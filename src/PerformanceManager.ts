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
}

export class PerformanceManager {
    static level: QualityLevel = QualityLevel.HIGH;
    static settings: PerformanceProfile = PerformanceManager.getProfile(QualityLevel.HIGH);

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
                    renderSkip: 1
                };
            case QualityLevel.MEDIUM:
                return {
                    maxAnts: 150,
                    particleLimit: 100,
                    shadows: true, // Simple shadows
                    gradients: false, // Flat colors
                    simpleInsects: false,
                    pheromoneUpdateSkip: 2,
                    renderSkip: 1
                };
            case QualityLevel.HIGH:
                return {
                    maxAnts: 500,
                    particleLimit: 500,
                    shadows: true,
                    gradients: true,
                    simpleInsects: false,
                    pheromoneUpdateSkip: 1,
                    renderSkip: 1
                };
            case QualityLevel.ULTRA:
                return {
                    maxAnts: 1000,
                    particleLimit: 2000,
                    shadows: true,
                    gradients: true,
                    simpleInsects: false,
                    pheromoneUpdateSkip: 1,
                    renderSkip: 1
                };
        }
    }

    static setQuality(level: QualityLevel) {
        this.level = level;
        this.settings = this.getProfile(level);
        console.log(`Performance Quality set to ${level}`, this.settings);
    }
}
