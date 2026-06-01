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
- [ ] **Temporale Polyethie** *(empfohlen als nächster Schritt)*: Aufgabenverteilung nach Alter —
  jung (≤20 % lifespan) → NURSING-Bias, mittelalt → Lagerhaltung/MILKING,
  alt (≥70 % lifespan) → FORAGING/PATROLLING. Implementierung: `Ant.getPreferredRole()` prüft
  `this.age / this.maxAge`; `World.assignIdleRole()` bevorzugt passende Rollen.
  Keine neuen Zustände nötig, nur Gewichtung in der FSM-Idle-Transition.

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

- [ ] **Dynamischer Nestausbau / Excavation**: Kolonie-Wachstum über eine Schwelle löst
  DIGGING-Zustand aus — Ameisen „graben" neue Kammern auf `nestCanvas`
  (Zellen-Freischalten + Tunnel-Partikel). Visuell: neue Bereiche hellen sich auf.
  Großer struktureller Eingriff (neuer State in FSM + NestLayout-Klasse).

- [ ] **Sammler-Gedächtnis / Site Fidelity**: Forager merkt sich zuletzt erfolgreich besuchte
  Futterquelle (`privateTargetX/Y`); kehrt bevorzugt dorthin zurück (statt reinem Pheromon-
  Folgen). Macht Straßen-Entstehung realistischer und stabiler.

- [ ] **Trail-Stärke ∝ Futterqualität**: `Food.amount` (oder ein `quality`-Feld) skaliert
  `depositFood`-Menge beim Heimtragen. Reiche Quellen ziehen mehr Ameisen an; erschöpfte
  Quellen verlieren automatisch ihren Trail.

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

## Hinweise für Mitarbeitende
- Build: `npm run build` (strenges `tsc`) · Dev: `npm run dev` · Tests: `npm run test`
- Tunable-Parameter zentral in `src/config.ts`; Laufzeit-Overrides via `src/configStore.ts`
- Läuft auf Raspberry Pi 4: Quality `Ultra Low`/`Low` (Diffusion aus, 0.4× Auflösung); Auto-Downgrade bei <20 FPS
