import { describe, it, expect } from 'vitest';
import { Brood } from './Brood';
import { CONFIG } from '../config';

describe('Brood lifecycle', () => {
    it('starts as an EGG', () => {
        const b = new Brood(0, 0);
        expect(b.stage).toBe('EGG');
    });

    it('hatches EGG -> LARVA after the egg duration', () => {
        const b = new Brood(0, 0);
        b.age = CONFIG.brood.eggDuration;
        const hatched = b.update();
        expect(hatched).toBe(false);
        expect(b.stage).toBe('LARVA');
        expect(b.age).toBe(0);
    });

    it('LARVA metamorphoses to PUPA when old enough and well fed', () => {
        const b = new Brood(0, 0);
        b.stage = 'LARVA';
        b.age = CONFIG.brood.larvaDuration;
        b.hunger = 0;
        b.update();
        expect(b.stage).toBe('PUPA');
    });

    it('PUPA reports ready to hatch after the pupa duration', () => {
        const b = new Brood(0, 0);
        b.stage = 'PUPA';
        b.age = CONFIG.brood.pupaDuration;
        expect(b.update()).toBe(true);
    });

    it('LARVA dies when hunger exceeds the starve limit', () => {
        const b = new Brood(0, 0);
        b.stage = 'LARVA';
        b.hunger = CONFIG.brood.larvaStarveLimit + 1;
        expect(b.update()).toBe(false);
    });

    it('feeding reduces hunger but never below zero', () => {
        const b = new Brood(0, 0);
        b.stage = 'LARVA';
        b.hunger = 10;
        b.feed(50);
        expect(b.hunger).toBe(0);
    });

    it('only larvae can be fed', () => {
        const b = new Brood(0, 0); // EGG
        b.hunger = 5;
        b.feed(50);
        expect(b.hunger).toBe(5); // unchanged
    });
});
