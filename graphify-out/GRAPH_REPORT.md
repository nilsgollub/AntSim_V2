# Graph Report - .  (2026-06-13)

## Corpus Check
- 61 files · ~148,821 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 535 nodes · 1096 edges · 29 communities (19 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Controls & Entry Point|UI Controls & Entry Point]]
- [[_COMMUNITY_Ant Agent Core|Ant Agent Core]]
- [[_COMMUNITY_Simulation Test Suite|Simulation Test Suite]]
- [[_COMMUNITY_Rendering Pipeline|Rendering Pipeline]]
- [[_COMMUNITY_Design Docs & Concepts|Design Docs & Concepts]]
- [[_COMMUNITY_Camera & Sprite Baking|Camera & Sprite Baking]]
- [[_COMMUNITY_Sim Observer & Tuner|Sim Observer & Tuner]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_Nest Structure & Tunnels|Nest Structure & Tunnels]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Nest View Screenshot|Nest View Screenshot]]
- [[_COMMUNITY_World View Screenshot|World View Screenshot]]
- [[_COMMUNITY_Integration & Soak Tests|Integration & Soak Tests]]
- [[_COMMUNITY_Spatial Grid Indexing|Spatial Grid Indexing]]
- [[_COMMUNITY_Food System|Food System]]
- [[_COMMUNITY_UI Loop & Inspector|UI Loop & Inspector]]
- [[_COMMUNITY_Terrain & Collision|Terrain & Collision]]
- [[_COMMUNITY_Error Handler|Error Handler]]
- [[_COMMUNITY_Playback Speed Controls|Playback Speed Controls]]
- [[_COMMUNITY_Vite Build Asset|Vite Build Asset]]
- [[_COMMUNITY_WebGL Detection|WebGL Detection]]
- [[_COMMUNITY_TypeScript Logo Asset|TypeScript Logo Asset]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_Vite SVG Asset|Vite SVG Asset]]
- [[_COMMUNITY_TypeScript SVG Asset|TypeScript SVG Asset]]

## God Nodes (most connected - your core abstractions)
1. `World` - 84 edges
2. `rand()` - 39 edges
3. `Nest` - 28 edges
4. `Ant` - 27 edges
5. `CONFIG` - 25 edges
6. `AntSim V2 Architecture & Mechanics Document` - 25 edges
7. `Renderer` - 20 edges
8. `Colony` - 20 edges
9. `compilerOptions` - 18 edges
10. `World.ts - Central Controller` - 17 edges

## Surprising Connections (you probably didn't know these)
- `GitHub Pages Deployment Workflow` --references--> `main.ts - Entry Point`  [INFERRED]
  C:/Users/gollu/Documents/Github/AntSim_V2/.github/workflows/pages.yml → C:/Users/gollu/Documents/Github/AntSim_V2/src/main.ts
- `Insect.ts - Prey & Predators` --conceptually_related_to--> `Agent-Based Simulation`  [INFERRED]
  C:/Users/gollu/Documents/Github/AntSim_V2/src/simulation/Insect.ts → C:/Users/gollu/Documents/Github/AntSim_V2/ARCHITECTURE_AND_MECHANICS.md
- `Vitest Config` --references--> `SimObserver Test Suite`  [INFERRED]
  vitest.config.ts → src/simulation/SimObserver.test.ts
- `Vitest Config` --references--> `SpatialGrid Test Suite`  [INFERRED]
  vitest.config.ts → src/simulation/SpatialGrid.test.ts
- `Vitest Config` --references--> `Environment Test Suite`  [INFERRED]
  vitest.config.ts → src/simulation/environment.test.ts

## Import Cycles
- 3-file cycle: `src/simulation/Colony.ts -> src/simulation/Queen.ts -> src/simulation/World.ts -> src/simulation/Colony.ts`

## Communities (29 total, 10 thin omitted)

### Community 0 - "UI Controls & Entry Point"
Cohesion: 0.02
Nodes (73): AntSim Package (package.json), InsectType, analyzeBtn, antColorPicker, bloomRange, bloomToggle, buildInfo, camera (+65 more)

### Community 1 - "Ant Agent Core"
Cohesion: 0.07
Nodes (20): Ant, Ant Tests, harvestFrom(), handleCombat(), handleDigging(), handleFleeing(), handleForaging(), handleHarvesting() (+12 more)

### Community 2 - "Simulation Test Suite"
Cohesion: 0.06
Nodes (20): sample(), Brood, BroodStage, Brood Tests, Colony, EntranceSide, HeadlessMetrics, runHeadless() (+12 more)

### Community 3 - "Rendering Pipeline"
Cohesion: 0.10
Nodes (32): Renderer, darknessFactor(), drawFireflies(), drawGodRays(), drawLighting(), drawRain(), drawShadows(), drawVignette() (+24 more)

### Community 4 - "Design Docs & Concepts"
Cohesion: 0.14
Nodes (42): AntSim V2 Architecture & Mechanics Document, Balance Model - Vital Rates & Target Values, Agent-Based Simulation, Colony Lifecycle (Brood Pipeline), Day/Night Cycle, Finite State Machine (Ant Behaviour), Pheromone Trail System, Rival Colony & War Mechanics (+34 more)

### Community 5 - "Camera & Sprite Baking"
Cohesion: 0.11
Nodes (12): Camera, bakeAnt(), bakeCargo(), bakeDisc(), CARGO_TINT, FOOD_TYPES, INSECT_TYPES, isLowQuality() (+4 more)

### Community 6 - "Sim Observer & Tuner"
Cohesion: 0.11
Nodes (21): applyTunerAction(), GraphPoint, mkAction(), nudgeValue(), SeverityLevel, SimObserver, Snapshot, FakeOpts (+13 more)

### Community 7 - "Project Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, pixi-filters, pixi.js, devDependencies, terser, typescript, vite, @vitejs/plugin-legacy (+13 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 10 - "Nest View Screenshot"
Cohesion: 0.31
Nodes (10): Brood Cluster (Eggs/Larvae), Build Status Bar (2025-12-17 RELEASE 2.0), Digging Behavior, Surface Entrance Tunnel, Excavated Nest Chambers, Nest View Screenshot, Queen Ant, Connecting Tunnels (+2 more)

### Community 11 - "World View Screenshot"
Cohesion: 0.27
Nodes (10): Ant Colony Simulation (AntSim), Ants, Dark Burrow Holes / Nest Entrances, Glowing Food Orbs, Grass Tufts Vegetation, Insects (Glowing Bugs and Moth), Dark Ambient Night Lighting, Rocks and Stones (+2 more)

### Community 12 - "Integration & Soak Tests"
Cohesion: 0.29
Nodes (10): Bench Soak Test, Colony Soak Test, Environment Test Suite, Headless Soak Test Suite, Headless Test Suite, SimObserver Test Suite, SpatialGrid Test Suite, Trophallaxis Soak Test (+2 more)

### Community 14 - "Food System"
Cohesion: 0.29
Nodes (3): Food, FoodType, Food Tests

### Community 15 - "UI Loop & Inspector"
Cohesion: 0.33
Nodes (7): applyAntColor(), clearSelection(), drawStats(), loop(), recordFps(), restartWorld(), updateInspector()

### Community 18 - "Playback Speed Controls"
Cohesion: 0.67
Nodes (3): applySpeed(), saveUiState(), stepSpeed()

## Ambiguous Edges - Review These
- `World View Screenshot` → `Ants`  [AMBIGUOUS]
  docs/screen-world.png · relation: references

## Knowledge Gaps
- **152 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `World View Screenshot` and `Ants`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `World` connect `Ant Agent Core` to `UI Controls & Entry Point`, `Simulation Test Suite`, `Rendering Pipeline`, `Camera & Sprite Baking`, `Sim Observer & Tuner`, `Nest Structure & Tunnels`, `Spatial Grid Indexing`, `Food System`, `Terrain & Collision`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `Nest` connect `Nest Structure & Tunnels` to `Ant Agent Core`, `Simulation Test Suite`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `Queen` connect `Simulation Test Suite` to `Integration & Soak Tests`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Controls & Entry Point` be split into smaller, more focused modules?**
  _Cohesion score 0.023529411764705882 - nodes in this community are weakly interconnected._
- **Should `Ant Agent Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06561859193438141 - nodes in this community are weakly interconnected._