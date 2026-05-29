import { CONFIG } from '../config';

export type BroodStage = 'EGG' | 'LARVA' | 'PUPA';

export class Brood {
    x: number;
    y: number;
    stage: BroodStage;
    age: number = 0;
    hunger: number = 0; // Only for Larvae
    carrier: any = null;

    // Configurable lifecycle durations (sourced from CONFIG so they can be tuned centrally)
    static get EGG_DURATION() { return CONFIG.brood.eggDuration; }
    static get LARVA_DURATION() { return CONFIG.brood.larvaDuration; }
    static get PUPA_DURATION() { return CONFIG.brood.pupaDuration; }

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.stage = 'EGG';
    }

    update(): boolean {
        this.age++;

        if (this.stage === 'EGG') {
            if (this.age > Brood.EGG_DURATION) {
                this.stage = 'LARVA';
                this.age = 0;
                this.hunger = 0; // Starts full
            }
        } else if (this.stage === 'LARVA') {
            this.hunger += CONFIG.brood.hungerRate; // Gets hungrier VERY slowly

            // Die if starving (Hardy)
            if (this.hunger > CONFIG.brood.larvaStarveLimit) return false; // Dead

            // Metamorphosis if well fed and old enough
            if (this.age > Brood.LARVA_DURATION && this.hunger < 20) {
                this.stage = 'PUPA';
                this.age = 0;
            }
        } else if (this.stage === 'PUPA') {
            if (this.age > Brood.PUPA_DURATION) {
                return true; // Ready to hatch into Ant!
            }
        }

        return false; // Not ready to hatch yet
    }

    feed(amount: number) {
        if (this.stage === 'LARVA') {
            this.hunger = Math.max(0, this.hunger - amount);
        }
    }
}
