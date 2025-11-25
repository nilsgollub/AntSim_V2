import { CONFIG } from '../config';

export class Terrain {
    obstacles: { x: number, y: number, radius: number }[];

    constructor() {
        this.obstacles = [];
        this.generate();
    }

    generate() {
        // Generate random circular obstacles
        // Avoid the nest area
        const nestSafeRadius = 200;

        for (let i = 0; i < CONFIG.obstacleCount; i++) {
            let x = 0, y = 0, r = 0;
            let valid = false;
            let attempts = 0;

            while (!valid && attempts < 100) {
                x = Math.random() * CONFIG.width;
                y = Math.random() * CONFIG.height;
                r = 30 + Math.random() * 70; // Radius 30-100

                // Check distance to nest
                const dx = x - CONFIG.queenPosition.x;
                const dy = y - CONFIG.queenPosition.y;
                if (dx * dx + dy * dy > nestSafeRadius * nestSafeRadius) {
                    valid = true;
                }
                attempts++;
            }

            if (valid) {
                this.obstacles.push({ x, y, radius: r });
            }
        }
    }

    isBlocked(x: number, y: number): boolean {
        // Check boundaries
        if (x < 0 || x >= CONFIG.width || y < 0 || y >= CONFIG.height) return true;

        // Check obstacles
        for (const obs of this.obstacles) {
            const dx = x - obs.x;
            const dy = y - obs.y;
            if (dx * dx + dy * dy < obs.radius * obs.radius) {
                return true;
            }
        }
        return false;
    }

    // Helper to bounce off obstacles
    getBounceAngle(x: number, y: number, currentAngle: number): number {
        for (const obs of this.obstacles) {
            const dx = x - obs.x;
            const dy = y - obs.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < obs.radius * obs.radius) {
                // Normal vector from obstacle center to point
                const normalAngle = Math.atan2(dy, dx);
                // Simple reflection: just turn away
                return normalAngle;
            }
        }
        return currentAngle + Math.PI; // Default bounce (wall)
    }
}
