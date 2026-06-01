import { Application, Container, Sprite, Texture, BlurFilter } from 'pixi.js';
import type { World } from '../simulation/World';
import type { Camera } from './Camera';

// ── Baked textures (drawn once to small canvases, then batched as sprites) ──
function bakeAnt(): Texture {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d')!;
    x.translate(16, 16);
    x.fillStyle = '#fff';
    // abdomen / thorax / head along +x (facing right = angle 0)
    x.beginPath(); x.ellipse(-4, 0, 5, 3.4, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(1, 0, 3, 2.4, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(6, 0, 2.6, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineCap = 'round';
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(7, -1); x.lineTo(11, -4); x.moveTo(7, 1); x.lineTo(11, 4); x.stroke(); // antennae
    x.lineWidth = 1.1;
    for (const lx of [-4, 0, 3]) { // legs
        x.beginPath(); x.moveTo(lx, -1.5); x.lineTo(lx - 1, -5);
        x.moveTo(lx, 1.5); x.lineTo(lx - 1, 5); x.stroke();
    }
    return Texture.from(c);
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

function bakeBug(): Texture {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d')!;
    x.translate(16, 16);
    x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 1.2; x.lineCap = 'round';
    for (const ly of [-3, 0, 3]) {
        x.beginPath(); x.moveTo(-2, ly); x.lineTo(-9, ly - 1);
        x.moveTo(2, ly); x.lineTo(9, ly - 1); x.stroke();
    }
    return Texture.from(c);
}

function antTint(ant: any): number {
    if (ant.state === 'FLEEING') return 0xff5a5a;
    if (ant.state === 'ATTACKING') return 0xff9030;
    if (ant.carrying === 'SUGAR') return 0xa8e8a8;
    if (ant.carrying === 'PROTEIN' || ant.carrying === 'CORPSE') return 0xe8b0a8;
    return ant.type === 'SOLDIER' ? 0x7a4a30 : 0x4a3526;
}

const BUG_STYLE: Record<string, { tint: number; scale: number }> = {
    PREY: { tint: 0x9ccc6a, scale: 0.7 },
    PREDATOR: { tint: 0xcc5a44, scale: 1.0 },
    SPIDER: { tint: 0x6a5a6a, scale: 1.0 },
    BEETLE: { tint: 0x556b4a, scale: 1.4 },
    LADYBUG: { tint: 0xdd4a44, scale: 0.9 },
    APHID: { tint: 0xa8cc88, scale: 0.5 },
};

const FOOD_TINT: Record<string, number> = { SUGAR: 0x6fce6f, PROTEIN: 0xdd8088, CORPSE: 0x8a8078 };

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
    private pheroSprite!: Sprite;
    private foodLayer!: Container;
    private bugLayer!: Container;
    private antLayer!: Container;
    private particleLayer!: Container;

    private foodPool: Sprite[] = [];
    private bugPool: Sprite[] = [];
    private antPool: Sprite[] = [];
    private particlePool: Sprite[] = [];

    private antTex!: Texture;
    private bugTex!: Texture;
    private discTex!: Texture;

    private pheroCanvas!: HTMLCanvasElement;
    private pheroCtx!: CanvasRenderingContext2D;
    private pheroImage!: ImageData;
    private pheroBuf!: Uint32Array;
    private pheroTex!: Texture;

    private logicalW = 0;
    private logicalH = 0;
    private resolutionScale = 1;
    private ready = false;
    private frame = 0;

    async init(glCanvas: HTMLCanvasElement, bgCanvas: HTMLCanvasElement, logicalW: number, logicalH: number, resolutionScale: number) {
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

        this.antTex = bakeAnt();
        this.bugTex = bakeBug();
        this.discTex = bakeDisc();

        this.world = new Container();
        app.stage.addChild(this.world);

        this.bgSprite = new Sprite(Texture.from(bgCanvas));
        this.bgSprite.width = logicalW;
        this.bgSprite.height = logicalH;
        this.world.addChild(this.bgSprite);

        // Pheromone field → soft glowing trails.
        this.pheroCanvas = document.createElement('canvas');
        this.pheroCanvas.width = 1; this.pheroCanvas.height = 1;
        this.pheroCtx = this.pheroCanvas.getContext('2d')!;
        this.pheroTex = Texture.from(this.pheroCanvas);
        this.pheroSprite = new Sprite(this.pheroTex);
        this.pheroSprite.width = logicalW;
        this.pheroSprite.height = logicalH;
        this.pheroSprite.blendMode = 'add';
        this.pheroSprite.alpha = 0.7;
        this.pheroSprite.filters = [new BlurFilter({ strength: 4, quality: 3 })];
        this.world.addChild(this.pheroSprite);

        this.foodLayer = new Container();
        this.bugLayer = new Container();
        this.antLayer = new Container();
        this.particleLayer = new Container();
        this.particleLayer.blendMode = 'add';
        this.world.addChild(this.foodLayer, this.bugLayer, this.antLayer, this.particleLayer);

        this.ready = true;
    }

    private ensurePheroSize(gw: number, gh: number) {
        if (this.pheroCanvas.width === gw && this.pheroCanvas.height === gh) return;
        this.pheroCanvas.width = gw;
        this.pheroCanvas.height = gh;
        this.pheroImage = this.pheroCtx.createImageData(gw, gh);
        this.pheroBuf = new Uint32Array(this.pheroImage.data.buffer);
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
                this.pheroCtx.putImageData(this.pheroImage, 0, 0);
                this.pheroTex.source.update();
            }
        }

        // Food
        this.pool(this.foodPool, this.foodLayer, this.discTex, world.foods.length);
        for (let i = 0; i < world.foods.length; i++) {
            const f: any = world.foods[i];
            const s = this.foodPool[i];
            s.visible = true;
            s.position.set(f.x, f.y);
            const radius = Math.max(8, Math.sqrt(f.amount) * 0.35);
            s.width = s.height = radius * 2.2;
            s.tint = FOOD_TINT[f.type] ?? 0xffffff;
            s.alpha = 0.9;
        }

        // Insects
        this.pool(this.bugPool, this.bugLayer, this.bugTex, world.insects.length);
        for (let i = 0; i < world.insects.length; i++) {
            const ins: any = world.insects[i];
            const s = this.bugPool[i];
            const style = BUG_STYLE[ins.type] ?? BUG_STYLE.PREY;
            s.visible = true;
            s.position.set(ins.x, ins.y);
            s.rotation = ins.angle ?? 0;
            s.scale.set(style.scale);
            s.tint = style.tint;
        }

        // Ants (world only)
        const ants = world.ants;
        this.pool(this.antPool, this.antLayer, this.antTex, ants.length);
        let n = 0;
        for (let i = 0; i < ants.length; i++) {
            const a: any = ants[i];
            const s = this.antPool[n++];
            if (a.location !== 'WORLD') { s.visible = false; continue; }
            s.visible = true;
            s.position.set(a.x, a.y);
            s.rotation = a.angle;
            s.scale.set((a.type === 'SOLDIER' ? 1.35 : 1) * (a.sizeVar ?? 1));
            s.tint = antTint(a);
        }
        for (let i = n; i < this.antPool.length; i++) this.antPool[i].visible = false;

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

    destroy() {
        this.ready = false;
        if (this.app) {
            this.app.destroy(false, { children: true });
            this.app = null;
        }
    }
}
