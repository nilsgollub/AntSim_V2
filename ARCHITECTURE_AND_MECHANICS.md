# AntSim V2 - Technical Design & Implementation Document

## 1. Overview
AntSim V2 is a complex, agent-based simulation of an ant colony, built with TypeScript and HTML5 Canvas. It simulates the emergent behavior of ants through pheromone trails, state machines, and interaction with a dynamic environment (food, predators, terrain). The simulation is designed to be resolution-independent and visually rich.

## 2. Core Architecture

### 2.1. Technology Stack
-   **Language:** TypeScript
-   **Build Tool:** Vite
-   **Rendering:** HTML5 Canvas API (2D Context)
-   **State Management:** Object-Oriented Programming (OOP) with a central `World` controller.

### 2.2. File Structure
-   `src/main.ts`: Entry point. Initializes the `Game` loop.
-   `src/config.ts`: Central configuration (constants, resolution scaling).
-   `src/simulation/`: Core logic.
    -   `World.ts`: The "God" class. Manages all entities and the update loop.
    -   `Ant.ts`: The primary agent logic (State Machine, Navigation).
    -   `Insect.ts`: Base class for other entities (Prey, Predators).
    -   `PheromoneGrid.ts`: The "smell" layer. Handles diffusion and decay.
    -   `Nest.ts`: Manages the underground structure (Nodes, Chambers).
    -   `Terrain.ts`: Manages obstacles and collision detection.
    -   `SpatialGrid.ts`: Optimization for proximity queries.
-   `src/graphics/`:
    -   `Renderer.ts`: Handles all drawing operations.

---

## 3. Simulation Mechanics

### 3.1. The World & Coordinate System
-   **Logical Size:** The world scales dynamically to fit the screen while maintaining a consistent "Target Area" (approx. 1600x900 logical pixels).
-   **Dual Layers:**
    1.  **WORLD:** The surface, containing food, obstacles, and enemies.
    2.  **NEST:** The underground, containing chambers, the queen, and brood.
-   **Transitions:** Ants transition between WORLD and NEST at specific coordinates (Entrance/Exit).

### 3.2. The Ant Agent (`Ant.ts`)
Ants are autonomous agents driven by a Finite State Machine (FSM).

#### 3.2.1. States
-   **FORAGING:** Searching for food (Sugar/Protein). Follows pheromones or wanders.
-   **RETURNING:** Carrying food back to the nest. Follows `HOME` pheromones or biases towards the nest.
-   **NURSING:** Inside the nest, caring for brood (Larvae/Pupae) or the Queen.
-   **PATROLLING:** Soldiers patrolling the nest entrance or perimeter.
-   **ATTACKING:** Engaging an enemy (Combat).
-   **FLEEING:** Running away from danger (Panic).
-   **IDLE:** Resting or waiting for a task.

#### 3.2.2. Navigation (Slime Mold Algorithm)
Ants use a sensory-based steering algorithm:
1.  **Sensors:** Three sensors (Left, Center, Right) sample the pheromone grid at a distance (`sensorDist`) and angle (`sensorAngle`).
2.  **Decision:**
    -   If **Center > Left & Right**: Move straight.
    -   If **Left > Right**: Turn Left.
    -   If **Right > Left**: Turn Right.
    -   If **All Low**: Wander randomly.
3.  **Jitter:** Small random noise is added to prevent mechanical movement.

#### 3.2.3. Pheromones
-   **Types:** `HOME` (Blue), `SUGAR` (Green), `PROTEIN` (Red), `DANGER` (Purple).
-   **Deposition:** Ants drop pheromones based on their state (e.g., `RETURNING` drops `SUGAR` or `PROTEIN` trail; `FORAGING` drops `HOME` trail).
-   **Dynamics:** Every type evaporates (exponential decay) each update. `HOME`/`SUGAR`/`PROTEIN`
    additionally **diffuse** via a separable box blur so trails spread and soften over time;
    `DANGER` is decay-only (kept sharp + decays faster) so warnings stay local and fade quickly.
    Diffusion is gated behind `CONFIG.pheromone.diffusionEnabled` and the per-quality
    `pheromoneDiffusion` flag (disabled at `ULTRA_LOW`/`LOW` for weak hardware).

### 3.3. Combat, Alarm & Defence (`CONFIG.combat`)
-   **Enemies:** Spiders, Beetles, Predators (generic bugs). Their HP and per-hit
    damage live in `CONFIG.enemy` (predator 55/7, spider 42/8, beetle 95/13) so a
    lone predator is a real threat — it takes a few ants with it before the colony
    swarms it down.
-   **Alarm pheromone:** fleeing ants drop a `DANGER` trail (sharp, fast-decaying).
-   **Soldier recruitment:** a patrolling soldier that senses `DANGER` above
    `alarmThreshold` switches to ATTACK and follows the danger gradient *to the
    alarm source* — so soldiers are pulled toward a threat, not just patrolling.
-   **Local numerical superiority:** a worker mobs an enemy only with enough local
    allies (`mobMinAllies`) and roughly `mobSuperiority`× more allies than enemies
    nearby (`countNearbyAllies` vs `countNearbyEnemies`); otherwise it flees and
    spreads the alarm. Soldiers fight regardless.
-   **Attack:** in melee range the ant stops and deals `worker/soldierDamage`; the
    enemy bites back at the single ant it's locked onto (a whole-swarm AoE bite was
    tried but reverted — it could wipe a mobbing squad and collapse the colony).
-   **Grappling/swarming:** an enemy is slowed by `grappleSlowPerAnt` for every ant
    within `grappleRadius` (capped at `grappleMaxSlow`) — a swarm slows it, but no
    longer fully pins it, so it can still fight/retreat while outnumbered.
-   **Death:** dead insects drop Protein at their location; dead **ants** above
    ground leave a corpse that undertakers carry to a graveyard chamber (§3.4).
-   **Balance note:** long-run (30k-tick) colony survival is ~50–60 % and *RNG-stream
    dominated* — tuning enemy strength reshuffles which seeds collapse rather than
    raising the survival rate. The soak guarantees establishment, not immortality.

### 3.4. Nest Logic (`Nest.ts`)
-   **Structure:** A graph of **Nodes** (rooms/junctions) connected by **Tunnels**.
-   **Growth:** the colony digs satellite chambers as it grows (`growStage`), as a
    **branching tree** — each new chamber hangs off an existing one but is placed
    strictly *outward* from the hub, so heading home is always monotone "inward"
    (keeps greedy navigation robust) and far more chambers fit than a single star ring.
-   **Functional chambers (roles):** a nest has *several* chambers per role
    (`getChambers`/`nearestChamber`), dug in the order Nursery → Granary → Cemetery →
    then a mix:
    -   `QUEEN` — the founding chamber; the queen lays here.
    -   `BROOD` (nurseries) — nurses carry misplaced brood to the nearest nursery
        (target committed at pickup via `Ant.carryTarget`, so it can't thrash between
        rooms). Brood is "misplaced" only if outside *every* nursery.
    -   `STORAGE` (granaries) — give real capacity: the global stockpile is capped at
        `base + perGranary × granaryCount` (`CONFIG.nest.storage*`). Food piles render
        split across all granaries. Delivery/eating use the primary granary (one stable
        target; the stockpile is global anyway).
    -   `CEMETERY` — undertakers carry **ant** corpses here (sanitation); they rest in
        `world.graveyard` (kept out of `world.foods` so the per-frame forage scan can't
        blow up as the dead accumulate) and slowly moulder. **Insect** corpses stay food.
-   **Navigation:** Ants move between nodes using a pathfinding heuristic (or simple node-to-node steering).


2.  **State Transition Protocols:**
    -   **Target Loss:** If an agent's target (e.g., an enemy) is removed from the world, the agent must **immediately** transition to a default state (e.g., `FORAGING`) in the same frame. It must not continue executing the previous steering command.
    -   **Signal Loss:** If following a gradient (e.g., `DANGER`) and the signal drops to zero, the agent must abandon the tracking state immediately.

3.  **Visual Coupling:**
    -   The animation speed of the agent's legs must be directly coupled to its current movement speed (`speedMultiplier`). This ensures that agents appear to walk slower when decelerating and stop moving their legs when stationary.

---

## 4. Key Algorithms & Formulas

### 4.1. Movement
```typescript
nextX = x + cos(angle) * speed
nextY = y + sin(angle) * speed
```

### 4.2. Collision (`Terrain.ts`)
-   **Detection:** Circle-Circle intersection (Ant radius vs Obstacle radius).
-   **Resolution:** If blocked, calculate the tangent angle of the obstacle and slide along it.

### 4.3. Pheromone Diffusion (Separable Box Blur)
Implemented in `PheromoneGrid.diffuse()` as two passes (O(2N) instead of O(9N)) using a
single reusable scratch buffer. Each pass blends a cell with its two neighbours:
```typescript
// Horizontal pass (grid -> temp), then vertical pass (temp -> grid):
out = (1 - rate) * center + rate * (neighbourA + neighbourB) * 0.5
```
Out-of-bounds neighbours reuse the centre value so edges don't bleed toward zero.
`rate` = `CONFIG.pheromone.diffusionRate`.

---

## 5. Visuals (`Renderer.ts`)
-   **Canvas API:** Uses `ctx.save()`, `ctx.translate()`, `ctx.rotate()` for sprite rendering.
-   **Procedural Animation:** Legs are animated using `Math.sin(time)` to create a walking gait.
-   **Pheromone Visualization:** Renders the grid to an offscreen canvas, maps values to RGB colors, and draws it as a world-space overlay (inside the camera transform, so it lines up with entities at any zoom).
-   **Camera (`Camera.ts`):** Applied on top of the resolution-scale transform inside `renderWorld()`. Only the world canvas is transformed — the nest canvas is never camera-transformed. Screen-space effects (god rays, vignette) draw after the camera block.

## 5.1. Interaction (`main.ts`)
-   **Camera control:** Mouse-drag to pan, wheel to zoom-to-cursor (`Camera.zoomTo`). A movement threshold distinguishes a drag from a click.
-   **Inspect:** In SELECT mode a click hit-tests ants via `SpatialGrid.getNearby` and shows a live DOM inspector (state/energy/health/age/cargo).
-   **Sandbox tools:** Place sugar/protein (`World.placeFood`) or spawn an enemy (`World.spawnEnemyAt`) by clicking.
-   **Playback:** Pause (Space) freezes `world.update()` while rendering continues; single-step advances one tick.

## 5.2. Parameter Tuner (`SimObserver.ts`)
-   Samples colony metrics every ~600 frames (cheap, O(1) per tick) into a rolling window.
-   `analyze()` compares metrics (population trend, energy, foraging ratio, combat pressure, queen health/stress, brood pipeline, soldier ratio, stockpile) against realism targets and returns severity-tagged suggestions, each naming a concrete `CONFIG.*` key and explaining the effect.

## 6. Determinism & Testing
-   **Seeded RNG (`src/rng.ts`):** mulberry32; the whole simulation draws via `rand()`,
    seeded by `seedRng()`. A given seed reproduces a run exactly. `main.ts` seeds at startup
    (`?seed=<n>` to replay). Rendering-only randomness stays on `Math.random()`.
-   **Headless harness (`src/simulation/headless.ts`):** `runHeadless(seed, ticks)` runs the
    full simulation with no DOM and returns aggregate metrics — used to assert on emergent
    outcomes (population band, no collapse, no resource stuck at zero) rather than only units.
-   **Runner:** Vitest (`npm run test`), `node` environment. `config.ts` guards `window.*`.
-   **Coverage:** `PheromoneGrid`, `Brood`, `SpatialGrid`, `Food`, `SimObserver`, `configStore`,
    `Nest`, `Ant`, and the headless determinism + viability soak.

## 7. Configuration (`config.ts`)
Key parameters to tune the simulation (flat keys + grouped sub-objects):
-   `antSpeed`: Base movement speed.
-   `antSensorAngle`: Field of view (e.g., 45 degrees).
-   `antSensorDist`: How far ahead they see (e.g., 40px).
-   `antTurnSpeed`: How fast they steer.
-   `CONFIG.pheromone.*`: `decay`, `diffusionRate`, deposit amounts, `trailRadius`.
-   `CONFIG.ant.*`: detection ranges, energy thresholds, feeding amounts, `lifespan`.
-   `CONFIG.brood.*`: lifecycle durations, starvation limit, hunger rate.

---

## 8. Reconstruction Guide
To rebuild this simulation:
1.  **Setup:** Initialize a Vite project with TypeScript.
2.  **Grid:** Implement `PheromoneGrid` (Float32Array) with diffusion loop.
3.  **Agents:** Create `Ant` class with `x, y, angle` and `update()` method.
4.  **FSM:** Implement the State Machine (`switch(state)`) in `Ant.ts`.
5.  **Steering:** Implement `senseAndSteer` using the 3-sensor logic.
6.  **World:** Create `World` class to hold arrays of `ants`, `food`, `obstacles`.
7.  **Render:** Create a loop that clears canvas, updates world, and draws entities.
