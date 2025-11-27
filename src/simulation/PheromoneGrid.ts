

export class PheromoneGrid {
    width: number;
    height: number;
    toHome: Float32Array;
    toSugar: Float32Array;
    toProtein: Float32Array;
    toDanger: Float32Array;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        const size = width * height;
        this.toHome = new Float32Array(size);
        this.toSugar = new Float32Array(size);
        this.toProtein = new Float32Array(size);
        this.toDanger = new Float32Array(size);
    }

    update() {
        // Simple decay for now. Diffusion is expensive in JS without shaders/WASM
        const homeDecay = 0.999; // Extremely stable (permanent trails)
        const foodDecay = 0.99; // Stable while food lasts
        const dangerDecay = 0.95; // Volatile, disappears quickly

        for (let i = 0; i < this.toHome.length; i++) {
            this.toHome[i] *= homeDecay;
            this.toSugar[i] *= foodDecay;
            this.toProtein[i] *= foodDecay;
            this.toDanger[i] *= dangerDecay;

            if (this.toHome[i] < 0.001) this.toHome[i] = 0;
            if (this.toSugar[i] < 0.001) this.toSugar[i] = 0;
            if (this.toProtein[i] < 0.001) this.toProtein[i] = 0;
            if (this.toDanger[i] < 0.001) this.toDanger[i] = 0;
        }
    }

    deposit(x: number, y: number, type: 'HOME' | 'SUGAR' | 'PROTEIN' | 'DANGER', amount: number) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
            const idx = iy * this.width + ix;
            if (type === 'HOME') this.toHome[idx] = Math.min(1.0, this.toHome[idx] + amount);
            else if (type === 'SUGAR') this.toSugar[idx] = Math.min(1.0, this.toSugar[idx] + amount);
            else if (type === 'PROTEIN') this.toProtein[idx] = Math.min(1.0, this.toProtein[idx] + amount);
            else if (type === 'DANGER') this.toDanger[idx] = Math.min(1.0, this.toDanger[idx] + amount);
        }
    }

    depositCircle(x: number, y: number, type: 'HOME' | 'SUGAR' | 'PROTEIN' | 'DANGER', amount: number, radius: number) {
        const startX = Math.floor(x - radius);
        const endX = Math.floor(x + radius);
        const startY = Math.floor(y - radius);
        const endY = Math.floor(y + radius);
        const r2 = radius * radius;

        for (let iy = startY; iy <= endY; iy++) {
            for (let ix = startX; ix <= endX; ix++) {
                if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
                    const dx = ix - x;
                    const dy = iy - y;
                    if (dx * dx + dy * dy <= r2) {
                        const idx = iy * this.width + ix;
                        if (type === 'HOME') this.toHome[idx] = Math.min(1.0, this.toHome[idx] + amount);
                        else if (type === 'SUGAR') this.toSugar[idx] = Math.min(1.0, this.toSugar[idx] + amount);
                        else if (type === 'PROTEIN') this.toProtein[idx] = Math.min(1.0, this.toProtein[idx] + amount);
                        else if (type === 'DANGER') this.toDanger[idx] = Math.min(1.0, this.toDanger[idx] + amount);
                    }
                }
            }
        }
    }

    get(x: number, y: number, type: 'HOME' | 'SUGAR' | 'PROTEIN' | 'DANGER'): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
            const idx = iy * this.width + ix;
            if (type === 'HOME') return this.toHome[idx];
            if (type === 'SUGAR') return this.toSugar[idx];
            if (type === 'PROTEIN') return this.toProtein[idx];
            if (type === 'DANGER') return this.toDanger[idx];
        }
        return 0;
    }
}
