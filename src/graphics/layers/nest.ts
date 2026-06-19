// Nest panel: realistic underground cross-section.
import { CONFIG } from '../../config';
import { PerformanceManager } from '../../PerformanceManager';
import type { World } from '../../simulation/World';
import type { Renderer } from '../Renderer';
import { darken, drawAnt, drawFood, drawShadow } from './entities';

// ── Seeded random [0,1) ───────────────────────────────────────────────────────
function sr(s: number): number {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
}

// ── Smooth closed bezier through [x,y] control points ────────────────────────
function smoothPath(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
    const n = pts.length;
    if (n < 2) return;
    ctx.beginPath();
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
}

// ── Organic (wobbled) circle path ─────────────────────────────────────────────
function organicArc(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, radius: number,
    seed: number, wobble = 0.11, nPts = 10
) {
    const amp = radius * wobble;
    const pts: [number, number][] = [];
    for (let i = 0; i < nPts; i++) {
        const ang = (i / nPts) * Math.PI * 2 - Math.PI / 2;
        const r = radius
            + Math.sin(seed * (i * 7.31 + 1.97)) * amp
            + Math.cos(seed * (i * 3.17 + 4.63)) * amp * 0.4;
        pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    smoothPath(ctx, pts);
}

// ── Soil texture — baked once into a permanent offscreen canvas ───────────────
let _soilCache: { canvas: HTMLCanvasElement; w: number; h: number } | null = null;
function getSoilCanvas(w: number, h: number): HTMLCanvasElement {
    if (_soilCache && _soilCache.w === w && _soilCache.h === h) return _soilCache.canvas;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d')!;

    // Geological layer bands (subtle horizontal gradients)
    for (let band = 0; band < 4; band++) {
        const y0 = h * (band / 4);
        const grad = cx.createLinearGradient(0, y0, 0, y0 + h / 4);
        const hue = [28, 24, 22, 18][band];
        grad.addColorStop(0, `rgba(${hue + 14},${hue},${hue - 4},0)`);
        grad.addColorStop(0.5, `rgba(${hue + 14},${hue},${hue - 4},0.06)`);
        grad.addColorStop(1, `rgba(${hue + 14},${hue},${hue - 4},0)`);
        cx.fillStyle = grad;
        cx.fillRect(0, y0, w, h / 4 + 1);
    }

    // Light grain pass (single fillStyle, many rects)
    cx.fillStyle = '#6b4828';
    for (let i = 0; i < 550; i++) {
        const x = sr(i * 3) * w;
        const y = sr(i * 3 + 1) * h;
        const sz = 0.8 + sr(i * 3 + 2) * 1.8;
        cx.globalAlpha = 0.12 + sr(i + 500) * 0.10;
        cx.fillRect(x, y, sz, sz * (0.5 + sr(i + 600) * 0.5));
    }
    // Dark grain pass
    cx.fillStyle = '#0a0705';
    for (let i = 0; i < 400; i++) {
        const x = sr(i * 3 + 1000) * w;
        const y = sr(i * 3 + 1001) * h;
        const sz = 0.7 + sr(i + 1002) * 1.5;
        cx.globalAlpha = 0.12 + sr(i + 1100) * 0.09;
        cx.fillRect(x, y, sz, sz * (0.4 + sr(i + 1200) * 0.6));
    }
    cx.globalAlpha = 1;

    _soilCache = { canvas: c, w, h };
    return c;
}

// ── Cubic bezier single-axis point ────────────────────────────────────────────
function bezP(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const m = 1 - t;
    return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

// ── Root network — drawn LAST so it overlays soil + tunnels + chambers ────────
function drawRootNetwork(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let ri = 0; ri < 8; ri++) {
        const sx = w * (0.04 + sr(ri * 5) * 0.92);
        const ex = sx + (sr(ri * 5 + 1) - 0.5) * w * 0.55;
        const ey = h * (0.25 + sr(ri * 5 + 2) * 0.74);
        const c1x = sx + (sr(ri * 5 + 3) - 0.5) * 70;
        const c1y = h * (0.10 + sr(ri * 5 + 4) * 0.09);
        const c2x = ex + (sr(ri * 5 + 5) - 0.5) * 50;
        const c2y = ey - h * 0.12;
        const thick = 1.4 + sr(ri * 5 + 6) * 2.2;
        // Warm tan — visible over dark tunnel floor (#0e0a06) and earthy chambers
        const alpha = 0.45 + sr(ri * 5 + 7) * 0.18;

        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
        ctx.strokeStyle = `rgba(95,58,22,${alpha.toFixed(3)})`;
        ctx.lineWidth = thick;
        ctx.stroke();

        // Lateral branches
        const BC = 2 + Math.floor(sr(ri * 5 + 8) * 4);
        for (let b = 0; b < BC; b++) {
            const t = 0.10 + sr(ri * 22 + b * 4) * 0.70;
            const bx = bezP(sx, c1x, c2x, ex, t);
            const by = bezP(0, c1y, c2y, ey, t);
            const bex = bx + (sr(ri * 22 + b * 4 + 1) - 0.5) * 48;
            const bey = by + sr(ri * 22 + b * 4 + 2) * 36;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx + (sr(ri * 22 + b * 4 + 3) - 0.5) * 20, by + 12, bex, bey);
            ctx.strokeStyle = `rgba(95,58,22,${(alpha * 0.6).toFixed(3)})`;
            ctx.lineWidth = thick * 0.45;
            ctx.stroke();
        }
    }
    ctx.restore();
}

// ── Pebble debris on the lower chamber floor ──────────────────────────────────
function drawChamberFloor(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number) {
    const N = 5 + Math.floor(r / 9);
    for (let i = 0; i < N; i++) {
        const ang = 0.08 * Math.PI + sr(seed * 91 + i * 7) * 0.84 * Math.PI;
        const d = r * (0.3 + sr(seed * 91 + i * 7 + 1) * 0.55);
        const px = cx + Math.cos(ang) * d;
        const py = cy + Math.sin(ang) * d;
        const pr = 1.3 + sr(seed * 91 + i * 7 + 2) * 2.6;
        const lv = sr(seed * 91 + i * 7 + 3);
        ctx.fillStyle = lv > 0.65 ? 'rgba(88,64,40,0.55)'
            : lv > 0.35   ? 'rgba(32,22,12,0.65)'
            :                'rgba(14,9,5,0.75)';
        ctx.beginPath();
        ctx.ellipse(px, py, pr,
            pr * (0.45 + sr(seed * 91 + i * 7 + 4) * 0.55),
            sr(seed * 91 + i * 7 + 5) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
export function renderNest(r: Renderer, world: World) {
    const ctx = r.nestCtx;
    const w = CONFIG.nestWidth;
    const h = CONFIG.nestHeight;

    // Base dark soil
    ctx.fillStyle = '#221611';
    ctx.fillRect(0, 0, w, h);

    // Depth gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0,   'rgba(0,0,0,0)');
    bg.addColorStop(0.7, 'rgba(0,0,0,0.18)');
    bg.addColorStop(1,   'rgba(0,0,0,0.45)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Structure cache
    if (!r.nestStructureCanvas || world.nest.nodes.length !== r.lastNodeCount) {
        r.lastNodeCount = world.nest.nodes.length;
        renderNestStructure(r, world);
    }
    ctx.drawImage(r.nestStructureCanvas, 0, 0);

    // Food piles
    const granaries = world.nest.getChambers('STORAGE');
    const piles = granaries.length > 0 ? granaries : [world.nest.getChamber('STORAGE')];
    if (piles[0]) {
        const sugarPer = world.sugarStockpile / piles.length;
        const proteinPer = world.proteinStockpile / piles.length;
        for (const g of piles) {
            drawFoodPile(g.x, g.y, g.radius, sugarPer, 'SUGAR', ctx);
            drawFoodPile(g.x, g.y, g.radius, proteinPer, 'PROTEIN', ctx);
        }
    }

    // Corpses
    for (const corpse of world.graveyard) {
        if ((corpse.colonyId ?? 0) === 0) drawFood(r, corpse);
    }

    // Dynamic entities
    drawQueen(r, world.queen, ctx);
    for (const b of world.brood) drawBrood(r, b, ctx);
    for (const ant of world.colonies[0].ants) {
        if (ant.location === 'NEST') drawAnt(r, ant, ctx);
    }

    // Particles
    if (world.nestParticles.length > 0) {
        ctx.save();
        for (const p of world.nestParticles) {
            ctx.globalAlpha = Math.max(0, p.life) * 0.6;
            ctx.fillStyle = p.color ?? '#b89a78';
            ctx.fillRect(p.x, p.y, 2, 2);
        }
        ctx.restore();
    }
}

export function renderNestStructure(r: Renderer, world: World) {
    const ctx = r.nestStructureCtx;
    const w = r.nestStructureCanvas.width;
    const h = r.nestStructureCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const useGrad = PerformanceManager.settings.gradients;

    // 1. Soil texture — permanent cache, never rebuilds on node count change
    ctx.drawImage(getSoilCanvas(w, h), 0, 0);

    // 2. Tunnel passages — simple ctx.arc() for speed (100+ nodes, organicArc too costly)
    //    Very dark floor makes tunnels distinct corridors between lighter chambers.
    for (const node of world.nest.nodes) {
        if (node.type !== 'TUNNEL') continue;

        // Earthy wall rim
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#261a0f';
        ctx.fill();

        // Tunnel interior — near-black so chambers stand out clearly
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0d0906';
        ctx.fill();
    }

    // 3. Chambers — organic shapes with high wobble (0.24) and fewer points (7)
    const chambers = world.nest.chambers;
    for (let ci = 0; ci < chambers.length; ci++) {
        const ch = chambers[ci];
        const seed = ch.x * 0.17 + ch.y * 0.11 + ci * 13.7;

        // Distinctly lighter chamber floors vs near-black tunnels
        let fc0 = '#5c3c20', fc1 = '#281a0e';
        let gcR = 160, gcG = 120, gcB = 70, ga = 0.06;
        switch (ch.type) {
            case 'QUEEN':
                fc0 = '#6a4020'; fc1 = '#2e1a08';
                gcR = 210; gcG = 130; gcB = 35; ga = 0.20; break;
            case 'BROOD':
                fc0 = '#5a3e28'; fc1 = '#22180a';
                gcR = 215; gcG = 175; gcB = 105; ga = 0.14; break;
            case 'STORAGE':
                fc0 = '#62481c'; fc1 = '#261a06';
                gcR = 225; gcG = 185; gcB = 65; ga = 0.16; break;
            case 'CEMETERY':
                fc0 = '#282220'; fc1 = '#10100e';
                gcR = 110; gcG = 125; gcB = 148; ga = 0.06; break;
        }

        // Deep shadow halo — large to separate chamber from surrounding soil
        ctx.save();
        if (PerformanceManager.settings.shadows) {
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 16;
        }
        organicArc(ctx, ch.x, ch.y, ch.radius + 9, seed + 3.1, 0.24, 7);
        ctx.fillStyle = '#080604';
        ctx.fill();
        ctx.restore();

        // Earthy wall rim — noticeably lighter than shadow, organic shape
        organicArc(ctx, ch.x, ch.y, ch.radius + 3.5, seed + 1.7, 0.22, 7);
        if (useGrad) {
            const rg = ctx.createRadialGradient(
                ch.x - ch.radius * 0.3, ch.y - ch.radius * 0.35, 0,
                ch.x, ch.y, ch.radius + 7);
            rg.addColorStop(0, '#a07858');
            rg.addColorStop(0.5, '#785848');
            rg.addColorStop(1, '#4a3020');
            ctx.fillStyle = rg;
        } else {
            ctx.fillStyle = '#785848';
        }
        ctx.fill();

        // Chamber floor — clearly lighter than tunnel #0d0906
        organicArc(ctx, ch.x, ch.y, ch.radius, seed, 0.24, 7);
        if (useGrad) {
            const fg = ctx.createRadialGradient(
                ch.x, ch.y - ch.radius * 0.2, ch.radius * 0.08,
                ch.x, ch.y, ch.radius * 1.15);
            fg.addColorStop(0, fc0);
            fg.addColorStop(0.65, '#3a2816');
            fg.addColorStop(1, fc1);
            ctx.fillStyle = fg;
        } else {
            ctx.fillStyle = fc0;
        }
        ctx.fill();

        // Role glow overlay
        if (useGrad && ga > 0.02) {
            organicArc(ctx, ch.x, ch.y, ch.radius, seed, 0.24, 7);
            const gg = ctx.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, ch.radius);
            gg.addColorStop(0, `rgba(${gcR},${gcG},${gcB},${ga})`);
            gg.addColorStop(0.6, `rgba(${gcR},${gcG},${gcB},${(ga * 0.3).toFixed(3)})`);
            gg.addColorStop(1, `rgba(${gcR},${gcG},${gcB},0)`);
            ctx.fillStyle = gg;
            ctx.fill();
        }

        // Floor debris pebbles
        drawChamberFloor(ctx, ch.x, ch.y, ch.radius, seed + 7.3);
    }

    // 4. Entrance light
    const ent = world.nest.entrances?.[0];
    if (ent) {
        const eg = ctx.createRadialGradient(ent.x, ent.y, 0, ent.x, ent.y, 65);
        eg.addColorStop(0,    'rgba(210,185,120,0.28)');
        eg.addColorStop(0.45, 'rgba(185,150,80,0.10)');
        eg.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, 65, 0, Math.PI * 2);
        ctx.fill();
    }

    // 5. Root network overlay — drawn LAST so it's visible over tunnels and chambers
    drawRootNetwork(ctx, w, h);
}

// ── Queen (unchanged) ─────────────────────────────────────────────────────────
export function drawQueen(r: Renderer, queen: any, ctx: CanvasRenderingContext2D) {
    if (!queen || queen.dead) return;
    ctx.save();
    ctx.translate(queen.x, queen.y);
    ctx.rotate(Math.sin(Date.now() * 0.001) * 0.05);

    const scale = 0.45;
    ctx.scale(scale, scale);

    drawShadow(r, 0, 0, 15, ctx);

    const body: string = queen.colony?.workerColor2D || '#7a4f2c';
    const legCol = darken(body, 0.55);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = legCol;
    ctx.lineWidth = 2;
    const qLegs: [number, number, number, number, number][] = [
        [-6, 15, -9, 20, -15],
        [ 0, 16,  1, 22,   2],
        [ 6, 14,  9, 19,  16],
    ];
    for (const [ay, kx, ky, fx, fy] of qLegs) {
        for (const s of [1, -1]) {
            ctx.beginPath();
            ctx.moveTo(4 * s, ay);
            ctx.lineTo(kx * s, ky);
            ctx.lineTo(fx * s, fy);
            ctx.stroke();
        }
    }

    const pulse = 1.0 + Math.sin(Date.now() * 0.002) * 0.02;
    const gcy = 26, grx = 14 * pulse, gry = 19 * pulse;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, gcy, grx, gry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= 4; i++) {
        const yy = gcy + (i - 2.5) * 8;
        const t = (yy - gcy) / gry;
        const rw = (13 * pulse) * Math.sqrt(Math.max(0, 1 - t * t));
        ctx.beginPath();
        ctx.moveTo(-rw, yy);
        ctx.quadraticCurveTo(0, yy + 2.5, rw, yy);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(-5, 20, 4, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 4, 3, 3, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -9, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(-4, -11, 1.8, 4, 0.3, 0, Math.PI * 2);
    ctx.ellipse(4, -11, 1.8, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, -21);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-2.5, -3, 2.5, 1.6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, -1.5, 1.6, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(4, -1.5, 1.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = legCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(-11, -3); ctx.lineTo(-14, -10);
    ctx.moveTo(5, 0); ctx.lineTo(11, -3); ctx.lineTo(14, -10);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
}

// ── Food pile ─────────────────────────────────────────────────────────────────
export function drawFoodPile(x: number, y: number, radius: number, amount: number, type: 'SUGAR' | 'PROTEIN', ctx: CanvasRenderingContext2D) {
    if (amount <= 0) return;
    const count = Math.min(200, Math.ceil(amount / 5));
    ctx.save();
    ctx.translate(x, y);

    const clusters = [
        { x: radius * 0.3, y: radius * 0.2 },
        { x: -radius * 0.3, y: radius * 0.3 },
        { x: 0, y: -radius * 0.3 }
    ];

    for (let i = 0; i < count; i++) {
        const cluster = clusters[i % clusters.length];
        const angle = (i * 137.508) % (Math.PI * 2);
        const dist = Math.abs(Math.sin(i * 12.9898)) * (radius * 0.4);
        const px = cluster.x + Math.cos(angle) * dist;
        const py = cluster.y + Math.sin(angle) * dist;
        const d = Math.sqrt(px * px + py * py);
        if (d > radius * 0.9) continue;

        if (type === 'SUGAR') {
            ctx.fillStyle = `rgba(255,180,20,${0.6 + (i % 5) * 0.1})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + (i % 3) * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = `rgba(200,100,100,${0.8 + (i % 3) * 0.1})`;
            ctx.beginPath();
            ctx.arc(px, py, 2 + (i % 2), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// ── Brood (improved) ──────────────────────────────────────────────────────────
export function drawBrood(r: Renderer, b: any, ctx: CanvasRenderingContext2D = r.nestCtx) {
    ctx.save();
    ctx.translate(b.x, b.y);

    // Stable tilt from resting position; zero while carried to avoid per-frame flicker.
    const seed = b.x * 17.3 + b.y * 31.7;
    const tilt = b.carrier ? 0 : (sr(seed) - 0.5) * 0.7;

    if (b.stage === 'EGG') {
        ctx.rotate(tilt);
        // Pearl-white teardrop
        ctx.fillStyle = 'rgba(245,242,235,0.95)';
        ctx.shadowColor = 'rgba(255,255,255,0.25)';
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0.4, 2.0, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Specular
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(-0.6, -0.9, 0.7, 1.2, 0.3, 0, Math.PI * 2);
        ctx.fill();

    } else if (b.stage === 'LARVA') {
        const growth = Math.min(b.age, 2000) / 500; // 0..4
        ctx.rotate(tilt);
        const segs = 5;
        const segR = 1.5 + growth * 0.35;
        const stride = segR * 1.6;

        for (let i = 0; i < segs; i++) {
            const t = i / (segs - 1);
            const px = (i - segs / 2) * stride;
            const py = Math.sin(t * Math.PI) * -3.5; // C-curve upward
            const sw = segR * (0.78 + Math.sin(t * Math.PI) * 0.38);
            const sh = sw * 0.66;
            const lum = Math.round(215 - t * 18);
            ctx.fillStyle = `rgba(${lum},${lum - 22},${lum - 38},0.92)`;
            ctx.beginPath();
            ctx.ellipse(px, py, sw, sh, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // Head nub — anchored to segment i=0 position (py=0 at t=0)
        const hx = -(segs / 2) * stride;
        const hy = -segR * 0.5;
        ctx.fillStyle = 'rgba(175,145,95,0.95)';
        ctx.beginPath();
        ctx.ellipse(hx, hy, segR * 0.8, segR * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();

    } else if (b.stage === 'PUPA') {
        ctx.rotate(tilt * 0.5);
        const pw = 3.5, ph = 5.5;

        // Amber casing
        ctx.fillStyle = 'rgba(178,148,95,0.92)';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, pw, ph, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner form outline
        ctx.strokeStyle = 'rgba(110,82,48,0.55)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, pw - 0.7, ph - 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Segmentation arcs
        ctx.strokeStyle = 'rgba(100,72,40,0.40)';
        ctx.lineWidth = 0.45;
        for (let i = 1; i <= 4; i++) {
            const sy = -ph + (i / 4.5) * ph * 1.8;
            const tt = sy / ph;
            const sw = pw * Math.sqrt(Math.max(0, 1 - tt * tt)) * 0.88;
            if (sw < 0.3) continue;
            ctx.beginPath();
            ctx.moveTo(-sw, sy);
            ctx.quadraticCurveTo(0, sy + 0.8, sw, sy);
            ctx.stroke();
        }

        // Chitin highlight
        ctx.fillStyle = 'rgba(230,210,170,0.28)';
        ctx.beginPath();
        ctx.ellipse(-pw * 0.28, -ph * 0.22, pw * 0.22, ph * 0.28, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}
