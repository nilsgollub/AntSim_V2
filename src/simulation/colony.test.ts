import { describe, it, expect, afterAll } from 'vitest';
import { seedRng } from '../rng';
import { World } from './World';
import { CONFIG } from '../config';

describe('rival colony — two colonies coexist', () => {
    // Run with two colonies in the describe body (collection phase) so the long run
    // isn't subject to the per-test timeout. Restore the default afterwards.
    afterAll(() => { CONFIG.colonyCount = 1; });

    CONFIG.colonyCount = 2;
    seedRng(42);
    const w = new World();
    for (let i = 0; i < 12000; i++) w.update();

    it('spawns two colonies on opposite entrances', () => {
        expect(w.colonies.length).toBe(2);
        expect(w.colonies[0].entranceSide).toBe('RIGHT');
        expect(w.colonies[1].entranceSide).toBe('LEFT');
    });

    it('both colonies survive and forage on their own resources', () => {
        for (const c of w.colonies) {
            expect(c.ants.length).toBeGreaterThan(0);          // alive
            expect(c.sugarStockpile + c.proteinStockpile).toBeGreaterThan(0); // foraging works
            expect(c.brood.length).toBeGreaterThan(0);         // queen laying
        }
    });

    it('each colony scouts on its own outdoor field (rivals do not share trails)', () => {
        expect(w.colonies[0].outdoorField).not.toBe(w.colonies[1].outdoorField);
    });
});
