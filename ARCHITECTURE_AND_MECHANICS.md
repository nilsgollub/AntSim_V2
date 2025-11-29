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
-   **Dynamics:** Pheromones diffuse (spread) and evaporate (decay) every frame in `PheromoneGrid`.

### 3.3. Combat System
-   **Enemies:** Spiders, Beetles, Predators (generic bugs).
-   **Logic:**
    -   Ants detect enemies visually (distance check).
    -   **Attack:** If in range, they stop and deal damage.
    -   **Panic:** If `DANGER` pheromone is high and allies are few, ants flee.
    -   **Courage:** Workers fight only in groups. Soldiers fight alone.
-   **Death:** Dead insects spawn food (Protein) at their location.

### 3.4. Nest Logic (`Nest.ts`)
-   **Structure:** A graph of **Nodes** (rooms/junctions) connected by **Tunnels**.
-   **Chambers:** Special nodes for `QUEEN`, `BROOD`, `STORAGE`.
-   **Navigation:** Ants move between nodes using a pathfinding heuristic (or simple node-to-node steering).

### 3.5. Brood Cycle (`Brood.ts`)
1.  **EGG:** Laid by Queen. Needs time to hatch.
2.  **LARVA:** Needs food (Protein). Workers deliver food. Grows when fed.
3.  **PUPA:** Metamorphosis phase.
4.  **ADULT:** Hatches into a new Ant (Worker or Soldier).

### 3.6. Advanced Movement & Interaction Protocols
To ensure fluid and natural agent behavior, the following movement rules are required:

1.  **Target Approach Dynamics:**
    -   Agents must **linearly decelerate** when approaching a target (Food/Enemy) within a 30px radius.
    -   At close range (< 30px), steering should switch from "Turn-based" to "Direct Orientation" (`atan2`) to ensure precise interaction without overshooting.
    -   A small random jitter should be applied to the angle during interaction to prevent agents from stacking perfectly on top of each other.

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

### 4.3. Pheromone Diffusion (Box Blur)
```typescript
grid[x][y] = (
  grid[x-1][y] + grid[x+1][y] +
  grid[x][y-1] + grid[x][y+1] +
  grid[x-1][y-1] + ... // diagonals
) / 9 * decayRate
```

---

## 5. Visuals (`Renderer.ts`)
-   **Canvas API:** Uses `ctx.save()`, `ctx.translate()`, `ctx.rotate()` for sprite rendering.
-   **Procedural Animation:** Legs are animated using `Math.sin(time)` to create a walking gait.
-   **Pheromone Visualization:** Renders the grid to an offscreen canvas, maps values to RGB colors, and draws it as a background layer.

## 6. Configuration (`config.ts`)
Key parameters to tune the simulation:
-   `antSpeed`: Base movement speed.
-   `antSensorAngle`: Field of view (e.g., 45 degrees).
-   `antSensorDist`: How far ahead they see (e.g., 40px).
-   `antTurnSpeed`: How fast they steer.
-   `decayRate`: How fast trails vanish.

---

## 7. Reconstruction Guide
To rebuild this simulation:
1.  **Setup:** Initialize a Vite project with TypeScript.
2.  **Grid:** Implement `PheromoneGrid` (Float32Array) with diffusion loop.
3.  **Agents:** Create `Ant` class with `x, y, angle` and `update()` method.
4.  **FSM:** Implement the State Machine (`switch(state)`) in `Ant.ts`.
5.  **Steering:** Implement `senseAndSteer` using the 3-sensor logic.
6.  **World:** Create `World` class to hold arrays of `ants`, `food`, `obstacles`.
7.  **Render:** Create a loop that clears canvas, updates world, and draws entities.
