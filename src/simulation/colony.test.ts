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
    // Track each colony's PEAK stockpile over the run — the losing side of the war can be
    // momentarily plundered to 0 at any given tick, so an instantaneous reading is a
    // fragile proxy for "foraging works". A non-zero peak proves it gathered food.
    const peakStock = w.colonies.map(() => 0);
    for (let i = 0; i < 12000; i++) {
        w.update();
        w.colonies.forEach((c, k) => {
            const s = c.sugarStockpile + c.proteinStockpile;
            if (s > peakStock[k]) peakStock[k] = s;
        });
    }

    it('spawns two colonies on opposite entrances', () => {
        expect(w.colonies.length).toBe(2);
        expect(w.colonies[0].entranceSide).toBe('RIGHT');
        expect(w.colonies[1].entranceSide).toBe('LEFT');
    });

    it('both colonies survive and forage on their own resources', () => {
        w.colonies.forEach((c, k) => {
            expect(c.ants.length).toBeGreaterThan(0);          // alive
            expect(peakStock[k]).toBeGreaterThan(0);           // foraging works (gathered food at some point)
            expect(c.brood.length).toBeGreaterThan(0);         // queen laying
        });
    });

    it('each colony scouts on its own outdoor field (rivals do not share trails)', () => {
        expect(w.colonies[0].outdoorField).not.toBe(w.colonies[1].outdoorField);
    });
});

describe('rival colony — ant-vs-ant warfare', () => {
    afterAll(() => { CONFIG.colonyCount = 1; });

    CONFIG.colonyCount = 2;
    seedRng(42);
    const w = new World();
    let antCorpseSeen = false;
    for (let i = 0; i < 10000; i++) {
        w.update();
        if (!antCorpseSeen) {
            for (const f of w.foods) {
                if ((f as unknown as { corpseType?: string }).corpseType === 'ANT') { antCorpseSeen = true; break; }
            }
        }
    }

    it('rival colonies actually fight (ant corpses appear on the field)', () => {
        expect(antCorpseSeen).toBe(true);
    });

    it('but the war is survivable — neither side is instantly annihilated', () => {
        expect(w.colonies[0].ants.length).toBeGreaterThan(0);
        expect(w.colonies[1].ants.length).toBeGreaterThan(0);
    });
});
