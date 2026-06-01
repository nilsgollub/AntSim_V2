import type { World } from './World';
import { CONFIG } from '../config';
import { getByPath, setOverride } from '../configStore';

export type SeverityLevel = 'good' | 'info' | 'warn' | 'critical';

/** A concrete, machine-applicable parameter change. */
export interface TunerAction {
    path: string;   // dot-path into CONFIG, e.g. 'antEnergyDecay' or 'ant.queenFeedAmount'
    label: string;  // e.g. "antEnergyDecay: 0.3 → 0.24"
    from: number;
    to: number;
}

export interface TunerSuggestion {
    metric: string;
    observed: string;
    target: string;
    severity: SeverityLevel;
    suggestion: string;        // human-readable description of what to change
    effect: string;            // human-readable consequence
    actions?: TunerAction[];   // applyable changes (empty/undefined = nothing to apply)
}

// Round a nudged value sensibly: integer-typed configs stay integers, small
// rates/decimals keep three significant figures.
function nudgeValue(current: number, factor: number): number {
    const v = current * factor;
    if (Number.isInteger(current) && Math.abs(current) >= 1) return Math.round(v);
    return Number(v.toPrecision(3));
}

function mkAction(path: string, factor: number): TunerAction {
    const from = getByPath(path);
    const to = nudgeValue(from, factor);
    return { path, from, to, label: `${path}: ${from} → ${to}` };
}

/** Apply a single tuner action: mutate live CONFIG and persist the override. */
export function applyTunerAction(a: TunerAction) {
    setOverride(a.path, a.to);
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

// Finer-grained history for the live stats graph (~1 s cadence, ~3 min window).
const GRAPH_INTERVAL = 60;
const GRAPH_SIZE = 180;

/** One point on the live stats graph. */
export interface GraphPoint {
    population: number;
    sugar: number;
    protein: number;
    energyPct: number; // average ant energy as 0..1 of max
}

export class SimObserver {
    private snapshots: Snapshot[] = [];
    private lastSampleAge = -1;

    private history: GraphPoint[] = [];
    private lastGraphAge = -1;

    /** Rolling history for the live graph (oldest → newest). */
    getHistory(): readonly GraphPoint[] { return this.history; }

    /** Call once per world.update() tick — O(1)/O(n) amortised, very cheap. */
    observe(world: World) {
        // Fine-grained graph sampling (independent of the analysis cadence).
        if (world.age - this.lastGraphAge >= GRAPH_INTERVAL) {
            this.lastGraphAge = world.age;
            const n = world.ants.length;
            const avg = n > 0 ? world.ants.reduce((s, a) => s + a.energy, 0) / n : 0;
            this.history.push({
                population: n,
                sugar: world.sugarStockpile,
                protein: world.proteinStockpile,
                energyPct: avg / CONFIG.antMaxEnergy,
            });
            if (this.history.length > GRAPH_SIZE) this.history.shift();
        }

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

    /** Call on user request. Returns typed suggestions with explanation + applyable actions. */
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
                suggestion: 'Schneller legen + länger leben (Pop ≈ lifespan/layInterval); bei Hunger Energieverbrauch senken',
                effect: 'Kürzeres Lege-Intervall und höhere Lebensspanne heben das Populations-Gleichgewicht. Geringerer Energieverbrauch hilft nur, wenn die Vorräte knapp sind.',
                actions: [mkAction('queenLayInterval', 0.7), mkAction('ant.lifespan', 1.3), mkAction('antEnergyDecay', 0.85)],
            });
        } else if (growthRate < -0.05) {
            push({
                metric: 'Populationstrend',
                observed: `${(growthRate * 100).toFixed(0)} % Rückgang`,
                target: '> −5 %',
                severity: 'warn',
                suggestion: 'Etwas schneller legen oder Ameisen länger leben lassen',
                effect: 'Kürzeres Lege-Intervall oder höhere Lebensspanne hebt das Populations-Gleichgewicht (≈ lifespan/layInterval).',
                actions: [mkAction('queenLayInterval', 0.85), mkAction('ant.lifespan', 1.2)],
            });
        } else if (growthRate > 0.5) {
            push({
                metric: 'Populationstrend',
                observed: `+${(growthRate * 100).toFixed(0)} % Wachstum (sehr schnell)`,
                target: '< 50 % pro Fenster',
                severity: 'info',
                suggestion: 'Lege-Intervall der Königin erhöhen oder Ei-Kosten anheben',
                effect: 'Die Kolonie wächst sehr schnell. Ein größeres Lege-Intervall (oder teurere Eier) bremst die Geburtenrate auf ein angenehmeres Tempo.',
                actions: [mkAction('queenLayInterval', 1.5), mkAction('eggCost', 1.3)],
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
        const avgEnergyRatio = latest.avgEnergy / CONFIG.antMaxEnergy;
        if (avgEnergyRatio < 0.3) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'critical',
                suggestion: 'Energieverbrauch senken oder mehr Nahrungsquellen',
                effect: 'Ameisen verbrennen Energie schneller als sie tanken können. Mehr Nahrungsquellen oder geringerer Verbrauch hält die Kolonie lebensfähig.',
                actions: [mkAction('antEnergyDecay', 0.8), mkAction('sugarSourceCount', 1.5)],
            });
        } else if (avgEnergyRatio < 0.5) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'warn',
                suggestion: 'Zuckerertrag erhöhen oder Verbrauch leicht senken',
                effect: 'Energiepuffer der Ameisen ist knapp. Etwas mehr Nahrungsertrag verhindert Massensterben bei plötzlichem Angriff.',
                actions: [mkAction('sugarValue', 1.3), mkAction('antEnergyDecay', 0.9)],
            });
        } else if (avgEnergyRatio > 0.85) {
            push({
                metric: 'Durchschnittliche Energie',
                observed: `${(avgEnergyRatio * 100).toFixed(0)} % von Max`,
                target: '50–85 %',
                severity: 'info',
                suggestion: 'Energieverbrauch erhöhen für mehr Herausforderung',
                effect: 'Ameisen haben zu viel Reserve — das Spiel verliert Spannung. Mehr Verbrauch erzwingt aktiveres Sammeln.',
                actions: [mkAction('antEnergyDecay', 1.15)],
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
                suggestion: 'Zuckerertrag oder Anzahl Nahrungsquellen erhöhen',
                effect: 'Fast alle Worker müssen sammeln — ein Zeichen für Nahrungsknappheit. Mehr Ertragsquellen reduzieren den Stress der Kolonie.',
                actions: [mkAction('sugarValue', 1.3), mkAction('sugarSourceCount', 1.5)],
            });
        } else if (activeFrac < 0.2 && latest.antCount > 20) {
            push({
                metric: 'Sammelquote',
                observed: `${(activeFrac * 100).toFixed(0)} % der Worker sammeln`,
                target: '40–75 %',
                severity: 'info',
                suggestion: 'Energieverbrauch erhöhen, damit Worker aktiver werden',
                effect: 'Kolonie ist zu gut versorgt, Worker rasten zu viel. Ein höherer Energieverbrauch belebt die Simulation.',
                actions: [mkAction('antEnergyDecay', 1.15)],
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
                suggestion: 'Feind-Spawnrate senken oder Schonzeit verlängern',
                effect: 'Zu viele Feinde überlasten die Kolonie. Längere Schonzeit oder langsamere Spawn-Rate gibt der Kolonie Zeit sich zu entwickeln.',
                actions: [mkAction('predatorSpawnRate', 0.6), mkAction('gracePeriod', 1.5)],
            });
        } else if (combatRatio < 0.02 && latest.antCount > 30 && span >= 6) {
            push({
                metric: 'Kampfbelastung',
                observed: `${(combatRatio * 100).toFixed(0)} % kämpfen/fliehen`,
                target: '2–25 %',
                severity: 'info',
                suggestion: 'Feind-Spawnrate oder Feind-Obergrenze erhöhen',
                effect: 'Keine Bedrohung — die Simulation wirkt langweilig. Mehr Feinde erzeugen spannende Verteidigungsreaktionen.',
                actions: [mkAction('predatorSpawnRate', 1.5), mkAction('maxPredators', 1.5)],
            });
        }

        // ── Queen health ─────────────────────────────────────────────────────
        const queenRatio = latest.queenEnergy / CONFIG.antMaxEnergy;
        if (queenRatio < 0.3) {
            push({
                metric: 'Königinnen-Energie',
                observed: `${(queenRatio * 100).toFixed(0)} % von Max`,
                target: '> 50 %',
                severity: 'critical',
                suggestion: 'Pflege-Protein-Menge oder Proteinwert erhöhen',
                effect: 'Königin ist unterernährt und kann keine Eier legen. Mehr Protein pro Pflegeakt oder höherer Proteinwert pro Nahrungsquelle hilft.',
                actions: [mkAction('ant.queenFeedAmount', 1.3), mkAction('proteinValue', 1.4)],
            });
        }
        if (latest.queenStress > 20) {
            push({
                metric: 'Königinnen-Stress',
                observed: `Stress: ${latest.queenStress.toFixed(1)}`,
                target: '< 15',
                severity: 'warn',
                suggestion: 'Feind-Spawnrate senken oder Soldaten stärken',
                effect: 'Feinde dringen nah an das Nest heran. Stärkere Soldaten oder weniger Feinde schützen die Königin besser.',
                actions: [mkAction('predatorSpawnRate', 0.7), mkAction('soldierHealth', 1.25)],
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
                suggestion: 'Eiproduktion verbilligen oder Königin früher füttern',
                effect: 'Königin legt zu wenige Eier. Günstigere Eiproduktion oder niedrigerer Hungerschwellenwert der Königin füllt die Pipeline.',
                actions: [mkAction('eggCost', 0.8), mkAction('ant.queenCriticalEnergy', 0.9)],
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
                suggestion: 'Soldaten-Schwellenwert erhöhen',
                effect: 'Zu viele Soldaten reduzieren die Sammelkapazität. Höherer Schwellenwert für Soldaten-Produktion balanciert die Kolonie.',
                actions: [mkAction('soldierUnlockThreshold', 1.3)],
            });
        } else if (soldierFrac < 0.05 && latest.antCount > 40) {
            push({
                metric: 'Soldatenanteil',
                observed: `${(soldierFrac * 100).toFixed(0)} %`,
                target: '10–30 %',
                severity: 'info',
                suggestion: 'Soldaten-Schwellenwert senken',
                effect: 'Keine Soldaten → Kolonie ist schutzlos. Niedrigerer Schwellenwert für frühere Soldaten-Produktion.',
                actions: [mkAction('soldierUnlockThreshold', 0.7)],
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
                suggestion: 'Zuckerertrag oder Anzahl Nahrungsquellen erhöhen',
                effect: 'Vorrat reicht kaum für Notfälle. Mehr Ernte pro Quelle oder mehrere Quellen schafft einen Puffer.',
                actions: [mkAction('sugarValue', 1.3), mkAction('sugarSourceCount', 1.5)],
            });
        }

        // ── Resource surplus (runaway growth = unused oversupply) ─────────────
        const sugarGrowth = latest.sugarStockpile - first.sugarStockpile;
        if (sugarGrowth > 200 && latest.sugarStockpile > 1500) {
            push({
                metric: 'Zucker-Überschuss',
                observed: `+${sugarGrowth.toFixed(0)} (jetzt ${latest.sugarStockpile.toFixed(0)})`,
                target: 'stabil',
                severity: 'info',
                suggestion: 'Kolonie-Unterhalt erhöhen oder Zuckerertrag senken',
                effect: 'Der Vorrat wächst ungenutzt. Höherer Unterhalt pro Ameise oder weniger Ertrag pro Lieferung bringt Angebot und Verbrauch ins Gleichgewicht.',
                actions: [mkAction('colonyUpkeep', 1.5), mkAction('sugarValue', 0.8)],
            });
        }

        const proteinGrowth = latest.proteinStockpile - first.proteinStockpile;
        if (proteinGrowth > 100 && latest.proteinStockpile > 800) {
            push({
                metric: 'Protein-Überschuss',
                observed: `+${proteinGrowth.toFixed(0)} (jetzt ${latest.proteinStockpile.toFixed(0)})`,
                target: 'stabil',
                severity: 'info',
                suggestion: 'Brut-Unterhalt erhöhen oder Proteinertrag senken',
                effect: 'Protein staut sich an. Mehr Verbrauch pro Larve oder weniger Ertrag pro Lieferung verhindert das Horten.',
                actions: [mkAction('broodProteinUpkeep', 1.5), mkAction('proteinValue', 0.8)],
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
