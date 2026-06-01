import { describe, it, expect } from 'vitest';
import { Nest } from './Nest';

describe('Nest excavation', () => {
    it('starts with the three core chambers and no extras', () => {
        const nest = new Nest();
        expect(nest.chambers.length).toBe(3);
        expect(nest.extraChambers).toBe(0);
        const types = nest.chambers.map(c => c.type).sort();
        expect(types).toEqual(['BROOD', 'QUEEN', 'STORAGE']);
    });

    it('excavate() adds a chamber, tunnel nodes, and bumps the counter', () => {
        const nest = new Nest();
        const chambersBefore = nest.chambers.length;
        const nodesBefore = nest.nodes.length;

        const ok = nest.excavate();
        expect(ok).toBe(true);
        expect(nest.chambers.length).toBe(chambersBefore + 1);
        expect(nest.nodes.length).toBeGreaterThan(nodesBefore + 1); // chamber + tunnel nodes
        expect(nest.extraChambers).toBe(1);
    });

    it('keeps every excavated chamber inside the nest bounds', () => {
        const nest = new Nest();
        for (let i = 0; i < 8; i++) nest.excavate();
        for (const c of nest.chambers) {
            expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
            expect(c.x + c.radius).toBeLessThanOrEqual(nest.width);
            expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
            expect(c.y + c.radius).toBeLessThanOrEqual(nest.height);
        }
    });

    it('excavated chambers remain reachable by navigation', () => {
        const nest = new Nest();
        nest.excavate();
        const dug = nest.chambers[nest.chambers.length - 1];
        // A point at the new chamber centre must register as inside the nest.
        expect(nest.isInside(dug.x, dug.y)).toBe(true);
    });
});
