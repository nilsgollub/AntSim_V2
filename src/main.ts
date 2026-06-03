import './errorhandler.js'; // Must be first to catch errors
import './style.css';
import { CONFIG } from './config';
import { World } from './simulation/World';
import { Renderer } from './graphics/Renderer';
import { PixiBackdrop } from './graphics/PixiBackdrop';
import { Camera } from './graphics/Camera';
import { Food } from './simulation/Food';
import { Ant } from './simulation/Ant';
import { PerformanceManager, QualityLevel } from './PerformanceManager';
import { applyTunerAction } from './simulation/SimObserver';
import type { TunerSuggestion } from './simulation/SimObserver';
import { loadOverrides, clearOverrides, hasOverrides, getByPath, setOverride } from './configStore';
import { seedRng } from './rng';

// Seed the deterministic RNG. A ?seed=<n> URL param reproduces a run exactly;
// otherwise each session gets a fresh seed.
const seedParam = new URLSearchParams(location.search).get('seed');
const seed = seedParam !== null ? Number(seedParam) >>> 0 : (Date.now() >>> 0);
seedRng(seed);

// Apply persisted parameter overrides to CONFIG before anything reads it.
loadOverrides();

// Rival colony: ?colonies=2 spawns a second colony on the opposite edge.
const coloniesParam = new URLSearchParams(location.search).get('colonies');
if (coloniesParam !== null) {
    const n = Math.max(1, Math.min(2, Number(coloniesParam) | 0));
    if (Number.isFinite(n)) CONFIG.colonyCount = n;
}

// ── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

window.onerror = function (msg, _url, lineNo, _columnNo, _error) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#AA0000;color:white;padding:10px;z-index:99999;font-size:14px;font-family:monospace';
    div.innerText = `ERROR: ${msg}\nLine: ${lineNo}`;
    document.body.appendChild(div);
    return false;
};

const nestCanvas = document.getElementById('nestCanvas') as HTMLCanvasElement;
nestCanvas.width  = CONFIG.nestWidth;
nestCanvas.height = CONFIG.nestHeight;

let world = new World();
const renderer = new Renderer(canvas);
const camera   = new Camera(CONFIG.width, CONFIG.height);
renderer.camera = camera;

// ── WebGL backdrop (experimental, opt-in) ────────────────────────────────────
// Renders the dirt + pheromone field on the GPU behind the 2D entity canvas.
// Falls back silently to pure canvas-2D when WebGL is unavailable (Pi-safe).
const glCanvas = document.getElementById('glCanvas') as HTMLCanvasElement;
let backdrop: PixiBackdrop | null = null;
let bloomEnabled = true;
let bloomIntensity = 0.7;

function webglAvailable(): boolean {
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
}

async function enableWebGL() {
    if (backdrop || !webglAvailable()) return;
    glCanvas.style.display = 'block';
    const b = new PixiBackdrop();
    await b.init(glCanvas, renderer, world, CONFIG.width, CONFIG.height, renderer.resolutionScale);
    b.setBloom(bloomEnabled, bloomIntensity);
    backdrop = b;
    // 2D layer keeps only lighting/effects/selection; Pixi draws backdrop + entities.
    renderer.drawBackdrop = false;
    renderer.drawEntities = false;
}

function disableWebGL() {
    renderer.drawBackdrop = true;
    renderer.drawEntities = true;
    glCanvas.style.display = 'none';
    if (backdrop) { backdrop.destroy(); backdrop = null; }
}

// ── Build info ──────────────────────────────────────────────────────────────
const buildInfo = document.createElement('div');
buildInfo.style.cssText = 'position:absolute;bottom:5px;right:5px;color:rgba(255,255,255,0.5);font-family:monospace;font-size:12px;pointer-events:none';
buildInfo.innerText = 'Build: 2025-12-17 21:00 - RELEASE 2.0';
document.body.appendChild(buildInfo);

// ── Simulation state ────────────────────────────────────────────────────────
let simSpeed  = 1;
let paused    = false;

// ── UI elements ─────────────────────────────────────────────────────────────
const speedRange     = document.getElementById('speedRange')     as HTMLInputElement;
const speedVal       = document.getElementById('speedVal')       as HTMLElement;
const restartBtn     = document.getElementById('restartBtn')     as HTMLButtonElement;
const fpsDisplay     = document.getElementById('fps')            as HTMLElement;
const popStat        = document.getElementById('popStat')        as HTMLElement;
const foodStat       = document.getElementById('foodStat')       as HTMLElement;
const queenStat      = document.getElementById('queenStat')      as HTMLElement;
const pauseBtn       = document.getElementById('pauseBtn')       as HTMLButtonElement;
const stepBtn        = document.getElementById('stepBtn')        as HTMLButtonElement;
const cameraResetBtn = document.getElementById('cameraResetBtn') as HTMLButtonElement;
const pheromoneToggle= document.getElementById('pheromoneToggle')as HTMLInputElement;
const qualitySelect  = document.getElementById('qualitySelect')  as HTMLSelectElement;

// Tool buttons
const toolSelectBtn  = document.getElementById('toolSelect')     as HTMLButtonElement;
const toolFoodBtn    = document.getElementById('toolFood')       as HTMLButtonElement;
const toolProteinBtn = document.getElementById('toolProtein')    as HTMLButtonElement;
const toolEnemyBtn   = document.getElementById('toolEnemy')      as HTMLButtonElement;
const toolBtns       = [toolSelectBtn, toolFoodBtn, toolProteinBtn, toolEnemyBtn];

// Inspector
const inspectorDiv     = document.getElementById('inspector')      as HTMLDivElement;
const inspectorContent = document.getElementById('inspector-content') as HTMLDivElement;
const inspectorClose   = document.getElementById('inspectorClose') as HTMLButtonElement;

// Tuner
const analyzeBtn    = document.getElementById('analyzeBtn')   as HTMLButtonElement;
const tunerPanel    = document.getElementById('tuner-panel')  as HTMLDivElement;
const tunerContent  = document.getElementById('tuner-content')as HTMLDivElement;
const tunerClose    = document.getElementById('tunerClose')   as HTMLButtonElement;
const tunerReset    = document.getElementById('tunerReset')   as HTMLButtonElement;

// ── Tool mode ───────────────────────────────────────────────────────────────
type ToolMode = 'SELECT' | 'PLACE_SUGAR' | 'PLACE_PROTEIN' | 'SPAWN_ENEMY';
let toolMode: ToolMode = 'SELECT';

function setTool(mode: ToolMode) {
    toolMode = mode;
    toolBtns.forEach(b => b.classList.remove('active'));
    const map: Record<ToolMode, HTMLButtonElement> = {
        SELECT:        toolSelectBtn,
        PLACE_SUGAR:   toolFoodBtn,
        PLACE_PROTEIN: toolProteinBtn,
        SPAWN_ENEMY:   toolEnemyBtn,
    };
    map[mode].classList.add('active');
}
toolSelectBtn.addEventListener('click',  () => setTool('SELECT'));
toolFoodBtn.addEventListener('click',    () => setTool('PLACE_SUGAR'));
toolProteinBtn.addEventListener('click', () => setTool('PLACE_PROTEIN'));
toolEnemyBtn.addEventListener('click',   () => setTool('SPAWN_ENEMY'));

// ── Selected entity for inspect ─────────────────────────────────────────────
let selectedAnt: Ant | null = null;

function clearSelection() {
    selectedAnt = null;
    renderer.selectedEntity = null;
    inspectorDiv.style.display = 'none';
}

inspectorClose.addEventListener('click', clearSelection);

function updateInspector() {
    if (!selectedAnt) return;
    if (!world.ants.includes(selectedAnt)) { clearSelection(); return; }
    inspectorDiv.style.display = 'block';
    renderer.selectedEntity = selectedAnt;
    const a = selectedAnt;
    const ageRatio = (a.age / a.maxAge * 100).toFixed(0);
    const energyPct = (a.energy / CONFIG.antMaxEnergy * 100).toFixed(0);
    inspectorContent.innerHTML =
        `<strong>${a.type}</strong><br>` +
        `State: ${a.state}<br>` +
        `Health: ${a.health.toFixed(0)}<br>` +
        `Energy: ${energyPct}%<br>` +
        `Age: ${ageRatio}% of lifespan<br>` +
        `Carrying: ${a.carrying}<br>` +
        `Location: ${a.location}`;
}

// ── Playback controls ────────────────────────────────────────────────────────
pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Resume (Space)' : 'Pause (Space)';
});
stepBtn.addEventListener('click', () => { if (paused) world.update(); });
document.addEventListener('keydown', e => {
    if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        pauseBtn.click();
    }
});
cameraResetBtn.addEventListener('click', () => camera.reset());

// Zoom buttons (keyboard +/- too) — zoom toward the current view centre.
const zoomInBtn  = document.getElementById('zoomInBtn')  as HTMLButtonElement;
const zoomOutBtn = document.getElementById('zoomOutBtn') as HTMLButtonElement;
const zoomBy = (factor: number) => camera.zoomTo(factor, camera.x, camera.y);
zoomInBtn.addEventListener('click', () => zoomBy(1.25));
zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.25));
document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25);
});

// ── UI-state persistence (quality / pheromones / speed) ──────────────────────
const UI_KEY = 'antsim.ui.v1';
function saveUiState() {
    try {
        localStorage.setItem(UI_KEY, JSON.stringify({
            quality: PerformanceManager.level,
            pheromones: renderer.showPheromones,
            speed: simSpeed,
            dayNight: renderer.dayNight,
            dayNightIntensity: renderer.dayNightIntensity,
            bloom: bloomEnabled,
            bloomIntensity,
            webgl: !!backdrop,
        }));
    } catch { /* storage unavailable */ }
}

function applyQuality(level: QualityLevel) {
    PerformanceManager.setQuality(level);
    qualitySelect.value = level;
    world.rebuildPheromoneGrids(); // keep grid resolution in sync with the new quality
    renderer.resize(CONFIG.width, CONFIG.height, PerformanceManager.settings.resolutionScale);
    renderer.updateSettings();
    backdrop?.resize(CONFIG.width, CONFIG.height, PerformanceManager.settings.resolutionScale);
}

// ── Speed / pheromone / quality ──────────────────────────────────────────────
speedRange.addEventListener('input', () => {
    simSpeed = parseFloat(speedRange.value);
    speedVal.innerText = simSpeed + 'x';
    saveUiState();
});
pheromoneToggle.addEventListener('change', () => {
    renderer.showPheromones = pheromoneToggle.checked;
    saveUiState();
});

const webglToggle = document.getElementById('webglToggle') as HTMLInputElement;
if (!webglAvailable()) {
    webglToggle.disabled = true;
    webglToggle.parentElement!.title = 'WebGL nicht verfügbar';
}
webglToggle.addEventListener('change', () => {
    if (webglToggle.checked) enableWebGL(); else disableWebGL();
    saveUiState();
});

// ── Graphics settings panel ──────────────────────────────────────────────────
const graphicsBtn   = document.getElementById('graphicsBtn')    as HTMLButtonElement;
const graphicsPanel = document.getElementById('graphics-panel') as HTMLDivElement;
const graphicsClose = document.getElementById('graphicsClose')  as HTMLButtonElement;
const dayNightToggle = document.getElementById('dayNightToggle') as HTMLInputElement;
const dayNightRange  = document.getElementById('dayNightRange')  as HTMLInputElement;

graphicsBtn.addEventListener('click', () => {
    graphicsPanel.style.display = graphicsPanel.style.display === 'none' ? 'block' : 'none';
});
graphicsClose.addEventListener('click', () => { graphicsPanel.style.display = 'none'; });

dayNightToggle.addEventListener('change', () => {
    renderer.dayNight = dayNightToggle.checked;
    saveUiState();
});
dayNightRange.addEventListener('input', () => {
    renderer.dayNightIntensity = parseFloat(dayNightRange.value);
    saveUiState();
});

const bloomToggle = document.getElementById('bloomToggle') as HTMLInputElement;
const bloomRange  = document.getElementById('bloomRange')  as HTMLInputElement;
bloomToggle.addEventListener('change', () => {
    bloomEnabled = bloomToggle.checked;
    backdrop?.setBloom(bloomEnabled, bloomIntensity);
    saveUiState();
});
bloomRange.addEventListener('input', () => {
    bloomIntensity = parseFloat(bloomRange.value);
    backdrop?.setBloom(bloomEnabled, bloomIntensity);
    saveUiState();
});
qualitySelect.addEventListener('change', () => {
    const val = qualitySelect.value as keyof typeof QualityLevel;
    applyQuality(QualityLevel[val]);
    saveUiState();
});
restartBtn.addEventListener('click', () => {
    world = new World();
    clearSelection();
    camera.reset();
});

// ── Camera mouse input ───────────────────────────────────────────────────────
let isDragging   = false;
let dragStartX   = 0;
let dragStartY   = 0;
let lastMouseX   = 0;
let lastMouseY   = 0;
const DRAG_THRESHOLD_PX = 5;  // CSS pixels before a click becomes a drag

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const anchor = camera.screenToWorld(e.clientX, e.clientY, canvas, renderer.resolutionScale);
    camera.zoomTo(factor, anchor.x, anchor.y);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
    isDragging  = false;
    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    lastMouseX  = e.clientX;
    lastMouseY  = e.clientY;
});
canvas.addEventListener('mousemove', (e) => {
    if (e.buttons !== 1) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
    if (moved > DRAG_THRESHOLD_PX) {
        isDragging = true;
        camera.pan(dx, dy, renderer.resolutionScale);
    }
});
canvas.addEventListener('mouseup', (e) => {
    if (isDragging) { isDragging = false; return; }
    // Click without drag → tool action
    const wp = camera.screenToWorld(e.clientX, e.clientY, canvas, renderer.resolutionScale);
    handleCanvasClick(wp.x, wp.y);
});

// Cursor hint
canvas.addEventListener('mousemove', (e) => {
    const cursors: Record<ToolMode, string> = {
        SELECT:        'default',
        PLACE_SUGAR:   'crosshair',
        PLACE_PROTEIN: 'crosshair',
        SPAWN_ENEMY:   'crosshair',
    };
    canvas.style.cursor = e.buttons === 1 && isDragging ? 'grabbing' : cursors[toolMode];
});

function handleCanvasClick(worldX: number, worldY: number) {
    if (toolMode === 'SELECT') {
        // Hit-test ants using the spatial grid (pre-built each frame)
        const candidates = world.spatialGrid.getNearby(worldX, worldY, 15);
        let best: Ant | null = null;
        let bestDist = Infinity;
        for (const ant of candidates) {
            if (ant.location !== 'WORLD') continue;
            const d = Math.hypot(ant.x - worldX, ant.y - worldY);
            if (d < 12 && d < bestDist) { best = ant; bestDist = d; }
        }
        selectedAnt = best;
        renderer.selectedEntity = best;
        inspectorDiv.style.display = best ? 'block' : 'none';
    } else if (toolMode === 'PLACE_SUGAR') {
        world.placeFood(worldX, worldY, 'SUGAR');
    } else if (toolMode === 'PLACE_PROTEIN') {
        world.placeFood(worldX, worldY, 'PROTEIN');
    } else if (toolMode === 'SPAWN_ENEMY') {
        world.spawnEnemyAt(worldX, worldY, 'PREDATOR');
    }
}

// ── Parameter Tuner ──────────────────────────────────────────────────────────
function severityIcon(s: TunerSuggestion['severity']): string {
    return { good: '✅', info: 'ℹ️', warn: '⚠️', critical: '🚨' }[s];
}

// Keeps the suggestions currently shown so the delegated click handler can
// resolve which action a button refers to.
let currentSuggestions: TunerSuggestion[] = [];

function renderTunerSuggestions(suggestions: TunerSuggestion[]) {
    currentSuggestions = suggestions;
    const anyActions = suggestions.some(s => s.actions && s.actions.length > 0);

    const rows = suggestions.map((s, si) => {
        const actionsHtml = (s.actions ?? []).map((a, ai) =>
            `<button class="tuner-apply" data-si="${si}" data-ai="${ai}" title="Übernehmen">${a.label}</button>`
        ).join('');
        return `<div class="tuner-row">
          <div class="tuner-metric tuner-${s.severity}">
            ${severityIcon(s.severity)} ${s.metric}
            <span style="font-weight:normal;color:#888;font-size:9px"> — ${s.observed} (Ziel: ${s.target})</span>
          </div>
          <div class="tuner-suggestion">💡 ${s.suggestion}</div>
          <div class="tuner-effect">→ ${s.effect}</div>
          ${actionsHtml ? `<div class="tuner-actions">${actionsHtml}</div>` : ''}
        </div>`;
    }).join('');

    const header = anyActions
        ? `<button id="tunerApplyAll">✓ Alle übernehmen</button>
           <div class="tuner-hint">Werte greifen sofort (live). Restart setzt nichts zurück.</div>`
        : '';
    tunerContent.innerHTML = header + rows;
}

function markApplied(btn: HTMLButtonElement) {
    btn.classList.add('applied');
    btn.disabled = true;
    btn.textContent = '✓ ' + btn.textContent;
}

// Delegated handler for apply buttons (per-action and "apply all").
tunerContent.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    if (t.id === 'tunerApplyAll') {
        for (const s of currentSuggestions) {
            for (const a of s.actions ?? []) applyTunerAction(a);
        }
        tunerContent.querySelectorAll<HTMLButtonElement>('.tuner-apply').forEach(b => {
            if (!b.disabled) markApplied(b);
        });
        (t as HTMLButtonElement).disabled = true;
        t.textContent = '✓ Alle übernommen';
        return;
    }

    if (t.classList.contains('tuner-apply')) {
        const si = Number(t.dataset.si);
        const ai = Number(t.dataset.ai);
        const action = currentSuggestions[si]?.actions?.[ai];
        if (action) {
            applyTunerAction(action);
            markApplied(t as HTMLButtonElement);
        }
    }
});

analyzeBtn.addEventListener('click', () => {
    const suggestions = world.observer.analyze();
    renderTunerSuggestions(suggestions);
    tunerPanel.style.display = 'block';
});
tunerClose.addEventListener('click', () => {
    tunerPanel.style.display = 'none';
});
tunerReset.addEventListener('click', resetAllToDefaults);

// ── Live parameter sliders ───────────────────────────────────────────────────
const slidersBtn     = document.getElementById('slidersBtn')     as HTMLButtonElement;
const slidersPanel   = document.getElementById('sliders-panel')  as HTMLDivElement;
const slidersContent = document.getElementById('sliders-content')as HTMLDivElement;
const slidersClose   = document.getElementById('slidersClose')   as HTMLButtonElement;
const slidersReset   = document.getElementById('slidersReset')   as HTMLButtonElement;

interface SliderSpec { path: string; label: string; min: number; max: number; step: number; }

// Only per-frame-read tunables (changing these takes effect immediately and safely).
const SLIDER_SPECS: SliderSpec[] = [
    { path: 'antSpeed',                 label: 'antSpeed',           min: 0.5, max: 6,    step: 0.1 },
    { path: 'antEnergyDecay',           label: 'antEnergyDecay',     min: 0.05, max: 1,   step: 0.01 },
    { path: 'queenLayInterval',         label: 'queenLayInterval (Pop ↑)', min: 50,  max: 800,  step: 10 },
    { path: 'ant.lifespan',             label: 'ant.lifespan (Pop ↑)', min: 6000, max: 80000, step: 2000 },
    { path: 'eggCost',                  label: 'eggCost',            min: 5,   max: 60,   step: 1 },
    { path: 'sugarValue',               label: 'sugarValue',         min: 1,   max: 40,   step: 1 },
    { path: 'proteinValue',             label: 'proteinValue',       min: 1,   max: 30,   step: 1 },
    { path: 'sugarEnergyValue',         label: 'sugarEnergyValue',   min: 20,  max: 300,  step: 10 },
    { path: 'colonyUpkeep',             label: 'colonyUpkeep',       min: 0,   max: 0.01, step: 0.0005 },
    { path: 'broodProteinUpkeep',       label: 'broodProteinUpkeep', min: 0,   max: 0.01, step: 0.0005 },
    { path: 'pheromone.diffusionRate',  label: 'pheromone.diffusionRate', min: 0, max: 0.5, step: 0.01 },
    { path: 'pheromone.decay',          label: 'pheromone.decay',    min: 0.9, max: 0.999, step: 0.001 },
    { path: 'pheromone.foodDecay',      label: 'pheromone.foodDecay (Straßen)', min: 0.9, max: 0.999, step: 0.001 },
    { path: 'antSensorDist',            label: 'antSensorDist (Spur-Reichweite)', min: 10, max: 120, step: 5 },
    { path: 'ant.dispersalRadius',      label: 'ant.dispersalRadius (Streuung)', min: 0, max: 600, step: 20 },
    { path: 'ant.dispersalStrength',    label: 'ant.dispersalStrength', min: 0, max: 0.4, step: 0.02 },
    { path: 'ant.memoryBias',           label: 'ant.memoryBias (Site Fidelity)', min: 0, max: 1, step: 0.05 },
    { path: 'ant.proteinForagerShare',  label: 'ant.proteinForagerShare', min: 0, max: 0.8, step: 0.05 },
    { path: 'broodProteinUpkeep',       label: 'broodProteinUpkeep (Pop-Limit)', min: 0, max: 0.005, step: 0.0005 },
    { path: 'brood.soldierFoodThreshold', label: 'brood.soldierFoodThreshold (Soldaten ↑=weniger)', min: 100, max: 2000, step: 100 },
    { path: 'brood.soldierProteinLevel', label: 'brood.soldierProteinLevel', min: 0, max: 500, step: 25 },
    { path: 'sugarSourceCount',         label: 'sugarSourceCount',   min: 1,   max: 10,  step: 1 },
    { path: 'predatorSpawnRate',        label: 'predatorSpawnRate',  min: 0,   max: 0.005, step: 0.0001 },
];

// Render from current CONFIG values (reflects tuner-applied + persisted overrides).
function renderSliders() {
    slidersContent.innerHTML = SLIDER_SPECS.map((s, i) => {
        const v = getByPath(s.path);
        return `<div class="slider-row">
          <label for="sl_${i}">${s.label}</label>
          <span class="slider-val" id="slv_${i}">${v}</span>
          <input type="range" id="sl_${i}" data-i="${i}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}">
        </div>`;
    }).join('');
}

slidersContent.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type !== 'range') return;
    const spec = SLIDER_SPECS[Number(t.dataset.i)];
    if (!spec) return;
    setOverride(spec.path, parseFloat(t.value)); // applies live + persists
    const valEl = document.getElementById('slv_' + t.dataset.i);
    if (valEl) valEl.textContent = t.value;
});

slidersBtn.addEventListener('click', () => {
    const show = slidersPanel.style.display === 'none';
    if (show) renderSliders();
    slidersPanel.style.display = show ? 'block' : 'none';
});
slidersClose.addEventListener('click', () => { slidersPanel.style.display = 'none'; });
slidersReset.addEventListener('click', resetAllToDefaults);

// Clear persisted parameter overrides + UI state and reload to pristine defaults.
function resetAllToDefaults() {
    clearOverrides();
    try { localStorage.removeItem(UI_KEY); } catch { /* ignore */ }
    location.reload();
}

// ── Live stats graph ─────────────────────────────────────────────────────────
const statsBtn    = document.getElementById('statsBtn')    as HTMLButtonElement;
const statsPanel  = document.getElementById('stats-graph-panel') as HTMLDivElement;
const statsCanvas = document.getElementById('statsCanvas') as HTMLCanvasElement;
const statsClose  = document.getElementById('statsClose')  as HTMLButtonElement;
const statsLegend = document.getElementById('stats-legend')as HTMLDivElement;
const statsCtx    = statsCanvas.getContext('2d')!;

const STATS_SERIES = [
    { key: 'population' as const, color: '#dddddd', label: 'Pop',     fixedMax: 0 },
    { key: 'sugar'      as const, color: '#6fdf6f', label: 'Zucker',  fixedMax: 0 },
    { key: 'protein'    as const, color: '#df6f6f', label: 'Protein', fixedMax: 0 },
    { key: 'energyPct'  as const, color: '#6fb0df', label: 'Energie', fixedMax: 1 },
];

statsBtn.addEventListener('click', () => {
    statsPanel.style.display = statsPanel.style.display === 'none' ? 'block' : 'none';
});
statsClose.addEventListener('click', () => { statsPanel.style.display = 'none'; });

function drawStats() {
    const W = statsCanvas.width, H = statsCanvas.height, pad = 4;
    statsCtx.clearRect(0, 0, W, H);
    const hist = world.observer.getHistory();

    if (hist.length < 2) {
        statsCtx.fillStyle = '#777';
        statsCtx.font = '11px monospace';
        statsCtx.fillText('sammelt Daten…', 8, H / 2);
        statsLegend.innerHTML = '';
        return;
    }

    // Baseline grid
    statsCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    statsCtx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
        const y = pad + g * (H - 2 * pad) / 4;
        statsCtx.beginPath(); statsCtx.moveTo(pad, y); statsCtx.lineTo(W - pad, y); statsCtx.stroke();
    }

    const latest = hist[hist.length - 1];
    const legendParts: string[] = [];

    for (const s of STATS_SERIES) {
        const max = s.fixedMax || Math.max(1, ...hist.map(p => p[s.key]));
        statsCtx.beginPath();
        statsCtx.strokeStyle = s.color;
        statsCtx.lineWidth = 1.5;
        hist.forEach((p, i) => {
            const x = pad + i * (W - 2 * pad) / (hist.length - 1);
            const y = (H - pad) - (p[s.key] / max) * (H - 2 * pad);
            if (i === 0) statsCtx.moveTo(x, y); else statsCtx.lineTo(x, y);
        });
        statsCtx.stroke();

        const cur = s.key === 'energyPct'
            ? `${Math.round(latest.energyPct * 100)}%`
            : `${Math.round(latest[s.key])}`;
        legendParts.push(`<span style="color:${s.color}">${s.label}: ${cur}</span>`);
    }
    statsLegend.innerHTML = legendParts.join('');
}

// ── Restore persisted UI state ───────────────────────────────────────────────
(function restoreUiState() {
    let saved: { quality?: string; pheromones?: boolean; speed?: number; dayNight?: boolean; dayNightIntensity?: number; bloom?: boolean; bloomIntensity?: number } | null = null;
    try {
        const raw = localStorage.getItem(UI_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch { saved = null; }
    if (!saved) return;

    if (saved.quality && saved.quality in QualityLevel) {
        applyQuality(QualityLevel[saved.quality as keyof typeof QualityLevel]);
    }
    if (typeof saved.pheromones === 'boolean') {
        renderer.showPheromones = saved.pheromones;
        pheromoneToggle.checked = saved.pheromones;
    }
    if (typeof saved.speed === 'number' && Number.isFinite(saved.speed)) {
        simSpeed = saved.speed;
        speedRange.value = String(saved.speed);
        speedVal.innerText = saved.speed + 'x';
    }
    if (typeof saved.dayNight === 'boolean') {
        renderer.dayNight = saved.dayNight;
        dayNightToggle.checked = saved.dayNight;
    }
    if (typeof saved.dayNightIntensity === 'number' && Number.isFinite(saved.dayNightIntensity)) {
        renderer.dayNightIntensity = saved.dayNightIntensity;
        dayNightRange.value = String(saved.dayNightIntensity);
    }
    if (typeof saved.bloom === 'boolean') {
        bloomEnabled = saved.bloom;
        bloomToggle.checked = saved.bloom;
    }
    if (typeof saved.bloomIntensity === 'number' && Number.isFinite(saved.bloomIntensity)) {
        bloomIntensity = saved.bloomIntensity;
        bloomRange.value = String(saved.bloomIntensity);
    }
})();

// WebGL is the default renderer (richer visuals); honour an explicit opt-out from a
// previous session, and fall back silently to canvas-2D where WebGL is unavailable (Pi-safe).
(function initWebGL() {
    let wantWebGL = true;
    try {
        const raw = localStorage.getItem(UI_KEY);
        if (raw) { const s = JSON.parse(raw); if (typeof s.webgl === 'boolean') wantWebGL = s.webgl; }
    } catch { /* default on */ }
    if (wantWebGL && webglAvailable()) {
        webglToggle.checked = true;
        enableWebGL();
    }
})();

// Surface that custom parameters are active (so a "weird" sim isn't a mystery).
if (hasOverrides()) {
    buildInfo.innerText += ' · custom params';
}

// ── Main game loop ───────────────────────────────────────────────────────────
let lastTime   = performance.now();
let frames     = 0;
let lastFpsTime= lastTime;
let lastQuality= PerformanceManager.level;

function loop(now: number) {
    requestAnimationFrame(loop);

    const delta = now - lastTime;
    lastTime = now;
    const instantFps = 1000 / (delta || 16);
    PerformanceManager.monitorFPS(instantFps);

    // Auto quality downgrade (Pi 4: will settle at a comfortable level automatically)
    if (PerformanceManager.level !== lastQuality) {
        lastQuality = PerformanceManager.level;
        qualitySelect.value = PerformanceManager.level;
        world.rebuildPheromoneGrids(); // keep grid resolution in sync with the new quality
        renderer.resize(CONFIG.width, CONFIG.height, PerformanceManager.settings.resolutionScale);
        renderer.updateSettings();
        backdrop?.resize(CONFIG.width, CONFIG.height, PerformanceManager.settings.resolutionScale);
    }

    // FPS counter
    frames++;
    if (now - lastFpsTime >= 1000) {
        fpsDisplay.innerText = `FPS: ${frames}`;
        frames = 0;
        lastFpsTime = now;
    }

    // HUD stats
    popStat.innerText  = `Population: ${world.ants.length} (W:${world.ants.filter(a => a.type === 'WORKER').length} S:${world.ants.filter(a => a.type === 'SOLDIER').length})`;
    foodStat.innerText = `Protein: ${Math.floor(world.proteinStockpile)} | Sugar: ${Math.floor(world.sugarStockpile)}`;

    const ageSeconds = Math.floor(world.queen.age / 60);
    queenStat.innerText = `Queen Age: ${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s`;

    // Simulation update (skipped while paused; render always runs so pan/zoom/inspect work)
    if (!paused) {
        const steps = Math.floor(simSpeed);
        for (let i = 0; i < steps; i++) world.update();
        if (Math.random() < simSpeed - steps) world.update();
    }

    // Inspector live update
    updateInspector();

    // Stats graph (only when visible, throttled to ~4 Hz to stay cheap)
    if (statsPanel.style.display !== 'none' && frames % 15 === 0) {
        drawStats();
    }

    // Render (always, even when paused)
    renderer.render(world);
    if (backdrop) backdrop.render(world, camera, renderer.showPheromones);
}

requestAnimationFrame(loop);

// Expose world/camera for quick browser-console debugging
(window as unknown as Record<string, unknown>)._world  = world;
(window as unknown as Record<string, unknown>)._camera = camera;
(window as unknown as Record<string, unknown>)._config = CONFIG;

// Prevent the Food import from being tree-shaken (used at runtime via World.placeFood)
void Food;
