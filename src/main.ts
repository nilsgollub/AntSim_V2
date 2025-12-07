import { CONFIG } from './config';
import { World } from './simulation/World';
import { Renderer } from './graphics/Renderer';
import { PerformanceManager, QualityLevel } from './PerformanceManager';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
canvas.width = CONFIG.width;
canvas.height = CONFIG.height;

const nestCanvas = document.getElementById('nestCanvas') as HTMLCanvasElement;
nestCanvas.width = CONFIG.nestWidth;
nestCanvas.height = CONFIG.nestHeight;

let world = new World();
const renderer = new Renderer(canvas);

// Build Info Overlay
const buildInfo = document.createElement('div');
buildInfo.style.position = 'absolute';
buildInfo.style.bottom = '5px';
buildInfo.style.right = '5px';
buildInfo.style.color = 'rgba(255, 255, 255, 0.5)';
buildInfo.style.fontFamily = 'monospace';
buildInfo.style.fontSize = '12px';
buildInfo.style.pointerEvents = 'none';
buildInfo.innerText = 'Build: 2025-12-07 20:23 - FIX ENEMY ORIENTATION';
document.body.appendChild(buildInfo);

// Controls
let simSpeed = 1;
const speedRange = document.getElementById('speedRange') as HTMLInputElement;
const speedVal = document.getElementById('speedVal') as HTMLElement;
const restartBtn = document.getElementById('restartBtn') as HTMLButtonElement;
const fpsDisplay = document.getElementById('fps') as HTMLElement;
const popStat = document.getElementById('popStat') as HTMLElement;
const foodStat = document.getElementById('foodStat') as HTMLElement;
const queenStat = document.getElementById('queenStat') as HTMLElement;

speedRange.addEventListener('input', () => {
  simSpeed = parseFloat(speedRange.value);
  speedVal.innerText = simSpeed + 'x';
});

const pheromoneToggle = document.getElementById('pheromoneToggle') as HTMLInputElement;
pheromoneToggle.addEventListener('change', () => {
  renderer.showPheromones = pheromoneToggle.checked;
});

const qualitySelect = document.getElementById('qualitySelect') as HTMLSelectElement;
qualitySelect.addEventListener('change', () => {
  const val = qualitySelect.value as keyof typeof QualityLevel;
  PerformanceManager.setQuality(QualityLevel[val]);
});

restartBtn.addEventListener('click', () => {
  world = new World();
});

// Loop
let lastTime = performance.now();
let frames = 0;
let lastFpsTime = lastTime;

function loop(now: number) {
  requestAnimationFrame(loop);

  const delta = now - lastTime;
  lastTime = now;
  const instantFps = 1000 / (delta || 16); // Avoid infinity on first frame
  PerformanceManager.monitorFPS(instantFps);

  // FPS
  frames++;
  if (now - lastFpsTime >= 1000) {
    fpsDisplay.innerText = `FPS: ${frames}`;

    // Sync Quality UI (in case of auto-downgrade)
    if (qualitySelect.value !== PerformanceManager.level) {
      qualitySelect.value = PerformanceManager.level;
    }

    frames = 0;
    lastFpsTime = now;
  }

  popStat.innerText = `Population: ${world.ants.length} (W:${world.ants.filter(a => a.type === 'WORKER').length} S:${world.ants.filter(a => a.type === 'SOLDIER').length})`;
  foodStat.innerText = `Protein: ${world.proteinStockpile} | Sugar: ${world.sugarStockpile}`;

  const ageSeconds = Math.floor(world.queen.age / 60);
  const minutes = Math.floor(ageSeconds / 60);
  const seconds = ageSeconds % 60;
  queenStat.innerText = `Queen Age: ${minutes}m ${seconds}s`;

  // Update
  // If speed is high, we might need multiple updates per frame for stability
  // For now, we just scale the delta or run multiple steps
  const steps = Math.floor(simSpeed);
  const remainder = simSpeed - steps;

  for (let i = 0; i < steps; i++) {
    world.update();
  }
  // Probabilistic update for remainder? Or just skip. 
  // For simplicity, let's just run integer steps + 1 with probability
  if (Math.random() < remainder) {
    world.update();
  }

  // Render
  renderer.render(world);
}

requestAnimationFrame(loop);
