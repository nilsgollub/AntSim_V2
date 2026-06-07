import { Application, Container, Sprite, Texture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import type { World } from '../simulation/World';
import type { Camera } from './Camera';
import type { Renderer } from './Renderer';

// ── Baked textures (drawn once to small canvases, then batched as sprites) ──
// Realistic ant matching the canvas-2D look: 3 body segments, 6 legs, antennae.
// Drawn in natural colours and shown untinted (no state/cargo recolouring).
function bakeAnt(type: 'WORKER' | 'SOLDIER', phase: number, enemy = false): Texture {
    const SS = 2; // supersample for crispness
    const c = document.createElement('canvas');
    c.width = 30 * SS; c.height = 30 * SS;
    const ctx = c.getContext('2d')!;
    ctx.scale(SS, SS);
    ctx.translate(15, 15);
    ctx.lineCap = 'round';

    // Legs — 6 jointed (attach → knee → foot), 3 per side; `phase` swings them fore-aft
    // for a tripod walk cycle. Front pair reaches forward beside the head, rear angles back.
    ctx.strokeStyle = enemy ? '#4a443a' : (type === 'SOLDIER' ? '#2a1410' : '#707070');
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
            ctx.moveTo(ax, 0.5 * s);
            ctx.lineTo(kx + sw, ky * s);
            ctx.lineTo(fx + sw * 1.4, fy * s);
            ctx.stroke();
            li++;
        }
    }

    if (type === 'SOLDIER') {
        // Big-headed Pheidole major, matching the 2D nest renderer (drawAnt) shape so a
        // soldier looks identical outside (this baked texture) and inside the nest.
        // Palette: us = dark red; rival = a naturally dark charcoal-brown ant (clearly
        // darker, no inked outline — reads as a different species, not a sticker).
        const pal = enemy
            ? { abdomen: '#241f19', stripe: '#332d24', thorax: '#2a241c', head: '#38322a', mand: '#5c564a' }
            : { abdomen: '#4a0404', stripe: '#8b0000', thorax: '#4b0000', head: '#900000', mand: '#221100' };
        // Abdomen (armoured, striped)
        ctx.fillStyle = pal.abdomen;
        ctx.beginPath(); ctx.ellipse(-6, 0, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill(); // slimmer
        ctx.fillStyle = pal.stripe;
        ctx.fillRect(-7.5, -1.3, 1, 2.6); ctx.fillRect(-5.5, -1.6, 1, 3.2);
        // Thorax (muscular)
        ctx.fillStyle = pal.thorax;
        ctx.beginPath(); ctx.ellipse(-1, 0, 2.5, 1.75, 0, 0, Math.PI * 2); ctx.fill(); // slimmer
        // Head — massive rounded-square / heart shape (the big-headed look)
        ctx.fillStyle = pal.head;
        ctx.beginPath();
        ctx.moveTo(1, -4.5);
        ctx.lineTo(6, -4.5);
        ctx.quadraticCurveTo(8, -4.5, 8, 0);
        ctx.quadraticCurveTo(8, 4.5, 6, 4.5);
        ctx.lineTo(1, 4.5);
        ctx.quadraticCurveTo(0, 0, 1, -4.5);
        ctx.fill();
        // Head armour highlight (shiny chitin)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(4, -2, 1.5, 1, -0.5, 0, Math.PI * 2); ctx.fill();
        // Mandibles (massive, crushing)
        ctx.strokeStyle = pal.mand; ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(7, 3.0); ctx.quadraticCurveTo(10, 3.0, 11, 0.5);
        ctx.moveTo(7, -3.0); ctx.quadraticCurveTo(10, -3.0, 11, -0.5);
        ctx.stroke();
    } else {
        // Worker — three clear segments matching the top-down reference: big rounded head
        // with eyes, narrow waisted thorax, and a large banded gaster, plus geniculate
        // antennae. Light greys → multiply-tinted to the colony colour at draw time.
        // Gaster (abdomen) + a faint segment band
        ctx.fillStyle = '#c2c2c2';
        ctx.beginPath(); ctx.ellipse(-4.1, 0, 3.0, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(-4.4, -1.5); ctx.quadraticCurveTo(-3.6, 0, -4.4, 1.5); ctx.stroke();
        // Petiole (narrow waist)
        ctx.fillStyle = '#cfcfcf';
        ctx.beginPath(); ctx.ellipse(-1.7, 0, 0.55, 0.5, 0, 0, Math.PI * 2); ctx.fill();
        // Thorax (mesosoma)
        ctx.fillStyle = '#cccccc';
        ctx.beginPath(); ctx.ellipse(-0.4, 0, 1.55, 0.92, 0, 0, Math.PI * 2); ctx.fill();
        // Head (big, rounded) + eyes
        ctx.fillStyle = '#dddddd';
        ctx.beginPath(); ctx.ellipse(2.5, 0, 1.85, 1.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(20,20,20,0.55)';
        ctx.beginPath(); ctx.ellipse(2.7, -0.95, 0.3, 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(2.7, 0.95, 0.3, 0.4, 0, 0, Math.PI * 2); ctx.fill();
        // Geniculate antennae — scape out from the head, elbow, funiculus sweeping forward-out.
        ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = 0.5; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(3.9, -0.5); ctx.lineTo(5.6, -1.9); ctx.lineTo(7.4, -2.7);
        ctx.moveTo(3.9, 0.5);  ctx.lineTo(5.6, 1.9);  ctx.lineTo(7.4, 2.7);
        ctx.stroke();
    }
    return Texture.from(c);
}

// Subtle per-ant darkening for variety (multiply tint; lighter is impossible).
const SHADE_TINT = [0xffffff, 0xeeeeee, 0xdddddd, 0xcccccc];
const CARGO_TINT: Record<string, number> = { SUGAR: 0xffd24a, PROTEIN: 0xd9483a, BROOD: 0xfff0f0, CORPSE: 0x8a8a8a };

// Per-channel multiply of two 0xRRGGBB tints (combine shade variety with team colour).
function mulTint(a: number, b: number): number {
    const r = (((a >> 16) & 0xff) * ((b >> 16) & 0xff) / 255) | 0;
    const g = (((a >> 8) & 0xff) * ((b >> 8) & 0xff) / 255) | 0;
    const bl = ((a & 0xff) * (b & 0xff) / 255) | 0;
    return (r << 16) | (g << 8) | bl;
}

function bakeDisc(): Texture {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.7, '#fff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(16, 16, 16, 0, Math.PI * 2); x.fill();
    return Texture.from(c);
}

const INSECT_TYPES = ['PREY', 'PREDATOR', 'SPIDER', 'BEETLE', 'LADYBUG', 'APHID'];
const FOOD_TYPES = ['SUGAR', 'PROTEIN', 'CORPSE'];
const FOOD_REF_RADIUS = Math.sqrt(200) * 0.85 * 2; // baked content radius in texture px (SS=2)

function particleTint(c: string): number {
    switch (c) {
        case 'red': return 0xff4444;
        case 'yellow': return 0xffe055;
        case '#FFD700': return 0xffd700;
        default: return 0xffffff;
    }
}

// WebGL world renderer (Pixi.js): draws the dirt background, the pheromone field
// and every world entity (food, insects, ants, particles) on the GPU. Sits on a
// canvas behind the (now effects-only) 2D canvas. Falls back to canvas-2D when
// WebGL is unavailable (the layer is simply never created).
export class PixiBackdrop {
    private app: Application | null = null;
    private world!: Container;
    private bgSprite!: Sprite;
    private decoSprite!: Sprite;
    private pheroSprite!: Sprite;
    private foodLayer!: Container;
    private bugLayer!: Container;
    private shadowLayer!: Container;
    private antLayer!: Container;
    private overlayLayer!: Container;
    private flashLayer!: Container;
    private particleLayer!: Container;

    private foodPool: Sprite[] = [];
    private bugPool: Sprite[] = [];
    private shadowPool: Sprite[] = [];   // soft contact shadow under each ant
    private antPool: Sprite[] = [];
    private carryPool: Sprite[] = [];    // little dot showing carried cargo
    private flashPool: Sprite[] = [];    // brief clash spark during combat
    private particlePool: Sprite[] = [];

    private antWorkerTex: Texture[] = []; // walk-cycle frames
    private antSoldierTex: Texture[] = [];
    private antEnemySoldierTex: Texture[] = []; // rival soldiers: black + light outline
    private insectTex: Record<string, Texture> = {};
    private foodTex: Record<string, Texture> = {};
    private discTex!: Texture;

    private pheroCanvas!: HTMLCanvasElement;     // blurred result → texture source
    private pheroCtx!: CanvasRenderingContext2D;
    private pheroRawCanvas!: HTMLCanvasElement;   // raw RGBA from the grid
    private pheroRawCtx!: CanvasRenderingContext2D;
    private pheroImage!: ImageData;
    private pheroBuf!: Uint32Array;
    private pheroTex!: Texture;

    private bloom!: AdvancedBloomFilter;
    private bloomOn = true;
    private bloomIntensity = 0.7;

    private logicalW = 0;
    private logicalH = 0;
    private resolutionScale = 1;
    private ready = false;
    private frame = 0;

    async init(glCanvas: HTMLCanvasElement, renderer: Renderer, world: World, logicalW: number, logicalH: number, resolutionScale: number) {
        this.logicalW = logicalW;
        this.logicalH = logicalH;
        this.resolutionScale = resolutionScale;

        const app = new Application();
        await app.init({
            canvas: glCanvas,
            width: Math.floor(logicalW * resolutionScale),
            height: Math.floor(logicalH * resolutionScale),
            backgroundAlpha: 0,
            antialias: true,
            autoStart: false,
        });
        this.app = app;

        const ANT_FRAMES = 4;
        for (let f = 0; f < ANT_FRAMES; f++) {
            this.antWorkerTex.push(bakeAnt('WORKER', f / ANT_FRAMES));
            this.antSoldierTex.push(bakeAnt('SOLDIER', f / ANT_FRAMES));
            this.antEnemySoldierTex.push(bakeAnt('SOLDIER', f / ANT_FRAMES, true));
        }
        this.discTex = bakeDisc();
        // Reuse the exact canvas-2D art for insects, food and decoration.
        for (const t of INSECT_TYPES) this.insectTex[t] = Texture.from(renderer.bakeInsectCanvas(t));
        for (const t of FOOD_TYPES) this.foodTex[t] = Texture.from(renderer.bakeFoodCanvas(t));

        this.world = new Container();
        app.stage.addChild(this.world);

        // Bloom: bright things (pheromone glow, particles, food glints) get a soft
        // halo. A low threshold lets the glowing trails through; the dark dirt
        // (~0.16 luminance) stays below it and remains crisp.
        this.bloom = new AdvancedBloomFilter({ threshold: 0.5, bloomScale: this.bloomIntensity, brightness: 1, blur: 8, quality: 5 });
        this.applyBloom();

        this.bgSprite = new Sprite(Texture.from(renderer.bgCanvas));
        this.bgSprite.width = logicalW;
        this.bgSprite.height = logicalH;
        this.world.addChild(this.bgSprite);

        // Pheromone field → soft glowing trails. Blurred in a 2D canvas (which
        // fades cleanly to transparent), then drawn additively. No Pixi filter —
        // that bled the transparent black into the edges ("fade to black").
        this.pheroCanvas = document.createElement('canvas');
        this.pheroCanvas.width = 1; this.pheroCanvas.height = 1;
        this.pheroCtx = this.pheroCanvas.getContext('2d')!;
        this.pheroRawCanvas = document.createElement('canvas');
        this.pheroRawCanvas.width = 1; this.pheroRawCanvas.height = 1;
        this.pheroRawCtx = this.pheroRawCanvas.getContext('2d')!;
        this.pheroTex = Texture.from(this.pheroCanvas);
        this.pheroSprite = new Sprite(this.pheroTex);
        this.pheroSprite.width = logicalW;
        this.pheroSprite.height = logicalH;
        this.pheroSprite.blendMode = 'add';
        this.pheroSprite.alpha = 0.75;
        this.world.addChild(this.pheroSprite);

        // Static decoration (rocks, grass, entrance) baked once at world resolution,
        // over the pheromones (matching the 2D draw order).
        this.decoSprite = new Sprite(Texture.from(renderer.renderStaticDecoration(world)));
        this.decoSprite.width = logicalW;
        this.decoSprite.height = logicalH;
        this.world.addChild(this.decoSprite);

        this.foodLayer = new Container();
        this.bugLayer = new Container();
        this.shadowLayer = new Container();
        this.antLayer = new Container();
        this.overlayLayer = new Container();   // carried-cargo dots over the ants
        this.flashLayer = new Container();
        this.flashLayer.blendMode = 'add';     // combat sparks glow
        this.particleLayer = new Container();
        this.particleLayer.blendMode = 'add';
        this.world.addChild(this.foodLayer, this.bugLayer, this.shadowLayer, this.antLayer,
            this.overlayLayer, this.flashLayer, this.particleLayer);

        this.ready = true;
    }

    private ensurePheroSize(gw: number, gh: number) {
        if (this.pheroCanvas.width === gw && this.pheroCanvas.height === gh) return;
        this.pheroCanvas.width = gw;
        this.pheroCanvas.height = gh;
        this.pheroRawCanvas.width = gw;
        this.pheroRawCanvas.height = gh;
        this.pheroImage = this.pheroRawCtx.createImageData(gw, gh);
        this.pheroBuf = new Uint32Array(this.pheroImage.data.buffer);
        // The canvas changed size → rebuild the GPU texture so its source matches
        // (otherwise it stays at its initial 1×1 size and the field is invisible).
        this.pheroTex.destroy();
        this.pheroTex = Texture.from(this.pheroCanvas);
        this.pheroSprite.texture = this.pheroTex;
        this.pheroSprite.width = this.logicalW;
        this.pheroSprite.height = this.logicalH;
    }

    private pool(arr: Sprite[], layer: Container, tex: Texture, count: number) {
        while (arr.length < count) {
            const s = new Sprite(tex);
            s.anchor.set(0.5);
            layer.addChild(s);
            arr.push(s);
        }
        for (let i = count; i < arr.length; i++) arr[i].visible = false;
    }

    private applyBloom() {
        this.bloom.bloomScale = this.bloomIntensity;
        this.world.filters = this.bloomOn ? [this.bloom] : [];
    }

    setBloom(enabled: boolean, intensity: number) {
        this.bloomOn = enabled;
        this.bloomIntensity = intensity;
        if (this.ready) this.applyBloom();
    }

    resize(logicalW: number, logicalH: number, resolutionScale: number) {
        this.logicalW = logicalW;
        this.logicalH = logicalH;
        this.resolutionScale = resolutionScale;
        if (!this.app) return;
        this.app.renderer.resize(Math.floor(logicalW * resolutionScale), Math.floor(logicalH * resolutionScale));
        this.bgSprite.width = logicalW;
        this.bgSprite.height = logicalH;
        this.pheroSprite.width = logicalW;
        this.pheroSprite.height = logicalH;
    }

    render(world: World, camera: Camera | null, showPheromones: boolean) {
        if (!this.ready || !this.app) return;

        // Match the 2D layer's transform exactly: screen = (W/2 + (wx-camX)*zoom)*rs
        const rs = this.resolutionScale;
        const zoom = camera ? camera.zoom : 1;
        const camX = camera ? camera.x : this.logicalW / 2;
        const camY = camera ? camera.y : this.logicalH / 2;
        this.world.scale.set(zoom * rs);
        this.world.position.set(
            (this.logicalW / 2 - camX * zoom) * rs,
            (this.logicalH / 2 - camY * zoom) * rs,
        );

        // Pheromone field
        this.pheroSprite.visible = showPheromones;
        if (showPheromones) {
            this.ensurePheroSize(world.grid.width, world.grid.height);
            if (this.frame % 3 === 0) {
                const toHome = world.grid.toHome, toSugar = world.grid.toSugar;
                const toProtein = world.grid.toProtein, toDanger = world.grid.toDanger;
                const buf = this.pheroBuf;
                for (let i = 0; i < buf.length; i++) {
                    const home = toHome[i], sugar = toSugar[i], protein = toProtein[i], danger = toDanger[i];
                    if (home > 0.01 || sugar > 0.01 || protein > 0.01 || danger > 0.01) {
                        const r = Math.min(255, ((protein + sugar + danger) * 255) | 0);
                        const g = Math.min(255, (sugar * 255) | 0);
                        const b = Math.min(255, ((home + danger) * 255) | 0);
                        buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
                    } else buf[i] = 0;
                }
                this.pheroRawCtx.putImageData(this.pheroImage, 0, 0);
                // Soft glow via a 2D blur (premultiplied → fades to transparent).
                this.pheroCtx.clearRect(0, 0, this.pheroCanvas.width, this.pheroCanvas.height);
                this.pheroCtx.filter = 'blur(1.5px)';
                this.pheroCtx.drawImage(this.pheroRawCanvas, 0, 0);
                this.pheroCtx.filter = 'none';
                this.pheroTex.source.update();
            }
        }

        // Food — baked 2D art per type, scaled by the source's current radius.
        this.pool(this.foodPool, this.foodLayer, this.foodTex.SUGAR, world.foods.length);
        for (let i = 0; i < world.foods.length; i++) {
            const f: any = world.foods[i];
            const s = this.foodPool[i];
            s.visible = true;
            s.texture = this.foodTex[f.type] ?? this.foodTex.SUGAR;
            s.position.set(f.x, f.y);
            const radius = Math.max(8, Math.sqrt(f.amount) * 0.85);
            s.scale.set(radius / FOOD_REF_RADIUS);
            s.tint = 0xffffff;
        }

        // Insects — baked 2D art per type; texture already faces +x, rotate by angle.
        this.pool(this.bugPool, this.bugLayer, this.insectTex.PREY, world.insects.length);
        for (let i = 0; i < world.insects.length; i++) {
            const ins: any = world.insects[i];
            const s = this.bugPool[i];
            s.visible = true;
            s.texture = this.insectTex[ins.type] ?? this.insectTex.PREY;
            s.position.set(ins.x, ins.y);
            s.rotation = ins.angle ?? 0;
            s.scale.set(0.5); // texture is 2× supersampled
            s.tint = 0xffffff;
        }

        // Ants (world only) — natural look, texture by caste; per-colony team tint so
        // rival armies read apart. Legs animate via a walk-cycle frame.
        let total = 0;
        for (const c of world.colonies) total += c.ants.length;
        this.pool(this.antPool, this.antLayer, this.antWorkerTex[0], total);
        this.pool(this.shadowPool, this.shadowLayer, this.discTex, total);
        this.pool(this.carryPool, this.overlayLayer, this.discTex, total);
        this.pool(this.flashPool, this.flashLayer, this.discTex, total);
        let n = 0, cn = 0, fn = 0;
        for (const c of world.colonies) {
            const rival = c.id > 0;
            for (let i = 0; i < c.ants.length; i++) {
                const a: any = c.ants[i];
                const s = this.antPool[n];
                const sh = this.shadowPool[n];
                n++;
                if (a.location !== 'WORLD') { s.visible = false; sh.visible = false; continue; }
                const soldier = a.type === 'SOLDIER';
                // Draw size from polymorphism, but knock soldiers down ~22% visually
                // (they're ~1.5× a worker by sizeVar, which read as too big) — purely
                // cosmetic, their stats/collision still use the full sizeVar.
                const dz = (a.sizeVar ?? 1) * (soldier ? 0.78 : 1);

                // Soft contact shadow under the ant — kept small + faint so it grounds the
                // ant on the dirt without reading as a dark ring when it crosses the bright
                // (additive) pheromone clouds.
                sh.visible = true;
                sh.position.set(a.x, a.y + 1.2);
                sh.scale.set(dz * 0.22);
                sh.tint = 0x000000;
                sh.alpha = 0.14;

                s.visible = true;
                // Rival soldiers use the dedicated dark texture (untinted); everyone else
                // is the natural texture × caste team tint.
                const enemySoldier = soldier && rival;
                const frames = enemySoldier ? this.antEnemySoldierTex
                                            : (soldier ? this.antSoldierTex : this.antWorkerTex);
                const moving = (a.speedMultiplier ?? 1) > 0.05;
                const idx = moving
                    ? (Math.floor(a.age * 0.3 + (a.forageSeed ?? 0) * frames.length) % frames.length)
                    : 0;
                s.texture = frames[idx];
                s.position.set(a.x, a.y);
                s.rotation = a.angle;
                s.scale.set(dz * 0.5); // texture is 2× supersampled (bakeAnt SS=2)
                const shade = SHADE_TINT[(a.shade ?? 0) % SHADE_TINT.length];
                if (enemySoldier) {
                    s.tint = shade;
                } else {
                    const caste = soldier ? c.soldierTint : c.workerTint;
                    s.tint = caste === 0xffffff ? shade : mulTint(shade, caste);
                }

                // Carried cargo: a small coloured dot at the head.
                if (a.carrying && a.carrying !== 'NONE') {
                    const cs = this.carryPool[cn++];
                    cs.visible = true;
                    const off = 5.5 * dz;
                    cs.position.set(a.x + Math.cos(a.angle) * off, a.y + Math.sin(a.angle) * off);
                    cs.scale.set(0.13);
                    cs.tint = CARGO_TINT[a.carrying] || 0xffffff;
                    cs.alpha = 1;
                }

                // (Combat feedback is the red blood particles spawned on a landing hit —
                // the old additive white "spark" read as a blinking white dot, removed.)
            }
        }
        for (let i = n; i < this.antPool.length; i++) { this.antPool[i].visible = false; this.shadowPool[i].visible = false; }
        for (let i = cn; i < this.carryPool.length; i++) this.carryPool[i].visible = false;
        for (let i = fn; i < this.flashPool.length; i++) this.flashPool[i].visible = false;

        // Particles
        const ps = world.particles;
        this.pool(this.particlePool, this.particleLayer, this.discTex, ps.length);
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            const s = this.particlePool[i];
            s.visible = true;
            s.position.set(p.x, p.y);
            s.width = s.height = 4;
            s.tint = particleTint(p.color);
            s.alpha = Math.max(0, Math.min(1, p.life));
        }

        this.frame++;
        this.app.render();
    }

    // Snapshot the current WebGL world to a 2D canvas for screenshot/export. Uses
    // Pixi's extract (re-renders the stage to a render texture), so it works without
    // preserveDrawingBuffer. Returns null when the backdrop isn't ready.
    snapshotCanvas(): HTMLCanvasElement | null {
        if (!this.ready || !this.app) return null;
        return this.app.renderer.extract.canvas(this.app.stage) as HTMLCanvasElement;
    }

    destroy() {
        this.ready = false;
        if (this.app) {
            this.app.destroy(false, { children: true });
            this.app = null;
        }
    }
}
