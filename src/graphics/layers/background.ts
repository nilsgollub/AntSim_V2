// Static world decoration: soil texture, grass tufts, rocks, nest entrance.
// Free functions over the Renderer instance (same pattern as simulation/antStates.ts).
import { CONFIG } from '../../config';
import { PerformanceManager } from '../../PerformanceManager';
import type { Renderer } from '../Renderer';
import { drawShadow } from './entities';

export function initGrassSprites(r: Renderer) {
    // Per-tuft palettes: lush greens through dry, yellow-olive clumps so the field
    // reads as a varied meadow rather than one flat green.
    const GRASS_PALETTES: [string, string][] = [
        ['#1d3a18', '#5aa048'], // lush
        ['#21401b', '#6fb255'], // bright
        ['#2a3a15', '#869a3a'], // olive
        ['#3a3817', '#a59a45'], // dry / yellowed
        ['#24351a', '#7fae50'],
    ];
    r.grassSprites = [];
    for (let v = 0; v < 8; v++) { // 8 variations
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d')!;
        ctx.translate(32, 60); // root at bottom-centre
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Soft grounding shadow so the tuft sits IN the ground, not on it.
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath(); ctx.ellipse(0, 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

        const pal = GRASS_PALETTES[v % GRASS_PALETTES.length];
        const bladeCount = 6 + Math.floor(Math.random() * 5);
        for (let i = 0; i < bladeCount; i++) {
            const t = bladeCount <= 1 ? 0.5 : i / (bladeCount - 1); // 0..1 across the fan
            const baseAngle = (t - 0.5) * 1.0 + (Math.random() - 0.5) * 0.18;
            const curl = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6); // L or R
            const h = 30 + Math.random() * 16;
            const w = 0.9 + Math.random() * 1.0; // half-width at base
            const tipx = curl * 7;

            ctx.save();
            ctx.rotate(baseAngle);
            const grad = ctx.createLinearGradient(0, 0, 0, -h);
            grad.addColorStop(0, pal[0]);
            grad.addColorStop(1, pal[1]);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-w, 0);
            ctx.quadraticCurveTo(curl * 5, -h * 0.55, tipx, -h); // up to the tip
            ctx.quadraticCurveTo(curl * 5, -h * 0.55, w, 0);     // back down, tapering
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // One variant in four carries a short seed head (wheat-like) for accent.
        if (v % 4 === 0) {
            ctx.save();
            ctx.rotate((Math.random() - 0.5) * 0.25);
            const sh = 30 + Math.random() * 6; // shorter stalk so it reads as grass, not straw
            ctx.strokeStyle = '#8f8348';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -sh); ctx.stroke();
            ctx.fillStyle = '#c9b25a'; // tan grain head
            for (let k = 0; k < 4; k++) {
                const gy = -sh + 2 + k * 2.1;
                ctx.beginPath(); ctx.ellipse(-1.1, gy, 1.0, 1.6, 0.4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(1.1, gy, 1.0, 1.6, -0.4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        r.grassSprites.push(c);
    }
}

export function generateBackground(r: Renderer) {
    const ctx = r.bgCanvas.getContext('2d')!;
    const w = r.bgCanvas.width;
    const h = r.bgCanvas.height;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(arr: T[]) => arr[(Math.random() * arr.length) | 0];

    // Warm earth base (matches the Messor-brown ants) instead of cold grey asphalt.
    ctx.fillStyle = '#46341f';
    ctx.fillRect(0, 0, w, h);

    // Large soft tonal zones — gentle lighter/darker soil patches for depth.
    const zones = (w * h) / 60000;
    for (let i = 0; i < zones; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = rnd(80, 200);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const light = Math.random() < 0.5;
        g.addColorStop(0, light ? 'rgba(104,80,48,0.30)' : 'rgba(22,14,7,0.30)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Medium earthy speckles (grains of soil, light + dark).
    const speckles = (w * h) / 350;
    for (let i = 0; i < speckles; i++) {
        const x = Math.random() * w, y = Math.random() * h, s = rnd(1, 2.5);
        ctx.fillStyle = pick(['rgba(74,58,36,0.5)', 'rgba(26,18,10,0.5)', 'rgba(92,72,44,0.35)']);
        ctx.fillRect(x, y, s, s);
    }
    // Fine grain dusting.
    const grain = (w * h) / 150;
    for (let i = 0; i < grain; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,238,205,0.05)' : 'rgba(0,0,0,0.10)';
        ctx.fillRect(x, y, 1, 1);
    }

    // Thin wandering cracks in the dried earth.
    const cracks = (w * h) / 80000;
    for (let i = 0; i < cracks; i++) {
        let x = Math.random() * w, y = Math.random() * h;
        let a = Math.random() * Math.PI * 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = rnd(0.6, 1.2);
        ctx.beginPath(); ctx.moveTo(x, y);
        const segs = 3 + ((Math.random() * 4) | 0);
        for (let k = 0; k < segs; k++) {
            a += rnd(-0.6, 0.6); const len = rnd(8, 22);
            x += Math.cos(a) * len; y += Math.sin(a) * len;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Scattered pebbles — stones that clearly dwarf an ant (ants are ~6px), each
    // with a contact shadow + highlight so it sits in the soil.
    const pebbles = (w * h) / 20000;
    for (let i = 0; i < pebbles; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = rnd(5, 12);
        const ar = rnd(0.6, 0.85);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(x + r * 0.22, y + r * 0.28, r, r * ar, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pick(['#5a5048', '#6b5d4a', '#4a4038', '#7a6b56', '#574b40']);
        ctx.beginPath(); ctx.ellipse(x, y, r, r * ar, rnd(0, 3), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.32, r * 0.4, r * 0.24, rnd(0, 3), 0, Math.PI * 2); ctx.fill();
    }

    // Fallen leaves — pointed almond shapes several ant-lengths long, with midrib + stem.
    const leaves = (w * h) / 52000;
    for (let i = 0; i < leaves; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rnd(0, Math.PI * 2));
        const ll = rnd(9, 18); // half-length
        ctx.fillStyle = pick(['#6e3b1e', '#7a4a22', '#5a3318', '#824e26', '#8a5a2a', '#7c5a2e']);
        ctx.beginPath();
        ctx.moveTo(-ll, 0);
        ctx.quadraticCurveTo(0, -ll * 0.42, ll, 0);
        ctx.quadraticCurveTo(0, ll * 0.42, -ll, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(-ll * 0.85, 0); ctx.lineTo(ll, 0); ctx.stroke();          // midrib
        ctx.beginPath(); ctx.moveTo(-ll, 0); ctx.lineTo(-ll - rnd(2, 5), rnd(-2, 2)); ctx.stroke(); // stem
        ctx.restore();
    }

    // Twigs — long forked sticks (a fallen branchlet dwarfs an ant).
    const twigs = (w * h) / 78000;
    for (let i = 0; i < twigs; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rnd(0, Math.PI * 2));
        ctx.strokeStyle = pick(['#4a3522', '#3e2c1c', '#564028']); ctx.lineWidth = rnd(1.4, 2.6); ctx.lineCap = 'round';
        const tl = rnd(16, 32);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tl, 0);
        ctx.moveTo(tl * 0.55, 0); ctx.lineTo(tl * 0.8, -rnd(4, 8));   // fork up
        ctx.moveTo(tl * 0.75, 0); ctx.lineTo(tl * 0.95, rnd(3, 6));   // fork down
        ctx.stroke();
        ctx.restore();
    }

    // Wildflowers — small but clearly bigger than an ant; a dab of colour for life.
    const flowers = (w * h) / 110000;
    for (let i = 0; i < flowers; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const petal = pick(['#e8e0d0', '#e6c84a', '#c79ad8', '#e88aa0', '#dfe0e8']);
        const pr = rnd(2.0, 3.0), off = pr * 1.4;
        ctx.fillStyle = petal;
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + Math.random() * 0.3;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * off, y + Math.sin(a) * off, pr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#d8a818'; // centre
        ctx.beginPath(); ctx.arc(x, y, pr * 0.8, 0, Math.PI * 2); ctx.fill();
    }
}

export function drawRock(r: Renderer, x: number, y: number, radius: number) {
    const ctx = r.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    drawShadow(r, 0, 0, radius, ctx);

    const seed = Math.floor(x * y);
    const vertices = 12;

    // 1. Draw the Rock Shape
    ctx.beginPath();
    for (let i = 0; i < vertices; i++) {
        const angle = (i / vertices) * Math.PI * 2;
        const r = radius * (0.8 + 0.4 * Math.abs(Math.sin(seed + i * 132.1)));
        const vx = Math.cos(angle) * r;
        const vy = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
    }
    ctx.closePath();

    // 2. Base Gradient (3D look)
    const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
    grad.addColorStop(0, '#888'); // Lighter highlight
    grad.addColorStop(1, '#333'); // Darker shadow
    ctx.fillStyle = grad;
    ctx.fill();

    // 3. Texture (Cracks/Specks)
    ctx.save();
    ctx.clip(); // Clip to rock shape

    // Random specks
    for (let i = 0; i < 5; i++) {
        const rx = (Math.sin(seed * (i + 1) * 12.3) * radius * 0.8);
        const ry = (Math.cos(seed * (i + 1) * 45.6) * radius * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(rx, ry, radius * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }

    // 4. Moss (Vegetation) - On some rocks
    if (seed % 3 === 0) {
        const mx = -radius * 0.3;
        const my = -radius * 0.3;
        const mossGrad = ctx.createRadialGradient(mx, my, 0, mx, my, radius * 0.6);
        mossGrad.addColorStop(0, 'rgba(100, 200, 100, 0.6)');
        mossGrad.addColorStop(1, 'rgba(50, 100, 50, 0)');
        ctx.fillStyle = mossGrad;
        ctx.beginPath();
        ctx.arc(mx, my, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore(); // End clip

    // Outline
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

export function drawEntrance(r: Renderer) {
    const isLandscape = CONFIG.width > CONFIG.height;
    const entranceX = isLandscape ? CONFIG.width - 15 : r.width / 2;
    const entranceY = isLandscape ? r.height / 2 : CONFIG.height - 15;
    const moundGrad = r.ctx.createRadialGradient(entranceX, entranceY, 10, entranceX, entranceY, 40);
    moundGrad.addColorStop(0, '#3a2a1a');
    moundGrad.addColorStop(1, 'rgba(58, 42, 26, 0)');
    r.ctx.fillStyle = moundGrad;
    r.ctx.beginPath();
    r.ctx.arc(entranceX, entranceY, 40, 0, Math.PI * 2);
    r.ctx.fill();
    r.ctx.fillStyle = '#050505';
    r.ctx.beginPath();
    if (isLandscape) r.ctx.ellipse(entranceX + 5, entranceY, 15, 25, 0, 0, Math.PI * 2);
    else r.ctx.ellipse(entranceX, entranceY + 5, 25, 15, 0, 0, Math.PI * 2);
    r.ctx.fill();
}

// ── Clock stone (horizontal stone tablet with live LED clock) ────────────────
// Static parts baked once into an offscreen canvas; only the time text redraws.
let _clockStoneCache: HTMLCanvasElement | null = null;
// Stone is a wide horizontal slab whose shape follows the display recess.
// All measurements relative to CONFIG.clock.radius so a single config change
// rescales everything consistently.
const _SW = 1.08;   // stone half-width  = radius × SW
const _SH = 0.60;   // stone half-height = radius × SH
const _CLOCK_PAD = 22;

function buildClockStoneCache(_r: Renderer, x: number, y: number): HTMLCanvasElement {
    const radius  = CONFIG.clock.radius;
    const sw      = (radius * _SW) | 0;    // stone half-width  px
    const sh      = (radius * _SH) | 0;    // stone half-height px
    const cornerR = 18;

    const offscreen = document.createElement('canvas');
    offscreen.width  = (sw + _CLOCK_PAD) * 2;
    offscreen.height = (sh + _CLOCK_PAD) * 2;
    const c = offscreen.getContext('2d')!;
    c.translate(sw + _CLOCK_PAD, sh + _CLOCK_PAD); // origin at stone centre

    // ── Drop shadow ──
    c.save();
    c.shadowColor   = 'rgba(0,0,0,0.70)';
    c.shadowBlur    = 20;
    c.shadowOffsetX = 5;
    c.shadowOffsetY = 9;
    c.beginPath();
    (c as any).roundRect(-sw, -sh, sw * 2, sh * 2, cornerR);
    c.fillStyle = '#000';
    c.fill();
    c.restore();

    // ── Stone body (rounded-rect slab, granite gradient) ──
    c.beginPath();
    (c as any).roundRect(-sw, -sh, sw * 2, sh * 2, cornerR);
    const stoneGrad = c.createLinearGradient(-sw * 0.55, -sh, sw * 0.45, sh);
    stoneGrad.addColorStop(0,    '#c4bfb8');
    stoneGrad.addColorStop(0.22, '#9c9890');
    stoneGrad.addColorStop(0.55, '#686460');
    stoneGrad.addColorStop(1,    '#2e2c2a');
    c.fillStyle = stoneGrad;
    c.fill();

    // ── Surface texture clipped to stone shape ──
    c.save();
    c.clip();

    const seed = (x * 7 + y * 13) | 0;

    // Weathering speckles
    for (let i = 0; i < 32; i++) {
        const sx = Math.sin(seed * (i + 1) * 12.7) * sw * 0.88;
        const sy = Math.cos(seed * (i + 1) * 31.4) * sh * 0.82;
        c.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.13)';
        c.beginPath();
        c.arc(sx, sy, 1.8 + (i % 5) * 1.1, 0, Math.PI * 2);
        c.fill();
    }

    // Horizontal slate grain lines
    c.strokeStyle = 'rgba(0,0,0,0.09)';
    c.lineWidth   = 0.8;
    for (let i = -4; i <= 4; i++) {
        const gy = i * sh * 0.22;
        const jitter = ((seed + i * 7) % 5) - 2;
        c.beginPath();
        c.moveTo(-sw * 0.92, gy);
        c.lineTo( sw * 0.92, gy + jitter);
        c.stroke();
    }

    // Moss patch — top-left corner (north-facing, stays damp)
    const mx = -sw * 0.32, my = -sh * 0.45;
    const mossGrad = c.createRadialGradient(mx, my, 0, mx, my, sw * 0.40);
    mossGrad.addColorStop(0,   'rgba(64,118,52,0.55)');
    mossGrad.addColorStop(0.5, 'rgba(40,82,32,0.25)');
    mossGrad.addColorStop(1,   'rgba(0,0,0,0)');
    c.fillStyle = mossGrad;
    c.beginPath();
    c.arc(mx, my, sw * 0.40, 0, Math.PI * 2);
    c.fill();

    // A couple of lichen spots
    for (let i = 0; i < 4; i++) {
        const lx = Math.sin(seed * (i + 3) * 8.1) * sw * 0.60;
        const ly = Math.cos(seed * (i + 3) * 19.7) * sh * 0.60;
        c.fillStyle = `rgba(${96 + i * 10},${152 + i * 8},${72 + i * 5},0.22)`;
        c.beginPath();
        c.arc(lx, ly, 3 + i * 1.4, 0, Math.PI * 2);
        c.fill();
    }

    c.restore();

    // ── Stone edge — bevel highlight then dark outer stroke ──
    c.beginPath();
    (c as any).roundRect(-sw, -sh, sw * 2, sh * 2, cornerR);
    c.strokeStyle = 'rgba(215,205,188,0.42)';
    c.lineWidth   = 3;
    c.stroke();
    c.strokeStyle = 'rgba(8,6,4,0.90)';
    c.lineWidth   = 1.5;
    c.stroke();

    // ── Carved display recess ──
    const faceW      = radius * 0.82;
    const faceH      = radius * 0.34;
    const faceCorner = 11;
    c.beginPath();
    (c as any).roundRect(-faceW, -faceH, faceW * 2, faceH * 2, faceCorner);

    // Engraved background: dark top, slightly lighter bottom (depth illusion)
    const faceGrad = c.createLinearGradient(0, -faceH, 0, faceH);
    faceGrad.addColorStop(0,   '#080a08');
    faceGrad.addColorStop(0.5, '#0d100c');
    faceGrad.addColorStop(1,   '#060806');
    c.fillStyle = faceGrad;
    c.fill();

    // Subtle dot-matrix grid (LED panel look)
    c.save();
    c.clip();
    const dotStep = 6;
    for (let dy = -faceH + 4; dy < faceH; dy += dotStep) {
        for (let dx = -faceW + 4; dx < faceW; dx += dotStep) {
            c.fillStyle = 'rgba(0,45,0,0.32)';
            c.fillRect(dx, dy, 1.8, 1.8);
        }
    }
    c.restore();

    // Inset bevel: dark top-left edge (chiselled into stone)
    c.strokeStyle = 'rgba(0,0,0,0.78)';
    c.lineWidth   = 3.5;
    c.stroke();
    // Faint green ambient from the LED screen bleeding onto the bezel
    c.strokeStyle = 'rgba(50,170,50,0.20)';
    c.lineWidth   = 1;
    c.stroke();

    return offscreen;
}

export function drawClockStone(r: Renderer, x: number, y: number) {
    const ctx    = r.ctx;
    const radius = CONFIG.clock.radius;
    const sw     = (radius * _SW) | 0;
    const sh     = (radius * _SH) | 0;

    if (!_clockStoneCache) _clockStoneCache = buildClockStoneCache(r, x, y);

    ctx.save();
    ctx.translate(x, y);

    ctx.drawImage(_clockStoneCache, -(sw + _CLOCK_PAD), -(sh + _CLOCK_PAD));

    // ── Live 24 h digital time — only dynamic part ──
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    ctx.font         = `bold ${CONFIG.clock.fontSize}px ${CONFIG.clock.font}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Phosphor-green glow — outer halo then crisp text on top
    ctx.shadowColor  = 'rgba(60,200,60,0.90)';
    ctx.shadowBlur   = 14;
    ctx.fillStyle    = 'rgba(80,220,80,0.55)';
    ctx.fillText(`${hh}:${mm}`, 0, 0);
    ctx.shadowBlur   = 6;
    ctx.fillStyle    = 'rgba(152,238,152,0.98)';
    ctx.fillText(`${hh}:${mm}`, 0, 0);
    ctx.shadowBlur   = 0;

    ctx.restore();
}

export function drawGrass(r: Renderer, g: any) {
    // Optimized: Use Cached Sprite
    const ctx = r.ctx;

    // Pick variation deterministically
    const variant = Math.floor(g.x + g.y) % r.grassSprites.length;
    const sprite = r.grassSprites[variant];

    ctx.save();
    ctx.translate(g.x, g.y);
    // Keep tufts mostly upright (grass grows up); g.angle only gives a gentle lean,
    // so seed heads/blades don't lie sideways like scattered straw.
    ctx.rotate((g.angle - Math.PI) * 0.12);

    // Scale
    const s = g.size * 0.3; // Adjust scale to match sprite size
    ctx.scale(s, s);

    // Simple sway for HIGH/ULTRA only
    if (PerformanceManager.settings.grassAnimation) {
        const sway = Math.sin(Date.now() * 0.002 + g.x * 0.01) * 0.1;
        ctx.rotate(sway);
    }

    ctx.drawImage(sprite, -32, -60); // root at bottom-centre (64×64 sprite)
    ctx.restore();
}

