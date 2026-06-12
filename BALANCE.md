# Balance-Modell — Vitalraten & Zielwerte

Explizites Modell statt reaktivem Tunen: Hier steht, **welche Raten** das
Kolonie-Gleichgewicht bestimmen und **wie die Zielwerte aus ihnen folgen**.
Wer einen Parameter ändert, kann hier ablesen, was er verschiebt — und der
Headless-Harness (`npm run test:soak`) verifiziert die Folgen.

Alle Raten in Einheiten **pro Frame** (Tick); ~60 Frames ≈ 1 s. Quellwerte
aus `src/config.ts` (Stand Juni 2026 — bei Config-Änderungen hier nachziehen).

## 1. Population

```
Gleichgewichts-Population ≈ lifespan / queenLayInterval
                          ≈ 38000 / 180 ≈ 211
```

- **Geburtsrate**: 1 Ei je `queenLayInterval` (180) Frames, solange die Königin
  Energie hat und Protein für die Brut da ist.
- **Sterberate**: jede Ameise lebt `lifespan ± lifespanJitter` (38000 ± 12000)
  Frames → bei Population P sterben im Mittel `P / 38000` Ameisen/Frame.
- Gleichgewicht, wo Geburts- = Sterberate: `1/180 = P/38000` → **P ≈ 211**.
  Das ist der Hebel hinter dem „~200 Ameisen"-Ziel: Population skaliert linear
  mit `lifespan` und invers mit `queenLayInterval`.
- **Pipeline-Verzögerung**: Ei→Ameise dauert `eggDuration + larvaDuration +
  pupaDuration` = 1000 + 2000 + 1500 = **4500 Frames** (~75 s). Balance-Änderungen
  wirken also erst nach ~1 Spieltag sichtbar auf die Population.
- Harter Deckel: `PerformanceManager.maxAnts` (quality-abhängig, bindet im
  Normalbetrieb bei ~211 < 300 nicht).

## 2. Zucker-Ökonomie (Energie)

**Senken** (Verbrauch pro Frame):

| Senke | Rate | bei P = 200 |
|---|---|---|
| Ameisen-Stoffwechsel (Energie) | `antEnergyDecay` 0.30 Energie/Ameise → ÷ `sugarEnergyValue` 100 = 0.003 Zucker/Ameise | 0.60 |
| Passiver Kolonie-Unterhalt | `colonyUpkeep` 0.001 Zucker/Ameise | 0.20 |
| Königin | `queenSugarRegen` 0.3 Energie ÷ 100 = 0.003 Zucker | 0.003 |
| **Summe** | | **≈ 0.80 Zucker/Frame** |

(Polymorphie skaliert den Unterhalt pro Ameise mit der Körpergröße —
`poly.upkeepBase` 0.60 — die Kasten-Mischung verschiebt die Summe um ±10 %.)

**Quelle**: `sugarValue` = 14 Zucker pro Liefertrip (skaliert mit `WORLD_SCALE`,
damit längere Laufwege die Income-*Rate* nicht senken).

```
Benötigte Trips ≈ 0.80 / 14 ≈ 0.057 Trips/Frame ≈ 3.4 Lieferungen/s Koloniegesamt
```

Bei ~40 % aktiven Foragern von 200 Ameisen (≈ 80) muss ein Forager also alle
~23 s liefern — ein Roundtrip im 1.4×-Welt-Maßstab dauert grob diese
Größenordnung. **Die Zucker-Ökonomie ist deshalb im Gleichgewicht knapp
positiv**; Puffer ist der Stockpile (`startSugar` 600, Kapazität wächst mit
Granary-Kammern).

## 3. Protein-Ökonomie (Wachstum) — der kritische Pfad

Die Todesspiral-Diagnose (siehe ROADMAP „Kolonie-Resilienz") zeigte: **Zucker
kippt nie zuerst, Protein schon.**

- **Senke**: `broodProteinUpkeep` 0.0006 Protein/Larve/Frame. Bei ~25 Larven:
  0.015/Frame.
- **Quelle**: `proteinValue` = 10 pro erlegter Beute (5→7 Basis × WORLD_SCALE,
  bewusst mit Marge angehoben) + Aas/Blattläuse.
- Benötigte Jagdrate: `0.015 / 10 = 0.0015 Jagden/Frame` ≈ 1 Beute alle ~11 s.
  Beute-Nachschub: `preySpawnRate`-gegated, Bestand `maxPrey` (flächen-skaliert).

**Warum hier die Marge zählt**: Ein Feind-Angriff unterbricht das Jagen für
hunderte Frames. Ohne Income-Puffer verhungert dann Brut → keine Nachrückenden
→ Population altert aus (Spirale über ~2 Pipeline-Längen = ~9000 Frames).
Deshalb: Drain niedrig (0.0015 → 0.0006), Ertrag hoch (5 → 7). Eine harte
„Königin-Reserve" (Legestopp bei Knappheit) wurde getestet und **verworfen** —
sie garantiert Brut→0; die Pipeline am Leben zu halten ist resilienter.

## 4. Kasten-Mischung

- Soldaten entstehen über Larven-Ernährung: Protein-Stand > `soldierProteinLevel`
  (150) lässt Larven Richtung Soldat akkumulieren (`soldierFoodThreshold` 1700
  von 2000 Larven-Frames), gedeckelt durch `maxSoldierFraction` 0.20.
- Hebel für den Spieler: Protein-Angebot ⇒ Soldatenquote (bis 20 %).
- Kosten: Soldaten sind über Polymorphie ~25–50 % größer → entsprechend
  langsamer + teurer im Unterhalt (Abschnitt 2).

## 5. Was NICHT tunebar ist: RNG-Dominanz

Mehrfach harness-belegt (Kampf-Rebalance, Raid-Tuning): die **Langzeit-
Überlebensrate einzelner Seeds (30k+ Ticks) ist RNG-dominiert**. Balance-
Schrauben mischen nur durch, *welche* Seeds kollabieren — die Quote bleibt.
Extrem-Seeds (42/99 im Kriegs-Szenario) blieben über drei Tuning-Varianten
byte-identisch lopsided. Konsequenz:

- Balance-Ziele auf **moderatem Horizont** verifizieren (4000–8000 Ticks,
  Multi-Seed) — dort sind gesunde Kolonien robust reproduzierbar.
- Lange Einzel-Runs können an einem Räuberangriff sterben. Das ist gewollt
  (realistisch), kein Balance-Bug.
- Wer die Überlebensquote wirklich heben will, muss **Aggregat-Druck** senken
  (Spawn-Raten der Räuber), nicht Einzelwerte verschieben.

## 6. Workflow für Balance-Änderungen

1. Zielwert über die Formeln oben ableiten (nicht raten).
2. `npm test` — Golden-Snapshots zeigen *jede* Verhaltensänderung; bewusste
   Änderungen werden neu gepinnt (im Commit dokumentieren).
3. `npm run test:soak` — Soak + Multi-Seed-Invarianten + Quality-Unabhängigkeit.
4. Für emergente Fragen: `runHeadless(seed, ticks)` ad hoc (Metriken ohne DOM),
   mehrere Seeds, moderater Horizont (s. Abschnitt 5).
