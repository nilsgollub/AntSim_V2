import { describe, it, expect } from 'vitest';
import { Nest } from './Nest';

describe('Nest — founding chamber & role differentiation', () => {
    it('starts as a single founding chamber holding every role', () => {
        const nest = new Nest();
        expect(nest.chambers.length).toBe(1);
        expect(nest.extraChambers).toBe(0);
        const c = nest.chambers[0];
        expect(nest.getChamber('QUEEN')).toBe(c);
        expect(nest.getChamber('BROOD')).toBe(c);
        expect(nest.getChamber('STORAGE')).toBe(c);
    });

    it('first growth splits off a dedicated brood chamber', () => {
        const nest = new Nest();
        const founding = nest.chambers[0];
        expect(nest.growStage()).toBe(true);
        expect(nest.chambers.length).toBe(2);
        expect(nest.getChamber('BROOD')).not.toBe(founding);
        expect(nest.getChamber('QUEEN')).toBe(founding);   // queen stays
        expect(nest.getChamber('STORAGE')).toBe(founding); // storage not yet split
    });

    it('second growth splits off a dedicated storage chamber', () => {
        const nest = new Nest();
        const founding = nest.chambers[0];
        nest.growStage(); // brood
        nest.growStage(); // storage
        expect(nest.getChamber('STORAGE')).not.toBe(founding);
        expect(nest.getChamber('BROOD')).not.toBe(founding);
        expect(nest.getChamber('STORAGE')).not.toBe(nest.getChamber('BROOD'));
    });

    it('keeps every chamber inside the nest bounds', () => {
        const nest = new Nest();
        for (let i = 0; i < 8; i++) nest.growStage();
        for (const c of nest.chambers) {
            expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
            expect(c.x + c.radius).toBeLessThanOrEqual(nest.width);
            expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
            expect(c.y + c.radius).toBeLessThanOrEqual(nest.height);
        }
    });

    it('every excavated chamber centre is reachable (inside the node graph)', () => {
        const nest = new Nest();
        for (let i = 0; i < 6; i++) nest.growStage();
        for (const c of nest.chambers) {
            expect(nest.isInside(c.x, c.y)).toBe(true);
        }
    });
});
