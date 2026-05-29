import { describe, it, expect } from 'vitest';
import { Food } from './Food';

describe('Food', () => {
    it('harvest reduces amount and returns taken value', () => {
        const f = new Food(0, 0, 'SUGAR', 100);
        const taken = f.harvest(30);
        expect(taken).toBe(30);
        expect(f.amount).toBe(70);
    });

    it('harvest clamps to available amount', () => {
        const f = new Food(0, 0, 'PROTEIN', 10);
        const taken = f.harvest(50);
        expect(taken).toBe(10);
        expect(f.amount).toBe(0);
    });

    it('PROTEIN decays each update tick', () => {
        const f = new Food(0, 0, 'PROTEIN', 100);
        f.update();
        expect(f.amount).toBeLessThan(100);
    });

    it('CORPSE decays slower than PROTEIN', () => {
        const protein = new Food(0, 0, 'PROTEIN', 100);
        const corpse  = new Food(0, 0, 'CORPSE', 100);
        protein.update();
        corpse.update();
        expect(corpse.amount).toBeGreaterThan(protein.amount);
    });

    it('SUGAR does not decay', () => {
        const f = new Food(0, 0, 'SUGAR', 100);
        f.update();
        expect(f.amount).toBe(100);
    });
});
