import { describe, it, expect } from 'vitest';
import { runHeadless } from './headless';

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

describe('headless harness — golden (behaviour pinned)', () => {
    // Exact metrics for a fixed seed. Any unintended behaviour change — from a
    // refactor or an accidental bug — shifts these numbers and fails the test.
    // Update deliberately (and in the commit message) when a change is intended.
    it('matches the pinned snapshot at 1000 ticks', () => {
        expect(runHeadless(12345, 1000)).toEqual({
            ticks: 1000, population: 21, workers: 20, soldiers: 1,
            brood: 23, larvae: 16, sugar: 655, protein: 238,
            queenEnergy: 2201, extraChambers: 2, peakPopulation: 21, minPopulation: 16,
        });
    });

    it('matches the pinned snapshot at 2500 ticks', () => {
        expect(runHeadless(12345, 2500)).toEqual({
            ticks: 2500, population: 23, workers: 22, soldiers: 1,
            brood: 29, larvae: 15, sugar: 693, protein: 214,
            queenEnergy: 2243, extraChambers: 2, peakPopulation: 23, minPopulation: 16,
        });
    });
});

// The long-horizon suites (soak, multi-seed economy, render-quality sweep) live in
// headless.soak.test.ts and run via `npm run test:soak` — they cost ~25s and would
// dominate the fast loop.

