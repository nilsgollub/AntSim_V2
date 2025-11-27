import { CONFIG } from '../config';
import { Ant } from './Ant';
import { Queen } from './Queen';
import { Insect } from './Insect';
import { Food } from './Food';
import { Terrain } from './Terrain';
import { PheromoneGrid } from './PheromoneGrid';

export class World {
    ants: Ant[];
    queen: Queen;
    insects: Insect[];
    foods: Food[];
    terrain: Terrain;
    grid: PheromoneGrid;

    // Resources
    proteinStockpile: number = 0;
    sugarStockpile: number = 0;

    // Brood
    eggs: number = 0;
    larvae: number = 0;
    pupae: number = 0;

    // Particles
    particles: { x: number, y: number, vx: number, vy: number, life: number, color: string }[] = [];

    constructor() {
        this.terrain = new Terrain();
        this.grid = new PheromoneGrid(CONFIG.width, CONFIG.height);
        this.ants = [];
        this.insects = [];
        this.foods = [];
        this.queen = new Queen();

        this.init();
    }

    init() {
        // Spawn initial workers
        for (let i = 0; i < CONFIG.initialWorkers; i++) {
            this.spawnAnt('WORKER');
        }
        // Spawn one initial soldier
        this.spawnAnt('SOLDIER');

        // Initial Brood
        this.eggs = 20;
        this.larvae = 10;
        this.pupae = 5;

        // Spawn initial food (Sugar near nest)
        this.foods.push(new Food(
            CONFIG.queenPosition.x + 100,
            CONFIG.queenPosition.y + 100,
            'SUGAR',
            5000
        ));

        // Spawn other food
        for (let i = 0; i < CONFIG.sugarSourceCount; i++) {
            this.spawnFood('SUGAR');
        }
    }

    spawnAnt(type: 'WORKER' | 'SOLDIER') {
        this.ants.push(new Ant(CONFIG.queenPosition.x, CONFIG.queenPosition.y, type));
    }

    addParticle(x: number, y: number, color: string) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;
        this.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color
        });
    }

    spawnBrood() {
        this.eggs++;
    }

    spawnFood(type: 'SUGAR' | 'PROTEIN') {
        let x = 0, y = 0;
        let valid = false;
        while (!valid) {
            x = Math.random() * CONFIG.width;
            y = Math.random() * CONFIG.height;
            if (!this.terrain.isBlocked(x, y)) valid = true;
        }
        this.foods.push(new Food(x, y, type, 1000));
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
        this.grid.update();
        this.queen.update(this);

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Update Ants
        for (let i = this.ants.length - 1; i >= 0; i--) {
            const ant = this.ants[i];
            ant.update(this);
            if (ant.health <= 0) {
                this.foods.push(new Food(ant.x, ant.y, 'CORPSE', 1));
                this.ants.splice(i, 1);
            }
        }

        // Update Insects
        // Spawn Prey
        if (this.insects.filter(i => i.type === 'PREY').length < CONFIG.maxPrey) {
            if (Math.random() < CONFIG.preySpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREY'));
            }
        }
        // Spawn Predators (Generic)
        if (this.insects.filter(i => i.type === 'PREDATOR').length < 1) {
            if (Math.random() < CONFIG.predatorSpawnRate) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'PREDATOR'));
            }
        }
        // Spawn Spiders (Fast, Dangerous)
        if (this.insects.filter(i => i.type === 'SPIDER').length < 1) {
            if (Math.random() < 0.0003) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'SPIDER'));
            }
        }
        // Spawn Beetles (Tanky)
        if (this.insects.filter(i => i.type === 'BEETLE').length < 2) {
            if (Math.random() < 0.0005) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'BEETLE'));
            }
        }
        // Spawn Ladybugs (Aphid Hunters)
        if (this.insects.filter(i => i.type === 'LADYBUG').length < 2) {
            if (Math.random() < 0.001) {
                const pos = this.getSafePosition();
                this.insects.push(new Insect(pos.x, pos.y, 'LADYBUG'));
            }
        }
        // Spawn Aphids (Blattläuse)
        if (this.insects.filter(i => i.type === 'APHID').length < 8) { // Increased limit slightly
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
                this.foods.push(new Food(insect.x, insect.y, 'PROTEIN', 50));
                this.insects.splice(i, 1);
            }
        }

        // Update Food
        for (let i = this.foods.length - 1; i >= 0; i--) {
            if (this.foods[i].amount <= 0) {
                this.foods.splice(i, 1);
            }
        }
        // Respawn Sugar
        if (this.foods.filter(f => f.type === 'SUGAR').length < CONFIG.sugarSourceCount) {
            if (Math.random() < 0.05) this.spawnFood('SUGAR'); // Increased spawn rate
        }

        // Brood Development
        if (this.eggs > 0 && Math.random() < 0.01) { this.eggs--; this.larvae++; }
        if (this.larvae > 0 && Math.random() < 0.005) { this.larvae--; this.pupae++; }
        if (this.pupae > 0 && Math.random() < 0.005) {
            this.pupae--;
            const type = this.ants.length > CONFIG.soldierUnlockThreshold && Math.random() < 0.2 ? 'SOLDIER' : 'WORKER';
            this.spawnAnt(type);
        }
    }
}
