import { rand } from '../rng';
import { CONFIG } from '../config';
import { Ant } from './Ant';
import { Queen } from './Queen';
import { Insect } from './Insect';
import { Food } from './Food';
import { Terrain } from './Terrain';
import { PheromoneGrid } from './PheromoneGrid';
import { SpatialGrid } from './SpatialGrid';
import { Brood } from './Brood';
import { PerformanceManager } from '../PerformanceManager';

import { Nest } from './Nest';
import { SimObserver } from './SimObserver';
import { Colony } from './Colony';

export class World {
    // Shared environment (NOT per-colony).
    insects: Insect[];
    foods: Food[];
    // Corpses laid to rest in a graveyard chamber. Kept OUT of `foods` so foragers
    // never re-scan them (that would make the per-frame food scan grow without bound
    // as the dead pile up) — they're only decayed + drawn from here.
    graveyard: Food[] = [];
    terrain: Terrain;
    spatialGrid: SpatialGrid;

    // Per-colony state lives on `Colony`. `World` holds the colonies and proxies
    // colony 0 through the back-compat getters below, so every existing call site
    // and test is untouched while a single colony runs (Phase 1 of rival-colony work).
    colonies: Colony[] = [];
    get queen(): Queen { return this.colonies[0].queen; }
    get nest(): Nest { return this.colonies[0].nest; }
    get nestGrid(): PheromoneGrid { return this.colonies[0].nestGrid; }
    set nestGrid(g: PheromoneGrid) { this.colonies[0].nestGrid = g; }
    /** Colony 0's outdoor pheromone field (proxy — rendering + tests read this one). */
    get grid(): PheromoneGrid { return this.colonies[0].outdoorField; }
    set grid(g: PheromoneGrid) { this.colonies[0].outdoorField = g; }
    get ants(): Ant[] { return this.colonies[0].ants; }
    get brood(): Brood[] { return this.colonies[0].brood; }
    get eggs(): number { return this.colonies[0].eggs; }
    get larvae(): number { return this.colonies[0].larvae; }
    get pupae(): number { return this.colonies[0].pupae; }
    get sugarStockpile(): number { return this.colonies[0].sugarStockpile; }
    set sugarStockpile(v: number) { this.colonies[0].sugarStockpile = v; }
    get proteinStockpile(): number { return this.colonies[0].proteinStockpile; }
    set proteinStockpile(v: number) { this.colonies[0].proteinStockpile = v; }
    get trophallaxisCount(): number { return this.colonies[0].trophallaxisCount; }
    set trophallaxisCount(v: number) { this.colonies[0].trophallaxisCount = v; }
    /** Storage ceiling of colony 0 (proxy). */
    storageCapacity(): number { return this.colonies[0].storageCapacity(); }

    // Simulation Age
    age: number = 0;
    timeOfDay: number = 0; // 0-1 cycle
    dayLength: number = 6000; // ~1.5 minutes per day

    // Weather: a passing shower that washes outdoor pheromone trails away.
    raining: boolean = false;
    rainTimer: number = 0;

    /** Daylight 0..1 (1 = full day, 0 = deepest night) — mirrors the lighting schedule. */
    dayBrightness(): number {
        const t = this.timeOfDay;
        if (t >= 0.2 && t <= 0.7) return 1;             // day
        if (t < 0.2) return t / 0.2;                    // dawn 0→1
        if (t < 0.8) return 1 - (t - 0.7) / 0.1;        // dusk 1→0
        return 0;                                        // night
    }

    /** Outdoor activity multiplier (speed + sensing): full by day, reduced at night. */
    activityFactor(): number {
        const min = CONFIG.environment.nightActivityMin;
        return min + (1 - min) * this.dayBrightness();
    }

    // Particles
    particles: { x: number, y: number, vx: number, vy: number, life: number, color: string, type: 'DEFAULT' | 'BLOOD' | 'DUST' }[] = [];

    // Excavation dust, drawn on the nest canvas (nest-local coordinates).
    nestParticles: { x: number, y: number, vx: number, vy: number, life: number }[] = [];

    // Vegetation
    grass: { x: number, y: number, size: number, angle: number }[] = [];

    // Performance observer / parameter tuner
    observer: SimObserver = new SimObserver();

    constructor() {
        this.terrain = new Terrain();
        const nest = new Nest();
        const nestGrid = new PheromoneGrid(CONFIG.nestWidth, CONFIG.nestHeight);
        this.spatialGrid = new SpatialGrid(CONFIG.width, CONFIG.height, 50);
        this.insects = [];
        this.foods = [];

        const ls = nest.height > nest.width;
        const queen = new Queen();
        const queenChamber = nest.getChamber('QUEEN');
        queen.x = queenChamber.x;
        queen.y = queenChamber.y;
        // Colony 0 — the original colony, on the RIGHT (landscape) / BOTTOM (portrait)
        // edge, exactly as before. (Construction draws no rand() before init().)
        this.colonies = [new Colony(0, nest, queen, nestGrid, ls ? 'RIGHT' : 'BOTTOM')];

        this.init(); // grass + colony 0 population + food (unchanged rand order)

        // Optional rival colony on the OPPOSITE edge. Its construction + population draw
        // rand() only AFTER colony 0's full init(), so the single-colony stream — and the
        // golden snapshots — are untouched when colonyCount === 1.
        if (CONFIG.colonyCount > 1) {
            const nest1 = new Nest();
            const nestGrid1 = new PheromoneGrid(CONFIG.nestWidth, CONFIG.nestHeight);
            const queen1 = new Queen();
            const qc1 = nest1.getChamber('QUEEN');
            queen1.x = qc1.x;
            queen1.y = qc1.y;
            const colony1 = new Colony(1, nest1, queen1, nestGrid1, ls ? 'LEFT' : 'TOP');
            this.colonies.push(colony1);
            this.populateColony(colony1);
        }
    }

    // Recreate the pheromone grids at the current quality's resolution. Called on
    // quality change so the grid scale stays in sync with the renderer's overlay
    // canvas. Transient trail state is intentionally discarded.
    rebuildPheromoneGrids() {
        for (const c of this.colonies) {
            c.outdoorField = new PheromoneGrid(CONFIG.width, CONFIG.height);
            c.nestGrid = new PheromoneGrid(CONFIG.nestWidth, CONFIG.nestHeight);
        }
    }

    init() {
        // Generate Grass
        for (let i = 0; i < 200; i++) {
            this.grass.push({
                x: rand() * CONFIG.width,
                y: rand() * CONFIG.height,
                size: 2 + rand() * 3,
                angle: rand() * Math.PI * 2
            });
        }

        // Colony 0's founding population (same rand sequence as before).
        this.populateColony(this.colonies[0]);





        // Spawn other food
        for (let i = 0; i < CONFIG.sugarSourceCount; i++) {
            this.spawnFood('SUGAR');
        }
    }

    // Seed a colony with its founding workers, a soldier, and staggered brood.
    populateColony(c: Colony) {
        for (let i = 0; i < CONFIG.initialWorkers; i++) {
            c.spawnAnt('WORKER');
            const ant = c.ants[c.ants.length - 1];
            ant.energy = CONFIG.antMaxEnergy * (0.5 + rand() * 0.5); // 50–100%
        }
        c.spawnAnt('SOLDIER');

        const broodChamber = c.nest.getChamber('BROOD');
        const spawnBrood = (stage: 'EGG' | 'LARVA' | 'PUPA', count: number) => {
            for (let i = 0; i < count; i++) {
                const b = new Brood(
                    broodChamber.x + (rand() - 0.5) * 40,
                    broodChamber.y + (rand() - 0.5) * 40
                );
                b.stage = stage;
                if (stage === 'EGG') b.age = rand() * Brood.EGG_DURATION;
                if (stage === 'LARVA') b.age = rand() * Brood.LARVA_DURATION;
                if (stage === 'PUPA') b.age = rand() * Brood.PUPA_DURATION;
                c.brood.push(b);
            }
        };
        spawnBrood('PUPA', 5);
        spawnBrood('LARVA', 8);
        spawnBrood('EGG', 10);
    }

    spawnAnt(type: 'WORKER' | 'SOLDIER') {
        this.colonies[0].spawnAnt(type);
    }

    addParticle(x: number, y: number, color: string, type: 'DEFAULT' | 'BLOOD' | 'DUST' = 'DEFAULT') {
        const angle = rand() * Math.PI * 2;
        const speed = type === 'BLOOD' ? rand() * 0.5 : rand() * 2;
        this.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: type === 'BLOOD' ? 2.0 : 1.0,
            color,
            type
        });
    }

    spawnFood(type: 'SUGAR' | 'PROTEIN') {
        let x = 0, y = 0;
        let valid = false;
        while (!valid) {
            x = rand() * CONFIG.width;
            y = rand() * CONFIG.height;

            // Check Entrance Proximity (Don't spawn too close to entrance)
            const isLandscape = CONFIG.width > CONFIG.height;
            const entranceX = isLandscape ? CONFIG.width : CONFIG.width / 2;
            const entranceY = isLandscape ? CONFIG.height / 2 : CONFIG.height;

            // Minimum distance: 25% of the largest dimension
            const maxDim = Math.max(CONFIG.width, CONFIG.height);
            const minDistance = maxDim * 0.25;
            const distSq = (x - entranceX) * (x - entranceX) + (y - entranceY) * (y - entranceY);

            if (distSq >= minDistance * minDistance && !this.terrain.isBlocked(x, y, 45)) valid = true;
        }
        let amount = 1000;
        if (type === 'SUGAR') {
            // Reduced to 150-400
            amount = 100 + Math.floor(rand() * 200);
        }
        this.foods.push(new Food(x, y, type, amount));
    }

    placeFood(x: number, y: number, type: 'SUGAR' | 'PROTEIN') {
        if (!this.terrain.isBlocked(x, y)) {
            this.foods.push(new Food(x, y, type, type === 'SUGAR' ? 200 : 150));
        }
    }

    spawnEnemyAt(x: number, y: number, type: 'PREDATOR' | 'SPIDER' | 'BEETLE') {
        if (!this.terrain.isBlocked(x, y)) {
            this.insects.push(new Insect(x, y, type));
        }
    }

    getSafePosition(): { x: number, y: number } {
        let x = 0, y = 0;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 20) {
            x = rand() * CONFIG.width;
            y = rand() * CONFIG.height;
            // Check terrain and distance from edges
            if (!this.terrain.isBlocked(x, y) && x > 10 && x < CONFIG.width - 10 && y > 10 && y < CONFIG.height - 10) {
                valid = true;
            }
            attempts++;
        }
        return { x, y };
    }

    update() {
        this.age++;
        this.timeOfDay = (this.age % this.dayLength) / this.dayLength;

        // Weather: start/stop showers, and while it rains wash outdoor trails away so
        // the colony has to re-scout (the underground nestGrid is sheltered).
        const env = CONFIG.environment;
        if (this.raining) {
            if (--this.rainTimer <= 0) this.raining = false;
            else for (const c of this.colonies) c.outdoorField.scaleAll(env.rainWashout);
        } else if (rand() < env.rainChance) {
            this.raining = true;
            this.rainTimer = env.rainMinDuration + Math.floor(rand() * (env.rainMaxDuration - env.rainMinDuration));
        }

        if (this.age % CONFIG.pheromone.updateSkip === 0) {
            for (const c of this.colonies) {
                c.outdoorField.update();  // each colony's own outdoor trails
                c.nestGrid.update();      // …and underground
            }
        }

        for (const c of this.colonies) c.queen.update(this);

        // Update Spatial Grid (over EVERY colony's ants, so ants sense each other).
        this.spatialGrid.clear();
        for (const c of this.colonies) {
            for (const ant of c.ants) this.spatialGrid.add(ant);
        }

        // Update Brood (per colony).
        for (const c of this.colonies) this.updateBrood(c);

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.type === 'BLOOD') {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.9;
                p.vy *= 0.9;
                p.life -= 0.05;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;
            }
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Update nest excavation dust
        for (let i = this.nestParticles.length - 1; i >= 0; i--) {
            const p = this.nestParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.life -= 0.02;
            if (p.life <= 0) this.nestParticles.splice(i, 1);
        }

        // Update Ants (per colony).
        for (const c of this.colonies) this.updateAnts(c);

        // Update Insects
        // Dynamic Difficulty Scaling (scales with the TOTAL ant population).
        const antCount = this.totalAntCount();
        const currentMaxPredators = CONFIG.maxPredators + Math.floor(antCount / 50);
        const currentMaxSpiders = CONFIG.maxSpiders + Math.floor(antCount / 100);
        const currentMaxBeetles = CONFIG.maxBeetles + Math.floor(antCount / 150);
        const currentMaxLadybugs = CONFIG.maxLadybugs + Math.floor(antCount / 40);

        // Spawn Prey
        if (this.insects.filter(i => i.type === 'PREY').length < CONFIG.maxPrey) {
            if (rand() < CONFIG.preySpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREY'));
            }
        }
        // Spawn Predators (Generic)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'PREDATOR').length < currentMaxPredators) {
            if (rand() < CONFIG.predatorSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREDATOR'));
            }
        }
        // Spawn Spiders (Fast, Dangerous)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'SPIDER').length < currentMaxSpiders) {
            if (rand() < CONFIG.spiderSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'SPIDER'));
            }
        }
        // Spawn Beetles (Tanky)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'BEETLE').length < currentMaxBeetles) {
            if (rand() < CONFIG.beetleSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'BEETLE'));
            }
        }
        // Spawn Ladybugs (Aphid Hunters)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'LADYBUG').length < currentMaxLadybugs) {
            if (rand() < CONFIG.ladybugSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'LADYBUG'));
            }
        }
        // Spawn Aphids (Blattläuse)
        if (this.insects.filter(i => i.type === 'APHID').length < 8) {
            if (rand() < 0.003) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'APHID'));
            }
        }

        for (let i = this.insects.length - 1; i >= 0; i--) {
            const insect = this.insects[i];
            insect.update(this);
            if (insect.health <= 0) {
                // Drop protein
                // Ensure valid position (don't spawn inside walls)
                let dropX = insect.x;
                let dropY = insect.y;

                if (this.terrain.isBlocked(dropX, dropY)) {
                    // Try to find a nearby valid spot
                    for (let r = 10; r <= 50; r += 10) {
                        let found = false;
                        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                            const tx = dropX + Math.cos(a) * r;
                            const ty = dropY + Math.sin(a) * r;
                            if (!this.terrain.isBlocked(tx, ty)) {
                                dropX = tx;
                                dropY = ty;
                                found = true;
                                break;
                            }
                        }
                        if (found) break;
                    }
                }

                if (!this.terrain.isBlocked(dropX, dropY)) {
                    // Check Entrance Proximity before dropping
                    const isLandscape = CONFIG.width > CONFIG.height;
                    let nearEntrance = false;
                    if (isLandscape) {
                        if (dropX > CONFIG.width - 100 && Math.abs(dropY - CONFIG.height / 2) < 100) nearEntrance = true;
                    } else {
                        if (dropY > CONFIG.height - 100 && Math.abs(dropX - CONFIG.width / 2) < 100) nearEntrance = true;
                    }

                    if (!nearEntrance) {
                        const food = new Food(dropX, dropY, 'CORPSE', 10); // Explicitly CORPSE type
                        food.corpseType = insect.type;
                        food.corpseAngle = insect.angle;
                        this.foods.push(food);
                    }
                }
                this.insects.splice(i, 1);
            }
        }

        // Non-intrusively sample metrics for the parameter tuner (~every 10s).
        this.observer.observe(this);

        // Update Food
        for (let i = this.foods.length - 1; i >= 0; i--) {
            this.foods[i].update();
            if (this.foods[i].amount <= 0) {
                this.foods.splice(i, 1);
            }
        }

        // Interred corpses slowly moulder away (and are never foraged again).
        for (let i = this.graveyard.length - 1; i >= 0; i--) {
            this.graveyard[i].update();
            if (this.graveyard[i].amount <= 0) this.graveyard.splice(i, 1);
        }
        // Respawn Sugar
        if (this.foods.filter(f => f.type === 'SUGAR').length < CONFIG.sugarSourceCount) {
            if (rand() < 0.05) this.spawnFood('SUGAR');
        }

        // Passive colony upkeep + dynamic excavation (per colony).
        for (const c of this.colonies) {
            //  - Sugar (energy) scales with the worker population.
            //  - Protein (growth) scales with the number of larvae being raised.
            if (c.sugarStockpile > 0) {
                c.sugarStockpile = Math.max(0, c.sugarStockpile - CONFIG.colonyUpkeep * c.ants.length);
            }
            if (c.proteinStockpile > 0) {
                c.proteinStockpile = Math.max(0, c.proteinStockpile - CONFIG.broodProteinUpkeep * c.larvae);
            }

            // As the colony grows, dig extra satellite chambers. Renderer + navigation
            // pick up the new nodes automatically.
            const targetExtra = Math.min(
                CONFIG.nest.maxExtraChambers,
                Math.floor(c.ants.length / CONFIG.nest.excavateEvery),
            );
            while (c.nest.extraChambers < targetExtra) {
                if (!c.nest.growStage()) break;
                this.spawnNestDust(c.nest);
            }
        }
    }

    // Total ants across all colonies (drives shared difficulty scaling).
    totalAntCount(): number {
        let n = 0;
        for (const c of this.colonies) n += c.ants.length;
        return n;
    }

    // Brood lifecycle for one colony: provision toward caste, hatch (capped), starve.
    private updateBrood(c: Colony) {
        const proteinRich = c.proteinStockpile > CONFIG.brood.soldierProteinLevel;
        for (let i = c.brood.length - 1; i >= 0; i--) {
            const b = c.brood[i];
            // Larvae raised during protein-rich times accumulate toward the soldier
            // caste (no protein consumed here — the cost is broodProteinUpkeep).
            if (proteinRich) b.provision();
            const readyToHatch = b.update();
            if (readyToHatch) {
                // Hatch, subject to the population cap.
                if (c.ants.length < PerformanceManager.settings.maxAnts) {
                    // Caste is set by how well the larva was provisioned (nutrition),
                    // but soldiers stay locked until the colony is established.
                    const workers = c.ants.filter(a => a.type === 'WORKER').length;
                    let caste = b.destinedCaste ?? 'WORKER';
                    if (caste === 'SOLDIER') {
                        // Locked until established, and capped so the workforce never
                        // collapses even when protein is abundant.
                        const soldiers = c.ants.length - workers;
                        const tooMany = soldiers >= c.ants.length * CONFIG.brood.maxSoldierFraction;
                        if (workers <= CONFIG.soldierUnlockThreshold || tooMany) caste = 'WORKER';
                    }
                    c.spawnAnt(caste);
                }
                c.brood.splice(i, 1);
            } else if (b.stage === 'LARVA' && b.hunger > 100) {
                c.brood.splice(i, 1); // starved to death
            }
        }
    }

    // Movement + lifecycle for one colony's ants; dead ants drop a corpse outdoors.
    private updateAnts(c: Colony) {
        for (let i = c.ants.length - 1; i >= 0; i--) {
            const ant = c.ants[i];
            ant.update(this);
            if (ant.health <= 0) {
                if (ant.location === 'WORLD') {
                    const corpse = new Food(ant.x, ant.y, 'CORPSE', 100);
                    corpse.corpseType = 'ANT';
                    corpse.corpseAngle = ant.angle;
                    this.foods.push(corpse);
                }
                c.ants.splice(i, 1);
            }
        }
    }

    // A short burst of dust particles at the most recently dug chamber, drawn on
    // the nest canvas, as visual feedback for excavation.
    spawnNestDust(nest: Nest = this.nest) {
        const c = nest.chambers[nest.chambers.length - 1];
        if (!c) return;
        for (let i = 0; i < 14; i++) {
            const a = rand() * Math.PI * 2;
            const sp = rand() * 1.5;
            this.nestParticles.push({
                x: c.x + (rand() - 0.5) * c.radius,
                y: c.y + (rand() - 0.5) * c.radius,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 1.0,
            });
        }
    }
}
