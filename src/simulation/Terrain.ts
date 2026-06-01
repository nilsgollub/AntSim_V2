import { rand } from '../rng';
import { CONFIG } from '../config';

export class Terrain {
    obstacles: { x: number, y: number, radius: number }[];

    constructor() {
        this.obstacles = [];
        this.generate();
    }

    generate() {
        // Generate random circular obstacles
        // Avoid the nest area (Entrance at 0, 100)

        // Reduced obstacle count and size
        const count = 8; // Reduced from CONFIG.obstacleCount (usually 15)

        for (let i = 0; i < count; i++) {
            let x = 0, y = 0, r = 0;
            let valid = false;
            let attempts = 0;

            while (!valid && attempts < 100) {
                x = rand() * CONFIG.width;
                y = rand() * CONFIG.height;
                r = 20 + rand() * 30; // Reduced Radius: 20-50 (was 30-100)

                // Check distance to Nest Entrance (Right edge, Centered)
                // Entrance at x = CONFIG.width, y = CONFIG.height / 2
                const entranceX = CONFIG.width;
                const entranceY = CONFIG.height / 2;

                const dx = x - entranceX;
                const dy = y - entranceY;

                // Keep large area clear around entrance (200px radius)
                if (dx * dx + dy * dy > 40000) {
                    valid = true;
                }
                attempts++;
            }

            if (valid) {
                this.obstacles.push({ x, y, radius: r });
            }
        }
    }

    isBlocked(x: number, y: number, buffer: number = 0): boolean {
        // Check boundaries
        if (x < buffer || x >= CONFIG.width - buffer || y < buffer || y >= CONFIG.height - buffer) return true;

        // Check obstacles
        for (const obs of this.obstacles) {
            const dx = x - obs.x;
            const dy = y - obs.y;
            if (dx * dx + dy * dy < (obs.radius + buffer) * (obs.radius + buffer)) {
                return true;
            }
        }
        return false;
    }

    // Helper to slide along obstacles
    getCollisionAngle(x: number, y: number, currentAngle: number): number {
        for (const obs of this.obstacles) {
            const dx = x - obs.x;
            const dy = y - obs.y;
            const distSq = dx * dx + dy * dy;
            const checkRad = obs.radius + 2; // Check slightly larger radius

            if (distSq < checkRad * checkRad) {
                // Normal vector from obstacle center to point
                const normalAngle = Math.atan2(dy, dx);

                // Tangents
                const t1 = normalAngle + Math.PI / 2;
                const t2 = normalAngle - Math.PI / 2;

                // Find which tangent is closer to current heading
                const diff1 = Math.abs(this.normalizeAngle(t1 - currentAngle));
                const diff2 = Math.abs(this.normalizeAngle(t2 - currentAngle));

                return diff1 < diff2 ? t1 : t2;
            }
        }

        // Wall collision (if no obstacle matched)
        return currentAngle + Math.PI + (rand() - 0.5) * 1.5;
    }

    normalizeAngle(a: number): number {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }
}
