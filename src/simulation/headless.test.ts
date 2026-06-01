import { describe, it, expect } from 'vitest';
import { runHeadless } from './headless';
import { PerformanceManager } from '../PerformanceManager';

describe('headless harness — determinism', () => {
    it('reproduces the same run exactly for the same seed', () => {
        const a = runHeadless(12345, 800);
        const b = runHeadless(12345, 800);
        expect(b).toEqual(a);
    });

    it('produces different runs for different seeds', () => {
        const a = runHeadless(1, 800);
        const b = runHeadless(2, 800);
        expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    });
});

describe('headless harness — colony viability (soak)', () => {
    // A longer run that would catch gross balance regressions: a colony that
    // collapses to zero, explodes past the cap, or starves a resource to a
    // permanent zero. Deterministic, so it can't flake.
    const m = runHeadless(7, 6000);

    it('the colony does not die out', () => {
        expect(m.population).toBeGreaterThan(0);
        expect(m.queenEnergy).toBeGreaterThan(0);
    });

    it('the colony grows beyond its starting size', () => {
        expect(m.peakPopulation).toBeGreaterThanOrEqual(16);
    });

    it('stays within the population cap', () => {
        expect(m.population).toBeLessThanOrEqual(PerformanceManager.settings.maxAnts);
    });

    it('keeps at least one resource flowing (not both stuck at zero)', () => {
        expect(m.sugar + m.protein).toBeGreaterThan(0);
    });

    it('keeps the brood pipeline alive (queen is laying)', () => {
        expect(m.brood).toBeGreaterThan(0);
    });
});
