import { describe, it, expect } from 'vitest';
import { seedRng } from '../rng';
import { World } from './World';

describe('trophallaxis (social stomach)', () => {
    // Run the sim in the describe body (collection phase), like the soak test, so the
    // long run isn't subject to the per-test timeout.
    seedRng(7);
    const w = new World();
    for (let i = 0; i < 8000; i++) w.update();

    it('foragers actually feed nestmates mouth-to-mouth', () => {
        // The mechanic is live (not dead code): many crop hand-offs happened…
        expect(w.trophallaxisCount).toBeGreaterThan(40);
    });

    it('and it does not wreck the colony', () => {
        expect(w.ants.length).toBeGreaterThan(0);
    });
});
