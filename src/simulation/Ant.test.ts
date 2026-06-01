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
