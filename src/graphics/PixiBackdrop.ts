import { Application, Container, Sprite, Texture, BlurFilter } from 'pixi.js';
import type { World } from '../simulation/World';
import type { Camera } from './Camera';

// WebGL backdrop layer (Pixi.js): renders the dirt background + the pheromone
// field on the GPU — the two most expensive full-screen operations of the
// canvas-2D renderer. It sits BEHIND the (transparent) 2D entity canvas. If
// WebGL is unavailable the whole layer is simply not created and the canvas-2D
// renderer draws everything as before (Pi-safe fallback).
export class PixiBackdrop {
    private app: Application | null = null;
    private world!: Container;
    private bgSprite!: Sprite;
    private pheroSprite!: Sprite;

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

        this.world = new Container();
        app.stage.addChild(this.world);

        // Dirt background (reuse the canvas-2D renderer's generated texture).
        this.bgSprite = new Sprite(Texture.from(bgCanvas));
        this.bgSprite.width = logicalW;
        this.bgSprite.height = logicalH;
        this.world.addChild(this.bgSprite);

        // Pheromone field: a small RGBA texture (built from the grids) scaled up
        // and blurred on the GPU into soft glowing trails.
        this.pheroCanvas = document.createElement('canvas');
        this.pheroCanvas.width = 1;
        this.pheroCanvas.height = 1;
        this.pheroCtx = this.pheroCanvas.getContext('2d')!;
        this.pheroTex = Texture.from(this.pheroCanvas);
        this.pheroSprite = new Sprite(this.pheroTex);
        this.pheroSprite.width = logicalW;
        this.pheroSprite.height = logicalH;
        this.pheroSprite.blendMode = 'add';
        this.pheroSprite.alpha = 0.7;
        this.pheroSprite.filters = [new BlurFilter({ strength: 4, quality: 3 })];
        this.world.addChild(this.pheroSprite);

        this.ready = true;
    }

    private ensurePheroSize(gw: number, gh: number) {
        if (this.pheroCanvas.width === gw && this.pheroCanvas.height === gh) return;
        this.pheroCanvas.width = gw;
        this.pheroCanvas.height = gh;
        this.pheroImage = this.pheroCtx.createImageData(gw, gh);
        this.pheroBuf = new Uint32Array(this.pheroImage.data.buffer);
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

        // Match the 2D layer's transform: screen = (W/2 + (wx-camX)*zoom)*rs.
        const rs = this.resolutionScale;
        const zoom = camera ? camera.zoom : 1;
        const camX = camera ? camera.x : this.logicalW / 2;
        const camY = camera ? camera.y : this.logicalH / 2;
        this.world.scale.set(zoom * rs);
        this.world.position.set(
            (this.logicalW / 2 - camX * zoom) * rs,
            (this.logicalH / 2 - camY * zoom) * rs,
        );

        this.pheroSprite.visible = showPheromones;
        if (showPheromones) {
            const gw = world.grid.width;
            const gh = world.grid.height;
            this.ensurePheroSize(gw, gh);
            // Rebuild the field a few times per second; it changes slowly.
            if (this.frame++ % 3 === 0) {
                const toHome = world.grid.toHome;
                const toSugar = world.grid.toSugar;
                const toProtein = world.grid.toProtein;
                const toDanger = world.grid.toDanger;
                const buf = this.pheroBuf;
                for (let i = 0; i < buf.length; i++) {
                    const home = toHome[i];
                    const sugar = toSugar[i];
                    const protein = toProtein[i];
                    const danger = toDanger[i];
                    if (home > 0.01 || sugar > 0.01 || protein > 0.01 || danger > 0.01) {
                        const r = Math.min(255, ((protein + sugar + danger) * 255) | 0);
                        const g = Math.min(255, (sugar * 255) | 0);
                        const b = Math.min(255, ((home + danger) * 255) | 0);
                        buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
                    } else {
                        buf[i] = 0;
                    }
                }
                this.pheroCtx.putImageData(this.pheroImage, 0, 0);
                this.pheroTex.source.update();
            }
        }

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
