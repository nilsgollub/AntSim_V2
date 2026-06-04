import { CONFIG } from '../config';
import { Ant } from './Ant';
import { Queen } from './Queen';
import { Brood } from './Brood';
import { Nest } from './Nest';
import { PheromoneGrid } from './PheromoneGrid';

/** Which world edge a colony's nest entrance sits on. */
export type EntranceSide = 'RIGHT' | 'LEFT' | 'BOTTOM' | 'TOP';

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
    nestGrid: PheromoneGrid;          // underground pheromone field (per nest)
    outdoorField: PheromoneGrid;      // this colony's OWN outdoor HOME/SUGAR/PROTEIN/DANGER trails
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
    entranceSide: EntranceSide;
    // Team identity (rendering only). Per-caste Pixi multiply tints + a 2D halo colour.
    // Colony 0 = our ants (workers warm brown, soldiers natural red); rivals = amber
    // workers + a dedicated black/outlined soldier texture (id > 0 → uses it).
    workerTint: number;
    soldierTint: number;
    teamColor: string;       // 2D overlay halo colour ('' = none)
    workerColor2D: string;   // 2D body tint (so nest ants aren't rendered plain white)
    soldierColor2D: string;  // '' = keep the natural sprite colour
    entranceWorld!: { x: number; y: number };    // world point ants steer to when heading home
    worldExitPoint!: { x: number; y: number };   // world point an ant lands on when leaving the nest
    worldExitAngle!: number;                      // facing when it lands outside
    entranceNestLocal!: { x: number; y: number }; // nest-space point an ant lands on when entering
    entranceNestAngle!: number;                   // facing when it lands inside

    constructor(id: number, nest: Nest, queen: Queen, nestGrid: PheromoneGrid, side: EntranceSide) {
        this.id = id;
        this.nest = nest;
        this.queen = queen;
        queen.colony = this;
        this.nestGrid = nestGrid;
        // Each colony scouts + recruits on its OWN outdoor field, so rivals don't
        // follow each other's roads home. (PheromoneGrid draws no rand → no RNG shift.)
        this.outdoorField = new PheromoneGrid(CONFIG.width, CONFIG.height);

        // Navigation anchors derived from which world edge this colony sits on. The
        // nest-LOCAL mouth is colony-agnostic (always at x≈0 landscape / y≈0 portrait);
        // only the world-space side + exit facing differ. RIGHT/BOTTOM reproduce the
        // original single-colony formulas exactly → colony 0 stays byte-identical.
        // Index-based palette. 0 = us (warm brown workers, natural soldiers),
        // 1 = rival (amber workers, black soldiers via dedicated texture).
        const WORKER_TINTS = [0xa89884, 0xddb24e, 0x88c0a0, 0xd0a0d0]; // own = muted earthy brown
        const SOLDIER_TINTS = [0xffffff, 0xffffff, 0xffffff, 0xffffff];
        const TEAM_COLORS = ['', '#cba046', '#88c0a0', '#d0a0d0'];
        const WORKER_2D = ['#7e7058', '#cba046', '#7ab090', '#c090c0']; // own = muted taupe-brown
        const SOLDIER_2D = ['', '#2b271f', '', ''];
        this.workerTint = WORKER_TINTS[id % WORKER_TINTS.length];
        this.soldierTint = SOLDIER_TINTS[id % SOLDIER_TINTS.length];
        this.teamColor = TEAM_COLORS[id % TEAM_COLORS.length];
        this.workerColor2D = WORKER_2D[id % WORKER_2D.length];
        this.soldierColor2D = SOLDIER_2D[id % SOLDIER_2D.length];

        const ls = nest.height > nest.width;
        this.isLandscape = ls;
        this.entranceSide = side;
        const W = CONFIG.width, H = CONFIG.height;
        switch (side) {
            case 'RIGHT':
                this.entranceWorld = { x: W, y: H / 2 };
                this.worldExitPoint = { x: W - 25, y: H / 2 };
                this.worldExitAngle = Math.PI;
                this.entranceNestLocal = { x: 25, y: nest.height / 2 };
                this.entranceNestAngle = 0;
                break;
            case 'LEFT':
                this.entranceWorld = { x: 0, y: H / 2 };
                this.worldExitPoint = { x: 25, y: H / 2 };
                this.worldExitAngle = 0;
                this.entranceNestLocal = { x: 25, y: nest.height / 2 };
                this.entranceNestAngle = 0;
                break;
            case 'BOTTOM':
                this.entranceWorld = { x: W / 2, y: H };
                this.worldExitPoint = { x: W / 2, y: H - 25 };
                this.worldExitAngle = -Math.PI / 2;
                this.entranceNestLocal = { x: nest.width / 2, y: 25 };
                this.entranceNestAngle = Math.PI / 2;
                break;
            case 'TOP':
                this.entranceWorld = { x: W / 2, y: 0 };
                this.worldExitPoint = { x: W / 2, y: 25 };
                this.worldExitAngle = Math.PI / 2;
                this.entranceNestLocal = { x: nest.width / 2, y: 25 };
                this.entranceNestAngle = Math.PI / 2;
                break;
        }
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
