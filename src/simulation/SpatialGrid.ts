import { Ant } from './Ant';

export class SpatialGrid {
    cellSize: number;
    cols: number;
    rows: number;
    buckets: Map<number, Ant[]>;

    constructor(width: number, height: number, cellSize: number) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.buckets = new Map();
    }

    clear() {
        this.buckets.clear();
    }

    add(ant: Ant) {
        const col = Math.floor(ant.x / this.cellSize);
        const row = Math.floor(ant.y / this.cellSize);
        const index = row * this.cols + col;

        if (!this.buckets.has(index)) {
            this.buckets.set(index, []);
        }
        this.buckets.get(index)!.push(ant);
    }

    getNearby(x: number, y: number, radius: number): Ant[] {
        const nearby: Ant[] = [];
        const cellRadius = Math.ceil(radius / this.cellSize);

        const centerCol = Math.floor(x / this.cellSize);
        const centerRow = Math.floor(y / this.cellSize);

        for (let r = centerRow - cellRadius; r <= centerRow + cellRadius; r++) {
            for (let c = centerCol - cellRadius; c <= centerCol + cellRadius; c++) {
                if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                    const index = r * this.cols + c;
                    const bucket = this.buckets.get(index);
                    if (bucket) {
                        for (const ant of bucket) {
                            nearby.push(ant);
                        }
                    }
                }
            }
        }
        return nearby;
    }
}
