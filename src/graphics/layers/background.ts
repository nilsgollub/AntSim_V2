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

const CLOCK_ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] as const;

export function drawClockStone(r: Renderer, x: number, y: number, timeOfDay: number) {
    const ctx = r.ctx;
    const radius = CONFIG.clock.radius;
    ctx.save();
    ctx.translate(x, y);

    // Contact shadow
    drawShadow(r, 0, 0, radius, ctx);

    // Stone body — deterministic wobble seeded by position
    const seed = (x * 7 + y * 13) | 0;
    const verts = 18;
    ctx.beginPath();
    for (let i = 0; i < verts; i++) {
        const a = (i / verts) * Math.PI * 2;
        const wobble = radius * (0.88 + 0.13 * Math.abs(Math.sin(seed + i * 97.3)));
        const vx = Math.cos(a) * wobble;
        const vy = Math.sin(a) * wobble;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
    }
    ctx.closePath();

    const stoneGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.05, 0, 0, radius);
    stoneGrad.addColorStop(0, '#9c9a96');
    stoneGrad.addColorStop(0.55, '#6a6865');
    stoneGrad.addColorStop(1, '#2c2c2a');
    ctx.fillStyle = stoneGrad;
    ctx.fill();

    // Stone surface specks
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 14; i++) {
        const sx = Math.sin(seed * (i + 1) * 12.7) * radius * 0.82;
        const sy = Math.cos(seed * (i + 1) * 31.4) * radius * 0.82;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)';
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.09 + (i % 4) * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = '#1a1a18';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Clock face (inset circle)
    const faceR = radius * 0.73;
    ctx.beginPath();
    ctx.arc(0, 0, faceR, 0, Math.PI * 2);
    const faceGrad = ctx.createRadialGradient(-faceR * 0.18, -faceR * 0.22, 1, 0, 0, faceR);
    faceGrad.addColorStop(0, '#1e1c18');
    faceGrad.addColorStop(1, '#0b0a08');
    ctx.fillStyle = faceGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,162,95,0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hour tick marks
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const isHour = i % 3 === 0;
        ctx.strokeStyle = isHour ? 'rgba(215,192,118,0.9)' : 'rgba(180,158,90,0.6)';
        ctx.lineWidth = isHour ? 1.8 : 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * faceR * (isHour ? 0.77 : 0.85), Math.sin(a) * faceR * (isHour ? 0.77 : 0.85));
        ctx.lineTo(Math.cos(a) * faceR * 0.93, Math.sin(a) * faceR * 0.93);
        ctx.stroke();
    }

    // Roman numerals
    const fontSize = CONFIG.clock.fontSize;
    ctx.font = `bold ${fontSize}px ${CONFIG.clock.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(218,196,126,0.92)';
    const numR = faceR * 0.63;
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(CLOCK_ROMAN[i], Math.cos(a) * numR, Math.sin(a) * numR);
    }

    // Hands — timeOfDay 0..1 = one full 24-hour day
    // Hour hand makes 2 full revolutions per day on a 12-hour face
    const hourAngle  = timeOfDay * 4 * Math.PI - Math.PI / 2;
    // Minute hand makes 24 full revolutions per day
    const minuteAngle = timeOfDay * 48 * Math.PI - Math.PI / 2;

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(212,190,115,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(hourAngle) * faceR * 0.46, Math.sin(hourAngle) * faceR * 0.46);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(232,218,158,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(minuteAngle) * faceR * 0.68, Math.sin(minuteAngle) * faceR * 0.68);
    ctx.stroke();

    // Centre pivot
    ctx.fillStyle = 'rgba(225,205,130,1)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

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

