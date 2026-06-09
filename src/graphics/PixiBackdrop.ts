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

    ctx.lineJoin = 'round';
    const soldier = type === 'SOLDIER';
    const S = soldier ? 1.12 : 1.0;   // a soldier is a scaled-up worker (with the big-headed shape below)

    // Legs — 6 jointed (attach → knee → foot), 3 per side; `phase` swings them fore-aft
    // for a tripod walk cycle. Front pair reaches forward beside the head, rear angles
    // back. Scaled with the body (S).
    ctx.strokeStyle = enemy ? '#7a6420' : (soldier ? '#262626' : '#707070');
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

    // Shared anatomy — narrow waisted thorax, large banded gaster, eyes, geniculate
    // antennae. The head differs: workers get a rounded head, soldiers the big-headed
    // (Pheidole) square/heart head at a moderate size. Only size (S) + head shape +
    // palette differ. Worker = light greys (multiply-tinted to the colony colour at draw
    // time); our soldier = dark red; rival soldier = dark charcoal.
    const C = soldier
        ? (enemy
            // rival soldier: yellowish body, red head
            ? { gaster: '#c2a23c', band: 'rgba(0,0,0,0.28)', petiole: '#c9a83e', thorax: '#c6a53e', head: '#c01810', eye: 'rgba(0,0,0,0.4)',  ant: '#7a6420' }
            // our soldier: near-black body, red head (Messor barbarus)
            : { gaster: '#7a4a26', band: 'rgba(0,0,0,0.3)', petiole: '#85522c', thorax: '#85522c', head: '#c01810', eye: 'rgba(0,0,0,0.45)', ant: '#4a2e18' })
        : { gaster: '#c2c2c2', band: 'rgba(0,0,0,0.22)', petiole: '#cfcfcf', thorax: '#cccccc', head: '#dddddd', eye: 'rgba(20,20,20,0.55)', ant: '#6a6a6a' };

    // Gaster sits back behind a short, thin petiole stalk so the abdomen is clearly
    // "pinched off" (the ant wasp-waist) instead of merging into the thorax like a termite.
    const grx = 2.9 * S, gry = 1.75 * S, gcx = -5.0 * S;
    // Soldier thorax is beefier + sits a touch forward so it stays a visible segment
    // between the big head and the gaster (otherwise the head looks stuck on the waist).
    const trx = (soldier ? 1.75 : 1.55) * S, tryR = (soldier ? 1.05 : 0.92) * S, tcx = (soldier ? -0.2 : -0.4) * S;
    const prx = 0.5 * S, pry = 0.32 * S, pcx = -2.05 * S; // thin waist stalk

    // Gaster (abdomen) + a faint segment band
    ctx.fillStyle = C.gaster;
    ctx.beginPath(); ctx.ellipse(gcx, 0, grx, gry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.band; ctx.lineWidth = 0.5 * S;
    ctx.beginPath(); ctx.moveTo(gcx - 0.3 * S, -gry * 0.83); ctx.quadraticCurveTo(gcx + 0.5 * S, 0, gcx - 0.3 * S, gry * 0.83); ctx.stroke();
    // Petiole (narrow waist)
    ctx.fillStyle = C.petiole;
    ctx.beginPath(); ctx.ellipse(pcx, 0, prx, pry, 0, 0, Math.PI * 2); ctx.fill();
    // Thorax (mesosoma)
    ctx.fillStyle = C.thorax;
    ctx.beginPath(); ctx.ellipse(tcx, 0, trx, tryR, 0, 0, Math.PI * 2); ctx.fill();
    // Head — rounded (worker) or the moderate big-headed square/heart (soldier).
    // headCx/headFront/headHalfH then place the eyes + antennae for either shape.
    let headCx: number, headFront: number, headHalfH: number;
    ctx.fillStyle = C.head;
    if (soldier) {
        const bx = 1.7 * S, fx = 5.5 * S, hy = 2.95 * S; // moved forward + a bit smaller/narrower
        ctx.beginPath();
        ctx.moveTo(bx, -hy);
        ctx.lineTo(fx * 0.78, -hy);
        ctx.quadraticCurveTo(fx, -hy, fx, 0);
        ctx.quadraticCurveTo(fx, hy, fx * 0.78, hy);
        ctx.lineTo(bx, hy);
        ctx.quadraticCurveTo(bx - 0.9 * S, 0, bx, -hy); // heart notch at the back
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; // chitin highlight
        ctx.beginPath(); ctx.ellipse(fx * 0.5 + 0.4, -hy * 0.45, 1.2 * S, 0.8 * S, -0.5, 0, Math.PI * 2); ctx.fill();
        headCx = (bx + fx) * 0.5; headFront = fx; headHalfH = hy;
    } else {
        const hrx = 1.85 * S, hry = 1.65 * S, hcx = 2.5 * S;
        ctx.beginPath(); ctx.ellipse(hcx, 0, hrx, hry, 0, 0, Math.PI * 2); ctx.fill();
        headCx = hcx; headFront = hcx + hrx; headHalfH = hry;
    }
    // Eyes
    ctx.fillStyle = C.eye;
    const ex = headCx + (soldier ? 0.4 : 0.2) * S, ey = headHalfH * 0.55, er = (soldier ? 0.4 : 0.32) * S;
    ctx.beginPath(); ctx.ellipse(ex, -ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex,  ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    // Antennae — the scape comes out ~90° to the side from the head, then the funiculus
    // bends forward (geniculate).
    ctx.strokeStyle = C.ant; ctx.lineWidth = (soldier ? 0.6 : 0.5) * S;
    const aax = headFront * 0.7, aay = headHalfH * 0.5;
    const aex = headFront * 0.78, aey = headHalfH + 1.6 * S;
    const atx = aex + 2.5 * S, aty = aey + 0.4 * S;
    ctx.beginPath();
    ctx.moveTo(aax, -aay); ctx.lineTo(aex, -aey); ctx.lineTo(atx, -aty);
    ctx.moveTo(aax,  aay); ctx.lineTo(aex,  aey); ctx.lineTo(atx,  aty);
    ctx.stroke();
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

// A distinct little icon for whatever an ant is carrying, so cargo reads at a glance:
// sugar crystal, protein chunk, brood egg, corpse bundle (instead of a tinted dot).
function bakeCargo(type: string): Texture {
    const SS = 2;
    const c = document.createElement('canvas');
    c.width = 16 * SS; c.height = 16 * SS;
    const x = c.getContext('2d')!;
    x.scale(SS, SS); x.translate(8, 8);
    x.lineJoin = 'round'; x.lineCap = 'round';
    if (type === 'SUGAR') {                       // pale crystal with a facet glint
        x.fillStyle = '#fff7d8';
        x.beginPath(); x.moveTo(0, -5); x.lineTo(3.4, 0); x.lineTo(0, 5); x.lineTo(-3.4, 0); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(150,120,40,0.5)'; x.lineWidth = 0.5; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.85)';
        x.beginPath(); x.moveTo(0, -5); x.lineTo(1.5, -1); x.lineTo(0, 0.6); x.lineTo(-1.5, -1); x.closePath(); x.fill();
    } else if (type === 'PROTEIN') {              // red meat chunk with a fat fleck
        x.fillStyle = '#c0432f';
        x.beginPath(); x.ellipse(0, 0, 4, 3.3, 0.3, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e8c79a'; x.beginPath(); x.arc(1.2, 1, 1, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.ellipse(-1.2, -1.2, 1.3, 0.8, 0, 0, Math.PI * 2); x.fill();
    } else if (type === 'BROOD') {                // cream egg/larva with a sheen
        x.fillStyle = '#f3ead2';
        x.beginPath(); x.ellipse(0, 0, 3, 4.2, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(190,170,120,0.4)'; x.lineWidth = 0.4; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(-0.8, -1.2, 1, 1.6, 0, 0, Math.PI * 2); x.fill();
    } else {                                       // CORPSE: grey bundle with curled legs
        x.fillStyle = '#5a5048';
        x.beginPath(); x.ellipse(0, 0, 3.4, 2.4, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#3a332c'; x.lineWidth = 0.6;
        for (const s of [-1, 1]) {
            x.beginPath(); x.moveTo(2 * s, -1.4); x.lineTo(3.6 * s, -2.4);
            x.moveTo(2 * s, 1.4); x.lineTo(3.6 * s, 2.4); x.stroke();
        }
    }
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
    private insectTex: Record<string, Texture[]> = {}; // walk-cycle frames per type
    private foodTex: Record<string, Texture> = {};
    private discTex!: Texture;
    private cargoTex: Record<string, Texture> = {}; // distinct carried-cargo icons

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
        for (const t of ['SUGAR', 'PROTEIN', 'BROOD', 'CORPSE']) this.cargoTex[t] = bakeCargo(t);
        // Reuse the exact canvas-2D art for insects, food and decoration.
        const INSECT_FRAMES = 4;
        for (const t of INSECT_TYPES) {
            this.insectTex[t] = [];
            for (let f = 0; f < INSECT_FRAMES; f++)
                this.insectTex[t].push(Texture.from(renderer.bakeInsectCanvas(t, f / INSECT_FRAMES)));
        }
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
        this.pheroSprite.alpha = 0.85;
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

    render(world: World, camera: Camera | null, showPheromones: boolean, pheromoneIntensity = 1) {
        if (!this.ready || !this.app) return;
        this.pheroSprite.alpha = Math.min(1, 0.85 * pheromoneIntensity);

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
                        // sqrt response curve: lifts faint concentrations so trails read
                        // as continuous glowing highways instead of dim wisps.
                        const r = Math.min(255, (Math.sqrt(protein + sugar + danger) * 255) | 0);
                        const g = Math.min(255, (Math.sqrt(sugar) * 255) | 0);
                        const b = Math.min(255, (Math.sqrt(home + danger) * 255) | 0);
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
        this.pool(this.bugPool, this.bugLayer, this.insectTex.PREY[0], world.insects.length);
        for (let i = 0; i < world.insects.length; i++) {
            const ins: any = world.insects[i];
            const s = this.bugPool[i];
            s.visible = true;
            const frames = this.insectTex[ins.type] ?? this.insectTex.PREY;
            // Legs animate via a walk-cycle frame; a stationary (IDLE) bug holds frame 0.
            const idx = ins.state !== 'IDLE'
                ? (Math.floor(this.frame * 0.25 + (ins.x | 0)) % frames.length)
                : 0;
            s.texture = frames[idx];
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
                sh.scale.set(dz * 0.3);
                sh.tint = 0x000000;
                sh.alpha = 0.24; // a touch stronger so brown ants lift off the brown earth

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

                // Carried cargo: a distinct little icon at the head (crystal/chunk/egg/corpse).
                if (a.carrying && a.carrying !== 'NONE') {
                    const cs = this.carryPool[cn++];
                    cs.visible = true;
                    const off = 5.5 * dz;
                    cs.position.set(a.x + Math.cos(a.angle) * off, a.y + Math.sin(a.angle) * off);
                    const ctex = this.cargoTex[a.carrying];
                    if (ctex) {
                        cs.texture = ctex;
                        cs.rotation = a.angle;
                        cs.scale.set(0.42 * dz);
                        cs.tint = 0xffffff;
                    } else { // fallback to the tinted dot for any unknown cargo
                        cs.texture = this.discTex;
                        cs.rotation = 0;
                        cs.scale.set(0.13);
                        cs.tint = CARGO_TINT[a.carrying] || 0xffffff;
                    }
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
