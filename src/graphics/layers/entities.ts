// Entity drawing: ants (incl. sprite cache), insects, food, particles —
// shared by the world view, the nest view and the WebGL texture baking.
import { PerformanceManager, QualityLevel } from '../../PerformanceManager';
import type { World } from '../../simulation/World';
import type { Renderer } from '../Renderer';

// Cached ant sprite shade variants (brightness tweaks against the clone look).
const ANT_SHADES = [1.0, 0.85, 1.13, 0.93];

export function drawParticles(r: Renderer, world: World) {
    for (const p of world.particles) {
        r.ctx.globalAlpha = p.life;
        r.ctx.fillStyle = p.color;
        r.ctx.fillRect(p.x, p.y, 2, 2);
    }
    r.ctx.globalAlpha = 1.0;
}

export function drawLegs(r: Renderer, count: number, length: number, color: string, speed: number, ctx: CanvasRenderingContext2D = r.ctx, isVertical: boolean = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    // Explicit animation control
    const animate = PerformanceManager.settings.legAnimation;
    const time = animate ? Date.now() * 0.02 * speed : 0;

    for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const legIndex = Math.floor(i / 2);
        // Spread legs out more for spiders/beetles
        const spread = (count > 6) ? 3 : 2;
        const legOffset = (legIndex - (count / 4) + 0.5) * spread;

        const move = animate ? Math.sin(time + i * Math.PI) * 0.5 : (i % 2 === 0 ? 0.3 : -0.3);

        ctx.beginPath();

        if (isVertical) {
            // Body is along Y axis, Legs extend in X
            ctx.moveTo(0, legOffset);

            // Knee
            const kx = side * length * 0.5;
            const ky = legOffset + move;

            // Foot
            const fx = side * length;
            const fy = ky + move;

            ctx.quadraticCurveTo(kx, ky, fx, fy);
        } else {
            // Body is along X axis, Legs extend in Y (Default for Ants)
            ctx.moveTo(legOffset, 0);

            // Knee
            const kx = legOffset + move;
            const ky = side * length * 0.5;

            // Foot
            const fx = kx + move;
            const fy = side * length;

            ctx.quadraticCurveTo(kx, ky, fx, fy);
        }
        ctx.stroke();
    }
}

export function drawShadow(r: Renderer, x: number, y: number, radius: number, ctx: CanvasRenderingContext2D = r.ctx) {
    if (!PerformanceManager.settings.shadows) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 2, radius, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
}

/** Multiply a #rgb/#rrggbb colour towards black by factor f (0..1). */
export function darken(hex: string, f: number): string {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const r = (((n >> 16) & 255) * f) | 0, g = (((n >> 8) & 255) * f) | 0, b = ((n & 255) * f) | 0;
    return `rgb(${r},${g},${b})`;
}

/**
 * Draw a single ant in local space (origin at thorax, facing +x), mirroring the
 * WebGL `bakeAnt` silhouette so the 2D nest view matches the outside 3D look:
 * wasp-waisted body (gaster + thin petiole + thorax), rounded worker head /
 * big-headed square soldier head, eyes, geniculate antennae and short jointed
 * legs. Colours come from the caller (body = colony colour, soldier head = red).
 * `phase` (0..1) swings the legs for the walk cycle; pass 0 for a static pose.
 */
export function drawAntBody2D(ctx: CanvasRenderingContext2D, soldier: boolean,
                      bodyCol: string, headCol: string, legCol: string, S: number, phase: number) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Legs — 6 jointed (attach → knee → foot), 3 per side; short so they barely protrude.
    ctx.strokeStyle = legCol;
    ctx.lineWidth = 0.6;
    const legDefs: [number, number, number, number, number][] = [
        [0.6, 2.6, 2.4, 4.4, 3.4],
        [-0.4, -0.2, 3.0, -0.6, 4.6],
        [-1.6, -3.2, 2.6, -5.0, 3.7],
    ];
    let li = 0;
    for (const [ax, kx, ky, fx, fy] of legDefs) {
        for (const s of [1, -1]) {
            const sw = Math.sin(phase * Math.PI * 2 + (li % 2 ? Math.PI : 0)) * 0.8;
            ctx.beginPath();
            ctx.moveTo(ax * S, 0.5 * s * S);
            ctx.lineTo((kx + sw) * S, ky * s * S);
            ctx.lineTo((fx + sw * 1.4) * S, fy * s * S);
            ctx.stroke();
            li++;
        }
    }
    // Gaster (abdomen) behind a thin petiole stalk → clear wasp waist.
    const grx = 2.9 * S, gry = 1.75 * S, gcx = -5.0 * S;
    const trx = (soldier ? 1.75 : 1.55) * S, tryR = (soldier ? 1.05 : 0.92) * S, tcx = (soldier ? -0.2 : -0.4) * S;
    const prx = 0.5 * S, pry = 0.32 * S, pcx = -2.05 * S;
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(gcx, 0, grx, gry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5 * S;
    ctx.beginPath(); ctx.moveTo(gcx - 0.3 * S, -gry * 0.83); ctx.quadraticCurveTo(gcx + 0.5 * S, 0, gcx - 0.3 * S, gry * 0.83); ctx.stroke();
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(pcx, 0, prx, pry, 0, 0, Math.PI * 2); ctx.fill();   // petiole
    ctx.beginPath(); ctx.ellipse(tcx, 0, trx, tryR, 0, 0, Math.PI * 2); ctx.fill();  // thorax
    // Head — rounded (worker) or moderate big-headed square/heart (soldier).
    let headCx: number, headFront: number, headHalfH: number;
    ctx.fillStyle = headCol;
    if (soldier) {
        const bx = 1.7 * S, fx = 5.5 * S, hy = 2.95 * S;
        ctx.beginPath();
        ctx.moveTo(bx, -hy);
        ctx.lineTo(fx * 0.78, -hy);
        ctx.quadraticCurveTo(fx, -hy, fx, 0);
        ctx.quadraticCurveTo(fx, hy, fx * 0.78, hy);
        ctx.lineTo(bx, hy);
        ctx.quadraticCurveTo(bx - 0.9 * S, 0, bx, -hy);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.ellipse(fx * 0.5 + 0.4, -hy * 0.45, 1.2 * S, 0.8 * S, -0.5, 0, Math.PI * 2); ctx.fill();
        headCx = (bx + fx) * 0.5; headFront = fx; headHalfH = hy;
    } else {
        const hrx = 1.85 * S, hry = 1.65 * S, hcx = 2.5 * S;
        ctx.beginPath(); ctx.ellipse(hcx, 0, hrx, hry, 0, 0, Math.PI * 2); ctx.fill();
        headCx = hcx; headFront = hcx + hrx; headHalfH = hry;
    }
    // Eyes
    ctx.fillStyle = soldier ? 'rgba(0,0,0,0.45)' : 'rgba(20,20,20,0.55)';
    const ex = headCx + (soldier ? 0.4 : 0.2) * S, ey = headHalfH * 0.55, er = (soldier ? 0.4 : 0.32) * S;
    ctx.beginPath(); ctx.ellipse(ex, -ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex,  ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    // Antennae — scape ~90° to the side, then funiculus bends forward (geniculate).
    ctx.strokeStyle = legCol; ctx.lineWidth = (soldier ? 0.6 : 0.5) * S;
    const aax = headFront * 0.7, aay = headHalfH * 0.5;
    const aex = headFront * 0.78, aey = headHalfH + 1.6 * S;
    const atx = aex + 2.5 * S, aty = aey + 0.4 * S;
    ctx.beginPath();
    ctx.moveTo(aax, -aay); ctx.lineTo(aex, -aey); ctx.lineTo(atx, -aty);
    ctx.moveTo(aax,  aay); ctx.lineTo(aex,  aey); ctx.lineTo(atx,  aty);
    ctx.stroke();
}

export function getCachedAnt(r: Renderer, type: 'WORKER' | 'SOLDIER', variant: number = 0, bodyCol: string = '#cccccc'): HTMLCanvasElement {
    const v = ((variant % ANT_SHADES.length) + ANT_SHADES.length) % ANT_SHADES.length;
    const key = `${type}_${v}_${bodyCol}`;
    if (r.antSprites[key]) return r.antSprites[key];

    // Variants other than the base are brightness-shifted copies of the base.
    if (v !== 0) {
        const base = getCachedAnt(r, type, 0, bodyCol);
        const tinted = document.createElement('canvas');
        tinted.width = base.width;
        tinted.height = base.height;
        const tctx = tinted.getContext('2d')!;
        tctx.filter = `brightness(${ANT_SHADES[v]})`;
        tctx.drawImage(base, 0, 0);
        r.antSprites[key] = tinted;
        return tinted;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 30;
    canvas.height = 30;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(15, 15); // centre; caller rotates the sprite when blitting

    // Same silhouette as the WebGL world (static leg pose). Soldier head = red.
    const soldier = type === 'SOLDIER';
    const S = soldier ? 1.12 : 1.0;
    const headCol = soldier ? '#c01810' : bodyCol;
    const legCol = darken(bodyCol, 0.6);
    drawAntBody2D(ctx, soldier, bodyCol, headCol, legCol, S, 0);

    r.antSprites[key] = canvas;
    return canvas;
}

export function drawAnt(r: Renderer, ant: any, ctx: CanvasRenderingContext2D = r.ctx) {
    ctx.save();
    ctx.translate(ant.x, ant.y);
    ctx.rotate(ant.angle);

    // Subtle per-ant size variance so the colony isn't uniform. Soldiers are knocked
    // down ~22% visually (their sizeVar reads as too big) — cosmetic only, stats stay.
    const sv = (ant.sizeVar || 1) * (ant.type === 'SOLDIER' ? 0.78 : 1);
    if (sv !== 1) ctx.scale(sv, sv);

    // Team aura for rival colonies — a path-independent colour halo under the ant
    // so the two armies read apart at every quality level. Colony 0 = no aura.
    const team = ant.colony?.teamColor;
    if (team) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = team;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Body colour for this ant (so nest ants aren't plain white + to colour rivals).
    // Applied as the actual fill colour below — NOT as an overlay rect, which would
    // tint the opaque nest floor under the ant (the "square halo" bug).
    const workerCol: string = ant.colony?.workerColor2D || '#cccccc';

    if (PerformanceManager.settings.simpleAnts) {
        // OPTIMIZED (Body Only, No Legs, Flat Colors)
        if (ant.type === 'SOLDIER') {
            // Soldier: colony body colour + red head, matching the WebGL world.
            ctx.fillStyle = workerCol;
            // Abdomen
            ctx.beginPath(); ctx.ellipse(-5, 0, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
            // Thorax
            ctx.beginPath(); ctx.ellipse(-1, 0, 2.5, 2.0, 0, 0, Math.PI * 2); ctx.fill();
            // Head (red, big-headed)
            ctx.fillStyle = '#c01810';
            ctx.beginPath(); ctx.rect(1, -3, 5, 6); ctx.fill();

        } else {
            // Worker: colony body colour (own warm brown, rival amber).
            ctx.fillStyle = workerCol;

            // Abdomen
            ctx.beginPath(); ctx.ellipse(-3, 0, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
            // Thorax
            ctx.beginPath(); ctx.ellipse(0, 0, 2, 1, 0, 0, Math.PI * 2); ctx.fill();
            // Head
            ctx.beginPath(); ctx.arc(2, 0, 1.5, 0, Math.PI * 2); ctx.fill();
        }

        // Carrying Indicator (Simple dot)
        if (ant.carrying !== 'NONE') {
            if (ant.carrying === 'SUGAR') ctx.fillStyle = '#FFD700';
            else if (ant.carrying === 'BROOD') ctx.fillStyle = '#FFF';
            else ctx.fillStyle = '#555';

            ctx.beginPath();
            ctx.arc(3, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        return;
    }

    // Optimization for MEDIUM: Use Cached Sprite if legs are static
    if (!PerformanceManager.settings.legAnimation && (ant.type === 'WORKER' || ant.type === 'SOLDIER')) {
        const sprite = getCachedAnt(r, ant.type, ant.shade || 0, workerCol);
        ctx.drawImage(sprite, -15, -15);

        // Draw Carrying Item on top
        if (ant.carrying !== 'NONE') {
            if (ant.carrying === 'SUGAR') {
                ctx.fillStyle = '#FF0';
                ctx.beginPath(); ctx.arc(5, 0, 2, 0, Math.PI * 2); ctx.fill();
            } else if (ant.carrying === 'PROTEIN') {
                ctx.fillStyle = '#F00';
                ctx.beginPath(); ctx.arc(5, 0, 2, 0, Math.PI * 2); ctx.fill();
            } else if (ant.carrying === 'BROOD' && ant.carryingInstance) {
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.ellipse(4, 0, 2, 3, Math.PI / 2, 0, Math.PI * 2); ctx.fill();
            } else if (ant.carrying === 'CORPSE') {
                ctx.fillStyle = '#555';
                ctx.beginPath(); ctx.arc(5, 0, 2.5, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
        return;
    }

    // Milking Visual (Particle Flow)
    if (ant.state === 'MILKING' && ant.carryingInstance) {
        const dx = ant.carryingInstance.x - ant.x;
        const dy = ant.carryingInstance.y - ant.y;

        const time = Date.now() * 0.002;
        const count = 3;
        ctx.fillStyle = '#FFD700'; // Gold/Sugar

        for (let i = 0; i < count; i++) {
            // Flow from Aphid (1.0) to Ant (0.0)
            const t = 1.0 - ((time + i / count) % 1.0);

            // Interpolate in World Space (Relative to Ant)
            const wx = dx * t;
            const wy = dy * t;

            ctx.beginPath();
            ctx.arc(wx, wy, 2.0, 0, Math.PI * 2); // particle
            ctx.fill();
        }

        // Carrying Indicator (Simple dot)
        if (ant.carrying !== 'NONE') {
            if (ant.carrying === 'SUGAR') ctx.fillStyle = '#FFD700';
            else if (ant.carrying === 'BROOD') ctx.fillStyle = '#FFF';
            else ctx.fillStyle = '#555';

            ctx.beginPath();
            ctx.arc(3, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        return;
    }

    // Shadow
    drawShadow(r, 0, 0, 3, ctx);

    // Body — same silhouette as the WebGL world. Legs animate via `phase`.
    const animSpeed = (ant.speedMultiplier !== undefined) ? ant.speedMultiplier : 1.0;
    const soldier = ant.type === 'SOLDIER';
    const S = soldier ? 1.12 : 1.0;
    const headCol = soldier ? '#c01810' : workerCol; // soldier head red (Messor)
    const legCol = darken(workerCol, 0.6);
    const phase = PerformanceManager.settings.legAnimation
        ? ((Date.now() * 0.005 * animSpeed) % 1) : 0;
    drawAntBody2D(ctx, soldier, workerCol, headCol, legCol, S, phase);

    // Carrying Food
    if (ant.carrying === 'SUGAR') {
        ctx.fillStyle = '#FF0'; // Yellow
        ctx.beginPath();
        ctx.arc(5, 0, 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (ant.carrying === 'PROTEIN') {
        ctx.fillStyle = '#CD5C5C';
        ctx.beginPath();
        ctx.rect(4, -1.5, 3, 3);
        ctx.fill();
    } else if (ant.carrying === 'CORPSE') {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.ellipse(5, 0, 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Legs
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(5, -3);
        ctx.moveTo(5, 0); ctx.lineTo(5, 3);
        ctx.stroke();
    }

    // Attack Animation
    if (ant.attackCooldown > 15) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(4, -2);
        ctx.lineTo(8, 0);
        ctx.lineTo(4, 2);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draw jointed insect legs with a fore-aft walk swing. `defs` are
 * [attachX, attachY, kneeX, kneeY, footX, footY] for the right side (mirrored left).
 * `phase` (0..1) swings the knee/foot; alternating legs are in counter-phase for a
 * tripod-ish gait. strokeStyle/lineWidth are taken from the current ctx state.
 */
export function insectLegs(r: Renderer, defs: [number, number, number, number, number, number][], phase: number) {
    const ctx = r.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let li = 0;
    for (const [ax, ay, kx, ky, fx, fy] of defs) {
        for (const s of [1, -1]) {
            const sw = Math.sin(phase * Math.PI * 2 + (li % 2 ? Math.PI : 0)) * 0.9;
            ctx.beginPath();
            ctx.moveTo(ax * s, ay);
            ctx.lineTo(kx * s, ky + sw);
            ctx.lineTo(fx * s, fy + sw * 1.3);
            ctx.stroke();
            li++;
        }
    }
}

export function drawInsect(r: Renderer, insect: any, phase: number = 0) {
    r.ctx.save();
    r.ctx.translate(insect.x, insect.y);

    if (PerformanceManager.settings.simpleInsects) {
        r.ctx.rotate(insect.angle + Math.PI / 2);
        if (insect.type === 'PREY') {
            r.ctx.fillStyle = '#ADD8E6'; // Silver
            r.ctx.beginPath();
            r.ctx.ellipse(0, 0, 2.5, 5, 0, 0, Math.PI * 2);
            r.ctx.fill();
        } else if (insect.type === 'APHID') {
            r.ctx.fillStyle = '#32CD32'; // Lime
            r.ctx.beginPath();
            r.ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
            r.ctx.fill();
        } else {
            r.ctx.fillStyle = '#DC143C'; // Red
            r.ctx.beginPath();
            r.ctx.ellipse(0, 0, 3, 4.5, 0, 0, Math.PI * 2);
            r.ctx.fill();
        }
        r.ctx.restore();
        return;
    }

    // Complex Drawing
    // Shadow - Handled by drawShadows
    // drawShadow(r, 0, 0, 6, r.ctx);

    if (insect.type === 'PREY') {
        // Silverfish — tapered segmented silver body, long antennae + 3 tail filaments.
        r.ctx.rotate(insect.angle + Math.PI / 2);
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        const wiggle = Math.sin(Date.now() * 0.02) * 1.2;

        // Legs — 6 small, jointed, splayed.
        r.ctx.strokeStyle = '#8a8a8a';
        r.ctx.lineWidth = 0.7;
        const pLegs: [number, number, number, number, number, number][] = [
            [2, -3, 4.5, -4, 6.5, -5],
            [2.5, -1, 5, -1, 7, 0],
            [2, 1, 4.5, 2, 6.5, 4],
        ];
        insectLegs(r, pLegs, phase);
        // Body — silvery, broad at the head, tapering to the tail.
        const bg = r.ctx.createLinearGradient(-4, 0, 4, 0);
        bg.addColorStop(0, '#9a9a9a'); bg.addColorStop(0.5, '#d2d2d2'); bg.addColorStop(1, '#9a9a9a');
        r.ctx.fillStyle = bg;
        r.ctx.beginPath();
        r.ctx.moveTo(0, -7.5);
        r.ctx.quadraticCurveTo(4.5, -5, 4, 0);
        r.ctx.quadraticCurveTo(3.2, 7, 0, 11);
        r.ctx.quadraticCurveTo(-3.2, 7, -4, 0);
        r.ctx.quadraticCurveTo(-4.5, -5, 0, -7.5);
        r.ctx.fill();
        // Segment plates
        r.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        r.ctx.lineWidth = 0.6;
        for (const yy of [-3, 0, 3, 6]) {
            const rw = 4 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - 1) / 9, 2)));
            r.ctx.beginPath();
            r.ctx.moveTo(-rw, yy); r.ctx.quadraticCurveTo(0, yy + 1.4, rw, yy); r.ctx.stroke();
        }
        // Eyes
        r.ctx.fillStyle = 'rgba(20,20,20,0.65)';
        r.ctx.beginPath();
        r.ctx.arc(-1.3, -6, 0.6, 0, Math.PI * 2); r.ctx.arc(1.3, -6, 0.6, 0, Math.PI * 2);
        r.ctx.fill();
        // Antennae (long, forward + out)
        r.ctx.strokeStyle = '#8a8a8a';
        r.ctx.lineWidth = 0.6;
        r.ctx.beginPath();
        r.ctx.moveTo(-1.3, -6.5); r.ctx.lineTo(-3.5, -11); r.ctx.lineTo(-4.5 - wiggle * 0.3, -15);
        r.ctx.moveTo(1.3, -6.5); r.ctx.lineTo(3.5, -11); r.ctx.lineTo(4.5 + wiggle * 0.3, -15);
        r.ctx.stroke();
        // Tail filaments (3 cerci)
        r.ctx.beginPath();
        r.ctx.moveTo(0, 10); r.ctx.lineTo(wiggle * 0.4, 15.5);
        r.ctx.moveTo(0, 10); r.ctx.lineTo(-2.5, 14);
        r.ctx.moveTo(0, 10); r.ctx.lineTo(2.5, 14);
        r.ctx.stroke();

    } else if (insect.type === 'SPIDER') {
        // Wolf spider — radiating jointed legs, brown-charcoal body, subtle eyes.
        r.ctx.rotate(insect.angle + Math.PI / 2);
        const legCol = '#2a211a';
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        r.ctx.strokeStyle = legCol;
        r.ctx.lineWidth = 1.1;
        // [attachX, attachY, kneeX, kneeY, footX, footY] for the right side; mirrored left.
        // Knee sits higher/further out than attach+foot → classic bent-leg fan.
        const sLegs: [number, number, number, number, number, number][] = [
            [3, -6,  9, -12, 15, -14],  // front pair → forward
            [4, -4, 12,  -7, 18,  -6],
            [4, -2, 12,   1, 18,   3],
            [3,  0,  9,   6, 14,  11],  // rear pair → backward
        ];
        insectLegs(r, sLegs, phase);
        // Abdomen (opisthosoma) — large, with a darker median folium marking.
        r.ctx.fillStyle = '#4a3b2c';
        r.ctx.beginPath(); r.ctx.ellipse(0, 4, 5.2, 6.5, 0, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.fillStyle = 'rgba(0,0,0,0.35)';
        r.ctx.beginPath();
        r.ctx.moveTo(0, -1);
        r.ctx.quadraticCurveTo(2.6, 4, 0, 10);
        r.ctx.quadraticCurveTo(-2.6, 4, 0, -1);
        r.ctx.fill();
        // Cephalothorax (prosoma)
        r.ctx.fillStyle = '#3a2e22';
        r.ctx.beginPath(); r.ctx.ellipse(0, -4.5, 4, 4.5, 0, 0, Math.PI * 2); r.ctx.fill();
        // Pedipalps (short front appendages beside the chelicerae)
        r.ctx.lineWidth = 1.2;
        r.ctx.beginPath();
        r.ctx.moveTo(-1.5, -8); r.ctx.lineTo(-3, -11);
        r.ctx.moveTo(1.5, -8); r.ctx.lineTo(3, -11);
        r.ctx.stroke();
        // Eyes — two large forward eyes + a small row (wolf-spider arrangement) with a glint.
        r.ctx.fillStyle = '#111';
        r.ctx.beginPath();
        r.ctx.arc(-1.6, -6.6, 1.1, 0, Math.PI * 2);
        r.ctx.arc(1.6, -6.6, 1.1, 0, Math.PI * 2);
        r.ctx.fill();
        r.ctx.beginPath();
        r.ctx.arc(-3, -5.5, 0.5, 0, Math.PI * 2);
        r.ctx.arc(3, -5.5, 0.5, 0, Math.PI * 2);
        r.ctx.arc(-0.9, -4.6, 0.4, 0, Math.PI * 2);
        r.ctx.arc(0.9, -4.6, 0.4, 0, Math.PI * 2);
        r.ctx.fill();
        r.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        r.ctx.beginPath();
        r.ctx.arc(-1.9, -7.0, 0.35, 0, Math.PI * 2);
        r.ctx.arc(1.3, -7.0, 0.35, 0, Math.PI * 2);
        r.ctx.fill();

    } else if (insect.type === 'BEETLE') {
        // Ground beetle — domed bronze-black elytra, pronotum, head + clubbed antennae.
        r.ctx.rotate(insect.angle + Math.PI / 2);
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        // Legs — 6 jointed, dark.
        r.ctx.strokeStyle = '#1a1510';
        r.ctx.lineWidth = 1.0;
        const beLegs: [number, number, number, number, number, number][] = [
            [3, -4, 6, -6, 9, -7],
            [3.5, -1, 7, -1, 10, 0],
            [3, 2, 6, 5, 9, 8],
        ];
        insectLegs(r, beLegs, phase);
        // Head + clubbed antennae
        r.ctx.strokeStyle = '#1a1510';
        r.ctx.lineWidth = 0.8;
        r.ctx.beginPath();
        r.ctx.moveTo(-1.5, -8.5); r.ctx.lineTo(-3.5, -11.5);
        r.ctx.moveTo(1.5, -8.5); r.ctx.lineTo(3.5, -11.5);
        r.ctx.stroke();
        r.ctx.fillStyle = '#15110c';
        r.ctx.beginPath(); r.ctx.arc(-3.5, -11.8, 0.9, 0, Math.PI * 2); r.ctx.arc(3.5, -11.8, 0.9, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.beginPath(); r.ctx.arc(0, -7.5, 2.6, 0, Math.PI * 2); r.ctx.fill();
        // Pronotum (thorax shield)
        r.ctx.fillStyle = '#241d14';
        r.ctx.beginPath(); r.ctx.ellipse(0, -4.5, 4, 2.6, 0, 0, Math.PI * 2); r.ctx.fill();
        // Elytra (domed wing cases) — warm bronze-black sheen.
        const grad = r.ctx.createLinearGradient(-5.5, 0, 5.5, 0);
        grad.addColorStop(0, '#15110c');
        grad.addColorStop(0.5, '#4a3d28');
        grad.addColorStop(1, '#15110c');
        r.ctx.fillStyle = grad;
        r.ctx.beginPath(); r.ctx.ellipse(0, 1.5, 5.5, 7.5, 0, 0, Math.PI * 2); r.ctx.fill();
        // Elytra split + parallel striations
        r.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        r.ctx.lineWidth = 0.8;
        r.ctx.beginPath();
        r.ctx.moveTo(0, -4); r.ctx.lineTo(0, 8.5);
        r.ctx.moveTo(-2.6, -2); r.ctx.quadraticCurveTo(-3.2, 2, -2.2, 6.5);
        r.ctx.moveTo(2.6, -2); r.ctx.quadraticCurveTo(3.2, 2, 2.2, 6.5);
        r.ctx.stroke();
        // Glossy highlight
        r.ctx.fillStyle = 'rgba(255,255,255,0.14)';
        r.ctx.beginPath(); r.ctx.ellipse(-2, -1.5, 1.6, 3.2, 0.3, 0, Math.PI * 2); r.ctx.fill();

    } else if (insect.type === 'LADYBUG') {
        // Ladybug — domed red elytra, symmetric spots, black head with cheek spots.
        r.ctx.rotate(insect.angle + Math.PI / 2);
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        // Legs — 6 short black, jointed.
        r.ctx.strokeStyle = '#111';
        r.ctx.lineWidth = 0.9;
        const lLegs: [number, number, number, number, number, number][] = [
            [3, -3, 5, -4, 7, -5],
            [3.5, -1, 6, -1, 8, 0],
            [3, 2, 5, 4, 7, 6],
        ];
        insectLegs(r, lLegs, phase);
        // Head (black) + tiny antennae + white cheek spots.
        r.ctx.strokeStyle = '#111';
        r.ctx.lineWidth = 0.7;
        r.ctx.beginPath();
        r.ctx.moveTo(-1.2, -7); r.ctx.lineTo(-2.6, -9.5);
        r.ctx.moveTo(1.2, -7); r.ctx.lineTo(2.6, -9.5);
        r.ctx.stroke();
        r.ctx.fillStyle = '#0a0a0a';
        r.ctx.beginPath(); r.ctx.arc(0, -5.8, 2.8, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.fillStyle = '#FFF';
        r.ctx.beginPath(); r.ctx.arc(-1.3, -6.6, 0.7, 0, Math.PI * 2); r.ctx.arc(1.3, -6.6, 0.7, 0, Math.PI * 2); r.ctx.fill();
        // Shell
        const grad = r.ctx.createRadialGradient(-2, -2, 0, 0, 1, 7);
        grad.addColorStop(0, '#ff5a2a');
        grad.addColorStop(1, '#c00000');
        r.ctx.fillStyle = grad;
        r.ctx.beginPath(); r.ctx.ellipse(0, 1, 5.5, 6.5, 0, 0, Math.PI * 2); r.ctx.fill();
        // Elytra split line
        r.ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        r.ctx.lineWidth = 0.8;
        r.ctx.beginPath(); r.ctx.moveTo(0, -4); r.ctx.lineTo(0, 7); r.ctx.stroke();
        // Symmetric spots
        r.ctx.fillStyle = '#0a0a0a';
        r.ctx.beginPath();
        for (const [sx, sy, sr] of [[-2.8, -1.2, 1.1], [2.8, -1.2, 1.1], [-3, 2.6, 1.1], [3, 2.6, 1.1], [-1.4, 5, 0.9], [1.4, 5, 0.9]] as [number, number, number][]) {
            r.ctx.moveTo(sx + sr, sy); r.ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        }
        r.ctx.fill();
        // Glossy highlight
        r.ctx.fillStyle = 'rgba(255,255,255,0.22)';
        r.ctx.beginPath(); r.ctx.ellipse(-2.2, -1.5, 1.4, 2.2, 0.4, 0, Math.PI * 2); r.ctx.fill();

    } else if (insect.type === 'PREDATOR') {
        // Predatory beetle — segmented dark-crimson body, sickle mandibles, bulging eyes,
        // long spiny legs. Reads as the colony's main threat.
        r.ctx.rotate(insect.angle + Math.PI / 2);
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        // Legs — 6 long, jointed, dark.
        r.ctx.strokeStyle = '#3a0a08';
        r.ctx.lineWidth = 1.2;
        const prLegs: [number, number, number, number, number, number][] = [
            [3, -5, 8, -8, 12, -9],
            [3.5, -1, 9, -1, 13, 1],
            [3, 3, 8, 7, 12, 11],
        ];
        insectLegs(r, prLegs, phase);
        // Abdomen (elongated) — crimson with a bronze sheen + segment bands.
        const grad = r.ctx.createLinearGradient(-5, 0, 5, 0);
        grad.addColorStop(0, '#5a0e0a');
        grad.addColorStop(0.5, '#c0241a');
        grad.addColorStop(1, '#5a0e0a');
        r.ctx.fillStyle = grad;
        r.ctx.beginPath(); r.ctx.ellipse(0, 2, 5, 8, 0, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        r.ctx.lineWidth = 0.7;
        for (const yy of [0, 3, 6]) {
            const rw = 5 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - 2) / 8, 2)));
            r.ctx.beginPath(); r.ctx.moveTo(-rw, yy); r.ctx.quadraticCurveTo(0, yy + 1.3, rw, yy); r.ctx.stroke();
        }
        // Pronotum (thorax)
        r.ctx.fillStyle = '#8a1410';
        r.ctx.beginPath(); r.ctx.ellipse(0, -6, 4, 3, 0, 0, Math.PI * 2); r.ctx.fill();
        // Head
        r.ctx.fillStyle = '#a01812';
        r.ctx.beginPath(); r.ctx.arc(0, -10, 3.4, 0, Math.PI * 2); r.ctx.fill();
        // Sickle mandibles — dark, curved, crossing forward.
        r.ctx.strokeStyle = '#1a0907';
        r.ctx.lineWidth = 1.6;
        r.ctx.beginPath();
        r.ctx.moveTo(-2.4, -11.5); r.ctx.quadraticCurveTo(-5, -15.5, -0.8, -16.5);
        r.ctx.moveTo(2.4, -11.5); r.ctx.quadraticCurveTo(5, -15.5, 0.8, -16.5);
        r.ctx.stroke();
        // Bulging eyes with a glint.
        r.ctx.fillStyle = '#0a0a0a';
        r.ctx.beginPath(); r.ctx.arc(-3, -10.5, 1.7, 0, Math.PI * 2); r.ctx.arc(3, -10.5, 1.7, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.fillStyle = 'rgba(255,255,255,0.55)';
        r.ctx.beginPath(); r.ctx.arc(-3.4, -11, 0.5, 0, Math.PI * 2); r.ctx.arc(2.6, -11, 0.5, 0, Math.PI * 2); r.ctx.fill();

    } else if (insect.type === 'APHID') {
        // Aphid — plump pear-shaped lime body, antennae, cornicles (tail pipes).
        r.ctx.rotate(insect.angle + Math.PI / 2);
        r.ctx.lineCap = 'round';
        r.ctx.lineJoin = 'round';
        // Legs — 6 short, soft green, jointed.
        r.ctx.strokeStyle = 'rgba(90,150,40,0.7)';
        r.ctx.lineWidth = 0.7;
        const aLegs: [number, number, number, number, number, number][] = [
            [2, -2, 4, -3, 5.5, -4],
            [2.5, 0, 4.5, 0, 6, 1],
            [2, 2, 4, 4, 5.5, 6],
        ];
        insectLegs(r, aLegs, phase);
        // Antennae (long, forward + out)
        r.ctx.strokeStyle = 'rgba(90,150,40,0.8)';
        r.ctx.lineWidth = 0.6;
        r.ctx.beginPath();
        r.ctx.moveTo(-1.2, -4); r.ctx.lineTo(-2.5, -7); r.ctx.lineTo(-3, -10);
        r.ctx.moveTo(1.2, -4); r.ctx.lineTo(2.5, -7); r.ctx.lineTo(3, -10);
        r.ctx.stroke();
        // Abdomen (plump) + head
        const ag = r.ctx.createRadialGradient(-1.2, 0, 0, 0, 1, 5);
        ag.addColorStop(0, '#c4f23a');
        ag.addColorStop(1, '#8fc41e');
        r.ctx.fillStyle = ag;
        r.ctx.beginPath(); r.ctx.ellipse(0, 1.5, 3.8, 4.8, 0, 0, Math.PI * 2); r.ctx.fill();
        r.ctx.fillStyle = '#a9d62a';
        r.ctx.beginPath(); r.ctx.arc(0, -3.2, 2.1, 0, Math.PI * 2); r.ctx.fill();
        // Highlight
        r.ctx.fillStyle = 'rgba(255,255,255,0.3)';
        r.ctx.beginPath(); r.ctx.ellipse(-1.3, -0.5, 1, 1.8, 0.3, 0, Math.PI * 2); r.ctx.fill();
        // Eyes
        r.ctx.fillStyle = 'rgba(20,20,20,0.7)';
        r.ctx.beginPath();
        r.ctx.arc(-1.4, -3.6, 0.5, 0, Math.PI * 2); r.ctx.arc(1.4, -3.6, 0.5, 0, Math.PI * 2);
        r.ctx.fill();
        // Cornicles (tail pipes)
        r.ctx.strokeStyle = '#5a8a18';
        r.ctx.lineWidth = 1;
        r.ctx.beginPath();
        r.ctx.moveTo(-2.4, 4.5); r.ctx.lineTo(-3, 7);
        r.ctx.moveTo(2.4, 4.5); r.ctx.lineTo(3, 7);
        r.ctx.stroke();
    } else {
        // Fallback for unknown types (Debug: Pink Square)
        r.ctx.fillStyle = '#FF00FF';
        r.ctx.fillRect(-5, -5, 10, 10);
    }

    r.ctx.restore();
}

export function drawFood(r: Renderer, food: any) {
    const ctx = r.ctx;
    const radius = Math.max(8, Math.sqrt(food.amount) * 0.85);

    // Shadow
    ctx.save();
    ctx.translate(food.x, food.y);
    drawShadow(r, 0, 0, radius, ctx);
    ctx.restore();

    if (food.type === 'SUGAR') {
        // Honey Drop Look
        ctx.save();
        ctx.translate(food.x, food.y);

        // 1. Body (Golden/Amber Gradient)
        const grad = ctx.createRadialGradient(-radius * 0.2, -radius * 0.2, radius * 0.1, 0, 0, radius);
        grad.addColorStop(0, 'rgba(255, 220, 100, 0.9)'); // Bright center
        grad.addColorStop(0.6, 'rgba(255, 180, 20, 0.8)'); // Golden body
        grad.addColorStop(1, 'rgba(200, 120, 0, 0.6)'); // Darker edge

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Slightly flattened circle for a "drop" look
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Specular Highlight (Glossy reflection)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(-radius * 0.3, -radius * 0.3, radius * 0.25, radius * 0.15, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // 3. Inner Glow / Refraction (Subtle)
        ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
        ctx.beginPath();
        ctx.arc(radius * 0.3, radius * 0.3, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    } else {
        // PROTEIN or CORPSE
        // Check for Dead Insect Corpse (High Quality)
        if (food.corpseType && PerformanceManager.level !== QualityLevel.LOW) {
            ctx.save();
            ctx.translate(food.x, food.y);
            ctx.rotate((food.corpseAngle || 0) + Math.PI); // Upside down?

            // Dead Insect Look (Darker, desaturated)
            if (food.corpseType === 'ANT') {
                // Dead Ant
                ctx.fillStyle = '#333'; // Dark Grey
                ctx.beginPath();
                ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2); // Body
                ctx.fill();
                ctx.beginPath();
                ctx.arc(3, 0, 1.5, 0, Math.PI * 2); // Head
                ctx.fill();
                // Curled legs
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 0.5;
                drawLegs(r, 3, 2, '#333', 0, ctx); // Static legs
            } else if (food.corpseType === 'BEETLE') {
                ctx.fillStyle = '#2F4F4F'; // Dark Slate Gray
                ctx.beginPath();
                ctx.arc(0, 0, 6, 0, Math.PI * 2);
                ctx.fill();
            } else if (food.corpseType === 'LADYBUG') {
                ctx.fillStyle = '#8B0000'; // Dark Red
                ctx.beginPath();
                ctx.arc(0, 0, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000'; // Spots
                ctx.beginPath();
                ctx.arc(-2, -2, 1, 0, Math.PI * 2);
                ctx.arc(2, 2, 1, 0, Math.PI * 2);
                ctx.fill();
            } else if (food.corpseType === 'SPIDER') {
                ctx.fillStyle = '#1a1a1a'; // Black
                ctx.beginPath();
                ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                // Curled legs
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(5, i * 2 - 4, 3, i * 2 - 4);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(-5, i * 2 - 4, -3, i * 2 - 4);
                    ctx.stroke();
                }
            } else {
                // Generic (Prey/Predator)
                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // X eyes for dead effect?
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(3, -1); ctx.lineTo(5, 1);
            ctx.moveTo(5, -1); ctx.lineTo(3, 1);
            ctx.stroke();

            ctx.restore();
        } else {
            // Meat Chunks (Default / Low Quality)
            ctx.save();
            ctx.translate(food.x, food.y);
            ctx.beginPath();
            const seed = Math.floor(food.x + food.y);
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const r = radius * (0.7 + 0.3 * Math.sin(seed + i));
                const vx = Math.cos(angle) * r;
                const vy = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(vx, vy);
                else ctx.lineTo(vx, vy);
            }
            ctx.closePath();
            ctx.fillStyle = '#CD5C5C';
            ctx.fill();
            ctx.strokeStyle = '#8B4513';
            ctx.stroke();
            ctx.fillStyle = '#E1C699';
            ctx.beginPath();
            ctx.arc(-2, -2, radius * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}
