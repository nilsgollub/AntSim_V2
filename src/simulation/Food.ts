export type FoodType = 'SUGAR' | 'PROTEIN';

export class Food {
    x: number;
    y: number;
    type: FoodType;
    amount: number;
    maxAmount: number;

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
}
