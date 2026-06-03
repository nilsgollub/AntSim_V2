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

- [x] **Kampf / Flucht / Alarm / Soldaten-Rekrutierung** (Realismus, `CONFIG.combat`):
  Soldaten folgen jetzt dem DANGER-Gradienten **zum Alarmherd** (statt nur Patrouille);
  Worker mobben/fliehen nach **lokaler Übermacht** (`countNearbyAllies` vs `countNearbyEnemies`)
  statt fester Zahl; Feinde werden beim **Schwärmen verlangsamt** (Grapple, `Insect.grappleSlow`).
  Harness-verifiziert: Kolonie übersteht Angriffe (seed7 @30k ≈ 152 Ameisen, ~30 % Soldaten).
  **Räuber-Stärke (`CONFIG.enemy`):** Predator/Spider/Beetle haben config-getriebene HP+Schaden
  (Predator 30/4 → 42/6, Spider 25/6 → 32/7, Beetle 80/10 → 88/12) — ein moderater Buff, damit ein
  Räuber pro Begegnung spürbar Ameisen kostet. Grapple leicht gelockert (0.15/0.8).
  *Lektion (harness-belegt):* Die 30k-Langzeit-Überlebensrate (~50–60 %) ist **RNG-dominiert**, nicht
  predator-stärke-dominiert — jede Balance-Änderung mischt nur durch, welche Seeds kollabieren. Ein
  erster Über-Buff (55/7 + AoE-Biss auf den ganzen Schwarm) wurde zurückgenommen, weil der AoE eine
  mobbende Squad auf einen Schlag auslöschen konnte. Kolonie etabliert sich verlässlich (Soak seed7
  @6000 grün); ein einzelner sehr langer Run kann an einen Räuberangriff verloren gehen (realistisch).

- [x] **Kolonie-Resilienz gegen den Protein-Todesspiral**: Diagnose (harness-Trajektorie eines
  sterbenden Seeds) zeigte den echten Mechanismus — **nicht** Zucker/Energie (bleiben gesund),
  sondern **Protein**: Income ≈ Demand ohne Puffer, ab Feind-Spawn (~t6000) kippt es → Brut
  verhungert → keine neuen Ameisen → Population altert aus. Hebel:
  • Larven-Protein-Drain `broodProteinUpkeep` 0.0015 → 0.0006 (Brut übersteht Engpässe).
  • Protein-Ertrag pro Jagd `proteinValue` 5→7×WORLD_SCALE (Income-Margin).
  • Eine harte „Königin-Reserve" (Eierlegen-Stopp bei Protein < N) wurde getestet und **verworfen** —
    sie fror das Eierlegen ein und garantierte Brut→0. Die Pipeline am Leben zu halten ist resilienter.
  Harness: zuvor sterbende Seeds (7, 12345) überleben jetzt, keine Regression; Margin dient zugleich
  dem Pop-Ziel (~200, da Peak vorher nur ~66). *Hinweis:* Rest-Seed-Sterblichkeit ist RNG-Stochastik
  (siehe Kampf-Item) — ohne Aggregat-Druck (Spawnraten) zu senken nicht weiter wegtunebar.
  *Offen/Ideen:* Notfall-Rekrutierung, Rückzug-Sammelpunkt.

- [x] **Trophallaxis / Sozialer Magen**: Forager füllen beim Ernten ihren Crop (`Ant.cropSugar`,
  `CONFIG.ant.troph`) und geben ihn im Nest gedrosselt mund-zu-mund an hungrige Nestgenossinnen ab
  (`spatialGrid.getNearby` + Energie-Transfer, eine Übergabe pro Versuch). Topt Ammen *im Vorbeigehen*
  auf, bevor sie zum Lager pilgern → weniger Storage-Andrang. Konservativ (verschiebt Energie, kein
  `rand()` → Golden stabil). `World.trophallaxisCount` als Live-Stat + Test-Guard (seed7 @8000 ≈ 70
  Fütterungen, Kolonie gesund). *Offen:* Larven-Trophallaxis, sichtbares Fütter-Partikel.

- [ ] **Larven-Ernährung bestimmt Kaste**: `Brood.cumulativeFood` verfolgt Gesamtfütterung;
  gut gefütterte Larven (`> CONFIG.brood.soldierFoodThreshold`) verpuppen sich zu Soldaten,
  unterversorgte zu Arbeitern. Gibt dem Spieler Einfluss auf Kastenzusammensetzung via
  Protein-Angebot.

- [x] **Funktionale Polymorphie** (`sizeVar` → echte Stats): `sizeVar` ist jetzt kasten-korreliert
  (`CONFIG.ant.poly`) und treibt sowohl Zeichengröße ALS AUCH echte Stats. **Soldaten** sind größer
  (sizeVar 1.25–1.50) → mehr HP/Biss, aber langsamer + höherer Unterhalt; **Arbeiter** kleiner
  (0.80–1.05) → schneller + günstiger. HP/Schaden skalieren **kasten-zentriert** (auf den jeweiligen
  Mittelwert normiert), sodass die Kasten-*Durchschnitte* — und die getunte Kampfbalance — exakt
  erhalten bleiben; nur Intra-Kasten-Varianz kommt dazu. Speed/Upkeep skalieren mit der *absoluten*
  Größe → echter kastenübergreifender Unterschied. `Ant.attackDamage/sizeSpeed/sizeUpkeep` aus
  Konstruktor. Tests (3) sichern: Soldaten zäher/stärker/langsamer/teurer + Kasten-Durchschnitt = Basis.

- [x] **Dynamischer Nestausbau / Excavation (v2)**: Start mit einer Gründungskammer
  (alle Rollen), die sich mit Koloniewachstum differenziert — `Nest.growStage()`
  gräbt nach und nach Nursery/Granary/Erweiterungen aus. **Baum-Topologie statt Stern:**
  neue Kammern docken an *jede* bestehende Kammer an, werden aber strikt **radial nach
  außen** gesetzt (weiter vom Hub weg als ihr Elternteil). Der alte Stern (alles am Hub)
  capte physisch bei ~8 Kammern; der Baum passt 25+ rein (Harness: 26/26 in Grenzen +
  erreichbar), während die Greedy-Navigation robust bleibt (Heimweg ist immer „nach innen",
  monoton). `excavateEvery` 18→10 + höheres `maxExtraChambers` → sichtbar mehr Kammern.
  Rollen-Modell `getChamber(role)` statt fixem Typ. *Offen:* per-Ameise `DIGGING`-Zustand.

- [x] **Funktionale Kammern** (Kammern haben echte Aufgaben, nicht nur Deko): Rollen-Modell auf
  *mehrere Kammern pro Rolle* erweitert (`getChambers`/`nearestChamber`). Grabungs-Rotation:
  Nursery → Granary → **Friedhof** → dann Mix aus Granaries/Nurseries.
  • **Granaries (STORAGE):** geben echte Lagerkapazität — globaler Vorrat ist gedeckelt bei
    `base + perGranary × Granary-Zahl` (`CONFIG.nest.storage*`); mehr Granaries = mehr Vorrat.
    Piles werden über alle Granaries verteilt gezeichnet.
  • **Mehrere Bruthöhlen (BROOD):** Brut gilt nur als „verlegt", wenn sie außerhalb *aller* Nurseries
    liegt; Ammen tragen sie in die beim Aufheben **committete** nächste Nursery (kein Frame-Thrashing).
  • **Friedhof (CEMETERY):** **Ameisen**leichen werden zur nächsten Friedhofskammer getragen
    (Sanität) und ruhen in `world.graveyard` (aus dem Foraging-Pool raus → kein O(Tote)-Scan-Blowup),
    wo sie langsam vermodern. **Insekten**leichen bleiben Beute → Protein.
  *Lektion:* per-Frame „nächste Kammer" ließ Ameisen zwischen Räumen oszillieren und nie ankommen →
  Ziele werden jetzt einmal committet (`Ant.carryTarget`) bzw. auf die primäre Kammer geführt.

- [x] **Sammler-Gedächtnis / Site Fidelity**: `Ant.foodMemoryX/Y` + `steerToMemory()`;
  Forager kehrt zur letzten erfolgreichen Quelle zurück (Fallback hinter Pheromon-Spur),
  vergisst sie bei Erschöpfung. `CONFIG.ant.memoryBias` + Slider.

- [x] **Trail-Stärke ∝ Futterqualität**: `Ant.carryingQuality` aus `food.amount` skaliert
  den `depositFood`-Trail. Reiche Quellen → starke Roads, erschöpfte → verblassen.
  `CONFIG.pheromone.qualityRef/minQuality`.

### Umwelt & Dynamik
- [x] **Nachtaktivität**: `World.dayBrightness()` (aus `timeOfDay`) + `activityFactor()` koppeln
  Speed UND Sensorreichweite der **Außen**-Ameisen an die Tageszeit — tagsüber 100 %, in tiefer
  Nacht runter auf `CONFIG.environment.nightActivityMin` (0.5). Die Kolonie fährt nachts herunter
  und wieder hoch. Nest-Ameisen unberührt (unter der Erde eh dunkel). Deterministisch (reine
  Funktion der Zeit).

- [x] **Wetter / Regen**: zufällige Schauer (`CONFIG.environment.rain*`, seeded → deterministisch)
  waschen die **Außen**-Pheromon-Grids pro Frame weg (`grid.scaleAll(rainWashout)`) → Straßen
  verblassen, die Kolonie muss neu auskundschaften/rekrutieren. Der unterirdische `nestGrid` bleibt
  geschützt. Visuell: Regen-Streifen + abgedunkelter Himmel (`Renderer.drawRain`, render-only-Zufall).
  *Offen:* Sandbox-Button zum manuellen Auslösen, Pfützen/Bodennässe.

### Technik & Struktur
- [~] **Rivalisierende Kolonie + Krieg** (`colonyId`, 2. Nest/Königin) — großer struktureller Eingriff, phasiert.
  - [x] **Phase 1 — `Colony` extrahiert**: kolonie-eigener Zustand (Queen, Nest, Brut, Ameisen,
    `nestGrid`, Vorräte, `trophallaxisCount`, Brut-Getter, `spawnAnt`, `storageCapacity`) lebt jetzt
    auf `src/simulation/Colony.ts`; `World` hält `colonies[]` + **Back-Compat-Getter/Setter** auf
    colony 0, sodass jeder Aufrufer/Test unberührt bleibt. `ant.colony`-Rückreferenz gesetzt (von
    Handlern noch nicht konsultiert). `World.update()`-Orchestrierung bewusst unverändert (die
    Kolonie-Arbeit ist mit globaler verschachtelt → ein monolithisches `colony.update()` würde den
    RNG-Stream umsortieren). **Golden byte-identisch, 76/76 grün** = Beweis der Verhaltens-Neutralität.
  - [ ] Phase 2 — Heimweg/Eingang von Welt-Rändern (`CONFIG.width/height`) auf `colony.entrance*` entkoppeln.
  - [ ] Später: 2. Kolonie (`CONFIG.colonyCount=2` + Sandbox-Button), per-Kolonie Outdoor-Pheromone,
    Ant-vs-Ant (Grenz-Scharmützel, wiederverwendet Kampf/Alarm/Mob), Team-Farben.
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

- [x] **Sim-Fidelity von Render-Quality entkoppelt**: Pheromon-Grid-Auflösung, Diffusion und
  Update-Takt hingen an den Quality-Presets → Verhalten änderte sich je Grafikstufe. Jetzt fest in
  `CONFIG.pheromone` (`resolutionScale`/`updateSkip`/`diffusionEnabled`, verankert an den früheren
  MEDIUM-Werten) — die Sim ist **quality-unabhängig & deterministisch**, nur das Rendering skaliert.
  `PerformanceManager` führt keine Sim-Fidelity-Felder mehr (`pheromoneResolutionScale`/
  `pheromoneDiffusion` entfernt; `pheromoneUpdateSkip` bleibt rein für die Overlay-Redraw-Frequenz).
  Harness-Test beweist es: identische Metriken (seed12345 @2500) über ULTRA→ULTRA_LOW. Golden
  unverändert (an MEDIUM verankert). *Offen:* `maxAnts` ist weiter quality-gekoppelt — eigene Achse
  (CPU-Skalierung/Population-Cap), bindet im Normalbetrieb (~170 < 300) nicht.

- [x] **`Ant.ts` (FSM) entflechtet**: die 12 State-Handler nach `src/simulation/antStates.ts`
  ausgelagert (freie Funktionen `(ant, world)`); `Ant.ts` 1490 → 486 Zeilen (nur noch Daten +
  Low-Level-Primitive: move/sense/separation/steering). Verhalten **bit-identisch** (Golden-Test
  unverändert) — der Harness hat den Refactor lückenlos abgesichert. *Offen:* `Renderer.ts`
  analog in Layer aufteilen.

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
