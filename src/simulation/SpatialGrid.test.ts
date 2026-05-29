import { describe, it, expect } from 'vitest';
import { SpatialGrid } from './SpatialGrid';
import type { Ant } from './Ant';

// SpatialGrid only reads x/y, so lightweight stand-ins are sufficient.
const at = (x: number, y: number) => ({ x, y } as Ant);

describe('SpatialGrid', () => {
    it('returns entities within the query radius', () => {
        const grid = new SpatialGrid(1000, 600, 50);
        const near = at(100, 100);
        grid.add(near);
        const found = grid.getNearby(100, 100, 30);
        expect(found).toContain(near);
    });

    it('excludes entities outside the query radius', () => {
        const grid = new SpatialGrid(1000, 600, 50);
        const far = at(900, 500);
        grid.add(far);
        const found = grid.getNearby(100, 100, 30);
        expect(found).not.toContain(far);
    });

    it('clear() empties the grid', () => {
        const grid = new SpatialGrid(1000, 600, 50);
        grid.add(at(100, 100));
        grid.clear();
        expect(grid.getNearby(100, 100, 50)).toHaveLength(0);
    });

    it('handles edge cells without crashing', () => {
        const grid = new SpatialGrid(1000, 600, 50);
        const corner = at(0, 0);
        grid.add(corner);
        expect(grid.getNearby(0, 0, 60)).toContain(corner);
    });
});
