import { rand } from '../rng';
import { CONFIG } from '../config';

export type ChamberRole = 'QUEEN' | 'BROOD' | 'STORAGE' | 'CEMETERY';
export interface Chamber {
    x: number; y: number; radius: number; type: ChamberRole;
    // The chamber this one was excavated from (its tunnel connects parent→this as a
    // STRAIGHT corridor). The founding chamber (hub) has no parent. These parent links
    // make the chambers a tree, which is what the robust router walks.
    parent?: Chamber;
}

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
        // The founding chamber fulfils every role at first; CEMETERY defaults to it
        // too but stays unused until a real graveyard is dug (callers key off
        // `getChambers('CEMETERY')`/`nearestChamber`, which only see CEMETERY-typed rooms).
        this.roles = { QUEEN: founding, BROOD: founding, STORAGE: founding, CEMETERY: founding };

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

    /** The primary chamber for a role (the representative, always defined). */
    getChamber(role: ChamberRole): Chamber {
        return this.roles[role];
    }

    /** Every chamber of a given role (a colony can have several granaries/nurseries). */
    getChambers(role: ChamberRole): Chamber[] {
        return this.chambers.filter(c => c.type === role);
    }

    /**
     * The chamber of `role` nearest to (x, y), or null if none of that kind exists
     * yet. Lets ants deliver to / eat from / drop brood at the closest room of a
     * kind, so a multi-chamber nest spreads traffic instead of funnelling everyone
     * to one room.
     */
    nearestChamber(role: ChamberRole, x: number, y: number): Chamber | null {
        let best: Chamber | null = null;
        let bestD = Infinity;
        for (const c of this.chambers) {
            if (c.type !== role) continue;
            const dx = x - c.x;
            const dy = y - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD) { bestD = d2; best = c; }
        }
        return best;
    }

    // Dig one new chamber branching off an existing one, connected by an organic
    // tunnel, kept inside bounds and from burying an existing chamber. Returns the
    // new chamber, or null if no valid spot was found.
    private digChamber(): Chamber | null {
        const minDim = Math.min(this.width, this.height);
        const rScale = minDim / CONFIG.nestScaleRef;
        const newR = (45 + rand() * 25) * rScale;
        const gap = 15 * rScale;
        const hub = this.chambers[0];

        // Grow as a branching *tree*, not a single star ring: a new chamber may
        // branch off ANY existing chamber, but is always placed radially outward
        // from the hub (further from the centre than its parent). The old star —
        // every chamber hung directly off the hub — physically capped the nest at
        // ~8 chambers (the ring filled up). A tree fits many more, while the
        // outward-only rule keeps greedy nest pathfinding robust: heading toward
        // the central entrance hub is always "inward", monotone, with no detours.
        for (let attempt = 0; attempt < 40; attempt++) {
            const parent = this.chambers[Math.floor(rand() * this.chambers.length)];

            // Outward direction = hub → parent (random when the parent IS the hub).
            const ox = parent.x - hub.x;
            const oy = parent.y - hub.y;
            const parentDist = Math.hypot(ox, oy);
            const baseAngle = parentDist < 1 ? rand() * Math.PI * 2 : Math.atan2(oy, ox);
            // Spread within a cone around the outward direction (full circle at the hub).
            const spread = parentDist < 1 ? Math.PI * 2 : Math.PI * 0.9;
            const angle = baseAngle + (rand() - 0.5) * spread;

            const d = parent.radius + newR + gap;
            const nx = parent.x + Math.cos(angle) * d;
            const ny = parent.y + Math.sin(angle) * d;

            if (nx < newR + 4 || nx > this.width - newR - 4) continue;
            if (ny < newR + 4 || ny > this.height - newR - 4) continue;

            // Must sit further from the hub than its parent → keeps the tree
            // strictly outward so the inward path home never has to backtrack.
            const childDist2 = (nx - hub.x) ** 2 + (ny - hub.y) ** 2;
            if (parentDist >= 1 && childDist2 <= parentDist * parentDist) continue;

            let tooClose = false;
            for (const c of this.chambers) {
                const ddx = nx - c.x;
                const ddy = ny - c.y;
                const minSep = c.radius + newR * 0.4;
                if (ddx * ddx + ddy * ddy < minSep * minSep) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const chamber = this.addChamber(nx, ny, newR, 'STORAGE');
            chamber.parent = parent; // tree edge: tunnel below connects parent→chamber straight
            this.createOrganicTunnel(parent.x, parent.y, parent.radius, nx, ny, newR, 22 * rScale);
            return chamber;
        }
        return null;
    }

    // Grow the nest by one stage, differentiating the colony's rooms as it grows:
    //   dig 0 → first nursery (BROOD)      dig 1 → first granary (STORAGE)
    //   dig 2 → the midden / graveyard (CEMETERY, exactly one)
    //   dig 3+ → mostly more granaries, every 3rd another nursery
    // so a mature nest has several granaries + nurseries and one cemetery. The
    // `roles` map keeps the first chamber of each kind as the primary; the plural
    // accessors (`getChambers`/`nearestChamber`) see them all. Navigation and the
    // renderer's node-count cache pick up the new nodes automatically.
    growStage(): boolean {
        const chamber = this.digChamber();
        if (!chamber) return false;

        let role: ChamberRole;
        if (this.extraChambers === 0) role = 'BROOD';
        else if (this.extraChambers === 1) role = 'STORAGE';
        else if (this.extraChambers === 2) role = 'CEMETERY';
        else role = (this.extraChambers % 3 === 0) ? 'BROOD' : 'STORAGE';

        chamber.type = role;
        // The first chamber of each kind becomes that role's primary representative.
        if (!this.chambers.some(c => c !== chamber && c.type === role)) {
            this.roles[role] = chamber;
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

    // True if every sampled point on the segment (x1,y1)→(x2,y2) lies inside the nest
    // union — i.e. no wall blocks the straight line. Coarse ~10px sampling, early-out.
    lineClear(x1: number, y1: number, x2: number, y2: number, buffer: number = 3): boolean {
        const dx = x2 - x1, dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        const n = Math.min(16, Math.max(1, Math.ceil(dist / 10)));
        for (let i = 1; i < n; i++) {
            const t = i / n;
            if (!this.isInside(x1 + dx * t, y1 + dy * t, buffer)) return false;
        }
        return true;
    }

    // The chamber containing (x,y), or null if the point sits in a tunnel / outside
    // every chamber. When several overlap, the one whose centre is nearest wins.
    chamberAt(x: number, y: number): Chamber | null {
        let best: Chamber | null = null, bestD = Infinity;
        for (const c of this.chambers) {
            const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
            if (d2 < c.radius * c.radius && d2 < bestD) { bestD = d2; best = c; }
        }
        return best;
    }

    nearestChamberAny(x: number, y: number): Chamber | null {
        let best: Chamber | null = null, bestD = Infinity;
        for (const c of this.chambers) {
            const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
            if (d2 < bestD) { bestD = d2; best = c; }
        }
        return best;
    }

    // Number of tree hops between two chambers (walk both up to their LCA).
    private chamberHops(a: Chamber, b: Chamber): number {
        if (a === b) return 0;
        const anc = new Map<Chamber, number>();
        let n: Chamber | undefined = a, d = 0;
        for (; n; n = n.parent, d++) anc.set(n, d);
        let m: Chamber | undefined = b, e = 0;
        for (; m; m = m.parent, e++) {
            const da = anc.get(m);
            if (da !== undefined) return da + e; // m is the LCA
        }
        return d + e; // disconnected (shouldn't happen in a tree) → upper bound
    }

    // The next chamber to step into when walking the tree from `from` toward `to`.
    // Either `from`'s parent (ascend) or the child of `from` on the path down to `to`.
    private nextChamberToward(from: Chamber, to: Chamber): Chamber | null {
        if (from === to) return null;
        // `to`'s ancestor chain (itself → … → hub).
        const toChain = new Set<Chamber>();
        for (let c: Chamber | undefined = to; c; c = c.parent) toChain.add(c);
        if (toChain.has(from)) {
            // `from` is an ancestor of `to` → DESCEND: step into the child of `from`
            // that lies on `to`'s chain.
            let c = to;
            while (c.parent && c.parent !== from) c = c.parent;
            return c;
        }
        return from.parent ?? null; // ASCEND toward the LCA / hub
    }

    /**
     * Robust nest waypoint: a point to steer toward that is guaranteed reachable in a
     * straight line (no wall between), making monotone progress toward (targetX,targetY).
     *
     * The chambers form a TREE and every tunnel is a STRAIGHT corridor between two
     * chamber centres, so the segment between tree-adjacent chamber centres is always
     * inside the union. Routing therefore reduces to a tiny tree walk over ≤ a handful of
     * chambers (not the ~800 dense tunnel nodes): pick the chamber the ant can see that is
     * closest (in tree hops) to the target's chamber, then return the next chamber centre
     * along the tree path. No oscillation (hop-distance is a true metric), no rand().
     */
    nestWaypoint(x: number, y: number, targetX: number, targetY: number): { x: number, y: number } | null {
        // Clear straight shot to the actual target (incl. entrance / tunnel points that
        // live in no chamber) → just go there. Covers the final leg + most short trips.
        // The buffer is the ant's body-clearance: a line that merely grazes a concave
        // wall samples as "blocked" here so we route around it via a chamber instead of
        // letting the ant wall-slide/wedge along the boundary.
        const CLEAR = CONFIG.nestRouteClearance;
        if (this.lineClear(x, y, targetX, targetY, CLEAR)) return { x: targetX, y: targetY };

        const targetCh = this.chamberAt(targetX, targetY) ?? this.nearestChamberAny(targetX, targetY);
        if (!targetCh) return null;

        // Candidate "current" chambers: those the ant has a clear straight line to. An ant
        // in a tunnel sees both its endpoints; the one fewer hops from the target wins, so
        // it heads the right way down the corridor instead of toward the nearer endpoint.
        let bestFrom: Chamber | null = null, bestHops = Infinity, bestDist = Infinity;
        for (const c of this.chambers) {
            if (!this.lineClear(x, y, c.x, c.y, CLEAR)) continue;
            const hops = this.chamberHops(c, targetCh);
            const dist = (x - c.x) ** 2 + (y - c.y) ** 2;
            if (hops < bestHops || (hops === bestHops && dist < bestDist)) {
                bestHops = hops; bestDist = dist; bestFrom = c;
            }
        }
        // Degenerate (no chamber in sight — e.g. wedged in a tunnel kink): fall back to the
        // nearest chamber centre to walk back into open space.
        if (!bestFrom) return this.nearestChamberAny(x, y);

        if (bestFrom === targetCh) {
            // We can see the target's chamber; the caller only routes when the final target
            // itself is blocked, so steer at the chamber centre to round the last wall.
            return { x: bestFrom.x, y: bestFrom.y };
        }
        const next = this.nextChamberToward(bestFrom, targetCh);
        return next ? { x: next.x, y: next.y } : { x: targetCh.x, y: targetCh.y };
    }

    // Back-compat shim: the FSM handlers call getNextNodeTowards to round a wall. It now
    // delegates to the robust chamber-tree router (returns a steer-toward point).
    getNextNodeTowards(x: number, y: number, targetX: number, targetY: number) {
        return this.nestWaypoint(x, y, targetX, targetY) ?? this.getNearestNode(x, y);
    }
}
