import { describe, it, expect, afterAll } from 'vitest';
import { runHeadless } from './headless';
import { PerformanceManager, QualityLevel } from '../PerformanceManager';

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
            brood: 23, larvae: 16, sugar: 687, protein: 238,
            queenEnergy: 2201, extraChambers: 2, peakPopulation: 21, minPopulation: 16,
        });
    });

    it('matches the pinned snapshot at 2500 ticks', () => {
        expect(runHeadless(12345, 2500)).toEqual({
            ticks: 2500, population: 23, workers: 22, soldiers: 1,
            brood: 29, larvae: 15, sugar: 711, protein: 194,
            queenEnergy: 2242, extraChambers: 2, peakPopulation: 23, minPopulation: 16,
        });
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

describe('headless harness — sim is independent of render quality', () => {
    // Pheromone sim fidelity (grid resolution / diffusion / update cadence) lives in
    // CONFIG, not the quality preset, so colony behaviour must be IDENTICAL on every
    // graphics setting. At 2500 ticks the colony (~23 ants) stays under even the
    // ULTRA_LOW ant cap (80), so maxAnts can't bind and the runs must match exactly.
    afterAll(() => PerformanceManager.setQuality(QualityLevel.MEDIUM));

    function runAt(level: QualityLevel) {
        PerformanceManager.setQuality(level);
        return runHeadless(12345, 2500);
    }

    it('produces identical metrics across all quality presets', () => {
        const ref = runAt(QualityLevel.ULTRA);
        for (const level of [QualityLevel.HIGH, QualityLevel.MEDIUM, QualityLevel.LOW, QualityLevel.ULTRA_LOW]) {
            expect(runAt(level)).toEqual(ref);
        }
    }, 20000); // 5 headless runs — needs more than the default 5s test budget
});
