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

### Grafik & UX
- [x] HUD/Control-Panel-Shell, Inspector-Panel, Tuner-/Slider-Panels
- [x] Pheromon-Overlay deckungsgleich unter Kamera (Logik-Space-Rework)
- [x] Nest-Pheromon-Overlay-Mapping gefixt → **dann komplett ausgeblendet** (im Nest zu dicht)

## 🔜 In Arbeit
- [ ] **Statistik-Graphen** (Schritt 3/3 des UI-Blocks): Verlaufskurven für
  Population / Energie / Zucker / Protein (nutzt SimObserver-Snapshots)

## 🧭 Geplant / Stretch
- [ ] Rivalisierende Kolonie + Krieg (`colonyId`, 2. Nest/Königin) — großer struktureller Eingriff
- [ ] Mobile **Touch/Pinch**-Steuerung für die Kamera (aktuell Maus-only)
- [ ] Screenshot-/Export-Funktion
- [ ] WebWorker für den Sim-Step (Render entkoppeln)
- [ ] Mehr Tests für die Ökonomie (Queen/World-Integration)

## Hinweise für Mitarbeitende
- Build: `npm run build` (strenges `tsc`) · Dev: `npm run dev` · Tests: `npm run test`
- Tunable-Parameter zentral in `src/config.ts`; Laufzeit-Overrides via `src/configStore.ts`
- Läuft auf Raspberry Pi 4: Quality `Ultra Low`/`Low` (Diffusion aus, 0.4× Auflösung); Auto-Downgrade bei <20 FPS
