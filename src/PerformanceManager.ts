export const QualityLevel = {
    ULTRA_LOW: 'ULTRA_LOW',
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
    simpleAnts: boolean;
    pheromoneUpdateSkip: number;
    renderSkip: number;
    grassAnimation: boolean;
    resolutionScale: number;
    pheromoneResolutionScale: number;
    legAnimation: boolean;
}

export class PerformanceManager {
    static level: QualityLevel = QualityLevel.HIGH;
    static settings: PerformanceProfile = PerformanceManager.getProfile(QualityLevel.HIGH);

    static getProfile(level: QualityLevel): PerformanceProfile {
        switch (level) {
            case QualityLevel.ULTRA_LOW:
                return {
                    maxAnts: 80,
                    particleLimit: 20,
                    shadows: false,
                    gradients: false,
                    simpleInsects: true,
                    simpleAnts: true,
                    pheromoneUpdateSkip: 6,
                    renderSkip: 1,
                    grassAnimation: false,
                    resolutionScale: 0.4,
                    pheromoneResolutionScale: 0.2, // Very low res pheromones
                    legAnimation: false
                };
            case QualityLevel.LOW:
                return {
                    maxAnts: 120,
                    particleLimit: 40,
                    shadows: false,
                    gradients: false,
                    simpleInsects: true,
                    simpleAnts: true,
                    pheromoneUpdateSkip: 6,
                    renderSkip: 1,
                    grassAnimation: false,
                    resolutionScale: 0.4,
                    pheromoneResolutionScale: 0.25, // Optimized
                    legAnimation: false
                };
            case QualityLevel.MEDIUM:
                return {
                    maxAnts: 300, // Increased from 200 -> 300
                    particleLimit: 100,
                    shadows: false,
                    gradients: false,
                    simpleInsects: false, // Detailed insects
                    simpleAnts: false, // Detailed ants (Sprites)
                    pheromoneUpdateSkip: 4,
                    renderSkip: 1,
                    grassAnimation: false,
                    resolutionScale: 0.6, // Sharper (0.5 -> 0.6)
                    pheromoneResolutionScale: 0.3,
                    legAnimation: false // Static legs (Cached Sprites)
                };
            case QualityLevel.HIGH:
                return {
                    maxAnts: 600,
                    particleLimit: 200,
                    shadows: false,
                    gradients: true,
                    simpleInsects: false,
                    simpleAnts: false,
                    pheromoneUpdateSkip: 2,
                    renderSkip: 1,
                    grassAnimation: false,
                    resolutionScale: 0.85,
                    pheromoneResolutionScale: 0.5,
                    legAnimation: true
                };
            case QualityLevel.ULTRA:
                return {
                    maxAnts: 1200,
                    particleLimit: 2000,
                    shadows: true,
                    gradients: true,
                    simpleInsects: false,
                    simpleAnts: false,
                    pheromoneUpdateSkip: 1,
                    renderSkip: 1,
                    grassAnimation: true,
                    resolutionScale: 1.0,
                    pheromoneResolutionScale: 0.5,
                    legAnimation: true
                };
        }
    }

    static setQuality(level: QualityLevel) {
        this.level = level;
        this.settings = this.getProfile(level);
        console.log(`Performance Quality set to ${level}`, this.settings);
    }

    static lowFpsFrames: number = 0;
    static lastDowngrade: number = 0;
    static readonly CRITICAL_FPS = 20;
    static readonly FPS_CHECK_FRAMES = 60;
    static readonly DOWNGRADE_COOLDOWN = 10000;

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
            case QualityLevel.LOW: newLevel = QualityLevel.ULTRA_LOW; break;
            case QualityLevel.ULTRA_LOW: return;
        }

        if (newLevel) {
            console.warn(`FPS Critical! Downgrading quality to ${newLevel}`);
            this.setQuality(newLevel);
        }
    }
}
