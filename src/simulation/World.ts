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

export class World {
    ants: Ant[];
    queen: Queen;
    insects: Insect[];
    foods: Food[];
    terrain: Terrain;
    grid: PheromoneGrid;
    nestGrid: PheromoneGrid;
    spatialGrid: SpatialGrid;
    nest: Nest;

    brood: Brood[];

    // Resources
    proteinStockpile: number = 0;
    sugarStockpile: number = 0;

    // Simulation Age
    age: number = 0;
    timeOfDay: number = 0; // 0-1 cycle
    dayLength: number = 6000; // ~1.5 minutes per day

    // Brood Stats (Getters for compatibility)
    get eggs(): number { return this.brood.filter(b => b.stage === 'EGG').length; }
    get larvae(): number { return this.brood.filter(b => b.stage === 'LARVA').length; }
    get pupae(): number { return this.brood.filter(b => b.stage === 'PUPA').length; }

    // Particles
    particles: { x: number, y: number, vx: number, vy: number, life: number, color: string, type: 'DEFAULT' | 'BLOOD' | 'DUST' }[] = [];

    // Vegetation
    grass: { x: number, y: number, size: number, angle: number }[] = [];

    constructor() {
        this.terrain = new Terrain();
        this.nest = new Nest();
        this.grid = new PheromoneGrid(CONFIG.width, CONFIG.height);
        this.nestGrid = new PheromoneGrid(CONFIG.nestWidth, CONFIG.nestHeight);
        this.spatialGrid = new SpatialGrid(CONFIG.width, CONFIG.height, 50);
        this.ants = [];
        this.insects = [];
        this.foods = [];
        this.brood = [];
        this.queen = new Queen();
        const queenChamber = this.nest.chambers.find(c => c.type === 'QUEEN') || this.nest.chambers[0];
        this.queen.x = queenChamber.x;
        this.queen.y = queenChamber.y;

        this.init();
    }

    init() {
        // Generate Grass
        for (let i = 0; i < 200; i++) {
            this.grass.push({
                x: Math.random() * CONFIG.width,
                y: Math.random() * CONFIG.height,
                size: 2 + Math.random() * 3,
                angle: Math.random() * Math.PI * 2
            });
        }

        // Spawn initial workers with randomized energy (to prevent mass die-off)
        for (let i = 0; i < CONFIG.initialWorkers; i++) {
            this.spawnAnt('WORKER');
            const ant = this.ants[this.ants.length - 1];
            // Randomize energy between 50% and 100%
            ant.energy = CONFIG.antMaxEnergy * (0.5 + Math.random() * 0.5);
        }
        // Spawn one initial soldier
        this.spawnAnt('SOLDIER');

        // Initial Brood (Staggered Stages)
        const broodChamber = this.nest.chambers.find(c => c.type === 'BROOD') || this.nest.chambers[0];

        // Helper to spawn brood
        const spawnBrood = (stage: 'EGG' | 'LARVA' | 'PUPA', count: number) => {
            for (let i = 0; i < count; i++) {
                const b = new Brood(
                    broodChamber.x + (Math.random() - 0.5) * 40,
                    broodChamber.y + (Math.random() - 0.5) * 40
                );
                b.stage = stage;
                // Randomize age to stagger hatching/pupation
                if (stage === 'EGG') b.age = Math.random() * Brood.EGG_DURATION;
                if (stage === 'LARVA') b.age = Math.random() * Brood.LARVA_DURATION;
                if (stage === 'PUPA') b.age = Math.random() * Brood.PUPA_DURATION;
                this.brood.push(b);
            }
        };

        spawnBrood('PUPA', 5);   // 5 Pupae (Will hatch soon)
        spawnBrood('LARVA', 8);  // 8 Larvae (Need feeding)
        spawnBrood('EGG', 10);   // 10 Eggs (Future generation)





        // Spawn other food
        for (let i = 0; i < CONFIG.sugarSourceCount; i++) {
            this.spawnFood('SUGAR');
        }
    }

    spawnAnt(type: 'WORKER' | 'SOLDIER') {
        const ant = new Ant(this.queen.x, this.queen.y, type);
        ant.location = 'NEST';
        this.ants.push(ant);
    }

    addParticle(x: number, y: number, color: string, type: 'DEFAULT' | 'BLOOD' | 'DUST' = 'DEFAULT') {
        const angle = Math.random() * Math.PI * 2;
        const speed = type === 'BLOOD' ? Math.random() * 0.5 : Math.random() * 2;
        this.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: type === 'BLOOD' ? 5.0 : 1.0,
            color,
            type
        });
    }

    spawnFood(type: 'SUGAR' | 'PROTEIN') {
        let x = 0, y = 0;
        let valid = false;
        while (!valid) {
            x = Math.random() * CONFIG.width;
            y = Math.random() * CONFIG.height;

            // Check Entrance Proximity (Don't spawn too close to entrance)
            const isLandscape = CONFIG.width > CONFIG.height;
            let nearEntrance = false;
            if (isLandscape) {
                if (x > CONFIG.width - 150 && Math.abs(y - CONFIG.height / 2) < 150) nearEntrance = true;
            } else {
                if (y > CONFIG.height - 150 && Math.abs(x - CONFIG.width / 2) < 150) nearEntrance = true;
            }

            if (!nearEntrance && !this.terrain.isBlocked(x, y, 45)) valid = true;
        }
        let amount = 1000;
        if (type === 'SUGAR') {
            // Randomize amount between 500 and 2000
            amount = 500 + Math.floor(Math.random() * 1500);
        }
        this.foods.push(new Food(x, y, type, amount));
    }

    getSafePosition(): { x: number, y: number } {
        let x = 0, y = 0;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 20) {
            x = Math.random() * CONFIG.width;
            y = Math.random() * CONFIG.height;
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
        this.grid.update();
        this.nestGrid.update();
        this.queen.update(this);

        // Update Spatial Grid
        this.spatialGrid.clear();
        for (const ant of this.ants) {
            this.spatialGrid.add(ant);
        }

        // Update Brood
        for (let i = this.brood.length - 1; i >= 0; i--) {
            const b = this.brood[i];
            const readyToHatch = b.update();
            if (readyToHatch) {
                // Hatch!
                // Dynamic Caste Production
                // Check Population Limit
                if (this.ants.length < PerformanceManager.settings.maxAnts) {
                    const soldiers = this.ants.filter(a => a.type === 'SOLDIER').length;
                    const workers = this.ants.filter(a => a.type === 'WORKER').length;

                    if (soldiers < workers / 5 && workers > CONFIG.soldierUnlockThreshold) {
                        this.spawnAnt('SOLDIER');
                    } else {
                        this.spawnAnt('WORKER');
                    }
                }

                this.brood.splice(i, 1);
            } else if (b.stage === 'LARVA' && b.hunger > 100) {
                // Starved to death
                this.brood.splice(i, 1);
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.type === 'BLOOD') {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.9;
                p.vy *= 0.9;
                p.life -= 0.005;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;
            }
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Update Ants
        for (let i = this.ants.length - 1; i >= 0; i--) {
            const ant = this.ants[i];
            ant.update(this);
            if (ant.health <= 0) {
                // Spawn Corpse
                if (ant.location === 'WORLD') {
                    const corpse = new Food(ant.x, ant.y, 'CORPSE', 100);
                    corpse.corpseType = 'ANT';
                    corpse.corpseAngle = ant.angle;
                    this.foods.push(corpse);
                }
                this.ants.splice(i, 1);
            }
        }

        // Update Insects
        // Dynamic Difficulty Scaling
        const antCount = this.ants.length;
        const currentMaxPredators = CONFIG.maxPredators + Math.floor(antCount / 50);
        const currentMaxSpiders = CONFIG.maxSpiders + Math.floor(antCount / 100);
        const currentMaxBeetles = CONFIG.maxBeetles + Math.floor(antCount / 75);
        const currentMaxLadybugs = CONFIG.maxLadybugs + Math.floor(antCount / 40);

        // Spawn Prey
        if (this.insects.filter(i => i.type === 'PREY').length < CONFIG.maxPrey) {
            if (Math.random() < CONFIG.preySpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREY'));
            }
        }
        // Spawn Predators (Generic)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'PREDATOR').length < currentMaxPredators) {
            if (Math.random() < CONFIG.predatorSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREDATOR'));
            }
        }
        // Spawn Spiders (Fast, Dangerous)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'SPIDER').length < currentMaxSpiders) {
            if (Math.random() < CONFIG.spiderSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'SPIDER'));
            }
        }
        // Spawn Beetles (Tanky)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'BEETLE').length < currentMaxBeetles) {
            if (Math.random() < CONFIG.beetleSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'BEETLE'));
            }
        }
        // Spawn Ladybugs (Aphid Hunters)
        if (this.age > CONFIG.gracePeriod && this.insects.filter(i => i.type === 'LADYBUG').length < currentMaxLadybugs) {
            if (Math.random() < CONFIG.ladybugSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'LADYBUG'));
            }
        }
        // Spawn Aphids (Blattläuse)
        if (this.insects.filter(i => i.type === 'APHID').length < 8) {
            if (Math.random() < 0.003) {
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
                        const food = new Food(dropX, dropY, 'PROTEIN', 50);
                        food.corpseType = insect.type;
                        food.corpseAngle = insect.angle;
                        this.foods.push(food);
                    }
                }
                this.insects.splice(i, 1);
            }
        }

        // Update Food
        for (let i = this.foods.length - 1; i >= 0; i--) {
            this.foods[i].update();
            if (this.foods[i].amount <= 0) {
                this.foods.splice(i, 1);
            }
        }
        // Respawn Sugar
        if (this.foods.filter(f => f.type === 'SUGAR').length < CONFIG.sugarSourceCount) {
            if (Math.random() < 0.05) this.spawnFood('SUGAR');
        }
    }
}
