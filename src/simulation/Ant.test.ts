import { describe, it, expect } from 'vitest';
import { Ant } from './Ant';
import { CONFIG } from '../config';

function workerAged(fraction: number): Ant {
    const a = new Ant(0, 0, 'WORKER');
    a.maxAge = 1000;
    a.age = fraction * a.maxAge;
    return a;
}

describe('temporal polyethism (forageUrge)', () => {
    it('young workers have the minimum forage urge', () => {
        expect(workerAged(0).forageUrge()).toBeCloseTo(CONFIG.ant.forageUrgeYoung, 6);
        expect(workerAged(CONFIG.ant.nurseAgeFraction).forageUrge()).toBeCloseTo(CONFIG.ant.forageUrgeYoung, 6);
    });

    it('old workers have the maximum forage urge', () => {
        expect(workerAged(1).forageUrge()).toBeCloseTo(CONFIG.ant.forageUrgeOld, 6);
        expect(workerAged(CONFIG.ant.forageAgeFraction).forageUrge()).toBeCloseTo(CONFIG.ant.forageUrgeOld, 6);
    });

    it('urge increases monotonically with age', () => {
        const young = workerAged(0.1).forageUrge();
        const mid   = workerAged(0.4).forageUrge();
        const old   = workerAged(0.9).forageUrge();
        expect(young).toBeLessThan(mid);
        expect(mid).toBeLessThan(old);
    });
});

describe('site fidelity (steerToMemory)', () => {
    it('does nothing without a remembered source', () => {
        const a = new Ant(0, 0, 'WORKER');
        expect(a.steerToMemory()).toBe(false);
    });

    it('steers toward a distant remembered source', () => {
        const a = new Ant(0, 0, 'WORKER');
        a.foodMemoryX = 500;
        a.foodMemoryY = 0;
        expect(a.steerToMemory()).toBe(true);
        // still remembers it (not yet arrived)
        expect(a.foodMemoryX).toBe(500);
    });

    it('forgets the source once arrived (depleted)', () => {
        const a = new Ant(100, 100, 'WORKER');
        a.foodMemoryX = 100; // same spot → "arrived"
        a.foodMemoryY = 100;
        expect(a.steerToMemory()).toBe(false);
        expect(a.foodMemoryX).toBe(-1);
    });
});

describe('trail strength ∝ food quality', () => {
    function harvestFrom(amount: number): Ant {
        const a = new Ant(0, 0, 'WORKER');
        a.harvestTimer = 0;
        a.carryingInstance = {
            amount, maxAmount: amount, type: 'SUGAR', x: 50, y: 50,
            harvest() { this.amount -= 1; },
        };
        a.handleHarvesting();
        return a;
    }

    it('a rich source yields a full-strength trail', () => {
        const a = harvestFrom(CONFIG.pheromone.qualityRef + 50);
        expect(a.carryingQuality).toBeCloseTo(1, 5);
    });

    it('a nearly-empty source yields the minimum trail', () => {
        const a = harvestFrom(5);
        expect(a.carryingQuality).toBeCloseTo(CONFIG.pheromone.minQuality, 5);
    });
});
