import { rand } from '../rng';
import { CONFIG } from '../config';

export type ChamberRole = 'QUEEN' | 'BROOD' | 'STORAGE';
export interface Chamber { x: number; y: number; radius: number; type: ChamberRole; }

export class Nest {
    width: number;
    height: number;

    // The nest is defined by a collection of overlapping nodes (circles).
    nodes: { x: number, y: number, radius: number, type: 'TUNNEL' | 'CHAMBER' }[] = [];

    // All chamber rooms (the founding chamber plus any excavated ones).
    chambers: Chamber[] = [];

    // Which chamber currently fulfils each functional role. Early on a single
    // founding chamber holds all three; excavation differentiates them.
    roles!: Record<ChamberRole, Chamber>;

    entrances: { x: number, y: number }[] = [];

    // Count of dynamically excavated chambers (beyond the founding one).
    extraChambers: number = 0;

    constructor() {
        this.width = CONFIG.nestWidth;
        this.height = CONFIG.nestHeight;
        this.init();
    }

    init() {
        const minDim = Math.min(this.width, this.height);
        const rScale = minDim / CONFIG.nestScaleRef;
        const cx = this.width / 2;
        const cy = this.height / 2;

        // A single, modest founding chamber that does everything at first.
        const startR = 70 * rScale;
        const founding = this.addChamber(cx, cy, startR, 'QUEEN');
        this.roles = { QUEEN: founding, BROOD: founding, STORAGE: founding };

        // Entrance + connecting tunnel, oriented like the original layout.
        if (this.width > this.height) {
            // Wide nest (portrait world): entrance at the top.
            this.entrances = [{ x: cx, y: 0 }];
            this.createOrganicTunnel(cx, cy, startR, cx, 0, 30 * rScale, 30 * rScale);
        } else {
            // Tall nest (landscape world): entrance at the left.
            this.entrances = [{ x: 0, y: cy }];
            this.createOrganicTunnel(cx, cy, startR, 0, cy, 30 * rScale, 30 * rScale);
        }
    }

    addChamber(x: number, y: number, radius: number, type: ChamberRole): Chamber {
        this.nodes.push({ x, y, radius, type: 'CHAMBER' });
        const chamber: Chamber = { x, y, radius, type };
        this.chambers.push(chamber);
        return chamber;
    }

    addNode(x: number, y: number, radius: number, type: 'TUNNEL' | 'CHAMBER') {
        this.nodes.push({ x, y, radius, type });
    }

    /** The chamber currently assigned a given functional role (always defined). */
    getChamber(role: ChamberRole): Chamber {
        return this.roles[role];
    }

    // Dig one new chamber branching off an existing one, connected by an organic
    // tunnel, kept inside bounds and from burying an existing chamber. Returns the
    // new chamber, or null if no valid spot was found.
    private digChamber(): Chamber | null {
        const minDim = Math.min(this.width, this.height);
        const rScale = minDim / CONFIG.nestScaleRef;
        const newR = (45 + rand() * 25) * rScale;
        const gap = 15 * rScale;

        // Always branch off the founding hub (chambers[0]) so the nest stays a
        // simple star: every chamber reaches the entrance through the centre.
        // This keeps the greedy nest pathfinding robust.
        const parent = this.chambers[0];
        for (let attempt = 0; attempt < 24; attempt++) {
            const angle = rand() * Math.PI * 2;
            const d = parent.radius + newR + gap;
            const nx = parent.x + Math.cos(angle) * d;
            const ny = parent.y + Math.sin(angle) * d;

            if (nx < newR + 4 || nx > this.width - newR - 4) continue;
            if (ny < newR + 4 || ny > this.height - newR - 4) continue;

            let tooClose = false;
            for (const c of this.chambers) {
                const ddx = nx - c.x;
                const ddy = ny - c.y;
                const minSep = c.radius + newR * 0.4;
                if (ddx * ddx + ddy * ddy < minSep * minSep) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const chamber = this.addChamber(nx, ny, newR, 'STORAGE');
            this.createOrganicTunnel(parent.x, parent.y, parent.radius, nx, ny, newR, 22 * rScale);
            return chamber;
        }
        return null;
    }

    // Grow the nest by one stage. The first dig becomes a dedicated brood
    // chamber, the second a dedicated storage chamber (differentiating the
    // founding chamber, which keeps the queen); further digs add generic space.
    // Existing navigation and the renderer's node-count cache pick up new nodes.
    growStage(): boolean {
        const chamber = this.digChamber();
        if (!chamber) return false;

        if (this.extraChambers === 0) {
            chamber.type = 'BROOD';
            this.roles.BROOD = chamber; // nursery splits off
        } else if (this.extraChambers === 1) {
            chamber.type = 'STORAGE';
            this.roles.STORAGE = chamber; // granary splits off
        } else {
            chamber.type = 'STORAGE'; // generic extra space / capacity
        }

        this.extraChambers++;
        return true;
    }

    // Creates a tunnel that smoothly transitions from chamber radii to a thin tunnel radius
    createOrganicTunnel(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, tunnelRadius: number) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const stepSize = tunnelRadius * 0.05;
        const steps = Math.ceil(dist / stepSize);

        const avgR = (r1 + r2) / 2;
        const k = 3.0 / (avgR * avgR);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const d = t * dist;
            const dFromEnd = dist - d;

            const excessStart = (r1 - tunnelRadius) * Math.exp(-k * d * d);
            const excessEnd = (r2 - tunnelRadius) * Math.exp(-k * dFromEnd * dFromEnd);
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

    // Simple greedy pathfinding over overlapping nodes.
    getNextNodeTowards(x: number, y: number, targetX: number, targetY: number) {
        const currentNodes = this.nodes.filter(n => {
            const dx = x - n.x;
            const dy = y - n.y;
            return dx * dx + dy * dy < (n.radius + 10) * (n.radius + 10);
        });

        if (currentNodes.length === 0) return this.getNearestNode(x, y);

        let bestNode = null;
        let bestScore = Infinity;

        for (const node of this.nodes) {
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
