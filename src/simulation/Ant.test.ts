import { describe, it, expect } from 'vitest';
import { Ant } from './Ant';
import { handleHarvesting } from './antStates';
import { CONFIG } from '../config';
import { seedRng } from '../rng';

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
        // SUGAR harvest doesn't touch the world; a minimal stub satisfies the signature.
        const worldStub = { nest: { getChambers: () => [] }, foods: [] } as any;
        handleHarvesting(a, worldStub);
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

describe('functional polymorphism (size → stats)', () => {
    function sample(type: 'WORKER' | 'SOLDIER', n: number): Ant[] {
        seedRng(99);
        return Array.from({ length: n }, () => new Ant(0, 0, type));
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

    it('soldiers are bigger, tougher and harder-hitting than workers', () => {
        const w = sample('WORKER', 200);
        const s = sample('SOLDIER', 200);
        // Size ranges don't overlap → every soldier outsizes every worker.
        expect(Math.max(...w.map(a => a.sizeVar))).toBeLessThan(Math.min(...s.map(a => a.sizeVar)));
        expect(avg(s.map(a => a.health))).toBeGreaterThan(avg(w.map(a => a.health)));
        expect(avg(s.map(a => a.attackDamage))).toBeGreaterThan(avg(w.map(a => a.attackDamage)));
    });

    it('soldiers are slower and costlier; workers faster and cheaper', () => {
        const w = sample('WORKER', 200);
        const s = sample('SOLDIER', 200);
        expect(avg(s.map(a => a.sizeSpeed))).toBeLessThan(avg(w.map(a => a.sizeSpeed)));
        expect(avg(s.map(a => a.sizeUpkeep))).toBeGreaterThan(avg(w.map(a => a.sizeUpkeep)));
        expect(avg(w.map(a => a.sizeSpeed))).toBeGreaterThan(1); // small ants faster than baseline
    });

    it('caste HP/damage averages stay centred on the tuned base values', () => {
        const w = sample('WORKER', 400);
        const s = sample('SOLDIER', 400);
        // Size scaling is centred on each caste mean → averages match CONFIG (±rounding).
        expect(avg(w.map(a => a.health))).toBeCloseTo(CONFIG.workerHealth, 0);
        expect(avg(s.map(a => a.health))).toBeCloseTo(CONFIG.soldierHealth, 0);
        expect(avg(w.map(a => a.attackDamage))).toBeCloseTo(CONFIG.workerDamage, 1);
        expect(avg(s.map(a => a.attackDamage))).toBeCloseTo(CONFIG.soldierDamage, 1);
    });
});
