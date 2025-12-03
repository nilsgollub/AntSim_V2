export const QualityLevel = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    ULTRA: 'ULTRA'
} as const;

export type QualityLevel = typeof QualityLevel[keyof typeof QualityLevel];

export interface PerformanceProfile {
    maxAnts: number;
    particleLimit: number;
    shadows: boolean;
    gradients: boolean;
    simpleInsects: boolean;
    pheromoneUpdateSkip: number; // Update every N frames
    renderSkip: number; // Render every N frames (not implemented yet, but good to have)
    grassAnimation: boolean;
}

export class PerformanceManager {
    static level: QualityLevel = QualityLevel.ULTRA;
    static settings: PerformanceProfile = PerformanceManager.getProfile(QualityLevel.ULTRA);

    static getProfile(level: QualityLevel): PerformanceProfile {
        switch (level) {
            case QualityLevel.LOW:
                return {
                    maxAnts: 50,
                    particleLimit: 20,
                    shadows: false,
                    gradients: false,
                    simpleInsects: true,
                    pheromoneUpdateSkip: 3,
                    renderSkip: 1,
                    grassAnimation: false
                };
            case QualityLevel.MEDIUM:
                return {
                    maxAnts: 150,
                    particleLimit: 100,
                    shadows: true, // Simple shadows
                    gradients: false, // Flat colors
                    simpleInsects: false,
                    pheromoneUpdateSkip: 2,
                    renderSkip: 1,
                    grassAnimation: false
                };
            case QualityLevel.HIGH:
                return {
                    maxAnts: 500,
                    particleLimit: 500,
                    shadows: true,
                    gradients: true,
                    simpleInsects: false,
                    pheromoneUpdateSkip: 1,
                    renderSkip: 1,
                    grassAnimation: false
                };
            case QualityLevel.ULTRA:
                return {
                    maxAnts: 1000,
                    particleLimit: 2000,
                    shadows: true,
                    gradients: true,
                    simpleInsects: false,
                    pheromoneUpdateSkip: 1,
                    renderSkip: 1,
                    grassAnimation: true
                };
        }
    }

    static setQuality(level: QualityLevel) {
        this.level = level;
        this.settings = this.getProfile(level);
        console.log(`Performance Quality set to ${level}`, this.settings);
    }

    // Auto-Performance Tuning
    static lowFpsFrames: number = 0;
    static lastDowngrade: number = 0;
    static readonly CRITICAL_FPS = 20;
    static readonly FPS_CHECK_FRAMES = 60; // ~1 second of sustained low FPS
    static readonly DOWNGRADE_COOLDOWN = 10000; // 10 seconds cooldown

    static monitorFPS(fps: number) {
        if (fps < this.CRITICAL_FPS) {
            this.lowFpsFrames++;
            if (this.lowFpsFrames > this.FPS_CHECK_FRAMES) {
                const now = Date.now();
                if (now - this.lastDowngrade > this.DOWNGRADE_COOLDOWN) {
                    this.downgrade();
                    this.lastDowngrade = now;
                    this.lowFpsFrames = 0;
                }
            }
        } else {
            this.lowFpsFrames = 0;
        }
    }

    static downgrade() {
        let newLevel: QualityLevel | null = null;
        switch (this.level) {
            case QualityLevel.ULTRA: newLevel = QualityLevel.HIGH; break;
            case QualityLevel.HIGH: newLevel = QualityLevel.MEDIUM; break;
            case QualityLevel.MEDIUM: newLevel = QualityLevel.LOW; break;
            case QualityLevel.LOW: return; // Already lowest
        }

        if (newLevel) {
            console.warn(`FPS Critical! Downgrading quality to ${newLevel}`);
            this.setQuality(newLevel);

            // Notify user via UI if possible (optional, but good for UX)
            // For now, we just log it.
        }
    }
}
