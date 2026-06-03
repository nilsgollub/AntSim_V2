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

    // Navigation anchors — where this colony's nest meets the world. Decouples
    // "go home / leave the nest" from hardcoded world edges, so a second colony can
    // sit anywhere. For colony 0 these equal the former CONFIG.width/height formulas
    // exactly, so behaviour is byte-identical. NOTE: nest-LOCAL coords are
    // colony-agnostic (every nest is the same CONFIG.nestWidth×nestHeight space with
    // its mouth at a fixed local spot) — only the WORLD-space anchors vary per colony.
    isLandscape: boolean;
    entranceWorld: { x: number; y: number };    // world point ants steer to when heading home
    worldExitPoint: { x: number; y: number };   // world point an ant lands on when leaving the nest
    worldExitAngle: number;                      // facing when it lands outside
    entranceNestLocal: { x: number; y: number }; // nest-space point an ant lands on when entering
    entranceNestAngle: number;                   // facing when it lands inside

    constructor(id: number, nest: Nest, queen: Queen, nestGrid: PheromoneGrid) {
        this.id = id;
        this.nest = nest;
        this.queen = queen;
        this.nestGrid = nestGrid;

        const ls = nest.height > nest.width;
        this.isLandscape = ls;
        this.entranceWorld = ls ? { x: CONFIG.width, y: CONFIG.height / 2 }
                                : { x: CONFIG.width / 2, y: CONFIG.height };
        this.worldExitPoint = ls ? { x: CONFIG.width - 25, y: CONFIG.height / 2 }
                                 : { x: CONFIG.width / 2, y: CONFIG.height - 25 };
        this.worldExitAngle = ls ? Math.PI : -Math.PI / 2;
        this.entranceNestLocal = ls ? { x: 25, y: nest.height / 2 }
                                    : { x: nest.width / 2, y: 25 };
        this.entranceNestAngle = ls ? 0 : Math.PI / 2;
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
