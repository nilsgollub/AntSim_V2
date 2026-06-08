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

    it('CORPSE decays proportional to size, clearing in a bounded ~30s', () => {
        // A flat decay rate let big ant corpses (amount 100) linger for minutes, so
        // battlefield dead piled into a permanent heap. Decay is now proportional to
        // maxAmount → any corpse, big or small, fully clears in roughly the same time.
        const ticksToClear = (amount: number) => {
            const f = new Food(0, 0, 'CORPSE', amount);
            let t = 0;
            while (f.amount > 0 && t < 100000) { f.update(); t++; }
            return t;
        };
        const big = ticksToClear(100);
        const small = ticksToClear(10);
        expect(Math.abs(big - small)).toBeLessThanOrEqual(2); // size-independent lifetime
        expect(big).toBeLessThan(2500);                       // ~30s @ 60fps, not minutes
    });

    it('SUGAR does not decay', () => {
        const f = new Food(0, 0, 'SUGAR', 100);
        f.update();
        expect(f.amount).toBe(100);
    });
});
