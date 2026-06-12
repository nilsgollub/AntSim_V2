import './errorhandler.js'; // Must be first to catch errors
import './style.css';
import { CONFIG } from './config';
import { World } from './simulation/World';
import { Renderer } from './graphics/Renderer';
import { PixiBackdrop } from './graphics/PixiBackdrop';
import { Camera } from './graphics/Camera';
import { Food } from './simulation/Food';
import { Ant } from './simulation/Ant';
import { Insect, type InsectType } from './simulation/Insect';
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

// Rival colony is the DEFAULT in the app. (The sim/test default in config.ts stays 1
// so the golden snapshots — pinned at a single colony — remain frozen; only the app
// opts into two.) Honour an explicit ?colonies=N and a saved preference.
{
    let n = 2; // default: rival colony on
    try {
        const s = JSON.parse(localStorage.getItem('antsim.ui.v1') || '{}');
        if (typeof s.colonies === 'number') n = s.colonies;
    } catch { /* default */ }
    const param = new URLSearchParams(location.search).get('colonies');
    if (param !== null) n = Number(param) | 0;
    CONFIG.colonyCount = Math.max(1, Math.min(2, Number.isFinite(n) ? n : 2));
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
// Debug handles for the cinematic director / camera (handy for screensaver tuning).
(window as any)._cam = camera;
(window as any)._cine = () => cinematic;
(window as any)._cfg = CONFIG;

// ── WebGL backdrop (experimental, opt-in) ────────────────────────────────────
// Renders the dirt + pheromone field on the GPU behind the 2D entity canvas.
// Falls back silently to pure canvas-2D when WebGL is unavailable (Pi-safe).
const glCanvas = document.getElementById('glCanvas') as HTMLCanvasElement;
let backdrop: PixiBackdrop | null = null;
let bloomEnabled = true;
let bloomIntensity = 0.7;
let cinematicEnabled = true; // screensaver auto-camera (declared early — restoreUiState reads it)
let antColor: string | null = null; // user override for colony 0's worker colour ('' = colony default)

// Recolour colony 0's workers to the user-picked colour (WebGL tint + 2D colour read it
// straight from the colony, so just mutating the fields is enough). Re-applied after a
// restart since a fresh colony resets to its default tint.
function applyAntColor() {
    if (!antColor) return;
    const c0 = world.colonies[0];
    if (!c0) return;
    c0.workerTint = parseInt(antColor.slice(1), 16);
    c0.workerColor2D = antColor;
}

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
const speedDownBtn   = document.getElementById('speedDown')      as HTMLButtonElement;
const speedUpBtn     = document.getElementById('speedUp')        as HTMLButtonElement;
const speedVal       = document.getElementById('speedVal')       as HTMLElement;
// Discrete speed steps (0 = pause). +/- step through these — less fiddly than a slider.
const SPEED_STEPS = [0, 0.5, 1, 2, 4, 8];
function applySpeed(s: number, save = true) {
    simSpeed = s;
    speedVal.innerText = s + 'x';
    if (save) saveUiState();
}
function stepSpeed(dir: 1 | -1) {
    // Snap to the nearest step, then move one in `dir`.
    let i = 0, best = Infinity;
    SPEED_STEPS.forEach((v, k) => { const d = Math.abs(v - simSpeed); if (d < best) { best = d; i = k; } });
    i = Math.max(0, Math.min(SPEED_STEPS.length - 1, i + dir));
    applySpeed(SPEED_STEPS[i]);
}
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

// Manual weather: toggle a shower on demand (same washout mechanics as the
// seeded random rain — outdoor trails fade, the colony has to re-scout).
const rainBtn = document.getElementById('rainBtn') as HTMLButtonElement;
rainBtn.addEventListener('click', () => {
    if (world.raining) {
        world.raining = false;
        world.rainTimer = 0;
    } else {
        world.raining = true;
        world.rainTimer = CONFIG.environment.rainMinDuration * 2;
    }
    rainBtn.classList.toggle('active', world.raining);
});

// ── Selected entity for inspect ─────────────────────────────────────────────
let selectedAnt: Ant | null = null;
let selectedInsect: Insect | null = null;

function clearSelection() {
    selectedAnt = null;
    selectedInsect = null;
    renderer.selectedEntity = null;
    inspectorDiv.style.display = 'none';
}

inspectorClose.addEventListener('click', clearSelection);

// Short flavour + the per-hit damage an insect deals to ants (0 = harmless).
const INSECT_INFO: Record<InsectType, { name: string; desc: string; damage: number }> = {
    PREY:     { name: 'Beute-Insekt', desc: 'Harmlos. Ameisen erlegen es für Protein.', damage: 0 },
    APHID:    { name: 'Blattlaus',    desc: 'Wird von Ameisen „gemolken" — liefert Honigtau (Zucker).', damage: 0 },
    LADYBUG:  { name: 'Marienkäfer',  desc: 'Harmlos, vergreift sich nicht an der Kolonie.', damage: 0 },
    PREDATOR: { name: 'Räuber',       desc: 'Jagt Ameisen aktiv. Erst im koordinierten Mob zu bezwingen.', damage: CONFIG.enemy.predatorDamage },
    SPIDER:   { name: 'Spinne',       desc: 'Schnelle Jägerin — gefährlich. Braucht einen großen Mob.', damage: CONFIG.enemy.spiderDamage },
    BEETLE:   { name: 'Käfer',        desc: 'Stark gepanzert und zäh, aber langsam.', damage: CONFIG.enemy.beetleDamage },
};

function updateInspector() {
    if (selectedAnt) {
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
        return;
    }
    if (selectedInsect) {
        if (!world.insects.includes(selectedInsect) || selectedInsect.health <= 0) { clearSelection(); return; }
        inspectorDiv.style.display = 'block';
        renderer.selectedEntity = selectedInsect;
        const ins = selectedInsect;
        const info = INSECT_INFO[ins.type];
        inspectorContent.innerHTML =
            `<strong>${info.name}</strong><br>` +
            `<span style="opacity:0.8;font-size:11px">${info.desc}</span><br>` +
            `Health: ${ins.health.toFixed(0)}<br>` +
            `Speed: ${ins.speed.toFixed(1)}<br>` +
            (info.damage > 0 ? `Schaden/Biss: ${info.damage}<br>` : '') +
            `State: ${ins.state}`;
    }
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

// ── Screenshot / Export: composite the world view to a PNG download ───────────
// WebGL mode: the Pixi world (glCanvas) sits under the 2D effects (gameCanvas) —
// composite both. The WebGL canvas can't be read back directly (no
// preserveDrawingBuffer), so pull it via Pixi's extract. 2D mode: gameCanvas
// already holds the full render.
function takeScreenshot() {
    const w = canvas.width, h = canvas.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h); // opaque background (layers have alpha)
    if (backdrop) {
        const gl = backdrop.snapshotCanvas();
        if (gl) ctx.drawImage(gl, 0, 0, w, h);
    }
    ctx.drawImage(canvas, 0, 0, w, h);
    out.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `antsim_seed${seed}_t${world.age}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}
document.getElementById('screenshotBtn')?.addEventListener('click', takeScreenshot);

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
            pheromoneIntensity: renderer.pheromoneIntensity,
            antColor,
            speed: simSpeed,
            dayNight: renderer.dayNight,
            dayNightIntensity: renderer.dayNightIntensity,
            bloom: bloomEnabled,
            bloomIntensity,
            cinematic: cinematicEnabled,
            webgl: !!backdrop,
            colonies: CONFIG.colonyCount,
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
speedDownBtn.addEventListener('click', () => stepSpeed(-1));
speedUpBtn.addEventListener('click', () => stepSpeed(1));
pheromoneToggle.addEventListener('change', () => {
    renderer.showPheromones = pheromoneToggle.checked;
    saveUiState();
});

const pheromoneRange = document.getElementById('pheromoneRange') as HTMLInputElement;
pheromoneRange.addEventListener('input', () => {
    renderer.pheromoneIntensity = parseFloat(pheromoneRange.value);
    saveUiState();
});

const antColorPicker = document.getElementById('antColorPicker') as HTMLInputElement;
antColorPicker.addEventListener('input', () => {
    antColor = antColorPicker.value;
    applyAntColor();
    saveUiState();
});

const cinematicToggle = document.getElementById('cinematicToggle') as HTMLInputElement;
cinematicToggle.addEventListener('change', () => {
    cinematicEnabled = cinematicToggle.checked;
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

// Auto-recover from a lost WebGL context (Android tab-switch / GPU reset / power save):
// tear down the dead backdrop and fall back to 2D, then re-create it once the context is
// restored — which re-bakes ALL textures. Fixes ants/rivals rendering wrong after a
// context glitch without needing a manual WebGL off/on toggle.
glCanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // required so the browser will fire 'restored'
    console.warn('WebGL context lost — falling back to Canvas-2D until restored');
    if (backdrop) { try { backdrop.destroy(); } catch { /* context already gone */ } backdrop = null; }
    renderer.drawBackdrop = true;
    renderer.drawEntities = true;
}, false);
glCanvas.addEventListener('webglcontextrestored', () => {
    console.warn('WebGL context restored — re-baking textures');
    if (webglToggle.checked && webglAvailable() && !backdrop) void enableWebGL();
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
// Screensaver auto-restart: frames the world has been fully collapsed (no ants in
// ANY colony). A fully dead world would otherwise idle forever (immortal-queen aside),
// so after ~8s of emptiness we start a fresh colony.
let deadTicks = 0;
const EXTINCT_RESTART_FRAMES = 480;

function restartWorld() {
    world = new World();
    applyAntColor(); // a fresh colony resets to its default tint → re-apply the user's pick
    clearSelection();
    camera.reset();
    deadTicks = 0;
}

restartBtn.addEventListener('click', restartWorld);

// Rival colony toggle: set the colony count and restart so the change takes effect.
const rivalToggle = document.getElementById('rivalToggle') as HTMLInputElement;
rivalToggle.checked = CONFIG.colonyCount > 1; // reflect default / ?colonies / saved
rivalToggle.addEventListener('change', () => {
    CONFIG.colonyCount = rivalToggle.checked ? 2 : 1;
    saveUiState();
    restartWorld();
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

// ── Touch: 1 finger = pan, 2 fingers = pinch-zoom, tap = tool/inspect ─────────
// Reuses the same Camera API as the mouse path (pan / zoomTo / screenToWorld).
canvas.style.touchAction = 'none'; // suppress native scroll/zoom gestures
let touchStartX = 0, touchStartY = 0, touchLastX = 0, touchLastY = 0;
let touchMoved = false, pinchLastDist = 0;
const touchDist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const touchMid  = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartX = touchLastX = t.clientX;
        touchStartY = touchLastY = t.clientY;
        touchMoved = false;
    } else if (e.touches.length === 2) {
        pinchLastDist = touchDist(e.touches);
        touchMoved = true; // a two-finger gesture is never a tap
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - touchLastX;
        const dy = t.clientY - touchLastY;
        touchLastX = t.clientX;
        touchLastY = t.clientY;
        if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) > DRAG_THRESHOLD_PX) {
            touchMoved = true;
            camera.pan(dx, dy, renderer.resolutionScale);
        }
    } else if (e.touches.length === 2 && pinchLastDist > 0) {
        const dist = touchDist(e.touches);
        const mid = touchMid(e.touches);
        const anchor = camera.screenToWorld(mid.x, mid.y, canvas, renderer.resolutionScale);
        camera.zoomTo(dist / pinchLastDist, anchor.x, anchor.y);
        pinchLastDist = dist;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    // Clean single tap (no drag/pinch) → tool action at the lifted point.
    if (!touchMoved && e.touches.length === 0 && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const wp = camera.screenToWorld(t.clientX, t.clientY, canvas, renderer.resolutionScale);
        handleCanvasClick(wp.x, wp.y);
    }
    if (e.touches.length < 2) pinchLastDist = 0;
}, { passive: false });

function handleCanvasClick(worldX: number, worldY: number) {
    if (toolMode === 'SELECT') {
        // Hit-test ants first (using the spatial grid, pre-built each frame).
        const candidates = world.spatialGrid.getNearby(worldX, worldY, 15);
        let best: Ant | null = null;
        let bestDist = Infinity;
        for (const ant of candidates) {
            if (ant.location !== 'WORLD') continue;
            const d = Math.hypot(ant.x - worldX, ant.y - worldY);
            if (d < 12 && d < bestDist) { best = ant; bestDist = d; }
        }
        // No ant hit → hit-test world insects (they aren't in the ant spatial grid).
        let bestInsect: Insect | null = null;
        if (!best) {
            let bestInsDist = Infinity;
            for (const ins of world.insects) {
                if (ins.health <= 0) continue;
                const d = Math.hypot(ins.x - worldX, ins.y - worldY);
                if (d < 16 && d < bestInsDist) { bestInsect = ins; bestInsDist = d; }
            }
        }
        selectedAnt = best;
        selectedInsect = bestInsect;
        renderer.selectedEntity = best ?? bestInsect;
        inspectorDiv.style.display = (best || bestInsect) ? 'block' : 'none';
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
    let saved: { quality?: string; pheromones?: boolean; pheromoneIntensity?: number; antColor?: string; speed?: number; dayNight?: boolean; dayNightIntensity?: number; bloom?: boolean; bloomIntensity?: number; cinematic?: boolean } | null = null;
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
    if (typeof saved.pheromoneIntensity === 'number' && Number.isFinite(saved.pheromoneIntensity)) {
        renderer.pheromoneIntensity = saved.pheromoneIntensity;
        (document.getElementById('pheromoneRange') as HTMLInputElement).value = String(saved.pheromoneIntensity);
    }
    if (typeof saved.cinematic === 'boolean') {
        cinematicEnabled = saved.cinematic;
        (document.getElementById('cinematicToggle') as HTMLInputElement).checked = saved.cinematic;
    }
    if (typeof saved.antColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(saved.antColor)) {
        antColor = saved.antColor;
        (document.getElementById('antColorPicker') as HTMLInputElement).value = saved.antColor;
        applyAntColor();
    }
    if (typeof saved.speed === 'number' && Number.isFinite(saved.speed)) {
        applySpeed(saved.speed, false);
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

// ── URL override: ?quality=LOW pins the quality regardless of saved state ─────
// Used by the Pi kiosk screensaver to force a Pi-friendly level even on a fresh
// Chromium profile (where localStorage is empty). Case-insensitive.
(function applyQualityFromUrl() {
    const q = new URLSearchParams(location.search).get('quality');
    if (!q) return;
    const key = q.toUpperCase();
    if (key in QualityLevel) {
        applyQuality(QualityLevel[key as keyof typeof QualityLevel]);
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

// ── Optional FPS log (?fpslog=1) ─────────────────────────────────────────────
// On the Pi we can't trivially read the live FPS counter, so opt-in persist a
// rolling ~30 min of per-second samples to localStorage and print a one-line
// summary each minute. Lets us check afterwards whether LOW actually held up on
// the real hardware (suggestion: measure the auto-downgrade in the wild).
const fpsLogOn = new URLSearchParams(location.search).get('fpslog') === '1';
const FPSLOG_KEY = 'antsim.fpslog.v1';
const fpsSamples: number[] = [];          // this-minute per-second FPS
let fpsMinuteStart = lastTime;
function recordFps(fps: number, now: number) {
    if (!fpsLogOn) return;
    fpsSamples.push(fps);
    if (now - fpsMinuteStart < 60000) return;
    const n = fpsSamples.length || 1;
    const min = Math.min(...fpsSamples), max = Math.max(...fpsSamples);
    const avg = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / n);
    const ants = world.totalAntCount();
    const entry = { t: Date.now(), min, avg, max, q: PerformanceManager.level, ants };
    let log: any[] = [];
    try { log = JSON.parse(localStorage.getItem(FPSLOG_KEY) || '[]'); } catch { /* corrupt → reset */ }
    log.push(entry);
    if (log.length > 30) log = log.slice(-30); // keep ~30 min
    try { localStorage.setItem(FPSLOG_KEY, JSON.stringify(log)); } catch { /* quota → ignore */ }
    console.log(`[fpslog] avg=${avg} min=${min} max=${max} q=${entry.q} ants=${ants}`);
    fpsSamples.length = 0;
    fpsMinuteStart = now;
}

// ── Cinematic camera (screensaver) ───────────────────────────────────────────
// When idle, the camera slowly drifts and cuts between "action" spots (raids,
// combat, milking, the busy nest entrance) so the screensaver is never static.
// Any user interaction pauses it; it resumes after a short idle.
// A "shot" is one of four framings the director rotates through, so the screensaver
// feels edited rather than randomly panned:
//   WIDE     — establishing: pull out near MIN_ZOOM, centred on where the action is
//   ENTRANCE — the bustling nest mouth of one colony
//   EVENT    — a raid / fight / aphid-milking, tracked live (these ants move)
//   FOLLOW   — ride along with one individual ant (laden forager, raider, fighter)
// FOLLOW/EVENT keep a live reference to their ant and re-centre on it every frame,
// cutting to a fresh shot the moment it ducks into the nest or dies.
type CineAnt = { x: number; y: number; location: string; energy: number; state: string; carrying: string; colony: { entranceWorld: { x: number; y: number } } };
type ShotKind = 'WIDE' | 'ENTRANCE' | 'EVENT' | 'FOLLOW';
const cinematic = {
    pausedUntil: 0,
    target: null as { x: number; y: number; zoom: number } | null,
    kind: 'WIDE' as ShotKind,
    followAnt: null as CineAnt | null,
    nextPick: 0,
    phase: 0,
    shotQueue: [] as ShotKind[],
    notifyInteraction() { this.pausedUntil = performance.now() + 25000; },

    // Rotate through the framings in a fixed, varied pattern (rather than rolling the
    // dice each cut, which can stall on one type) so the viewer reliably gets the whole
    // tour: ride an ant, see the nest mouth, ride another, pull wide, catch an event.
    // Kinds with no material right now (no event ant, no field ant) are skipped.
    nextKind(events: CineAnt[], ants: CineAnt[]): ShotKind {
        if (!this.shotQueue.length) this.shotQueue = ['FOLLOW', 'ENTRANCE', 'FOLLOW', 'WIDE', 'EVENT'];
        for (let i = 0; i < this.shotQueue.length; i++) {
            const k = this.shotQueue[i];
            if (k === 'EVENT' && !events.length) continue;
            if (k === 'FOLLOW' && !ants.length) continue;
            this.shotQueue.splice(i, 1);
            return k;
        }
        return 'WIDE';
    },

    worldAnts(): CineAnt[] {
        const out: CineAnt[] = [];
        for (const c of world.colonies) for (const a of c.ants) if (a.location === 'WORLD') out.push(a as unknown as CineAnt);
        return out;
    },

    // Pick an ant with the most "runway" (farthest from its own entrance) out of a few
    // random samples, so a FOLLOW shot lasts instead of cutting the instant the ant pops
    // back into the nest.
    pickWithRunway(pool: CineAnt[]): CineAnt {
        let best = pool[Math.floor(Math.random() * pool.length)];
        let bestD = -1;
        for (let i = 0; i < 5; i++) {
            const a = pool[Math.floor(Math.random() * pool.length)];
            const e = a.colony.entranceWorld;
            const d = (a.x - e.x) ** 2 + (a.y - e.y) ** 2;
            if (d > bestD) { bestD = d; best = a; }
        }
        return best;
    },

    pickShot() {
        const now = performance.now();
        const ants = this.worldAnts();
        const events = ants.filter(a => { const s = a.state; return s === 'RAIDING' || s === 'ATTACKING' || s === 'FLEEING' || s === 'MILKING'; });

        const kind = this.nextKind(events, ants);
        this.kind = kind;
        this.followAnt = null;

        let hold: number;
        if (kind === 'WIDE') {
            let cx = CONFIG.width / 2, cy = CONFIG.height / 2;
            if (ants.length) { // frame the crowd's centre of mass
                cx = ants.reduce((s, a) => s + a.x, 0) / ants.length;
                cy = ants.reduce((s, a) => s + a.y, 0) / ants.length;
            }
            this.target = { x: cx, y: cy, zoom: 1.05 + Math.random() * 0.25 };
            hold = 11000 + Math.random() * 4000;
        } else if (kind === 'ENTRANCE') {
            const c = world.colonies[Math.floor(Math.random() * world.colonies.length)];
            this.target = { x: c.entranceWorld.x, y: c.entranceWorld.y, zoom: 2.1 + Math.random() * 0.4 };
            hold = 8000 + Math.random() * 3000;
        } else if (kind === 'EVENT') {
            const a = events[Math.floor(Math.random() * events.length)];
            this.followAnt = a;
            const z = a.state === 'RAIDING' ? 2.6 : a.state === 'MILKING' ? 3.2 : 3.0;
            this.target = { x: a.x, y: a.y, zoom: z };
            hold = 7000 + Math.random() * 4000;
        } else { // FOLLOW
            const carriers = ants.filter(a => a.carrying && a.carrying !== 'NONE');
            const pool = events.length ? events : (carriers.length ? carriers : ants);
            const a = this.pickWithRunway(pool);
            this.followAnt = a;
            this.target = { x: a.x, y: a.y, zoom: 2.8 + Math.random() * 0.4 };
            hold = 8000 + Math.random() * 4000;
        }
        this.nextPick = now + hold;
    },

    update() {
        if (!cinematicEnabled) return;
        const now = performance.now();
        if (now < this.pausedUntil) return;            // user is steering — hands off
        // Cut to a new shot on a timer, or the instant a tracked ant leaves the world / dies.
        const gone = this.followAnt && (this.followAnt.location !== 'WORLD' || this.followAnt.energy <= 0);
        if (!this.target || now >= this.nextPick || gone) this.pickShot();
        const t = this.target!;
        if (this.followAnt) { t.x = this.followAnt.x; t.y = this.followAnt.y; } // live re-centre

        this.phase += 0.004;
        const driftAmp = this.followAnt ? 2 : 7;       // less fake drift while a live ant supplies motion
        const dx = Math.cos(this.phase) * driftAmp, dy = Math.sin(this.phase * 0.7) * driftAmp * 0.7;
        const k = this.followAnt ? 0.08 : 0.014;       // snappier tracking for follows, slow glide otherwise
        camera.zoom += (t.zoom - camera.zoom) * k;
        camera.x += (t.x + dx - camera.x) * k;
        camera.y += (t.y + dy - camera.y) * k;
        camera.pan(0, 0, renderer.resolutionScale);    // clamp inside the world bounds
    },
};
['wheel', 'mousedown', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, () => cinematic.notifyInteraction(), { passive: true }));

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
        recordFps(frames, now);
        frames = 0;
        lastFpsTime = now;
    }

    // HUD stats
    if (world.colonies.length > 1) {
        // Rival mode: show the combined total plus the per-colony split (the war scoreline).
        const split = world.colonies.map(c => c.ants.length).join(' vs ');
        popStat.innerText = `Population: ${world.totalAntCount()} (${split})`;
    } else {
        const a = world.colonies[0].ants;
        popStat.innerText = `Population: ${a.length} (W:${a.filter(x => x.type === 'WORKER').length} S:${a.filter(x => x.type === 'SOLDIER').length})`;
    }
    foodStat.innerText = `Protein: ${Math.floor(world.proteinStockpile)} | Sugar: ${Math.floor(world.sugarStockpile)}`;

    const ageSeconds = Math.floor(world.queen.age / 60);
    queenStat.innerText = `Queen Age: ${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s`;

    // Simulation update (skipped while paused; render always runs so pan/zoom/inspect work)
    if (!paused) {
        const steps = Math.floor(simSpeed);
        for (let i = 0; i < steps; i++) world.update();
        if (Math.random() < simSpeed - steps) world.update();

        // Auto-restart for the screensaver: the match is decided once a colony has been
        // wiped out (its queen starved → `queen.dead`, a permanent flag that can't flicker
        // like a momentary 0-ant count) OR the whole world is empty. After a short grace,
        // start a fresh world so it never idles on a dead/decided board.
        const decided = world.totalAntCount() === 0 || world.colonies.some(c => c.queen.dead);
        if (decided) {
            if (++deadTicks > EXTINCT_RESTART_FRAMES) restartWorld();
        } else {
            deadTicks = 0;
        }
    }

    // Cinematic camera drift (no-op while the user is steering or it's disabled)
    cinematic.update();

    // Inspector live update
    updateInspector();

    // Stats graph (only when visible, throttled to ~4 Hz to stay cheap)
    if (statsPanel.style.display !== 'none' && frames % 15 === 0) {
        drawStats();
    }

    // Render (always, even when paused)
    renderer.render(world);
    if (backdrop) backdrop.render(world, camera, renderer.showPheromones, renderer.pheromoneIntensity);
}

requestAnimationFrame(loop);

// Expose world/camera for quick browser-console debugging
(window as unknown as Record<string, unknown>)._world  = world;
(window as unknown as Record<string, unknown>)._camera = camera;
(window as unknown as Record<string, unknown>)._config = CONFIG;

// Prevent the Food import from being tree-shaken (used at runtime via World.placeFood)
void Food;
