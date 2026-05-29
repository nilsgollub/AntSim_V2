import type { World } from './World';

export type SeverityLevel = 'good' | 'info' | 'warn' | 'critical';

export interface TunerSuggestion {
    metric: string;
    observed: string;
    target: string;
    severity: SeverityLevel;
    suggestion: string;  // which config key / what to change
    effect: string;      // human-readable consequence
}

interface Snapshot {
    age: number;
    antCount: number;
    workerCount: number;
    soldierCount: number;
    foragingCount: number;   // workers in FORAGING/HARVESTING/RETURNING
    attackingCount: number;
    fleeingCount: number;
    avgEnergy: number;
    queenEnergy: number;
    queenStress: number;
    sugarStockpile: number;
    proteinStockpile: number;
    broodCount: number;
    larvaeCount: number;
    enemyCount: number;
}

// How often to capture a snapshot (frames). 600 ≈ 10 s at 60 fps.
// Kept high so analysis barely costs anything, even on a Pi 4.
const SAMPLE_INTERVAL = 600;
// How many snapshots to keep (~2 minutes of history at 60 fps).
const WINDOW_SIZE = 12;

export class SimObserver {
    private snapshots: Snapshot[] = [];
    private lastSampleAge = -1;

    /** Call once per world.update() tick — O(1), extremely cheap. */
    observe(world: World) {
        if (world.age - this.lastSampleAge < SAMPLE_INTERVAL) return;
        this.lastSampleAge = world.age;

        const ants = world.ants;
        const workers = ants.filter(a => a.type === 'WORKER');
        const foraging = workers.filter(
            a => a.state === 'FORAGING' || a.state === 'HARVESTING' || a.state === 'RETURNING',
        );
        const attacking = ants.filter(a => a.state === 'ATTACKING');
        const fleeing   = ants.filter(a => a.state === 'FLEEING');

        const totalEnergy = ants.reduce((sum, a) => sum + a.energy, 0);
        const avgEnergy = ants.length > 0 ? totalEnergy / ants.length : 0;

        const snap: Snapshot = {
            age: world.age,
            antCount: ants.length,
            workerCount: workers.length,
            soldierCount: ants.filter(a => a.type === 'SOLDIER').length,
            foragingCount: foraging.length,
            attackingCount: attacking.length,
            fleeingCount: fleeing.length,
            avgEnergy,
            queenEnergy: world.queen.energy,
            queenStress: world.queen.stress,
            sugarStockpile: world.sugarStockpile,
            proteinStockpile: world.proteinStockpile,
            broodCount: world.brood.length,
            larvaeCount: world.brood.filter(b => b.stage === 'LARVA').length,
            enemyCount: world.insects.filter(
                i => i.type === 'PREDATOR' || i.type === 'SPIDER' || i.type === 'BEETLE',
            ).length,
        };

        this.snapshots.push(snap);
        if (this.snapshots.length > WINDOW_SIZE) this.snapshots.shift();
    }

    /** Call on user request. Returns typed suggestions with explanation of effect. */
    analyze(): TunerSuggestion[] {
        if (this.snapshots.length < 2) {
            return [{
                metric: 'Datenmenge',
                observed: `${this.snapshots.length} / ${WINDOW_SIZE} Snapshots`,
                target: `≥ 2 Snapshots`,
                severity: 'info',
                suggestion: 'Bitte noch etwas länger warten (ca. 20 Sekunden)',
                effect: 'Der Observer braucht mindestens 2 Messungen für Trendanalyse.',
            }];
        }

        const latest = this.snapshots[this.snapshots.length - 1];
        const first   = this.snapshots[0];
        const span    = this.snapshots.length;

        const results: TunerSuggestion[] = [];
        const push = (s: TunerSuggestion) => results.push(s);

        // ── Colony growth trend ──────────────────────────────────────────────
        const growthRate = (latest.antCount - first.antCount) / Math.max(1, first.antCount);
        if (growthRate < -0.25) {
            push({
                metric: 'Populationstrend',
                observed: `${(growthRate * 100).toFixed(0)} % Rückgang`,
                target: '≥ 0 % (stabil)',
                severity: 'critical',
                suggestion: 'CONFIG.antEnergyDecay senken (aktuell 0.30) oder CONFIG.sugarValue erhöhen (aktuell 10)',
                effect: 'Weniger Energieverbrauch pro Frame → Ameisen überleben länger; mehr Zucker pro Ernte → Nahrungsversorgung wird besser.',
            });
        } else if (growthRate < -0.05) {
            push({
                metric: 'Populationstrend',
                observed: `${(growthRate * 100).toFixed(0)} % Rückgang`,
                target: '> −5 %',
                severity: 'warn',
                suggestion: 'CONFIG.antEnergyDecay leicht senken oder CONFIG.eggCost verringern (aktuell 20)',
                effect: 'Geringerer Energieverbrauch oder günstigere Eiproduktion stabilisiert die Kolonie.',
            });
        } else if (growthRate > 0.05) {
            push({
                metric: 'Populationstrend',
                observed: `+${(growthRate * 100).toFixed(0)} % Wachstum`,
                target: '0–5 %',
                severity: 'good',
                suggestion: '– kein Handlungsbedarf –',
                effect: 'Kolonie wächst gesund.',
            });
        }

        // ── Energy health ────────────────────────────────────────────────────
        const avgEnergyRatio = latest.avgEnergy / 2000; // antMaxEnergy = 2000
        if (avgEnergyRatio < 0.3) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'critical',
                suggestion: 'CONFIG.antEnergyDecay senken (< 0.30) oder CONFIG.sugarSourceCount erhöhen (aktuell 2)',
                effect: 'Ameisen verbrennen Energie schneller als sie tanken können. Mehr Nahrungsquellen oder geringerer Verbrauch hält die Kolonie lebensfähig.',
            });
        } else if (avgEnergyRatio < 0.5) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'warn',
                suggestion: 'CONFIG.sugarValue erhöhen (aktuell 10) oder CONFIG.antEnergyDecay leicht senken',
                effect: 'Energiepuffer der Ameisen ist knapp. Etwas mehr Nahrungsertrag verhindert Massensterben bei plötzlichem Angriff.',
            });
        } else if (avgEnergyRatio > 0.85) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '50–85 %',
                severity: 'info',
                suggestion: 'CONFIG.antEnergyDecay erhöhen (> 0.30) für mehr Herausforderung',
                effect: 'Ameisen haben zu viel Reserve — das Spiel verliert Spannung. Mehr Verbrauch erzwingt aktiveres Sammeln.',
            });
        }

        // ── Foraging ratio ───────────────────────────────────────────────────
        const activeFrac = latest.workerCount > 0
            ? latest.foragingCount / latest.workerCount
            : 0;
        if (activeFrac > 0.85) {
            push({
                metric: 'Sammelquote',
                observed: `${(activeFrac * 100).toFixed(0)} % der Worker sammeln`,
                target: '40–75 %',
                severity: 'warn',
                suggestion: 'CONFIG.sugarValue erhöhen (aktuell 10) oder CONFIG.sugarSourceCount erhöhen',
                effect: 'Fast alle Worker müssen sammeln — ein Zeichen für Nahrungsknappheit. Mehr Ertragsquellen reduzieren den Stress der Kolonie.',
            });
        } else if (activeFrac < 0.2 && latest.antCount > 20) {
            push({
                metric: 'Sammelquote',
                observed: `${(activeFrac * 100).toFixed(0)} % der Worker sammeln`,
                target: '40–75 %',
                severity: 'info',
                suggestion: 'CONFIG.antEnergyDecay erhöhen (> 0.30) oder CONFIG.sugarValue senken',
                effect: 'Kolonie ist zu gut versorgt, Worker rasten zu viel. Ein höherer Energieverbrauch belebt die Simulation.',
            });
        }

        // ── Combat pressure ──────────────────────────────────────────────────
        const combatRatio = latest.antCount > 0
            ? (latest.attackingCount + latest.fleeingCount) / latest.antCount
            : 0;
        if (combatRatio > 0.35) {
            push({
                metric: 'Kampfbelastung',
                observed: `${(combatRatio * 100).toFixed(0)} % kämpfen/fliehen`,
                target: '< 25 %',
                severity: 'critical',
                suggestion: 'CONFIG.predatorSpawnRate senken (aktuell 0.0005) oder CONFIG.gracePeriod erhöhen (aktuell 4000)',
                effect: 'Zu viele Feinde überlasten die Kolonie. Längere Schonzeit oder langsamere Spawn-Rate gibt der Kolonie Zeit sich zu entwickeln.',
            });
        } else if (combatRatio < 0.02 && latest.antCount > 30 && span >= 6) {
            push({
                metric: 'Kampfbelastung',
                observed: `${(combatRatio * 100).toFixed(0)} % kämpfen/fliehen`,
                target: '2–25 %',
                severity: 'info',
                suggestion: 'CONFIG.predatorSpawnRate erhöhen (aktuell 0.0005) oder CONFIG.maxPredators erhöhen (aktuell 2)',
                effect: 'Keine Bedrohung — die Simulation wirkt langweilig. Mehr Feinde erzeugen spannende Verteidigungsreaktionen.',
            });
        }

        // ── Queen health ─────────────────────────────────────────────────────
        const queenRatio = latest.queenEnergy / 2000; // queen max energy
        if (queenRatio < 0.3) {
            push({
                metric: 'Königinnen-Energie',
                observed: `${(queenRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'critical',
                suggestion: 'CONFIG.ant.queenFeedAmount erhöhen (aktuell 500) oder CONFIG.proteinValue erhöhen (aktuell 5)',
                effect: 'Königin ist unterernährt und kann keine Eier legen. Mehr Protein pro Pflegeakt oder höherer Proteinwert pro Nahrungsquelle hilft.',
            });
        }
        if (latest.queenStress > 20) {
            push({
                metric: 'Königinnen-Stress',
                observed: `Stress: ${latest.queenStress.toFixed(1)}`,
                target: '< 15',
                severity: 'warn',
                suggestion: 'CONFIG.predatorSpawnRate senken oder CONFIG.soldierHealth erhöhen (aktuell 60)',
                effect: 'Feinde dringen nah an das Nest heran. Stärkere Soldaten oder weniger Feinde schützen die Königin besser.',
            });
        }

        // ── Brood pipeline ───────────────────────────────────────────────────
        const broodRatio = latest.antCount > 0 ? latest.broodCount / latest.antCount : 0;
        if (broodRatio < 0.2 && latest.antCount > 10) {
            push({
                metric: 'Brut-Pipeline',
                observed: `${broodRatio.toFixed(2)}× Koloniengröße`,
                target: '> 0.3×',
                severity: 'warn',
                suggestion: 'CONFIG.eggCost senken (aktuell 20) oder CONFIG.ant.queenCriticalEnergy senken',
                effect: 'Königin legt zu wenige Eier. Günstigere Eiproduktion oder niedrigerer Hungerschwellenwert der Königin füllt die Pipeline.',
            });
        }

        // ── Soldier ratio ────────────────────────────────────────────────────
        const soldierFrac = latest.antCount > 0
            ? latest.soldierCount / latest.antCount
            : 0;
        if (soldierFrac > 0.40) {
            push({
                metric: 'Soldatenanteil',
                observed: `${(soldierFrac * 100).toFixed(0)} %`,
                target: '10–30 %',
                severity: 'info',
                suggestion: 'CONFIG.soldierUnlockThreshold erhöhen (aktuell 30)',
                effect: 'Zu viele Soldaten reduzieren die Sammelkapazität. Höherer Schwellenwert für Soldaten-Produktion balanciert die Kolonie.',
            });
        } else if (soldierFrac < 0.05 && latest.antCount > 40) {
            push({
                metric: 'Soldatenanteil',
                observed: `${(soldierFrac * 100).toFixed(0)} %`,
                target: '10–30 %',
                severity: 'info',
                suggestion: 'CONFIG.soldierUnlockThreshold senken (aktuell 30)',
                effect: 'Keine Soldaten → Kolonie ist schutzlos. Niedrigerer Schwellenwert für frühere Soldaten-Produktion.',
            });
        }

        // ── Stockpile health ─────────────────────────────────────────────────
        const sugarPerAnt = latest.antCount > 0 ? latest.sugarStockpile / latest.antCount : 0;
        if (sugarPerAnt < 5 && latest.antCount > 15) {
            push({
                metric: 'Zucker-Vorrat pro Ameise',
                observed: `${sugarPerAnt.toFixed(1)} Einheiten`,
                target: '> 10',
                severity: 'warn',
                suggestion: 'CONFIG.sugarValue erhöhen (aktuell 10) oder CONFIG.sugarSourceCount erhöhen (aktuell 2)',
                effect: 'Vorrat reicht kaum für Notfälle. Mehr Ernte pro Quelle oder mehrere Quellen schafft einen Puffer.',
            });
        }

        // ── Nothing actionable ───────────────────────────────────────────────
        if (results.length === 0 || results.every(r => r.severity === 'good')) {
            push({
                metric: 'Gesamtzustand',
                observed: 'Alles im grünen Bereich',
                target: '–',
                severity: 'good',
                suggestion: '– Keine Anpassungen nötig –',
                effect: 'Die Simulation läuft im Gleichgewicht. Probier den Auto-Tuner in 2 Minuten nochmal nach einem Angriff.',
            });
        }

        return results;
    }

    /** How many snapshots have been collected so far. */
    get snapshotCount() { return this.snapshots.length; }
}
