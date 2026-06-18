import { CONFIG } from '../config';
import { World } from '../simulation/World';
import { PerformanceManager, QualityLevel } from '../PerformanceManager';
import { Camera } from './Camera';
import { drawClockStone, drawEntrance, drawGrass, drawRock, generateBackground, initGrassSprites } from './layers/background';
import { drawAnt, drawFood, drawInsect, drawParticles } from './layers/entities';
import { renderNest } from './layers/nest';
import { drawFireflies, drawGodRays, drawLighting, drawRain, drawShadows, drawVignette } from './layers/atmosphere';

export class Renderer {
    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;
    width!: number;
    height!: number;

    // Pheromone Rendering
    pheromoneCanvas!: HTMLCanvasElement;
    pheromoneCtx!: CanvasRenderingContext2D;
    pheroImageData!: ImageData;
    pheroBuf32!: Uint32Array;

    nestCanvas!: HTMLCanvasElement;
    nestCtx!: CanvasRenderingContext2D;
    showPheromones: boolean = true; // the pheromone highways are the headline feature → on by default
    pheromoneIntensity: number = 1.0; // user-tunable optical strength of the trail overlay

    // Camera — set from main.ts before calling render().
    camera: Camera | null = null;
    // Currently selected entity for highlight ring (set from main.ts).
    selectedEntity: { x: number; y: number } | null = null;
    // Current resolution scale (kept for Camera.screenToWorld).
    resolutionScale: number = 1.0;
    // When false, the WebGL backdrop draws the dirt + pheromones, so the 2D
    // canvas stays transparent and only draws entities/effects on top.
    drawBackdrop: boolean = true;
    // When false, the Pixi layer draws the world entities; the 2D layer keeps
    // only the selection ring + screen-space lighting/effects.
    drawEntities: boolean = true;

    // Day/night ambient tint — optional and dialled down by default.
    dayNight: boolean = true;
    dayNightIntensity: number = 0.5; // 0..1 scales the whole effect

    // Background Texture
    bgCanvas!: HTMLCanvasElement;

    // Nest Geometry Cache
    nestStructureCanvas!: HTMLCanvasElement;
    nestStructureCtx!: CanvasRenderingContext2D;
    lastNodeCount: number = -1;

    grassSprites: HTMLCanvasElement[] = [];

    // Layer-module state (see graphics/layers/*): cached ant sprites keyed by
    // `${type}_${variant}_${bodyCol}`, rain impact rings, night fireflies.
    antSprites: Record<string, HTMLCanvasElement> = {};
    rainRipples: { x: number; y: number; age: number }[] = [];
    fireflies: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;

        this.nestCanvas = document.getElementById('nestCanvas') as HTMLCanvasElement;
        this.nestCtx = this.nestCanvas.getContext('2d')!;

        // Default Init
        this.resize(CONFIG.width, CONFIG.height, 1.0);

        // Background Texture
        this.bgCanvas = document.createElement('canvas');
        this.bgCanvas.width = CONFIG.width;
        this.bgCanvas.height = CONFIG.height;
        generateBackground(this);

        // Setup Nest Structure Cache
        this.nestStructureCanvas = document.createElement('canvas');
        this.nestStructureCanvas.width = this.nestCanvas.width;
        this.nestStructureCanvas.height = this.nestCanvas.height;
        this.nestStructureCtx = this.nestStructureCanvas.getContext('2d')!;

        this.initPheromoneBuffers(CONFIG.width, CONFIG.height);
        initGrassSprites(this);
    }


    resize(logicalWidth: number, logicalHeight: number, scale: number) {
        this.width = logicalWidth;
        this.height = logicalHeight;

        // Crispness on HiDPI/retina displays: multiply the backing store by the
        // device pixel ratio (capped at 2 to bound cost on 3x phones). The CSS
        // display size is unchanged, so the canvas just gets more real pixels.
        const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
        // Total logical → backing-pixel factor (perf scale × dpr). Camera uses this.
        const pixelScale = scale * dpr;
        this.resolutionScale = pixelScale;

        this.canvas.width = Math.floor(logicalWidth * pixelScale);
        this.canvas.height = Math.floor(logicalHeight * pixelScale);

        // Context transform: a draw op at logical (100,100) lands at
        // (100*pixelScale, 100*pixelScale) in the backing store. The camera
        // transform is applied per-frame on top of this inside save/restore.
        this.ctx.resetTransform();
        this.ctx.scale(pixelScale, pixelScale);
        this.ctx.imageSmoothingEnabled = false;
    }

    initPheromoneBuffers(w: number, h: number) {
        // Overlay canvas is sized to the pheromone grid (fixed sim resolution, NOT the
        // render-quality preset) so it indexes the grid 1:1 and stays aligned.
        const scale = CONFIG.pheromone.resolutionScale;

        this.pheromoneCanvas = document.createElement('canvas');
        this.pheromoneCanvas.width = Math.ceil(w * scale);
        this.pheromoneCanvas.height = Math.ceil(h * scale);
        this.pheromoneCtx = this.pheromoneCanvas.getContext('2d', { alpha: false })!;
        this.pheroImageData = this.pheromoneCtx.createImageData(this.pheromoneCanvas.width, this.pheromoneCanvas.height);
        this.pheroBuf32 = new Uint32Array(this.pheroImageData.data.buffer);

        // Note: nest pheromones are not rendered (see renderNest), so no nest
        // pheromone buffers are allocated here.
    }

    updateSettings() {
        // Re-init buffers with new scale
        this.initPheromoneBuffers(this.width, this.height);
        // Force Nest Redraw (shadows/gradients might change)
        this.lastNodeCount = -1;
    }

    render(world: World) {
        const skip = PerformanceManager.settings.renderSkip;
        // Use a static counter or world age? World age is good.
        if (world.age % skip !== 0) return;

        this.renderWorld(world);
        renderNest(this, world);
    }

    renderWorld(world: World) {
        const ctx = this.ctx;

        // In WebGL-backdrop mode the 2D canvas is transparent (the Pixi layer
        // behind shows the dirt + pheromones); clear it each frame.
        if (!this.drawBackdrop) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.restore();
        }

        // Apply camera transform for the entire world scene.  All world-space
        // drawing happens inside this block; screen-space effects (god rays,
        // vignette, lighting) are applied afterwards without the camera.
        ctx.save();
        if (this.camera) {
            this.camera.applyTo(ctx, this.width, this.height);
        }

        // 0. Background (Texture) — scrolls with camera
        if (this.drawBackdrop) {
            ctx.drawImage(this.bgCanvas, 0, 0, this.width, this.height);
        }

        // 1. Pheromones (Overlay). The offscreen image is the SAME resolution as
        //    the grid, so we index it directly (1:1, no per-pixel remap). It only
        //    changes when the grid updates, so we rebuild the image on that cadence
        //    and reuse the cached canvas on the frames in between — a big saving in
        //    a large world (the per-frame cost is otherwise O(world area) in JS).
        if (this.drawBackdrop && this.showPheromones) {
            // Rebuild the overlay image at most every 3 frames (it changes slowly),
            // independent of the grid cadence — so it stays cheap even at ULTRA
            // where the grid updates every frame.
            const overlaySkip = Math.max(PerformanceManager.settings.pheromoneUpdateSkip, 3);
            if (world.age % overlaySkip === 0) {
                const toHome = world.grid.toHome;
                const toSugar = world.grid.toSugar;
                const toProtein = world.grid.toProtein;
                const toDanger = world.grid.toDanger;
                const buf = this.pheroBuf32;
                for (let i = 0; i < buf.length; i++) {
                    const home = toHome[i];
                    const sugar = toSugar[i];
                    const protein = toProtein[i];
                    const danger = toDanger[i];
                    if (home > 0.01 || sugar > 0.01 || protein > 0.01 || danger > 0.01) {
                        // sqrt response curve so faint trails still read as glowing highways.
                        const rVal = Math.min(255, (Math.sqrt(protein + sugar + danger) * 255) | 0);
                        const gVal = Math.min(255, (Math.sqrt(sugar) * 255) | 0);
                        const bVal = Math.min(255, (Math.sqrt(home + danger) * 255) | 0);
                        buf[i] = (255 << 24) | (bVal << 16) | (gVal << 8) | rVal;
                    } else {
                        buf[i] = 0;
                    }
                }
                this.pheromoneCtx.putImageData(this.pheroImageData, 0, 0);
            }

            // Draw the cached overlay in logical world-space (lines up with entities under
            // any camera zoom/pan). Additive blending + a soft blur turn the trails
            // into glowing "scent clouds" instead of hard pixel patches.
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, 0.55 * this.pheromoneIntensity);
            // The bilinear upscale of the low-res overlay already softens it; the
            // blur just adds glow. Keep the radius small — a full-canvas blur every
            // frame is one of the most expensive 2D-canvas ops, especially big.
            const lvl = PerformanceManager.level;
            if (lvl === QualityLevel.ULTRA || lvl === QualityLevel.HIGH) {
                ctx.filter = 'blur(2px)';
            } else if (lvl === QualityLevel.MEDIUM) {
                ctx.filter = 'blur(1px)'; // off on LOW/ULTRA_LOW
            }
            ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
            ctx.filter = 'none';
            ctx.restore();
            ctx.imageSmoothingEnabled = false;
        }



        // World entities (rocks, food, grass, insects, ants, particles). In WebGL
        // mode the Pixi layer draws these, so the 2D layer skips them and only
        // keeps the camera-space selection ring + screen-space lighting/effects.
        if (this.drawEntities) {
        // 2. Obstacles (Rocks) with Shadows
        for (const obs of world.terrain.obstacles) {
            drawRock(this, obs.x, obs.y, obs.radius);
        }
        // Clock stone (fixed world-centre landmark; collision handled by Terrain.clockStone)
        drawClockStone(this, world.terrain.clockStone.x, world.terrain.clockStone.y, world.timeOfDay);

        // 2.5 Dynamic Shadows (Ants & Insects) - ULTRA
        if (PerformanceManager.settings.shadows) {
            drawShadows(this, world);
        }

        // 3. Food with Shadows
        for (const food of world.foods) {
            drawFood(this, food);
        }

        // 4. Nest Entrance (Visual Marker)
        drawEntrance(this);

        // 4.5 Vegetation (Grass) — cached sprites, cheap. Drawn on LOW too (otherwise the
        // world looks barren); only the emergency ULTRA_LOW floor skips it. (In WebGL it's
        // baked into the decoration texture, so this 2D path only matters as a fallback.)
        if (PerformanceManager.level !== QualityLevel.ULTRA_LOW) {
            for (const g of world.grass) {
                drawGrass(this, g);
            }
        }

        // 5. Insects (Shadows handled inside)
        for (const insect of world.insects) {
            drawInsect(this, insect, (Date.now() * 0.012 + insect.x * 0.07) % 1);
        }

        // 6. Ants (World only) — every colony.
        for (const c of world.colonies) {
            for (const ant of c.ants) {
                if (ant.location === 'WORLD') drawAnt(this, ant, this.ctx);
            }
        }
        // 7. Particles
        drawParticles(this, world);
        } // end if (drawEntities)

        // 8. Selection highlight ring (drawn in world space so it moves with camera)
        if (this.selectedEntity) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 100, 0.85)';
            ctx.lineWidth = 1.5 / (this.camera?.zoom ?? 1);
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);
            ctx.globalAlpha = 0.5 + 0.5 * pulse;
            ctx.beginPath();
            ctx.arc(this.selectedEntity.x, this.selectedEntity.y, 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }

        // End of camera-transformed world scene.
        ctx.restore();

        // Screen-space post-effects (no camera transform, drawn over everything).
        // Day/night ambient tint — runs at every quality level (cheap fillRects).
        drawLighting(this, world);
        drawFireflies(this, world);  // glowworms drifting at night
        drawRain(this, world);
        if (PerformanceManager.level === QualityLevel.ULTRA) {
            drawGodRays(this);
            drawVignette(this);
        }
    }

    // ── Texture baking for the WebGL (Pixi) renderer ──────────────────────────
    // Reuse the exact canvas-2D art by temporarily pointing this.ctx at an
    // offscreen canvas, so the WebGL sprites look identical to the 2D drawing.
    private withCtx(ctx: CanvasRenderingContext2D, fn: () => void) {
        const old = this.ctx;
        this.ctx = ctx;
        fn();
        this.ctx = old;
    }

    private bakeCentered(size: number, draw: () => void): HTMLCanvasElement {
        const SS = 2;
        const c = document.createElement('canvas');
        c.width = size * SS; c.height = size * SS;
        const ctx = c.getContext('2d')!;
        ctx.scale(SS, SS);
        ctx.translate(size / 2, size / 2);
        this.withCtx(ctx, draw);
        return c;
    }

    bakeInsectCanvas(type: string, phase: number = 0): HTMLCanvasElement {
        // Always bake the DETAILED insect, regardless of the quality active at bake time.
        // The WebGL textures are baked once at init; if the kiosk starts at LOW (where
        // simpleInsects=true) the baked sprite would be a plain oval forever — and changing
        // quality later doesn't re-bake. The per-frame cost is just a sprite, so detail is free.
        const prev = PerformanceManager.settings.simpleInsects;
        PerformanceManager.settings.simpleInsects = false;
        const canvas = this.bakeCentered(64, () => drawInsect(this, { x: 0, y: 0, type, angle: 0 }, phase));
        PerformanceManager.settings.simpleInsects = prev;
        return canvas;
    }

    bakeFoodCanvas(type: string): HTMLCanvasElement {
        // Reference amount 200 → radius ≈ 12; the sprite is scaled per source.
        return this.bakeCentered(64, () => drawFood(this, { x: 0, y: 0, type, amount: 200, maxAmount: 200 }));
    }

    // Static decoration (rocks, grass, entrance) drawn once at world resolution.
    renderStaticDecoration(world: World): HTMLCanvasElement {
        const c = document.createElement('canvas');
        c.width = CONFIG.width; c.height = CONFIG.height;
        const ctx = c.getContext('2d')!;
        this.withCtx(ctx, () => {
            for (const obs of world.terrain.obstacles) drawRock(this, obs.x, obs.y, obs.radius);
            for (const g of world.grass) drawGrass(this, g);
            drawEntrance(this);
        });
        return c;
    }
}
