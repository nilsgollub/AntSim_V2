export type FoodType = 'SUGAR' | 'PROTEIN' | 'CORPSE';

export class Food {
    x: number;
    y: number;
    type: FoodType;
    amount: number;
    maxAmount: number;
    corpseType?: string;
    corpseAngle?: number;

    constructor(x: number, y: number, type: FoodType, amount: number) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.amount = amount;
        this.maxAmount = amount;
    }

    harvest(amount: number): number {
        const taken = Math.min(this.amount, amount);
        this.amount -= taken;
        return taken;
    }

    update() {
        if (this.type === 'PROTEIN') {
            this.amount -= 0.02; // Decay over time (Rotting)
        } else if (this.type === 'CORPSE') {
            // Rot away in ~30s regardless of size. A flat rate let big ant corpses
            // (amount 100) linger for minutes, so battlefield dead piled up into a
            // permanent black-crumb heap along the rival front. Decaying proportional
            // to maxAmount clears any corpse in roughly the same time (~2000 ticks).
            this.amount -= this.maxAmount * 0.0005;
        }
    }
}
