
import { CONFIG } from '../config';

export class PheromoneGrid {
    width: number;
    height: number;
    scale: number;
    toHome: Float32Array;
    toSugar: Float32Array;
    toProtein: Float32Array;
    toDanger: Float32Array;

    constructor(width: number, height: number) {
        this.scale = 0.25; // 1/4 resolution (Optimized for Pi)
        this.width = Math.ceil(width * this.scale);
        this.height = Math.ceil(height * this.scale);
        const size = this.width * this.height;
        this.toHome = new Float32Array(size);
        this.toSugar = new Float32Array(size);
        this.toProtein = new Float32Array(size);
        this.toDanger = new Float32Array(size);
    }

    update() {
        const decay = CONFIG.pheromoneDecay;
        // Simple decay for now. Diffusion is expensive in JS without shaders/WASM
        for (let i = 0; i < this.toHome.length; i++) {
            this.toHome[i] *= decay;
            this.toSugar[i] *= decay;
            this.toProtein[i] *= decay;
            this.toDanger[i] *= 0.95; // Danger decays faster

            if (this.toHome[i] < 0.001) this.toHome[i] = 0;
            if (this.toSugar[i] < 0.001) this.toSugar[i] = 0;
            if (this.toProtein[i] < 0.001) this.toProtein[i] = 0;
            if (this.toDanger[i] < 0.001) this.toDanger[i] = 0;
        }
    }

    deposit(x: number, y: number, type: 'HOME' | 'SUGAR' | 'PROTEIN' | 'DANGER', amount: number) {
        const ix = Math.floor(x * this.scale);
        const iy = Math.floor(y * this.scale);
        if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
            const idx = iy * this.width + ix;
            if (type === 'HOME') this.toHome[idx] = Math.min(1.0, this.toHome[idx] + amount);
            else if (type === 'SUGAR') this.toSugar[idx] = Math.min(1.0, this.toSugar[idx] + amount);
            else if (type === 'PROTEIN') this.toProtein[idx] = Math.min(1.0, this.toProtein[idx] + amount);
            else if (type === 'DANGER') this.toDanger[idx] = Math.min(1.0, this.toDanger[idx] + amount);
        }
    }

    depositCircle(x: number, y: number, type: 'HOME' | 'SUGAR' | 'PROTEIN' | 'DANGER', amount: number, radius: number) {
        const scaledX = x * this.scale;
        const scaledY = y * this.scale;
        const scaledRadius = radius * this.scale;

        const startX = Math.floor(scaledX - scaledRadius);
        const endX = Math.floor(scaledX + scaledRadius);
        const startY = Math.floor(scaledY - scaledRadius);
        const endY = Math.floor(scaledY + scaledRadius);
        const r2 = scaledRadius * scaledRadius;

        for (let iy = startY; iy <= endY; iy++) {
            for (let ix = startX; ix <= endX; ix++) {
                if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
                    const dx = ix - scaledX;
                    const dy = iy - scaledY;
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
        const ix = Math.floor(x * this.scale);
        const iy = Math.floor(y * this.scale);
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
