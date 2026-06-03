import { CONFIG } from '../config';
import { Ant } from './Ant';
import { Queen } from './Queen';
import { Brood } from './Brood';
import { Nest } from './Nest';
import { PheromoneGrid } from './PheromoneGrid';

/**
 * One ant colony's own state — everything that is conceptually "per colony" rather
 * than part of the shared environment (terrain, foods, insects, outdoor pheromones,
 * weather, time all stay on `World`).
 *
 * Phase 1 of the rival-colony work: `World` still owns the update orchestration and
 * exposes back-compat getters that proxy `colonies[0]`, so behaviour is byte-identical
 * for a single colony. Later phases give each colony its own nest location / entrance
 * and split the update loop per colony.
 */
export class Colony {
    id: number;
    queen: Queen;
    nest: Nest;
    nestGrid: PheromoneGrid;          // underground pheromone field (already per-nest)
    ants: Ant[] = [];
    brood: Brood[] = [];
    sugarStockpile: number = CONFIG.startSugar;
    proteinStockpile: number = CONFIG.startProtein;
    trophallaxisCount: number = 0;     // mouth-to-mouth feedings (live stat / test guard)

    constructor(id: number, nest: Nest, queen: Queen, nestGrid: PheromoneGrid) {
        this.id = id;
        this.nest = nest;
        this.queen = queen;
        this.nestGrid = nestGrid;
    }

    // Brood stage counts.
    get eggs(): number { return this.brood.filter(b => b.stage === 'EGG').length; }
    get larvae(): number { return this.brood.filter(b => b.stage === 'LARVA').length; }
    get pupae(): number { return this.brood.filter(b => b.stage === 'PUPA').length; }

    /**
     * Per-resource storage ceiling. Scales with this colony's granary (STORAGE)
     * chambers, so digging more granaries lets it stockpile more.
     */
    storageCapacity(): number {
        const granaries = this.nest.getChambers('STORAGE').length;
        return CONFIG.nest.storageBaseCapacity + granaries * CONFIG.nest.storagePerGranary;
    }

    /** Spawn an ant of this colony at its queen, tagged with a back-reference. */
    spawnAnt(type: 'WORKER' | 'SOLDIER') {
        const ant = new Ant(this.queen.x, this.queen.y, type);
        ant.location = 'NEST';
        ant.colony = this;
        this.ants.push(ant);
    }
}
