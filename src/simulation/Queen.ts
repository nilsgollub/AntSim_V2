import { CONFIG } from '../config';
import { World } from './World';
import { Brood } from './Brood';

export type QueenState = 'IDLE' | 'LAYING' | 'STRESSED';

export class Queen {
    x: number;
    y: number;
    state: QueenState = 'IDLE';

    energy: number = 1000;
    maxEnergy: number = 2000;
    stress: number = 0;

    layTimer: number = 0;
    age: number = 0;

    constructor() {
        this.x = 0;
        this.y = 0;
    }

    update(world: World) {
        // 1. Check for Danger (Stress)
        const danger = world.grid.get(this.x, this.y, 'DANGER');
        if (danger > 0.1) {
            this.stress += 1.0;
            this.state = 'STRESSED';
        } else {
            this.stress = Math.max(0, this.stress - 0.05);
        }

        // 2. State Machine
        switch (this.state) {
            case 'STRESSED':
                if (this.stress < 10) {
                    this.state = 'IDLE';
                }
                break;

            case 'IDLE':
                // Recover energy slowly
                this.energy = Math.min(this.maxEnergy, this.energy + 0.1);

                // Decide to lay eggs if healthy and fed
                if (this.energy > 500 && this.stress < 20 && world.brood.length < 50) {
                    this.state = 'LAYING';
                    this.layTimer = 100;
                }
                break;

            case 'LAYING':
                this.layTimer--;
                if (this.layTimer <= 0) {
                    // Try to lay egg
                    if (this.energy >= CONFIG.eggCost && world.proteinStockpile >= 5) {
                        this.energy -= CONFIG.eggCost;
                        world.proteinStockpile -= 5; // Eggs need protein too

                        // Spawn Egg
                        // Spawn Egg at the tip of the abdomen (Queen is vertical, head up)
                        // Abdomen tip is approx +45px down
                        const eggX = this.x + (Math.random() - 0.5) * 10;
                        const eggY = this.y + 45 + (Math.random() * 5);
                        world.brood.push(new Brood(eggX, eggY));

                        this.state = 'IDLE';
                    } else {
                        // Not enough resources, abort
                        this.state = 'IDLE';
                    }
                }
                break;
        }

        // Hunger check
        this.energy -= 0.2; // Metabolic cost
        if (this.energy < 0) this.energy = 0;

        this.age++;
    }

    feed(amount: number) {
        this.energy = Math.min(this.maxEnergy, this.energy + amount);
    }
}
