import { describe, it, expect } from 'vitest';
import { PheromoneGrid } from './PheromoneGrid';
import { CONFIG } from '../config';

describe('PheromoneGrid', () => {
    it('scales the grid down by the resolution factor', () => {
        const g = new PheromoneGrid(100, 100);
        expect(g.scale).toBe(0.25);
        expect(g.width).toBe(25);
        expect(g.height).toBe(25);
    });

    it('round-trips deposit -> get at the same location', () => {
        const g = new PheromoneGrid(100, 100);
        g.deposit(40, 40, 'HOME', 0.5);
        expect(g.get(40, 40, 'HOME')).toBeCloseTo(0.5, 5);
        // Other channels untouched
        expect(g.get(40, 40, 'SUGAR')).toBe(0);
    });

    it('ignores out-of-bounds deposits and reads', () => {
        const g = new PheromoneGrid(100, 100);
        expect(() => g.deposit(-10, -10, 'HOME', 1)).not.toThrow();
        expect(g.get(-10, -10, 'HOME')).toBe(0);
        expect(g.get(99999, 99999, 'HOME')).toBe(0);
    });

    it('decays values by the configured factor', () => {
        const g = new PheromoneGrid(100, 100);
        g.diffusionEnabled = false; // isolate decay from diffusion
        g.deposit(40, 40, 'HOME', 0.5);
        g.update();
        expect(g.get(40, 40, 'HOME')).toBeCloseTo(0.5 * CONFIG.pheromone.decay, 5);
    });

    it('clamps tiny values to zero', () => {
        const g = new PheromoneGrid(100, 100);
        g.diffusionEnabled = false;
        g.deposit(40, 40, 'HOME', CONFIG.pheromone.minThreshold * 0.5);
        g.update();
        expect(g.get(40, 40, 'HOME')).toBe(0);
    });

    it('diffuses a spike into neighbouring cells', () => {
        const g = new PheromoneGrid(100, 100);
        g.diffusionEnabled = true;
        // Deposit into a single interior cell (cell coords 10,10 -> world ~40,40)
        g.deposit(40, 40, 'HOME', 1.0);
        const centerBefore = g.get(40, 40, 'HOME');
        const neighborBefore = g.get(44, 40, 'HOME'); // adjacent cell (4px = 1 cell at 0.25 scale)
        expect(neighborBefore).toBe(0);
        g.update();
        const centerAfter = g.get(40, 40, 'HOME');
        const neighborAfter = g.get(44, 40, 'HOME');
        // Spike has spread: neighbour gained, centre dropped below its post-decay value
        expect(neighborAfter).toBeGreaterThan(0);
        expect(centerAfter).toBeLessThan(centerBefore);
    });

    it('does not diffuse the DANGER channel (stays local)', () => {
        const g = new PheromoneGrid(100, 100);
        g.diffusionEnabled = true;
        g.deposit(40, 40, 'DANGER', 1.0);
        g.update();
        // Immediate neighbour should remain empty (danger only decays, never blurs)
        expect(g.get(44, 40, 'DANGER')).toBe(0);
    });
});
