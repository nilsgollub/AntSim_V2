// Nest panel: chamber structure, queen, brood, food piles, colony-0 interior.
import { CONFIG } from '../../config';
import { PerformanceManager } from '../../PerformanceManager';
import type { World } from '../../simulation/World';
import type { Renderer } from '../Renderer';
import { darken, drawAnt, drawFood, drawShadow } from './entities';

export function renderNest(r: Renderer, world: World) {
    const ctx = r.nestCtx;
    const w = CONFIG.nestWidth;
    const h = CONFIG.nestHeight;

    // Clear with Dark Soil Background
    ctx.fillStyle = '#2e231d'; // Dark Earth
    ctx.fillRect(0, 0, w, h);

    // Gradient for depth
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 1. Structure (Cached)
    // Ensure cache exists and check dirty state
    if (!r.nestStructureCanvas || world.nest.nodes.length !== r.lastNodeCount) {
        r.lastNodeCount = world.nest.nodes.length;
        renderNestStructure(r, world);
    }
    ctx.drawImage(r.nestStructureCanvas, 0, 0);

    // Nest pheromones are intentionally NOT drawn: in the cramped nest the
    // overlay becomes a dense, muddy blob. The nestGrid still drives ant
    // navigation underground — only its visualisation is suppressed.

    // Draw Food Piles BEFORE ants so ants walk ON TOP. The stockpile is shown
    // split evenly across every granary, so a multi-chamber nest shows food in
    // each storage room rather than one giant heap.
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

    // Interred corpses resting in the graveyard chamber(s). The nest panel shows
    // colony 0, so only draw its own dead — a rival's interred corpses carry their
    // colony's nest-local coords and would otherwise appear as phantom crumbs here.
    for (const corpse of world.graveyard) {
        if ((corpse.colonyId ?? 0) === 0) drawFood(r, corpse);
    }

    // Draw Dynamic Entities
    drawQueen(r, world.queen, ctx);

    for (const b of world.brood) {
        drawBrood(r, b, ctx);
    }

    // Nest interior shows colony 0 (the single nest canvas can't hold two nests
    // at the same nest-local coords — rival nest rendering is a later step).
    for (const ant of world.colonies[0].ants) {
        if (ant.location === 'NEST') drawAnt(r, ant, ctx);
    }

    // Excavation dust
    if (world.nestParticles.length > 0) {
        ctx.save();
        for (const p of world.nestParticles) {
            ctx.globalAlpha = Math.max(0, p.life) * 0.6;
            ctx.fillStyle = '#b89a78';
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

    // 1. Wall Cut (The "rim" of the tunnel - Rough hewn earth)
    ctx.strokeStyle = '#6b5b4e'; // Earthy Rim

    if (PerformanceManager.settings.shadows) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
    } else {
        ctx.shadowBlur = 0;
    }

    ctx.lineWidth = 10; // Thicker rim for depth
    for (const node of world.nest.nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.shadowBlur = 0; // Reset

    // 2. Chamber Floor (Depth - Deep Shadow at edges)
    // 2. Chamber Floor (Depth - Deep Shadow at edges)
    for (const node of world.nest.nodes) {
        if (PerformanceManager.settings.gradients) {
            const grad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.1, node.x, node.y, node.radius * 1.1);
            grad.addColorStop(0, '#5a4a3a'); // Lit Floor (Center)
            grad.addColorStop(0.7, '#3e3228'); // Standard Floor
            grad.addColorStop(1, '#1a140f'); // Deep Walls (Edge)
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = '#3e3228'; // Flat Standard Floor
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function drawQueen(r: Renderer, queen: any, ctx: CanvasRenderingContext2D) {
    if (queen.dead) return; // a starved-out colony's queen is gone
    ctx.save();
    ctx.translate(queen.x, queen.y);
    ctx.rotate(Math.sin(Date.now() * 0.001) * 0.05);

    // Scale down to be less massive (0.45x previous size)
    const scale = 0.45;
    ctx.scale(scale, scale);

    // Shadow
    drawShadow(r, 0, 0, 15, ctx);

    // Same family as the new ants: colony body colour (own warm brown / rival amber)
    // with a red head like the soldiers (Messor barbarus). She faces "up" (-y) here.
    const body: string = queen.colony?.workerColor2D || '#7a4f2c';
    const legCol = darken(body, 0.55);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Legs — jointed (attach → knee → foot), STATIC resting pose. She just sits and
    // lays, so no walk cycle: front pair reaches forward, mid splays out, rear angles back.
    ctx.strokeStyle = legCol;
    ctx.lineWidth = 2;
    const qLegs: [number, number, number, number, number][] = [
        [-6, 15, -9, 20, -15],   // front: reach forward
        [ 0, 16,  1, 22,   2],   // mid: straight out
        [ 6, 14,  9, 19,  16],   // rear: angle back
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

    // Abdomen (physogastric — swollen with eggs); a gentle breathing pulse only.
    const pulse = 1.0 + Math.sin(Date.now() * 0.002) * 0.02;
    const gcy = 26, grx = 14 * pulse, gry = 19 * pulse;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, gcy, grx, gry, 0, 0, Math.PI * 2); ctx.fill();
    // Segment bands — thin curved arcs following the gaster's curve.
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
    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(-5, 20, 4, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Petiole — thin wasp waist pinching the gaster off from the thorax.
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 4, 3, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Thorax (humped mesosoma) + faint wing scars (queens shed their wings).
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -9, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(-4, -11, 1.8, 4, 0.3, 0, Math.PI * 2);
    ctx.ellipse(4, -11, 1.8, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Head — rounded, colony body colour (no red); eyes + geniculate antennae.
    ctx.save();
    ctx.translate(0, -21);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; // chitin highlight
    ctx.beginPath(); ctx.ellipse(-2.5, -3, 2.5, 1.6, -0.5, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, -1.5, 1.6, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(4, -1.5, 1.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Antennae — scape ~90° out to the side, then funiculus bends forward (up).
    ctx.strokeStyle = legCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(-11, -3); ctx.lineTo(-14, -10);
    ctx.moveTo(5, 0); ctx.lineTo(11, -3); ctx.lineTo(14, -10);
    ctx.stroke();
    ctx.restore(); // End Head transform

    ctx.restore(); // End Queen transform
}

export function drawFoodPile(x: number, y: number, radius: number, amount: number, type: 'SUGAR' | 'PROTEIN', ctx: CanvasRenderingContext2D) {
    if (amount <= 0) return;

    const count = Math.min(200, Math.ceil(amount / 5));

    ctx.save();
    ctx.translate(x, y);

    // Define 3 cluster centers relative to (0,0)
    const clusters = [
        { x: radius * 0.3, y: radius * 0.2 },
        { x: -radius * 0.3, y: radius * 0.3 },
        { x: 0, y: -radius * 0.3 }
    ];

    for (let i = 0; i < count; i++) {
        // Deterministic random positions based on index i
        const cluster = clusters[i % clusters.length];

        // Organic Polar Coordinates for circular distribution
        // Use prime numbers for pseudo-randomness to avoid patterns
        const angle = (i * 137.508) % (Math.PI * 2); // Golden angle approximation
        // Sqrt for uniform distribution, but we want center-bias for a pile, so linear or squared is fine.
        // Let's use a mix to keep it dense in center but spreading out.
        const distFactor = Math.abs(Math.sin(i * 12.9898));
        const dist = distFactor * (radius * 0.4); // Keep within 40% of radius per cluster

        const offsetX = Math.cos(angle) * dist;
        const offsetY = Math.sin(angle) * dist;

        const px = cluster.x + offsetX;
        const py = cluster.y + offsetY;

        // Keep within bounds strictly
        const d = Math.sqrt(px * px + py * py);
        if (d > radius * 0.9) continue;

        if (type === 'SUGAR') {
            // Honey Drops - Golden/Amber
            ctx.fillStyle = `rgba(255, 180, 20, ${0.6 + (i % 5) * 0.1})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + (i % 3) * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Meat chunks
            ctx.fillStyle = `rgba(200, 100, 100, ${0.8 + (i % 3) * 0.1})`;
            ctx.beginPath();
            ctx.arc(px, py, 2 + (i % 2), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

export function drawBrood(r: Renderer, b: any, ctx: CanvasRenderingContext2D = r.nestCtx) {
    ctx.save();
    ctx.translate(b.x, b.y);

    if (b.stage === 'EGG') {
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(0, 0, 2, 1.5, Math.random(), 0, Math.PI * 2);
        ctx.fill();
    } else if (b.stage === 'LARVA') {
        ctx.fillStyle = '#EEE';
        ctx.beginPath();
        const growth = Math.min(b.age, 2000) / 500;
        ctx.ellipse(0, 0, 3 + growth, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Segments
        ctx.strokeStyle = '#CCC';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-1, -1); ctx.lineTo(-1, 1);
        ctx.moveTo(1, -1); ctx.lineTo(1, 1);
        ctx.stroke();
    } else if (b.stage === 'PUPA') {
        ctx.fillStyle = '#D2B48C'; // Tan
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    ctx.restore();
}
