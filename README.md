# AntSim V2

Agent-based ant colony simulation built with TypeScript and HTML5 Canvas — no runtime dependencies.

## Quick start

```bash
npm install
npm run dev      # Dev server (hot reload) — open http://localhost:5173
npm run build    # Production build → dist/
npm run test     # Unit tests (Vitest)
```

## Controls

| Action | How |
|--------|-----|
| Pan camera | Left-click drag on world canvas |
| Zoom camera | Mouse wheel (zoom-to-cursor) |
| Reset camera | ⌖ button |
| Pause / Resume | ⏸ button or **Space** |
| Single step | ⏭ button (while paused) |
| Inspect entity | 🔍 tool → click an ant |
| Place food | 🍬 (sugar) / 🥩 (protein) tool → click on world |
| Spawn enemy | ☠ tool → click on world |
| Show pheromones | ✓ Pheromones checkbox |
| Parameter analysis | ⚙ Analyse button |

## Architecture overview

```
src/
├── main.ts                    Entry point, game loop, input handling
├── config.ts                  All simulation constants (see grouped sub-objects)
├── PerformanceManager.ts      Quality presets + auto-downgrade (Pi 4 friendly)
├── graphics/
│   ├── Camera.ts              Pan/zoom camera with screen↔world coordinate mapping
│   └── Renderer.ts            Canvas 2D rendering (world canvas + nest canvas)
└── simulation/
    ├── World.ts               Central controller; holds all entities
    ├── Ant.ts                 12-state FSM agent (Worker / Soldier)
    ├── Queen.ts               Queen entity + egg laying
    ├── Brood.ts               Egg → Larva → Pupa → Ant lifecycle
    ├── Insect.ts              Prey and predators (Spider, Beetle, Ladybug, Aphid, …)
    ├── Food.ts                Sugar / Protein / Corpse sources
    ├── PheromoneGrid.ts       Float32Array grids with decay + separable blur diffusion
    ├── Terrain.ts             Obstacle generation + circle-circle collision
    ├── SpatialGrid.ts         Proximity queries (cell size 50 px)
    ├── Nest.ts                Node-graph underground structure
    └── SimObserver.ts         Metric sampling + parameter tuner
```

## Parameter tuning

Hit **⚙ Analyse** after the sim has run for ≥20 seconds. `SimObserver` samples key
metrics every 600 frames (~10 s) and compares them against realism targets. Output
includes severity-tagged observations plus concrete `CONFIG.*` suggestions with an
explanation of the effect each change would have.

All tunable constants live in `src/config.ts` grouped under:
- `CONFIG.ant.*`       — detection ranges, energy thresholds, feeding amounts
- `CONFIG.pheromone.*` — decay, diffusion rate, deposit amounts
- `CONFIG.brood.*`     — lifecycle durations, starvation limits

## Pi 4 / low-end device notes

Select **Quality → Ultra Low** (or **Low**) for Raspberry Pi 4 / HAOS deployment.
At these levels:
- Pheromone diffusion is **disabled** (decay-only, identical to the original behaviour)
- Resolution scales down to 0.4× (smaller canvas = ~6× fewer pixels to fill)
- Max ant count drops to 80–120
- Particle limits, shadows, and grass animation are all off
- The camera, inspector, and tuner remain fully functional at any quality level

The auto-downgrade kicks in after 60 consecutive frames below 20 FPS with a 10-second
cooldown between steps, so the sim self-adjusts on first launch.

## Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Test files live alongside their modules as `*.test.ts`. Covered modules:
`PheromoneGrid`, `Brood`, `SpatialGrid`, `Food`.

Tests run in a `node` environment — no DOM required. `config.ts` guards all
`window.*` reads so it can be imported safely from tests.
