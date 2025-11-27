export type BroodStage = 'EGG' | 'LARVA' | 'PUPA';

export class Brood {
    x: number;
    y: number;
    stage: BroodStage;
    age: number = 0;
    hunger: number = 0; // Only for Larvae

    // Configurable lifecycle durations
    static EGG_DURATION = 1000;
    static LARVA_DURATION = 2000;
    static PUPA_DURATION = 1500;

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
                this.hunger = 50; // Starts hungry
            }
        } else if (this.stage === 'LARVA') {
            this.hunger += 0.05; // Gets hungrier over time

            // Die if starving
            if (this.hunger > 100) return false; // Dead

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
