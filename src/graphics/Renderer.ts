import { CONFIG } from '../config';
import { World } from '../simulation/World';
import { PerformanceManager, QualityLevel } from '../PerformanceManager';
import { Camera } from './Camera';

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
        this.generateBackground();

        // Setup Nest Structure Cache
        this.nestStructureCanvas = document.createElement('canvas');
        this.nestStructureCanvas.width = this.nestCanvas.width;
        this.nestStructureCanvas.height = this.nestCanvas.height;
        this.nestStructureCtx = this.nestStructureCanvas.getContext('2d')!;

        this.initPheromoneBuffers(CONFIG.width, CONFIG.height);
        this.initGrassSprites();
    }

    initGrassSprites() {
        // Per-tuft palettes: lush greens through dry, yellow-olive clumps so the field
        // reads as a varied meadow rather than one flat green.
        const GRASS_PALETTES: [string, string][] = [
            ['#1d3a18', '#5aa048'], // lush
            ['#21401b', '#6fb255'], // bright
            ['#2a3a15', '#869a3a'], // olive
            ['#3a3817', '#a59a45'], // dry / yellowed
            ['#24351a', '#7fae50'],
        ];
        this.grassSprites = [];
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
            this.grassSprites.push(c);
        }
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

    generateBackground() {
        const ctx = this.bgCanvas.getContext('2d')!;
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;
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

    render(world: World) {
        const skip = PerformanceManager.settings.renderSkip;
        // Use a static counter or world age? World age is good.
        if (world.age % skip !== 0) return;

        this.renderWorld(world);
        this.renderNest(world);
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
            this.drawRock(obs.x, obs.y, obs.radius);
        }

        // 2.5 Dynamic Shadows (Ants & Insects) - ULTRA
        if (PerformanceManager.settings.shadows) {
            this.drawShadows(world);
        }

        // 3. Food with Shadows
        for (const food of world.foods) {
            this.drawFood(food);
        }

        // 4. Nest Entrance (Visual Marker)
        this.drawEntrance();

        // 4.5 Vegetation (Grass) — cached sprites, cheap. Drawn on LOW too (otherwise the
        // world looks barren); only the emergency ULTRA_LOW floor skips it. (In WebGL it's
        // baked into the decoration texture, so this 2D path only matters as a fallback.)
        if (PerformanceManager.level !== QualityLevel.ULTRA_LOW) {
            for (const g of world.grass) {
                this.drawGrass(g);
            }
        }

        // 5. Insects (Shadows handled inside)
        for (const insect of world.insects) {
            this.drawInsect(insect, (Date.now() * 0.012 + insect.x * 0.07) % 1);
        }

        // 6. Ants (World only) — every colony.
        for (const c of world.colonies) {
            for (const ant of c.ants) {
                if (ant.location === 'WORLD') this.drawAnt(ant, this.ctx);
            }
        }
        // 7. Particles
        this.drawParticles(world);
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
        this.drawLighting(world);
        this.drawFireflies(world);  // glowworms drifting at night
        this.drawRain(world);
        if (PerformanceManager.level === QualityLevel.ULTRA) {
            this.drawGodRays();
            this.drawVignette();
        }
    }

    renderNest(world: World) {
        const ctx = this.nestCtx;
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
        if (!this.nestStructureCanvas || world.nest.nodes.length !== this.lastNodeCount) {
            this.lastNodeCount = world.nest.nodes.length;
            this.renderNestStructure(world);
        }
        ctx.drawImage(this.nestStructureCanvas, 0, 0);

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
                this.drawFoodPile(g.x, g.y, g.radius, sugarPer, 'SUGAR', ctx);
                this.drawFoodPile(g.x, g.y, g.radius, proteinPer, 'PROTEIN', ctx);
            }
        }

        // Interred corpses resting in the graveyard chamber(s). The nest panel shows
        // colony 0, so only draw its own dead — a rival's interred corpses carry their
        // colony's nest-local coords and would otherwise appear as phantom crumbs here.
        for (const corpse of world.graveyard) {
            if ((corpse.colonyId ?? 0) === 0) this.drawFood(corpse);
        }

        // Draw Dynamic Entities
        this.drawQueen(world.queen, ctx);

        for (const b of world.brood) {
            this.drawBrood(b, ctx);
        }

        // Nest interior shows colony 0 (the single nest canvas can't hold two nests
        // at the same nest-local coords — rival nest rendering is a later step).
        for (const ant of world.colonies[0].ants) {
            if (ant.location === 'NEST') this.drawAnt(ant, ctx);
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

    renderNestStructure(world: World) {
        const ctx = this.nestStructureCtx;
        const w = this.nestStructureCanvas.width;
        const h = this.nestStructureCanvas.height;

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

    drawQueen(queen: any, ctx: CanvasRenderingContext2D) {
        if (queen.dead) return; // a starved-out colony's queen is gone
        ctx.save();
        ctx.translate(queen.x, queen.y);
        ctx.rotate(Math.sin(Date.now() * 0.001) * 0.05);

        // Scale down to be less massive (0.45x previous size)
        const scale = 0.45;
        ctx.scale(scale, scale);

        // Shadow
        this.drawShadow(0, 0, 15, ctx);

        // Same family as the new ants: colony body colour (own warm brown / rival amber)
        // with a red head like the soldiers (Messor barbarus). She faces "up" (-y) here.
        const body: string = queen.colony?.workerColor2D || '#7a4f2c';
        const legCol = Renderer.darken(body, 0.55);
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

    drawFoodPile(x: number, y: number, radius: number, amount: number, type: 'SUGAR' | 'PROTEIN', ctx: CanvasRenderingContext2D) {
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

    drawBrood(b: any, ctx: CanvasRenderingContext2D = this.nestCtx) {
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

    drawParticles(world: World) {
        for (const p of world.particles) {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, 2, 2);
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawLegs(count: number, length: number, color: string, speed: number, ctx: CanvasRenderingContext2D = this.ctx, isVertical: boolean = false) {
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

    drawShadow(x: number, y: number, radius: number, ctx: CanvasRenderingContext2D = this.ctx) {
        if (!PerformanceManager.settings.shadows) return;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 2, radius, radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Multiply a #rgb/#rrggbb colour towards black by factor f (0..1). */
    private static darken(hex: string, f: number): string {
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
    private drawAntBody2D(ctx: CanvasRenderingContext2D, soldier: boolean,
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

    // Cache for static ants (Medium Quality)
    // Cached ant sprites keyed by `${type}_${variant}_${bodyCol}`. Variants are
    // brightness tweaks so the MEDIUM-quality crowd isn't a field of identical clones.
    private antSprites: Record<string, HTMLCanvasElement> = {};
    private static readonly ANT_SHADES = [1.0, 0.85, 1.13, 0.93];

    private getCachedAnt(type: 'WORKER' | 'SOLDIER', variant: number = 0, bodyCol: string = '#cccccc'): HTMLCanvasElement {
        const v = ((variant % Renderer.ANT_SHADES.length) + Renderer.ANT_SHADES.length) % Renderer.ANT_SHADES.length;
        const key = `${type}_${v}_${bodyCol}`;
        if (this.antSprites[key]) return this.antSprites[key];

        // Variants other than the base are brightness-shifted copies of the base.
        if (v !== 0) {
            const base = this.getCachedAnt(type, 0, bodyCol);
            const tinted = document.createElement('canvas');
            tinted.width = base.width;
            tinted.height = base.height;
            const tctx = tinted.getContext('2d')!;
            tctx.filter = `brightness(${Renderer.ANT_SHADES[v]})`;
            tctx.drawImage(base, 0, 0);
            this.antSprites[key] = tinted;
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
        const legCol = Renderer.darken(bodyCol, 0.6);
        this.drawAntBody2D(ctx, soldier, bodyCol, headCol, legCol, S, 0);

        this.antSprites[key] = canvas;
        return canvas;
    }

    drawAnt(ant: any, ctx: CanvasRenderingContext2D = this.ctx) {
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
            const sprite = this.getCachedAnt(ant.type, ant.shade || 0, workerCol);
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
        this.drawShadow(0, 0, 3, ctx);

        // Body — same silhouette as the WebGL world. Legs animate via `phase`.
        const animSpeed = (ant.speedMultiplier !== undefined) ? ant.speedMultiplier : 1.0;
        const soldier = ant.type === 'SOLDIER';
        const S = soldier ? 1.12 : 1.0;
        const headCol = soldier ? '#c01810' : workerCol; // soldier head red (Messor)
        const legCol = Renderer.darken(workerCol, 0.6);
        const phase = PerformanceManager.settings.legAnimation
            ? ((Date.now() * 0.005 * animSpeed) % 1) : 0;
        this.drawAntBody2D(ctx, soldier, workerCol, headCol, legCol, S, phase);

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
    private insectLegs(defs: [number, number, number, number, number, number][], phase: number) {
        const ctx = this.ctx;
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

    drawInsect(insect: any, phase: number = 0) {
        this.ctx.save();
        this.ctx.translate(insect.x, insect.y);

        if (PerformanceManager.settings.simpleInsects) {
            this.ctx.rotate(insect.angle + Math.PI / 2);
            if (insect.type === 'PREY') {
                this.ctx.fillStyle = '#ADD8E6'; // Silver
                this.ctx.beginPath();
                this.ctx.ellipse(0, 0, 2.5, 5, 0, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (insect.type === 'APHID') {
                this.ctx.fillStyle = '#32CD32'; // Lime
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = '#DC143C'; // Red
                this.ctx.beginPath();
                this.ctx.ellipse(0, 0, 3, 4.5, 0, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();
            return;
        }

        // Complex Drawing
        // Shadow - Handled by drawShadows
        // this.drawShadow(0, 0, 6, this.ctx);

        if (insect.type === 'PREY') {
            // Silverfish — tapered segmented silver body, long antennae + 3 tail filaments.
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            const wiggle = Math.sin(Date.now() * 0.02) * 1.2;

            // Legs — 6 small, jointed, splayed.
            this.ctx.strokeStyle = '#8a8a8a';
            this.ctx.lineWidth = 0.7;
            const pLegs: [number, number, number, number, number, number][] = [
                [2, -3, 4.5, -4, 6.5, -5],
                [2.5, -1, 5, -1, 7, 0],
                [2, 1, 4.5, 2, 6.5, 4],
            ];
            this.insectLegs(pLegs, phase);
            // Body — silvery, broad at the head, tapering to the tail.
            const bg = this.ctx.createLinearGradient(-4, 0, 4, 0);
            bg.addColorStop(0, '#9a9a9a'); bg.addColorStop(0.5, '#d2d2d2'); bg.addColorStop(1, '#9a9a9a');
            this.ctx.fillStyle = bg;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -7.5);
            this.ctx.quadraticCurveTo(4.5, -5, 4, 0);
            this.ctx.quadraticCurveTo(3.2, 7, 0, 11);
            this.ctx.quadraticCurveTo(-3.2, 7, -4, 0);
            this.ctx.quadraticCurveTo(-4.5, -5, 0, -7.5);
            this.ctx.fill();
            // Segment plates
            this.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            this.ctx.lineWidth = 0.6;
            for (const yy of [-3, 0, 3, 6]) {
                const rw = 4 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - 1) / 9, 2)));
                this.ctx.beginPath();
                this.ctx.moveTo(-rw, yy); this.ctx.quadraticCurveTo(0, yy + 1.4, rw, yy); this.ctx.stroke();
            }
            // Eyes
            this.ctx.fillStyle = 'rgba(20,20,20,0.65)';
            this.ctx.beginPath();
            this.ctx.arc(-1.3, -6, 0.6, 0, Math.PI * 2); this.ctx.arc(1.3, -6, 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            // Antennae (long, forward + out)
            this.ctx.strokeStyle = '#8a8a8a';
            this.ctx.lineWidth = 0.6;
            this.ctx.beginPath();
            this.ctx.moveTo(-1.3, -6.5); this.ctx.lineTo(-3.5, -11); this.ctx.lineTo(-4.5 - wiggle * 0.3, -15);
            this.ctx.moveTo(1.3, -6.5); this.ctx.lineTo(3.5, -11); this.ctx.lineTo(4.5 + wiggle * 0.3, -15);
            this.ctx.stroke();
            // Tail filaments (3 cerci)
            this.ctx.beginPath();
            this.ctx.moveTo(0, 10); this.ctx.lineTo(wiggle * 0.4, 15.5);
            this.ctx.moveTo(0, 10); this.ctx.lineTo(-2.5, 14);
            this.ctx.moveTo(0, 10); this.ctx.lineTo(2.5, 14);
            this.ctx.stroke();

        } else if (insect.type === 'SPIDER') {
            // Wolf spider — radiating jointed legs, brown-charcoal body, subtle eyes.
            this.ctx.rotate(insect.angle + Math.PI / 2);
            const legCol = '#2a211a';
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = legCol;
            this.ctx.lineWidth = 1.1;
            // [attachX, attachY, kneeX, kneeY, footX, footY] for the right side; mirrored left.
            // Knee sits higher/further out than attach+foot → classic bent-leg fan.
            const sLegs: [number, number, number, number, number, number][] = [
                [3, -6,  9, -12, 15, -14],  // front pair → forward
                [4, -4, 12,  -7, 18,  -6],
                [4, -2, 12,   1, 18,   3],
                [3,  0,  9,   6, 14,  11],  // rear pair → backward
            ];
            this.insectLegs(sLegs, phase);
            // Abdomen (opisthosoma) — large, with a darker median folium marking.
            this.ctx.fillStyle = '#4a3b2c';
            this.ctx.beginPath(); this.ctx.ellipse(0, 4, 5.2, 6.5, 0, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
            this.ctx.beginPath();
            this.ctx.moveTo(0, -1);
            this.ctx.quadraticCurveTo(2.6, 4, 0, 10);
            this.ctx.quadraticCurveTo(-2.6, 4, 0, -1);
            this.ctx.fill();
            // Cephalothorax (prosoma)
            this.ctx.fillStyle = '#3a2e22';
            this.ctx.beginPath(); this.ctx.ellipse(0, -4.5, 4, 4.5, 0, 0, Math.PI * 2); this.ctx.fill();
            // Pedipalps (short front appendages beside the chelicerae)
            this.ctx.lineWidth = 1.2;
            this.ctx.beginPath();
            this.ctx.moveTo(-1.5, -8); this.ctx.lineTo(-3, -11);
            this.ctx.moveTo(1.5, -8); this.ctx.lineTo(3, -11);
            this.ctx.stroke();
            // Eyes — two large forward eyes + a small row (wolf-spider arrangement) with a glint.
            this.ctx.fillStyle = '#111';
            this.ctx.beginPath();
            this.ctx.arc(-1.6, -6.6, 1.1, 0, Math.PI * 2);
            this.ctx.arc(1.6, -6.6, 1.1, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(-3, -5.5, 0.5, 0, Math.PI * 2);
            this.ctx.arc(3, -5.5, 0.5, 0, Math.PI * 2);
            this.ctx.arc(-0.9, -4.6, 0.4, 0, Math.PI * 2);
            this.ctx.arc(0.9, -4.6, 0.4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
            this.ctx.beginPath();
            this.ctx.arc(-1.9, -7.0, 0.35, 0, Math.PI * 2);
            this.ctx.arc(1.3, -7.0, 0.35, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'BEETLE') {
            // Ground beetle — domed bronze-black elytra, pronotum, head + clubbed antennae.
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            // Legs — 6 jointed, dark.
            this.ctx.strokeStyle = '#1a1510';
            this.ctx.lineWidth = 1.0;
            const beLegs: [number, number, number, number, number, number][] = [
                [3, -4, 6, -6, 9, -7],
                [3.5, -1, 7, -1, 10, 0],
                [3, 2, 6, 5, 9, 8],
            ];
            this.insectLegs(beLegs, phase);
            // Head + clubbed antennae
            this.ctx.strokeStyle = '#1a1510';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.moveTo(-1.5, -8.5); this.ctx.lineTo(-3.5, -11.5);
            this.ctx.moveTo(1.5, -8.5); this.ctx.lineTo(3.5, -11.5);
            this.ctx.stroke();
            this.ctx.fillStyle = '#15110c';
            this.ctx.beginPath(); this.ctx.arc(-3.5, -11.8, 0.9, 0, Math.PI * 2); this.ctx.arc(3.5, -11.8, 0.9, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(0, -7.5, 2.6, 0, Math.PI * 2); this.ctx.fill();
            // Pronotum (thorax shield)
            this.ctx.fillStyle = '#241d14';
            this.ctx.beginPath(); this.ctx.ellipse(0, -4.5, 4, 2.6, 0, 0, Math.PI * 2); this.ctx.fill();
            // Elytra (domed wing cases) — warm bronze-black sheen.
            const grad = this.ctx.createLinearGradient(-5.5, 0, 5.5, 0);
            grad.addColorStop(0, '#15110c');
            grad.addColorStop(0.5, '#4a3d28');
            grad.addColorStop(1, '#15110c');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.ellipse(0, 1.5, 5.5, 7.5, 0, 0, Math.PI * 2); this.ctx.fill();
            // Elytra split + parallel striations
            this.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -4); this.ctx.lineTo(0, 8.5);
            this.ctx.moveTo(-2.6, -2); this.ctx.quadraticCurveTo(-3.2, 2, -2.2, 6.5);
            this.ctx.moveTo(2.6, -2); this.ctx.quadraticCurveTo(3.2, 2, 2.2, 6.5);
            this.ctx.stroke();
            // Glossy highlight
            this.ctx.fillStyle = 'rgba(255,255,255,0.14)';
            this.ctx.beginPath(); this.ctx.ellipse(-2, -1.5, 1.6, 3.2, 0.3, 0, Math.PI * 2); this.ctx.fill();

        } else if (insect.type === 'LADYBUG') {
            // Ladybug — domed red elytra, symmetric spots, black head with cheek spots.
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            // Legs — 6 short black, jointed.
            this.ctx.strokeStyle = '#111';
            this.ctx.lineWidth = 0.9;
            const lLegs: [number, number, number, number, number, number][] = [
                [3, -3, 5, -4, 7, -5],
                [3.5, -1, 6, -1, 8, 0],
                [3, 2, 5, 4, 7, 6],
            ];
            this.insectLegs(lLegs, phase);
            // Head (black) + tiny antennae + white cheek spots.
            this.ctx.strokeStyle = '#111';
            this.ctx.lineWidth = 0.7;
            this.ctx.beginPath();
            this.ctx.moveTo(-1.2, -7); this.ctx.lineTo(-2.6, -9.5);
            this.ctx.moveTo(1.2, -7); this.ctx.lineTo(2.6, -9.5);
            this.ctx.stroke();
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath(); this.ctx.arc(0, -5.8, 2.8, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.fillStyle = '#FFF';
            this.ctx.beginPath(); this.ctx.arc(-1.3, -6.6, 0.7, 0, Math.PI * 2); this.ctx.arc(1.3, -6.6, 0.7, 0, Math.PI * 2); this.ctx.fill();
            // Shell
            const grad = this.ctx.createRadialGradient(-2, -2, 0, 0, 1, 7);
            grad.addColorStop(0, '#ff5a2a');
            grad.addColorStop(1, '#c00000');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.ellipse(0, 1, 5.5, 6.5, 0, 0, Math.PI * 2); this.ctx.fill();
            // Elytra split line
            this.ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath(); this.ctx.moveTo(0, -4); this.ctx.lineTo(0, 7); this.ctx.stroke();
            // Symmetric spots
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath();
            for (const [sx, sy, sr] of [[-2.8, -1.2, 1.1], [2.8, -1.2, 1.1], [-3, 2.6, 1.1], [3, 2.6, 1.1], [-1.4, 5, 0.9], [1.4, 5, 0.9]] as [number, number, number][]) {
                this.ctx.moveTo(sx + sr, sy); this.ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            }
            this.ctx.fill();
            // Glossy highlight
            this.ctx.fillStyle = 'rgba(255,255,255,0.22)';
            this.ctx.beginPath(); this.ctx.ellipse(-2.2, -1.5, 1.4, 2.2, 0.4, 0, Math.PI * 2); this.ctx.fill();

        } else if (insect.type === 'PREDATOR') {
            // Predatory beetle — segmented dark-crimson body, sickle mandibles, bulging eyes,
            // long spiny legs. Reads as the colony's main threat.
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            // Legs — 6 long, jointed, dark.
            this.ctx.strokeStyle = '#3a0a08';
            this.ctx.lineWidth = 1.2;
            const prLegs: [number, number, number, number, number, number][] = [
                [3, -5, 8, -8, 12, -9],
                [3.5, -1, 9, -1, 13, 1],
                [3, 3, 8, 7, 12, 11],
            ];
            this.insectLegs(prLegs, phase);
            // Abdomen (elongated) — crimson with a bronze sheen + segment bands.
            const grad = this.ctx.createLinearGradient(-5, 0, 5, 0);
            grad.addColorStop(0, '#5a0e0a');
            grad.addColorStop(0.5, '#c0241a');
            grad.addColorStop(1, '#5a0e0a');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath(); this.ctx.ellipse(0, 2, 5, 8, 0, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            this.ctx.lineWidth = 0.7;
            for (const yy of [0, 3, 6]) {
                const rw = 5 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - 2) / 8, 2)));
                this.ctx.beginPath(); this.ctx.moveTo(-rw, yy); this.ctx.quadraticCurveTo(0, yy + 1.3, rw, yy); this.ctx.stroke();
            }
            // Pronotum (thorax)
            this.ctx.fillStyle = '#8a1410';
            this.ctx.beginPath(); this.ctx.ellipse(0, -6, 4, 3, 0, 0, Math.PI * 2); this.ctx.fill();
            // Head
            this.ctx.fillStyle = '#a01812';
            this.ctx.beginPath(); this.ctx.arc(0, -10, 3.4, 0, Math.PI * 2); this.ctx.fill();
            // Sickle mandibles — dark, curved, crossing forward.
            this.ctx.strokeStyle = '#1a0907';
            this.ctx.lineWidth = 1.6;
            this.ctx.beginPath();
            this.ctx.moveTo(-2.4, -11.5); this.ctx.quadraticCurveTo(-5, -15.5, -0.8, -16.5);
            this.ctx.moveTo(2.4, -11.5); this.ctx.quadraticCurveTo(5, -15.5, 0.8, -16.5);
            this.ctx.stroke();
            // Bulging eyes with a glint.
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath(); this.ctx.arc(-3, -10.5, 1.7, 0, Math.PI * 2); this.ctx.arc(3, -10.5, 1.7, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.fillStyle = 'rgba(255,255,255,0.55)';
            this.ctx.beginPath(); this.ctx.arc(-3.4, -11, 0.5, 0, Math.PI * 2); this.ctx.arc(2.6, -11, 0.5, 0, Math.PI * 2); this.ctx.fill();

        } else if (insect.type === 'APHID') {
            // Aphid — plump pear-shaped lime body, antennae, cornicles (tail pipes).
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            // Legs — 6 short, soft green, jointed.
            this.ctx.strokeStyle = 'rgba(90,150,40,0.7)';
            this.ctx.lineWidth = 0.7;
            const aLegs: [number, number, number, number, number, number][] = [
                [2, -2, 4, -3, 5.5, -4],
                [2.5, 0, 4.5, 0, 6, 1],
                [2, 2, 4, 4, 5.5, 6],
            ];
            this.insectLegs(aLegs, phase);
            // Antennae (long, forward + out)
            this.ctx.strokeStyle = 'rgba(90,150,40,0.8)';
            this.ctx.lineWidth = 0.6;
            this.ctx.beginPath();
            this.ctx.moveTo(-1.2, -4); this.ctx.lineTo(-2.5, -7); this.ctx.lineTo(-3, -10);
            this.ctx.moveTo(1.2, -4); this.ctx.lineTo(2.5, -7); this.ctx.lineTo(3, -10);
            this.ctx.stroke();
            // Abdomen (plump) + head
            const ag = this.ctx.createRadialGradient(-1.2, 0, 0, 0, 1, 5);
            ag.addColorStop(0, '#c4f23a');
            ag.addColorStop(1, '#8fc41e');
            this.ctx.fillStyle = ag;
            this.ctx.beginPath(); this.ctx.ellipse(0, 1.5, 3.8, 4.8, 0, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.fillStyle = '#a9d62a';
            this.ctx.beginPath(); this.ctx.arc(0, -3.2, 2.1, 0, Math.PI * 2); this.ctx.fill();
            // Highlight
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.beginPath(); this.ctx.ellipse(-1.3, -0.5, 1, 1.8, 0.3, 0, Math.PI * 2); this.ctx.fill();
            // Eyes
            this.ctx.fillStyle = 'rgba(20,20,20,0.7)';
            this.ctx.beginPath();
            this.ctx.arc(-1.4, -3.6, 0.5, 0, Math.PI * 2); this.ctx.arc(1.4, -3.6, 0.5, 0, Math.PI * 2);
            this.ctx.fill();
            // Cornicles (tail pipes)
            this.ctx.strokeStyle = '#5a8a18';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(-2.4, 4.5); this.ctx.lineTo(-3, 7);
            this.ctx.moveTo(2.4, 4.5); this.ctx.lineTo(3, 7);
            this.ctx.stroke();
        } else {
            // Fallback for unknown types (Debug: Pink Square)
            this.ctx.fillStyle = '#FF00FF';
            this.ctx.fillRect(-5, -5, 10, 10);
        }

        this.ctx.restore();
    }

    drawRock(x: number, y: number, radius: number) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);

        // Shadow
        this.drawShadow(0, 0, radius, ctx);

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

    drawEntrance() {
        const isLandscape = CONFIG.width > CONFIG.height;
        const entranceX = isLandscape ? CONFIG.width - 15 : this.width / 2;
        const entranceY = isLandscape ? this.height / 2 : CONFIG.height - 15;
        const moundGrad = this.ctx.createRadialGradient(entranceX, entranceY, 10, entranceX, entranceY, 40);
        moundGrad.addColorStop(0, '#3a2a1a');
        moundGrad.addColorStop(1, 'rgba(58, 42, 26, 0)');
        this.ctx.fillStyle = moundGrad;
        this.ctx.beginPath();
        this.ctx.arc(entranceX, entranceY, 40, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#050505';
        this.ctx.beginPath();
        if (isLandscape) this.ctx.ellipse(entranceX + 5, entranceY, 15, 25, 0, 0, Math.PI * 2);
        else this.ctx.ellipse(entranceX, entranceY + 5, 25, 15, 0, 0, Math.PI * 2);
        this.ctx.fill();
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
        return this.bakeCentered(64, () => this.drawInsect({ x: 0, y: 0, type, angle: 0 }, phase));
    }

    bakeFoodCanvas(type: string): HTMLCanvasElement {
        // Reference amount 200 → radius ≈ 12; the sprite is scaled per source.
        return this.bakeCentered(64, () => this.drawFood({ x: 0, y: 0, type, amount: 200, maxAmount: 200 }));
    }

    // Static decoration (rocks, grass, entrance) drawn once at world resolution.
    renderStaticDecoration(world: World): HTMLCanvasElement {
        const c = document.createElement('canvas');
        c.width = CONFIG.width; c.height = CONFIG.height;
        const ctx = c.getContext('2d')!;
        this.withCtx(ctx, () => {
            for (const obs of world.terrain.obstacles) this.drawRock(obs.x, obs.y, obs.radius);
            for (const g of world.grass) this.drawGrass(g);
            this.drawEntrance();
        });
        return c;
    }

    drawFood(food: any) {
        const ctx = this.ctx;
        const radius = Math.max(8, Math.sqrt(food.amount) * 0.85);

        // Shadow
        ctx.save();
        ctx.translate(food.x, food.y);
        this.drawShadow(0, 0, radius, ctx);
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
                    this.drawLegs(3, 2, '#333', 0, ctx); // Static legs
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

    drawGrass(g: any) {
        // Optimized: Use Cached Sprite
        const ctx = this.ctx;

        // Pick variation deterministically
        const variant = Math.floor(g.x + g.y) % this.grassSprites.length;
        const sprite = this.grassSprites[variant];

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


    drawGodRays() {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.15;

        // Moving rays

        // Moving rays
        const time = Date.now() * 0.0005;
        for (let i = 0; i < 3; i++) {
            const offset = Math.sin(time + i) * 100;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(this.width * 0.5 + offset, 0);
            ctx.lineTo(this.width * 0.6 + offset, 0);
            ctx.lineTo(this.width * 0.4 + offset - 200, this.height);
            ctx.lineTo(this.width * 0.3 + offset - 200, this.height);
            ctx.fill();
        }

        ctx.restore();
    }

    drawVignette() {
        const ctx = this.ctx;
        const grad = ctx.createRadialGradient(this.width / 2, this.height / 2, this.width * 0.3, this.width / 2, this.height / 2, this.width * 0.8);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.2)'); // Much lighter vignette

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    private rainRipples: { x: number; y: number; age: number }[] = [];
    drawRain(world: World) {
        if (!world.raining) return;
        const ctx = this.ctx;
        const lowFx = PerformanceManager.level === QualityLevel.ULTRA_LOW;
        ctx.save();
        // Overcast wet darkening.
        ctx.fillStyle = 'rgba(40, 50, 70, 0.20)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Two depth layers of wind-slanted streaks (far = faint/short, near = bright/long).
        const slant = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(170, 190, 225, 0.16)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * this.width, y = Math.random() * this.height, len = 6 + Math.random() * 6;
            ctx.moveTo(x, y); ctx.lineTo(x - slant * 0.6, y + len);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(198, 214, 242, 0.4)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * this.width, y = Math.random() * this.height, len = 12 + Math.random() * 12;
            ctx.moveTo(x, y); ctx.lineTo(x - slant, y + len);
        }
        ctx.stroke();

        // Droplet impact rings: spawn a few each frame, expand + fade (flattened = on-ground).
        if (!lowFx) {
            for (let s = 0; s < 2; s++) this.rainRipples.push({ x: Math.random() * this.width, y: Math.random() * this.height, age: 0 });
            ctx.strokeStyle = 'rgba(205, 222, 246, 1)'; ctx.lineWidth = 0.8;
            for (let i = this.rainRipples.length - 1; i >= 0; i--) {
                const r = this.rainRipples[i]; r.age++;
                const t = r.age / 16;
                if (t >= 1) { this.rainRipples.splice(i, 1); continue; }
                ctx.globalAlpha = (1 - t) * 0.5;
                const rad = 1 + t * 5;
                ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    drawLighting(world: World) {
        if (!this.dayNight) return;
        const ctx = this.ctx;
        const time = world.timeOfDay; // 0-1
        const k = this.dayNightIntensity; // overall strength (toned down by default)

        // Night/dawn/dusk darkness (0 during the day).
        let alpha = 0;
        if (time < 0.2) alpha = 0.7 * (1 - time / 0.2);        // dawn fading out
        else if (time < 0.7) alpha = 0;                         // day
        else if (time < 0.8) alpha = 0.7 * ((time - 0.7) / 0.1); // dusk fading in
        else alpha = 0.7;                                       // night
        alpha *= k;

        ctx.save();
        if (alpha > 0.001) {
            ctx.fillStyle = `rgba(0, 10, 30, ${alpha})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Sun/Moon glow (also scaled by intensity).
        if (time > 0.8 || time < 0.2) {
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(100, 150, 255, ${0.1 * k})`;
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (time > 0.2 && time < 0.3) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = `rgba(255, 200, 100, ${0.2 * k})`;
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (time > 0.6 && time < 0.7) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = `rgba(255, 100, 50, ${0.2 * k})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        ctx.restore();
    }

    // How dark the sky is right now: 0 in full day, 1 at deep night (scaled by intensity).
    private darknessFactor(world: World): number {
        const t = world.timeOfDay;
        let d = 0;
        if (t < 0.2) d = 1 - t / 0.2;
        else if (t < 0.7) d = 0;
        else if (t < 0.8) d = (t - 0.7) / 0.1;
        else d = 1;
        return d * this.dayNightIntensity;
    }

    private fireflies: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];
    // Glowworms drifting over the scene at night (screen-space; cheap two-circle glow).
    drawFireflies(world: World) {
        if (!this.dayNight) return;
        const dark = this.darknessFactor(world);
        if (dark < 0.06) return; // none in daylight
        const ctx = this.ctx;
        if (this.fireflies.length === 0) {
            for (let i = 0; i < 18; i++) this.fireflies.push({
                x: Math.random() * this.width, y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
                ph: Math.random() * Math.PI * 2,
            });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const f of this.fireflies) {
            f.x += f.vx; f.y += f.vy; f.ph += 0.045;
            if (f.x < 0 || f.x > this.width) f.vx *= -1;
            if (f.y < 0 || f.y > this.height) f.vy *= -1;
            if (Math.random() < 0.01) { f.vx = (Math.random() - 0.5) * 0.45; f.vy = (Math.random() - 0.5) * 0.45; }
            const a = (0.45 + 0.55 * Math.sin(f.ph)) * dark; // flicker, faded by darkness
            if (a <= 0.01) continue;
            ctx.fillStyle = `rgba(190,255,110,${0.22 * a})`;
            ctx.beginPath(); ctx.arc(f.x, f.y, 6, 0, Math.PI * 2); ctx.fill();   // halo
            ctx.fillStyle = `rgba(225,255,165,${0.9 * a})`;
            ctx.beginPath(); ctx.arc(f.x, f.y, 1.6, 0, Math.PI * 2); ctx.fill(); // core
        }
        ctx.restore();
    }

    drawShadows(world: World) {
        const ctx = this.ctx;
        const time = world.timeOfDay;

        // No shadows at night
        if (time > 0.8 || time < 0.1) return;

        // Calculate Sun Position (Moves from Left to Right)
        // 0.1 (Dawn) -> Left
        // 0.45 (Noon) -> Center
        // 0.8 (Dusk) -> Right

        // Shadow Offset (Opposite to sun)
        // Dawn: Sun Left -> Shadow Right (+x)
        // Dusk: Sun Right -> Shadow Left (-x)

        let sunX = ((time - 0.1) / 0.7) * this.width; // 0 to Width
        let shadowLen = 1.0;

        // Shadow Length depends on time (Long at dawn/dusk, short at noon)
        const noonDist = Math.abs(time - 0.45);
        shadowLen = 0.5 + noonDist * 2; // Reduced max length

        const shadowOffsetX = (this.width / 2 - sunX) / (this.width / 2) * 2 * shadowLen; // Much closer
        const shadowOffsetY = 1 * shadowLen; // Very close

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';

        // Draw Shadows for Ants (every colony)
        for (const c of world.colonies) {
            for (const ant of c.ants) {
                if (ant.location === 'WORLD') {
                    ctx.beginPath();
                    ctx.ellipse(ant.x + shadowOffsetX, ant.y + shadowOffsetY, 3, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw Shadows for Insects
        for (const insect of world.insects) {
            ctx.beginPath();
            ctx.ellipse(insect.x + shadowOffsetX, insect.y + shadowOffsetY, 5, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
