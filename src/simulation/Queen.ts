import { rand } from '../rng';
import { CONFIG } from '../config';
import type { World } from './World';
import { Brood } from './Brood';
import type { Colony } from './Colony';

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

    // Mortality: a queen whose energy sits at 0 (the colony can no longer feed her)
    // starves. `dead` queens stop laying — so a collapsed colony truly ends instead of
    // an immortal queen idling on an empty world forever.
    dead: boolean = false;
    starveTimer: number = 0;

    // The colony this queen heads (set in Colony's constructor). Egg-laying + sugar
    // regen draw on this colony's own stockpiles + brood.
    colony!: Colony;

    constructor() {
        this.x = 0;
        this.y = 0;
    }

    update(_world: World) {
        if (this.dead) return; // a starved queen lays no more eggs

        // 1. Check for Danger (Stress)
        const danger = this.colony.outdoorField.get(this.x, this.y, 'DANGER');
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
                // Recover energy by consuming sugar from the colony stockpile.
                // (Protein feeding by nurses tops her up separately.)
                if (this.energy < this.maxEnergy && this.colony.sugarStockpile > 0) {
                    const regen = CONFIG.queenSugarRegen;
                    const cost = regen / CONFIG.sugarEnergyValue;
                    const spent = Math.min(this.colony.sugarStockpile, cost);
                    this.colony.sugarStockpile -= spent;
                    this.energy = Math.min(this.maxEnergy, this.energy + spent * CONFIG.sugarEnergyValue);
                }

                // Decide to lay eggs if healthy and fed. (Keeping the pipeline alive even
                // at low protein is what lets a battered colony recover — a hard protein
                // reserve here backfired: it froze laying and guaranteed brood→0.)
                if (this.energy > 500 && this.stress < 20 && this.colony.brood.length < 200) {
                    this.state = 'LAYING';
                    this.layTimer = CONFIG.queenLayInterval;
                }
                break;

            case 'LAYING':
                this.layTimer--;
                if (this.layTimer <= 0) {
                    // Try to lay egg
                    if (this.energy >= CONFIG.eggCost && this.colony.proteinStockpile >= 5) {
                        this.energy -= CONFIG.eggCost;
                        this.colony.proteinStockpile -= 5; // Eggs need protein too

                        // Spawn Egg
                        // Spawn Egg at the tip of the abdomen (Queen is vertical, head up)
                        // Abdomen tip is approx +45px down
                        const eggX = this.x + (rand() - 0.5) * 10;
                        const eggY = this.y + 45 + (rand() * 5);
                        this.colony.brood.push(new Brood(eggX, eggY));

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

        // Mortality: she dies once the colony can no longer sustain her — i.e. she's
        // ABANDONED (no workers left to feed/tend her) or starved to empty. Long enough
        // in that state → death, so a collapsed colony truly ends. A healthy colony
        // always has ants and a fed queen, so this never triggers (golden run safe).
        if (this.colony.ants.length === 0 || this.energy <= 0) {
            if (++this.starveTimer > CONFIG.queenStarveDeathTicks) this.dead = true;
        } else {
            this.starveTimer = 0;
        }

        this.age++;
    }

    feed(amount: number) {
        this.energy = Math.min(this.maxEnergy, this.energy + amount);
    }
}
