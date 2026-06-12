// Generic uniform-grid spatial index. World keeps one per entity kind
// (ants / foods / insects) so per-ant perception loops query a small
// neighbourhood instead of scanning whole arrays.
export interface SpatialItem {
    x: number;
    y: number;
}

export class SpatialGrid<T extends SpatialItem> {
    cellSize: number;
    cols: number;
    rows: number;
    buckets: Map<number, T[]>;

    constructor(width: number, height: number, cellSize: number) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.buckets = new Map();
    }

    clear() {
        this.buckets.clear();
    }

    add(item: T) {
        // Clamp to the grid so an item exactly on / past the world edge can't
        // alias into a neighbouring row's bucket (it would become invisible to
        // queries — the old brute-force scans never missed such items).
        const col = Math.max(0, Math.min(this.cols - 1, Math.floor(item.x / this.cellSize)));
        const row = Math.max(0, Math.min(this.rows - 1, Math.floor(item.y / this.cellSize)));
        const index = row * this.cols + col;

        if (!this.buckets.has(index)) {
            this.buckets.set(index, []);
        }
        this.buckets.get(index)!.push(item);
    }

    // Remove an item by its CURRENT position (only valid while the item hasn't
    // moved cells since add — true for static items like food). Used to mirror
    // mid-tick array splices so queries never return already-consumed items.
    remove(item: T) {
        const col = Math.max(0, Math.min(this.cols - 1, Math.floor(item.x / this.cellSize)));
        const row = Math.max(0, Math.min(this.rows - 1, Math.floor(item.y / this.cellSize)));
        const bucket = this.buckets.get(row * this.cols + col);
        if (!bucket) return;
        const i = bucket.indexOf(item);
        if (i >= 0) bucket.splice(i, 1);
    }

    getNearby(x: number, y: number, radius: number): T[] {
        const nearby: T[] = [];
        const cellRadius = Math.ceil(radius / this.cellSize);

        const centerCol = Math.floor(x / this.cellSize);
        const centerRow = Math.floor(y / this.cellSize);

        for (let r = centerRow - cellRadius; r <= centerRow + cellRadius; r++) {
            for (let c = centerCol - cellRadius; c <= centerCol + cellRadius; c++) {
                if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                    const index = r * this.cols + c;
                    const bucket = this.buckets.get(index);
                    if (bucket) {
                        for (const item of bucket) {
                            nearby.push(item);
                        }
                    }
                }
            }
        }
        return nearby;
    }
}
