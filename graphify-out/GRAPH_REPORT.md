# Graph Report - .  (2026-06-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 492 nodes · 1037 edges · 24 communities (17 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3720f304`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Controls & Settings|UI Controls & Settings]]
- [[_COMMUNITY_Colony & Insect Behavior|Colony & Insect Behavior]]
- [[_COMMUNITY_Rendering Pipeline|Rendering Pipeline]]
- [[_COMMUNITY_Simulation Design Docs|Simulation Design Docs]]
- [[_COMMUNITY_Brood Lifecycle System|Brood Lifecycle System]]
- [[_COMMUNITY_Ant Agent Logic|Ant Agent Logic]]
- [[_COMMUNITY_Camera & Sprite Baking|Camera & Sprite Baking]]
- [[_COMMUNITY_Sim Observer & Tuner|Sim Observer & Tuner]]
- [[_COMMUNITY_Nest Structure & Tunnels|Nest Structure & Tunnels]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Spatial Grid Indexing|Spatial Grid Indexing]]
- [[_COMMUNITY_Food System|Food System]]
- [[_COMMUNITY_UI Loop & Inspector|UI Loop & Inspector]]
- [[_COMMUNITY_Terrain & Collision|Terrain & Collision]]
- [[_COMMUNITY_Playback Speed Controls|Playback Speed Controls]]
- [[_COMMUNITY_WebGL Detection|WebGL Detection]]
- [[_COMMUNITY_Vite Logo Asset|Vite Logo Asset]]
- [[_COMMUNITY_TypeScript Logo Asset|TypeScript Logo Asset]]

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
10. `World.ts - Central Controller` - 18 edges

## Surprising Connections (you probably didn't know these)
- `GitHub Pages Deployment Workflow` --references--> `main.ts - Entry Point`  [INFERRED]
  .github/workflows/pages.yml → src/main.ts
- `Insect.ts - Prey & Predators` --conceptually_related_to--> `Agent-Based Simulation`  [INFERRED]
  src/simulation/Insect.ts → ARCHITECTURE_AND_MECHANICS.md
- `AntSim V2 Architecture & Mechanics Document` --references--> `Camera.ts - Pan/Zoom`  [EXTRACTED]
  ARCHITECTURE_AND_MECHANICS.md → src/graphics/Camera.ts
- `Deployment on Home Assistant OS & Raspberry Pi Kiosk` --references--> `main.ts - Entry Point`  [INFERRED]
  DEPLOYMENT_HAOS.md → src/main.ts
- `AntSim V2 Main HTML Entry Point` --references--> `main.ts - Entry Point`  [EXTRACTED]
  index.html → src/main.ts

## Import Cycles
- 3-file cycle: `src/simulation/Colony.ts -> src/simulation/Queen.ts -> src/simulation/World.ts -> src/simulation/Colony.ts`

## Communities (24 total, 7 thin omitted)

### Community 0 - "UI Controls & Settings"
Cohesion: 0.02
Nodes (72): InsectType, analyzeBtn, antColorPicker, bloomRange, bloomToggle, buildInfo, camera, cameraResetBtn (+64 more)

### Community 1 - "Colony & Insect Behavior"
Cohesion: 0.06
Nodes (5): Colony, Insect, PheromoneGrid, Queen, World

### Community 2 - "Rendering Pipeline"
Cohesion: 0.10
Nodes (32): Renderer, darknessFactor(), drawFireflies(), drawGodRays(), drawLighting(), drawRain(), drawShadows(), drawVignette() (+24 more)

### Community 3 - "Simulation Design Docs"
Cohesion: 0.14
Nodes (43): AntSim V2 Architecture & Mechanics Document, Balance Model - Vital Rates & Target Values, Agent-Based Simulation, Colony Lifecycle (Brood Pipeline), Day/Night Cycle, Finite State Machine (Ant Behaviour), Pheromone Trail System, Rival Colony & War Mechanics (+35 more)

### Community 4 - "Brood Lifecycle System"
Cohesion: 0.10
Nodes (13): Brood, BroodStage, EntranceSide, HeadlessMetrics, runHeadless(), Metrics, runAt(), Chamber (+5 more)

### Community 5 - "Ant Agent Logic"
Cohesion: 0.11
Nodes (18): Ant, harvestFrom(), sample(), handleCombat(), handleDigging(), handleFleeing(), handleForaging(), handleHarvesting() (+10 more)

### Community 6 - "Camera & Sprite Baking"
Cohesion: 0.11
Nodes (12): Camera, bakeAnt(), bakeCargo(), bakeDisc(), CARGO_TINT, FOOD_TYPES, INSECT_TYPES, isLowQuality() (+4 more)

### Community 7 - "Sim Observer & Tuner"
Cohesion: 0.11
Nodes (20): applyTunerAction(), GraphPoint, mkAction(), nudgeValue(), SeverityLevel, SimObserver, Snapshot, FakeOpts (+12 more)

### Community 9 - "Project Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, pixi-filters, pixi.js, devDependencies, terser, typescript, vite, @vitejs/plugin-legacy (+13 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 13 - "UI Loop & Inspector"
Cohesion: 0.33
Nodes (7): applyAntColor(), clearSelection(), drawStats(), loop(), recordFps(), restartWorld(), updateInspector()

### Community 15 - "Playback Speed Controls"
Cohesion: 0.67
Nodes (3): applySpeed(), saveUiState(), stepSpeed()

## Knowledge Gaps
- **135 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+130 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `World` connect `Colony & Insect Behavior` to `UI Controls & Settings`, `Rendering Pipeline`, `Brood Lifecycle System`, `Ant Agent Logic`, `Camera & Sprite Baking`, `Sim Observer & Tuner`, `Nest Structure & Tunnels`, `Spatial Grid Indexing`, `Food System`, `Terrain & Collision`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Why does `Nest` connect `Nest Structure & Tunnels` to `Colony & Insect Behavior`, `Brood Lifecycle System`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `Renderer` connect `Rendering Pipeline` to `UI Controls & Settings`, `Camera & Sprite Baking`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _135 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Controls & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.023809523809523808 - nodes in this community are weakly interconnected._
- **Should `Colony & Insect Behavior` be split into smaller, more focused modules?**
  _Cohesion score 0.06253652834599649 - nodes in this community are weakly interconnected._
- **Should `Rendering Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.09941944847605225 - nodes in this community are weakly interconnected._