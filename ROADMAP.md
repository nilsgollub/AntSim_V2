# AntSim V2 — Roadmap & Status

Lebendes Statusdokument für den „v2.0"-Overhaul. Abgehakt = im Branch
`claude/ant-simulation-review-*` umgesetzt, gebaut und getestet.

## ✅ Erledigt

### Fundament & Code-Qualität
- [x] Vitest eingerichtet; **40 Tests grün** (PheromoneGrid, Brood, SpatialGrid, Food, SimObserver, configStore)
- [x] `window`-Guard in `config.ts` (Import in node/Test-Umgebung)
- [x] Magic Numbers aus `Ant.ts`/`Brood.ts` → gruppierte `CONFIG.*` (ant/pheromone/brood)
- [x] README + ARCHITECTURE-Doc aktualisiert (Diffusion, Camera, Tuner, Testing)
- [x] Debug-Cruft im Renderer entfernt

### Simulationstiefe
- [x] Echte Pheromon-**Diffusion** (separierbarer Box-Blur, Perf-gegated, ULTRA_LOW/LOW aus)
- [x] Grid-Skala an `pheromoneResolutionScale` gekoppelt (Grid==Overlay-Canvas)
- [x] Ameisen-**Lebensspanne**/natürlicher Tod (`age`/`maxAge`)
- [x] **Ressourcen-Ökonomie** mit echten Senken:
  - Königin zieht Energie aus Zuckervorrat (`queenSugarRegen`)
  - Essen kostet Zucker anteilig zur Energie (`sugarEnergyValue`)
  - Passiver Kolonie-Unterhalt (Zucker/Ameise, Protein/Larve)
- [x] Eierlege-Intervall config-getrieben + verlangsamt (Wachstums-Balance)
- [x] „Weitläufigkeit" & Straßenbildung: scharfe/langlebige Futter-Spuren
  (keine Diffusion auf SUGAR/PROTEIN), Auswärts-Dispersion der Explorer,
  mehr Futterquellen — alles per Slider tunebar

### Interaktivität & Tools
- [x] **Kamera**: Pan (Drag) + Zoom-to-Cursor (Maus)
- [x] **Inspect**: Klick auf Ameise → Live-Panel (State/Energie/Health/Alter/Fracht)
- [x] **Sandbox**: Zucker/Protein platzieren, Feind spawnen
- [x] **Pause/Step** (Render läuft im Pause weiter)
- [x] **Parameter-Tuner** (`SimObserver`): sampelt Metriken, gibt Vorschläge mit
  Schweregrad + Effekt-Erklärung; erkennt u.a. Über-/Unterversorgung & zu schnelles Wachstum
- [x] Tuner-Vorschläge **per Knopf anwendbar** (konkrete CONFIG-Aktionen)
- [x] **Persistenz** (localStorage): Tuner-Anpassungen + Quality/Pheromon/Speed überleben Reload; Reset-Button
- [x] **Live-Parameter-Slider** für alle Hot-Tunables
- [x] **Statistik-Graphen** (Verlauf: Population / Zucker / Protein / Energie)

### Grafik & UX
- [x] HUD/Control-Panel-Shell, Inspector-Panel, Tuner-/Slider-Panels
- [x] Pheromon-Overlay deckungsgleich unter Kamera (Logik-Space-Rework)
- [x] Nest-Pheromon-Overlay-Mapping gefixt → **dann komplett ausgeblendet** (im Nest zu dicht)

### Optische Politur
- [x] Tag/Nacht-Beleuchtung sichtbar (drawLighting verdrahtet, alle Stufen)
- [x] HiDPI-Schärfe (Rendering auf devicePixelRatio, gedeckelt bei 2)
- [x] Pheromon-Trails als weiche Duftwolken (additives Blending + Blur)
- [x] Ameisen-Varianz (Größe + Helligkeit gegen den „Klon-Look")

## 🧭 Geplant / Stretch

### Realismus — Ameisenbiologie
- [x] **Temporale Polyethie**: alters-gewichtete Idle-Transition via `Ant.forageUrge()`
  (jung → Nursing, alt → Foraging); `CONFIG.ant.nurse/forageAgeFraction` + Slider.

- [ ] **Trophallaxis / Sozialer Magen**: Ameisen tragen Crop-Inhalt (`cropSugar: number`);
  beim Passieren einer hungrigen Nestgenossin oder Larve wird Nahrung direkt mund-zu-mund
  weitergegeben (`spatialGrid.getNearby` + Energie-Transfer). Reduziert Heimweg-Traffic.

- [ ] **Larven-Ernährung bestimmt Kaste**: `Brood.cumulativeFood` verfolgt Gesamtfütterung;
  gut gefütterte Larven (`> CONFIG.brood.soldierFoodThreshold`) verpuppen sich zu Soldaten,
  unterversorgte zu Arbeitern. Gibt dem Spieler Einfluss auf Kastenzusammensetzung via
  Protein-Angebot.

- [ ] **Funktionale Polymorphie** (`sizeVar` → echte Stats): `sizeVar` beeinflusst aktuell nur
  Optik. Erweiterung: Soldat (sizeVar ≥ 1.3) → +50 % HP, +30 % Angriffsschaden, −20 % Speed,
  höherer Unterhalt; Arbeiter (sizeVar ≤ 0.9) → schneller, günstiger. Konsistent mit
  `CONFIG.ant.*`-Multiplikatoren.

- [x] **Dynamischer Nestausbau / Excavation (v1)**: Start mit einer Gründungskammer
  (alle Rollen), die sich mit Koloniewachstum differenziert — `Nest.growStage()`
  gräbt nach und nach Nursery/Granary/Erweiterungen aus (Stern-Topologie, in Grenzen,
  Excavation-Staub). Rollen-Modell `getChamber(role)` statt fixem Typ. Navigation
  gehärtet (Wall-Sliding). *Offen:* per-Ameise `DIGGING`-Zustand (Ameisen graben physisch).

- [x] **Sammler-Gedächtnis / Site Fidelity**: `Ant.foodMemoryX/Y` + `steerToMemory()`;
  Forager kehrt zur letzten erfolgreichen Quelle zurück (Fallback hinter Pheromon-Spur),
  vergisst sie bei Erschöpfung. `CONFIG.ant.memoryBias` + Slider.

- [x] **Trail-Stärke ∝ Futterqualität**: `Ant.carryingQuality` aus `food.amount` skaliert
  den `depositFood`-Trail. Reiche Quellen → starke Roads, erschöpfte → verblassen.
  `CONFIG.pheromone.qualityRef/minQuality`.

### Umwelt & Dynamik
- [ ] **Nachtaktivität** (Geschwindigkeit an `timeOfDay` koppeln): Ameisen reduzieren Speed
  und Sensorreichweite bei `lighting < 0.4`; Kolonie fährt herunter. Bestraft schlechte
  Vorratshaltung, belohnt tageszeitliches Wirtschaften.

- [ ] **Wetter / Regen**: Regen-Event (zufällig oder per Sandbox-Button) dämpft alle
  Pheromon-Grids (`toSugar *= 0.98` pro Frame für Dauer des Regens), wäscht Straßen weg
  und erzwingt Neu-Rekrutierung. Visuell: Regen-Partikel + abgedunkelter Himmel.

### Technik & Struktur
- [ ] **Rivalisierende Kolonie + Krieg** (`colonyId`, 2. Nest/Königin) — großer struktureller Eingriff
- [ ] **Mehr Tests für die Ökonomie** (Queen/World-Integration)
- [ ] Mobile **Touch/Pinch**-Steuerung für die Kamera (aktuell Maus-only)
- [ ] Screenshot-/Export-Funktion
- [ ] WebWorker für den Sim-Step (Render entkoppeln)

## 🏗 Architektur & Technische Schuld (Refactors)
„Was würde ich anders machen, wenn ich neu anfinge" — geerdet an den Schmerzpunkten
dieser Session (Balance-Whiplash, Navigations-Hänger, blindes Tunen). **Kein Rewrite** —
gezielte Nachrüstung. Nach Hebelwirkung sortiert.

- [x] **Deterministische Simulation (seeded PRNG)**: `src/rng.ts` (mulberry32, `seedRng`/`rand`);
  alle 87 `Math.random()`-Aufrufe in `src/simulation/*` ersetzt. `main.ts` seedet beim Start
  (`?seed=<n>` reproduziert einen Run exakt). Rendering-Zufall bleibt bewusst auf `Math.random()`.

- [x] **Headless Metrik-Harness für emergentes Verhalten**: `src/simulation/headless.ts`
  (`runHeadless(seed, ticks)` → Aggregat-Metriken, ohne DOM). Tests prüfen Determinismus
  (gleicher Seed → identischer Run) + Kolonie-Stabilität (Soak: stirbt nicht aus, bleibt
  unter Cap, kein Vorrat dauerhaft 0, Brut lebt). Macht Balance verifizierbar statt „im Browser".

- [ ] **Explizites Balance-Modell statt reaktivem Tunen**: Vitalraten (Geburt/Tod/Ertrag/
  Verbrauch) dokumentieren; Parameter aus Zielwerten ableiten (z.B. Pop ≈ lifespan/layInterval)
  statt Magic Numbers zu raten. Teilweise vorhanden (config-Gruppen + Tuner), aber nicht als Modell.

- [ ] **Sim-Fidelity von Render-Quality entkoppeln**: Pheromon-Grid-Auflösung/Diffusion hängen
  aktuell an den Quality-Presets → Verhalten ändert sich je Grafikstufe. Sim sollte
  quality-unabhängig & deterministisch sein, nur das Rendering skaliert.

- [ ] **`Ant.ts` (FSM) entflechten**: 1350-Zeilen-Gott-Klasse; 12 Zustände + implizite,
  sich gegenseitig mutierende Übergänge (Quelle der „target loss"-Fehlerklasse). In diskrete
  State-Handler aufteilen, Perzeption/Steuerung/Entscheidung trennen. Reine Mechanik, kein
  Verhaltensänderung. (`Renderer.ts` analog in Layer aufteilen.)

- [ ] **Robuste Nest-Navigation**: Kreis-Union + Greedy-Pfadsuche war die Wurzel des Hängens.
  Ersetzbar durch Raum-Graph mit expliziten Kanten + A* (robust by design). Teil-entschärft
  (Stern-Topologie + Wall-Sliding, bereits im Hauptbranch); eine echte Graph-Pfadsuche steht aus.

- [ ] **Daten-orientiert für Skalierung (ECS / Structure-of-Arrays)**: Objekt-pro-Ameise ist
  GC-/Cache-unfreundlich; für >500 Ameisen oder Kolonienkrieg deutlich schneller in SoA/ECS.
  Erst angehen, wenn die Performance-Grenze real erreicht wird.

- [ ] **Einheitlicher Spatial-Index für alle Entitäten**: `SpatialGrid` indiziert nur Ameisen;
  Food/Insekten werden brute-force durchsucht. Vereinheitlichen.

## Hinweise für Mitarbeitende
- Build: `npm run build` (strenges `tsc`) · Dev: `npm run dev` · Tests: `npm run test`
- Tunable-Parameter zentral in `src/config.ts`; Laufzeit-Overrides via `src/configStore.ts`
- Läuft auf Raspberry Pi 4: Quality `Ultra Low`/`Low` (Diffusion aus, 0.4× Auflösung); Auto-Downgrade bei <20 FPS
