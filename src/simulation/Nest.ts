import { CONFIG } from '../config';

export class Nest {
    width: number;
    height: number;

    // The nest is defined by a collection of overlapping nodes (circles)
    // This allows for organic shapes and easy collision detection
    nodes: { x: number, y: number, radius: number, type: 'TUNNEL' | 'CHAMBER' }[] = [];

    // Specific chamber locations for logic (Queen, Brood, Storage)
    // These point to specific nodes in the list
    chambers: { x: number, y: number, radius: number, type: 'QUEEN' | 'BROOD' | 'STORAGE' }[] = [];

    entrances: { x: number, y: number }[] = [];

    constructor() {
        this.width = CONFIG.nestWidth;
        this.height = CONFIG.nestHeight;
        this.init();
    }

    init() {
        // Scale factor based on smallest dimension to ensure fit
        // Base reference: 800px height/width.
        const minDim = Math.min(this.width, this.height);
        const rScale = minDim / 500;

        if (this.width > this.height) {
            this.initHorizontal(rScale);
        } else {
            this.initVertical(rScale);
        }
    }

    initVertical(rScale: number) {
        const cx = this.width / 2;

        // 1. Define Main Chambers (Massive & Organic)

        // Queen Chamber (Bottom - 85% down)
        const queenY = this.height * 0.85;
        const queenR = 100 * rScale;
        this.addChamber(cx, queenY, queenR, 'QUEEN');

        // Storage Chamber (Middle - 50% down) - Was Brood, now Storage (Closest to Entrance)
        const storageY = this.height * 0.5;
        const storageR = 90 * rScale;
        this.addChamber(cx, storageY, storageR, 'STORAGE');

        // Brood Chamber (Top - 15% down) - Was Storage, now Brood
        const broodY = this.height * 0.15;
        const broodR = 80 * rScale;
        this.addChamber(cx, broodY, broodR, 'BROOD');

        // 2. Connect with Organic Bone-Shape Tunnels
        // Thin tunnels (30 * rScale) with smooth flares at ends

        // Connect Brood (Top) -> Storage (Middle)
        this.createOrganicTunnel(cx, broodY, broodR, cx, storageY, storageR, 30 * rScale);

        // Connect Storage (Middle) -> Queen (Bottom)
        this.createOrganicTunnel(cx, storageY, storageR, cx, queenY, queenR, 30 * rScale);

        // 3. Entrance Tunnel (Horizontal to Left)
        // From Storage Chamber (Middle) to Left Wall
        // Entrance at y = height / 2 (Centered)
        const entranceY = this.height / 2;
        this.entrances = [{ x: 0, y: entranceY }];

        // Connect Storage to Entrance
        this.createOrganicTunnel(cx, storageY, storageR, 0, entranceY, 30 * rScale, 30 * rScale);
    }

    initHorizontal(rScale: number) {
        const cy = this.height / 2;

        // 1. Define Main Chambers (Left to Right)

        // Brood Chamber (Left - 15% across) - Was Storage, now Brood
        const broodX = this.width * 0.15;
        const broodR = 80 * rScale;
        this.addChamber(broodX, cy, broodR, 'BROOD');

        // Storage Chamber (Middle - 50% across) - Was Brood, now Storage (Closest to Entrance)
        const storageX = this.width * 0.5;
        const storageR = 90 * rScale;
        this.addChamber(storageX, cy, storageR, 'STORAGE');

        // Queen Chamber (Right - 85% across)
        const queenX = this.width * 0.85;
        const queenR = 100 * rScale;
        this.addChamber(queenX, cy, queenR, 'QUEEN');

        // 2. Connect with Organic Bone-Shape Tunnels

        // Connect Brood (Left) -> Storage (Middle)
        this.createOrganicTunnel(broodX, cy, broodR, storageX, cy, storageR, 30 * rScale);

        // Connect Storage (Middle) -> Queen (Right)
        this.createOrganicTunnel(storageX, cy, storageR, queenX, cy, queenR, 30 * rScale);

        // 3. Entrance Tunnel (Vertical to Top)
        // From Storage Chamber (Middle) to Top Wall (y=0)
        // Entrance at x = width / 2 (Centered)
        const entranceX = this.width / 2;
        this.entrances = [{ x: entranceX, y: 0 }]; // y=0 is top

        // Connect Storage to Entrance
        this.createOrganicTunnel(storageX, cy, storageR, entranceX, 0, 30 * rScale, 30 * rScale);
    }

    addChamber(x: number, y: number, radius: number, type: 'QUEEN' | 'BROOD' | 'STORAGE') {
        this.nodes.push({ x, y, radius, type: 'CHAMBER' });
        this.chambers.push({ x, y, radius, type });
    }

    addNode(x: number, y: number, radius: number, type: 'TUNNEL' | 'CHAMBER') {
        this.nodes.push({ x, y, radius, type });
    }

    // Creates a tunnel that smoothly transitions from chamber radii to a thin tunnel radius
    // Uses exponential decay to create a "trumpet" or "bone" shape
    createOrganicTunnel(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, tunnelRadius: number) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Step size
        const stepSize = tunnelRadius * 0.05; // Ultra high density for smoothness
        const steps = Math.ceil(dist / stepSize);

        // Decay factor - controls how fast the flare tapers
        // We want it to drop from R to tunnelRadius over a distance of roughly R
        // Gaussian decay: exp(-k * d^2)
        // We want exp(-k * R^2) approx 0.05 (5%)
        // -k * R^2 = ln(0.05) approx -3.0
        // k = 3.0 / (avgR * avgR)
        const avgR = (r1 + r2) / 2;
        const k = 3.0 / (avgR * avgR);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const d = t * dist; // Distance from start
            const dFromEnd = dist - d; // Distance from end

            // Calculate radius contribution from Start Flare (Gaussian)
            // R_start(d) = (r1 - tunnelRadius) * exp(-k * d^2)
            // Derivative at d=0 is 0, ensuring smooth tangent with chamber
            const excessStart = (r1 - tunnelRadius) * Math.exp(-k * d * d);

            // Calculate radius contribution from End Flare (Gaussian)
            const excessEnd = (r2 - tunnelRadius) * Math.exp(-k * dFromEnd * dFromEnd);

            // Combine them by SUMMING the excess radius.
            const currentRadius = tunnelRadius + excessStart + excessEnd;

            this.nodes.push({
                x: x1 + dx * t,
                y: y1 + dy * t,
                radius: currentRadius,
                type: 'TUNNEL'
            });
        }
    }

    // Check if a point is inside any node
    isInside(x: number, y: number, buffer: number = 0): boolean {
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            // Check against radius minus buffer
            // If buffer is 5, we check if we are within (radius - 5)
            if (dx * dx + dy * dy < (node.radius - buffer) * (node.radius - buffer)) {
                return true;
            }
        }
        return false;
    }

    getEntrance() {
        return this.entrances[0];
    }

    // Pathfinding Helpers
    getNearestNode(x: number, y: number) {
        let nearest = null;
        let minDist = Infinity;
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minDist) {
                minDist = d2;
                nearest = node;
            }
        }
        return nearest;
    }

    // Simple greedy pathfinding: Find a node that is closer to target than current position
    // but is also connected (overlapping) with current node area
    getNextNodeTowards(x: number, y: number, targetX: number, targetY: number) {
        // Find nodes that overlap with current position
        const currentNodes = this.nodes.filter(n => {
            const dx = x - n.x;
            const dy = y - n.y;
            return dx * dx + dy * dy < (n.radius + 10) * (n.radius + 10);
        });

        if (currentNodes.length === 0) return this.getNearestNode(x, y); // Fallback

        // Find a neighbor node that is closer to target
        let bestNode = null;
        let bestScore = Infinity;

        // Consider all nodes as potential next steps
        for (const node of this.nodes) {
            // Check if this node overlaps with any current node (is reachable)
            let reachable = false;
            for (const curr of currentNodes) {
                const dx = node.x - curr.x;
                const dy = node.y - curr.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < node.radius + curr.radius) {
                    reachable = true;
                    break;
                }
            }

            if (reachable) {
                const dx = targetX - node.x;
                const dy = targetY - node.y;
                const distToTarget = dx * dx + dy * dy;

                // Add a penalty for distance from current position to avoid huge jumps
                const dx2 = x - node.x;
                const dy2 = y - node.y;
                const distFromCurr = dx2 * dx2 + dy2 * dy2;

                const score = distToTarget + distFromCurr * 0.5;

                if (score < bestScore) {
                    bestScore = score;
                    bestNode = node;
                }
            }
        }

        return bestNode;
    }
}
