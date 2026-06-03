
import { CONFIG } from '../config';

export class PheromoneGrid {
    width: number;
    height: number;
    scale: number;
    toHome: Float32Array;
    toSugar: Float32Array;
    toProtein: Float32Array;
    toDanger: Float32Array;
    // Reusable scratch buffer for the separable diffusion blur. Allocated once
    // to avoid per-frame garbage at high ant counts.
    private temp: Float32Array;

    // Allow tests / callers to opt out of the PerformanceManager dependency.
    diffusionEnabled: boolean = true;

    // `scale` defaults to the FIXED sim resolution (`CONFIG.pheromone.resolutionScale`),
    // independent of render quality — the renderer's overlay uses the same value so the
    // two stay sized identically. Pass an explicit value in tests for determinism.
    constructor(width: number, height: number, scale: number = CONFIG.pheromone.resolutionScale) {
        this.scale = scale;
        this.width = Math.ceil(width * this.scale);
        this.height = Math.ceil(height * this.scale);
        const size = this.width * this.height;
        this.toHome = new Float32Array(size);
        this.toSugar = new Float32Array(size);
        this.toProtein = new Float32Array(size);
        this.toDanger = new Float32Array(size);
        this.temp = new Float32Array(size);
    }

    // Uniformly scale every field (e.g. rain washing outdoor trails away).
    scaleAll(factor: number) {
        for (let i = 0; i < this.toHome.length; i++) {
            this.toHome[i] *= factor;
            this.toSugar[i] *= factor;
            this.toProtein[i] *= factor;
            this.toDanger[i] *= factor;
        }
    }

    update() {
        const decay = CONFIG.pheromone.decay;
        const foodDecay = CONFIG.pheromone.foodDecay;
        const dangerDecay = CONFIG.pheromone.dangerDecay;
        const min = CONFIG.pheromone.minThreshold;

        // Exponential evaporation. Food trails fade slower so recruitment "roads"
        // persist long enough to be reinforced by following ants.
        for (let i = 0; i < this.toHome.length; i++) {
            this.toHome[i] *= decay;
            this.toSugar[i] *= foodDecay;
            this.toProtein[i] *= foodDecay;
            this.toDanger[i] *= dangerDecay; // Danger decays faster

            if (this.toHome[i] < min) this.toHome[i] = 0;
            if (this.toSugar[i] < min) this.toSugar[i] = 0;
            if (this.toProtein[i] < min) this.toProtein[i] = 0;
            if (this.toDanger[i] < min) this.toDanger[i] = 0;
        }

        // Spatial diffusion: smooths the HOME homing field. SUGAR/PROTEIN are kept
        // sharp by default (CONFIG.pheromone.diffuseFood = false) so trails read as
        // crisp roads rather than blurry clouds. DANGER never diffuses (local warning).
        if (this.diffusionEnabled && CONFIG.pheromone.diffusionEnabled) {
            const rate = CONFIG.pheromone.diffusionRate;
            this.diffuse(this.toHome, rate);
            if (CONFIG.pheromone.diffuseFood) {
                this.diffuse(this.toSugar, rate);
                this.diffuse(this.toProtein, rate);
            }
        }
    }

    // Separable box blur: a horizontal pass (grid -> temp) followed by a vertical
    // pass (temp -> grid). O(2N) instead of O(9N) for a 3x3 kernel. Out-of-bounds
    // neighbours reuse the centre value so edges don't leak toward zero.
    private diffuse(grid: Float32Array, rate: number) {
        const w = this.width;
        const h = this.height;
        const temp = this.temp;
        const keep = 1 - rate;
        const min = CONFIG.pheromone.minThreshold;

        // Horizontal pass
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const i = row + x;
                const c = grid[i];
                const l = x > 0 ? grid[i - 1] : c;
                const r = x < w - 1 ? grid[i + 1] : c;
                temp[i] = keep * c + rate * (l + r) * 0.5;
            }
        }

        // Vertical pass
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const i = row + x;
                const c = temp[i];
                const u = y > 0 ? temp[i - w] : c;
                const d = y < h - 1 ? temp[i + w] : c;
                let v = keep * c + rate * (u + d) * 0.5;
                if (v < min) v = 0;
                grid[i] = v;
            }
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
