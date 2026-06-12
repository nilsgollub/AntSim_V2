import { describe, it, expect, afterAll } from 'vitest';
import { runHeadless } from './headless';
import { PerformanceManager, QualityLevel } from '../PerformanceManager';

// Slow long-horizon suites, excluded from the default `npm test` loop.
// Run with `npm run test:soak` (CI runs `npm run test:all`).

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

describe('headless harness — economy invariants (multi-seed)', () => {
    // The soak pins ONE seed; these assert the same health invariants hold across
    // several seeds at a MODERATE horizon. Deliberately not a long run: colony
    // survival turns RNG-dominated at high tick counts (some seeds legitimately
    // collapse — see project notes), so a long multi-seed "must survive" test would
    // be brittle by design. At 4000 ticks every seed is robustly healthy (pop ~32-38,
    // queenEnergy ~1764), so these catch balance regressions that bite only some
    // seeds — e.g. a navigation change that quietly starves the queen — with margin.
    const runs = [1, 3, 42].map(seed => ({ seed, m: runHeadless(seed, 4000) }));

    it.each(runs)('seed $seed: queen alive and colony grew beyond its start', ({ m }) => {
        expect(m.queenEnergy).toBeGreaterThan(0);
        expect(m.population).toBeGreaterThan(0);
        expect(m.peakPopulation).toBeGreaterThanOrEqual(20);
    });

    it.each(runs)('seed $seed: stockpiles non-negative and at least one resource flowing', ({ m }) => {
        expect(m.sugar).toBeGreaterThanOrEqual(0);
        expect(m.protein).toBeGreaterThanOrEqual(0);
        expect(m.sugar + m.protein).toBeGreaterThan(0);
    });

    it.each(runs)('seed $seed: brood pipeline alive (queen laying)', ({ m }) => {
        expect(m.brood).toBeGreaterThan(0);
    });

    it.each(runs)('seed $seed: stays within the population cap', ({ m }) => {
        expect(m.population).toBeLessThanOrEqual(PerformanceManager.settings.maxAnts);
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
