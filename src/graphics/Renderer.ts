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
    showPheromones: boolean = false;

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
        this.grassSprites = [];
        for (let v = 0; v < 5; v++) { // 5 Variations
            const c = document.createElement('canvas');
            c.width = 60; // Wide enough
            c.height = 60;
            const ctx = c.getContext('2d')!;

            // Draw relative to bottom-center (30, 60)
            ctx.translate(30, 60);

            // Draw a Tuft (Cluster of blades)
            const bladeCount = 5 + Math.floor(Math.random() * 3);
            for (let i = 0; i < bladeCount; i++) {
                const offsetAngle = (i - bladeCount / 2) * 0.3 + (Math.random() - 0.5) * 0.2;
                const lengthVar = 0.8 + Math.random() * 0.4;
                const size = 6; // Base size for generation

                ctx.save();
                ctx.rotate(offsetAngle);

                // Blade Gradient (Baked in)
                const gradient = ctx.createLinearGradient(0, 0, 5, -30 * lengthVar);
                gradient.addColorStop(0, '#1a331a'); // Dark base
                gradient.addColorStop(1, '#4d804d'); // Light tip
                ctx.fillStyle = gradient;

                ctx.beginPath();
                ctx.moveTo(-2, 0);
                ctx.quadraticCurveTo(0, -size * 2 * lengthVar, 2, -size * 5 * lengthVar); // Curve right
                ctx.quadraticCurveTo(0, -size * 2 * lengthVar, 2, 0);
                ctx.fill();

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
        // Setup Pheromone Offscreen Canvas (Scaled by Quality)
        const scale = PerformanceManager.settings.pheromoneResolutionScale;

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

        // Base Dirt Color
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, w, h);

        // Noise / Texture
        const count = (w * h) / 200;

        for (let i = 0; i < count; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const size = Math.random() * 2 + 1;
            const opacity = Math.random() * 0.1;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(x, y, size, size);
        }

        // Darker patches
        const patchCount = (w * h) / 5000;
        for (let i = 0; i < patchCount; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const r = Math.random() * 50 + 20;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fill();
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
                        const rVal = Math.min(255, ((protein + sugar + danger) * 255) | 0);
                        const gVal = Math.min(255, (sugar * 255) | 0);
                        const bVal = Math.min(255, ((home + danger) * 255) | 0);
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
            ctx.globalAlpha = 0.55;
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

        // 4.5 Vegetation (Grass)
        // Draw on MEDIUM, HIGH, ULTRA
        if (PerformanceManager.level !== QualityLevel.LOW && PerformanceManager.level !== QualityLevel.ULTRA_LOW) {
            for (const g of world.grass) {
                this.drawGrass(g);
            }
        }

        // 5. Insects (Shadows handled inside)
        for (const insect of world.insects) {
            this.drawInsect(insect);
        }

        // 6. Ants (World only)
        for (const ant of world.ants) {
            if (ant.location === 'WORLD') {
                this.drawAnt(ant, this.ctx);
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

        const storage = world.nest.getChamber('STORAGE');
        if (storage) {
            // Draw Food Piles BEFORE ants so ants walk ON TOP
            this.drawFoodPile(storage.x, storage.y, storage.radius, world.sugarStockpile, 'SUGAR', ctx);
            this.drawFoodPile(storage.x, storage.y, storage.radius, world.proteinStockpile, 'PROTEIN', ctx);
        }

        // Draw Dynamic Entities
        this.drawQueen(world.queen, ctx);

        for (const b of world.brood) {
            this.drawBrood(b, ctx);
        }

        for (const ant of world.ants) {
            if (ant.location === 'NEST') {
                this.drawAnt(ant, ctx);
            }
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
        ctx.save();
        ctx.translate(queen.x, queen.y);
        ctx.rotate(Math.sin(Date.now() * 0.001) * 0.05);

        // Scale down to be less massive (0.45x previous size)
        const scale = 0.45;
        ctx.scale(scale, scale);

        // Shadow
        this.drawShadow(0, 0, 15, ctx);

        // Legs (Attached to Thorax)
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        const legTime = Date.now() * 0.005;

        for (let i = 0; i < 3; i++) {
            const yOffset = -5 + i * 5; // Spread along thorax

            // Right legs
            ctx.beginPath();
            ctx.moveTo(4, yOffset);
            ctx.quadraticCurveTo(15, yOffset - 5, 20, yOffset + 10 + Math.sin(legTime + i) * 3);
            ctx.stroke();

            // Left legs
            ctx.beginPath();
            ctx.moveTo(-4, yOffset);
            ctx.quadraticCurveTo(-15, yOffset - 5, -20, yOffset + 10 + Math.sin(legTime + i + Math.PI) * 3);
            ctx.stroke();
        }

        // Abdomen (Physogastric - Swollen with eggs)
        const pulse = 1.0 + Math.sin(Date.now() * 0.002) * 0.02;

        ctx.fillStyle = '#A0522D'; // Sienna base
        ctx.beginPath();
        // Elongated, swollen oval
        ctx.ellipse(0, 22, 14 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();

        // Darker Segments (Stripes)
        ctx.fillStyle = 'rgba(60, 30, 10, 0.4)';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            // Curved stripes
            ctx.ellipse(0, 12 + i * 6, 13 * pulse * (1 - i * 0.05), 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Specular Highlight on Abdomen
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.ellipse(-5, 20, 4, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Petiole (Waist)
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Thorax (Muscular, Humped)
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        // Rounded rectangle/oval shape
        ctx.ellipse(0, -10, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wing Scars (Black marks on thorax)
        ctx.fillStyle = '#221';
        ctx.beginPath();
        ctx.ellipse(-4, -12, 2, 4, 0.3, 0, Math.PI * 2);
        ctx.ellipse(4, -12, 2, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Head (Heart shaped)
        ctx.fillStyle = '#8B4513'; // Same as thorax
        ctx.save();
        ctx.translate(0, -24); // Move to head pos

        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        // Mandibles
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-3, -4); ctx.lineTo(-6, -10);
        ctx.moveTo(3, -4); ctx.lineTo(6, -10);
        ctx.stroke();

        // Antennae (Elbowed)
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Left
        ctx.moveTo(-4, -2);
        ctx.lineTo(-12, -6); // Scape
        ctx.lineTo(-18, 4); // Funiculus
        // Right
        ctx.moveTo(4, -2);
        ctx.lineTo(12, -6);
        ctx.lineTo(18, 4);
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-5, -1, 2, 0, Math.PI * 2);
        ctx.arc(5, -1, 2, 0, Math.PI * 2);
        ctx.fill();

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

    // Cache for static ants (Medium Quality)
    // Cached ant sprites keyed by `${type}_${variant}`. Variants are brightness
    // tweaks so the MEDIUM-quality crowd isn't a field of identical clones.
    private antSprites: Record<string, HTMLCanvasElement> = {};
    private static readonly ANT_SHADES = [1.0, 0.85, 1.13, 0.93];

    private getCachedAnt(type: 'WORKER' | 'SOLDIER', variant: number = 0): HTMLCanvasElement {
        const v = ((variant % Renderer.ANT_SHADES.length) + Renderer.ANT_SHADES.length) % Renderer.ANT_SHADES.length;
        const key = `${type}_${v}`;
        if (this.antSprites[key]) return this.antSprites[key];

        // Variants other than the base are brightness-shifted copies of the base.
        if (v !== 0) {
            const base = this.getCachedAnt(type, 0);
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
        canvas.width = 30; // Sufficient size
        canvas.height = 30;
        const ctx = canvas.getContext('2d')!;

        ctx.translate(15, 15); // Center
        // No rotation needed here, we rotate the canvas usage

        // Draw Legs (Static)
        ctx.strokeStyle = '#AAA';
        ctx.lineWidth = 0.5;
        const count = 6;
        const length = 4;
        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const legIndex = Math.floor(i / 2);
            const spread = 2;
            const legOffset = (legIndex - (count / 4) + 0.5) * spread;
            const move = (i % 2 === 0 ? 0.3 : -0.3); // Static pose

            ctx.beginPath();
            ctx.moveTo(legOffset, 0);
            const kx = legOffset + move;
            const ky = side * length * 0.5;
            const fx = kx + move;
            const fy = side * length;
            ctx.quadraticCurveTo(kx, ky, fx, fy);
            ctx.stroke();
        }

        // Draw Body
        if (type === 'SOLDIER') {
            ctx.fillStyle = '#4B0000'; // Flat Dark Red
            // Thorax
            ctx.beginPath(); ctx.ellipse(-1, 0, 2.5, 2.0, 0, 0, Math.PI * 2); ctx.fill();
            // Abdomen
            ctx.fillStyle = '#4A0404';
            ctx.beginPath(); ctx.ellipse(-6, 0, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
            // Stripes
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(-7.5, -1.5, 1, 3);
            ctx.fillRect(-5.5, -1.8, 1, 3.6);
            // Head
            ctx.fillStyle = '#900000';
            ctx.beginPath();
            ctx.moveTo(1, -4.5);
            ctx.lineTo(6, -4.5);
            ctx.quadraticCurveTo(8, -4.5, 8, 0);
            ctx.quadraticCurveTo(8, 4.5, 6, 4.5);
            ctx.lineTo(1, 4.5);
            ctx.quadraticCurveTo(0, 0, 1, -4.5);
            ctx.fill();
            // Mandibles
            ctx.strokeStyle = '#221100'; ctx.lineWidth = 3.0;
            ctx.beginPath(); ctx.moveTo(7, 3.0); ctx.quadraticCurveTo(10, 3.0, 11, 0.5);
            ctx.moveTo(7, -3.0); ctx.quadraticCurveTo(10, -3.0, 11, -0.5); ctx.stroke();

        } else {
            // WORKER
            ctx.fillStyle = '#CCC';
            // Head
            ctx.beginPath(); ctx.arc(2, 0, 1.5, 0, Math.PI * 2); ctx.fill();
            // Thorax
            ctx.beginPath(); ctx.ellipse(0, 0, 2, 1, 0, 0, Math.PI * 2); ctx.fill();
            // Abdomen
            ctx.beginPath(); ctx.ellipse(-3, 0, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        }

        this.antSprites[`${type}_0`] = canvas;
        return canvas;
    }

    drawAnt(ant: any, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.save();
        ctx.translate(ant.x, ant.y);
        ctx.rotate(ant.angle);

        // Subtle per-ant size variance so the colony isn't uniform.
        const sv = ant.sizeVar || 1;
        if (sv !== 1) ctx.scale(sv, sv);

        if (PerformanceManager.settings.simpleAnts) {
            // OPTIMIZED (Body Only, No Legs, Flat Colors)
            if (ant.type === 'SOLDIER') {
                // Soldier: Dark body, RED head (matching HIGH/ULTRA theme)
                ctx.fillStyle = '#444'; // Dark Gray body

                // Abdomen
                ctx.beginPath(); ctx.ellipse(-5, 0, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
                // Thorax
                ctx.beginPath(); ctx.ellipse(-1, 0, 2.5, 2.0, 0, 0, Math.PI * 2); ctx.fill();

                // Head (RED)
                ctx.fillStyle = '#C00'; // Bright Red
                ctx.beginPath(); ctx.rect(1, -3, 5, 6); ctx.fill();

            } else {
                // Worker: Light Gray (matching HIGH/ULTRA)
                ctx.fillStyle = '#CCC';

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
            const sprite = this.getCachedAnt(ant.type, ant.shade || 0);
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

        // Legs
        const animSpeed = (ant.speedMultiplier !== undefined) ? ant.speedMultiplier : 1.0;
        this.drawLegs(6, 4, '#AAA', animSpeed, ctx);

        if (ant.type === 'SOLDIER') {
            // Pheidole Soldier (Big-headed Ant) - HEAVY ARMOR VISUALS

            // Thorax (Muscular)
            if (PerformanceManager.settings.gradients) {
                const gradThorax = ctx.createRadialGradient(0, 0, 0, 0, 0, 3);
                gradThorax.addColorStop(0, '#5D0000'); // Dark Red Core
                gradThorax.addColorStop(1, '#3E0000'); // Darker Edge
                ctx.fillStyle = gradThorax;
            } else {
                ctx.fillStyle = '#4B0000'; // Flat Dark Red
            }
            ctx.beginPath();
            ctx.ellipse(-1, 0, 2.5, 2.0, 0, 0, Math.PI * 2); // Beefier thorax
            ctx.fill();

            // Abdomen (Armored/Striped)
            ctx.fillStyle = '#4A0404'; // Dark Maroon
            ctx.beginPath();
            ctx.ellipse(-6, 0, 3.5, 2.5, 0, 0, Math.PI * 2); // Larger abdomen
            ctx.fill();

            // Abdomen Stripes (Lighter Red)
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(-7.5, -1.5, 1, 3);
            ctx.fillRect(-5.5, -1.8, 1, 3.6);

            // Head (Massive, Heart-shaped/Square)
            // Head (Massive, Heart-shaped/Square)
            if (PerformanceManager.settings.gradients) {
                const gradHead = ctx.createRadialGradient(3, 0, 0, 3, 0, 5);
                gradHead.addColorStop(0, '#B22222'); // Firebrick Red
                gradHead.addColorStop(1, '#800000'); // Maroon
                ctx.fillStyle = gradHead;
            } else {
                ctx.fillStyle = '#900000'; // Flat Maroon
            }

            ctx.beginPath();
            // Draw a rounded square/heart shape for the head
            ctx.moveTo(1, -4.5);
            ctx.lineTo(6, -4.5); // Top edge
            ctx.quadraticCurveTo(8, -4.5, 8, 0); // Front curve
            ctx.quadraticCurveTo(8, 4.5, 6, 4.5); // Bottom edge
            ctx.lineTo(1, 4.5);
            ctx.quadraticCurveTo(0, 0, 1, -4.5); // Back curve
            ctx.fill();

            // Head Armor Highlight (Shiny Chitin)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.ellipse(4, -2, 1.5, 1, -0.5, 0, Math.PI * 2);
            ctx.fill();

            // Mandibles (Massive, Crushing)
            ctx.strokeStyle = '#221100'; // Almost Black
            ctx.lineWidth = 3.0; // Thicker
            ctx.beginPath();
            // Left Mandible
            ctx.moveTo(7, 3.0);
            ctx.quadraticCurveTo(10, 3.0, 11, 0.5); // Curved, sharp
            // Right Mandible
            ctx.moveTo(7, -3.0);
            ctx.quadraticCurveTo(10, -3.0, 11, -0.5);
            ctx.stroke();

        } else {
            // WORKER
            // Head
            // WORKER
            // Head
            if (PerformanceManager.settings.gradients) {
                const gradHead = ctx.createRadialGradient(2, 0, 0, 2, 0, 2);
                gradHead.addColorStop(0, '#FFF');
                gradHead.addColorStop(1, '#AAA');
                ctx.fillStyle = gradHead;
            } else {
                ctx.fillStyle = '#CCC';
            }
            ctx.beginPath();
            ctx.arc(2, 0, 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Thorax
            ctx.beginPath();
            ctx.ellipse(0, 0, 2, 1, 0, 0, Math.PI * 2);
            ctx.fill();

            // Abdomen
            ctx.beginPath();
            ctx.ellipse(-3, 0, 2.5, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

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

    drawInsect(insect: any) {
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
            // Silverfish / Springtail look
            this.ctx.rotate(insect.angle + Math.PI / 2); // Face forward

            // Wiggle animation
            const wiggle = Math.sin(Date.now() * 0.02) * 2;

            // Legs (Many, small)
            this.drawLegs(6, 4, '#888', 2.0, this.ctx, true);

            // Body (Teardrop, segmented)
            this.ctx.fillStyle = '#A9A9A9'; // Dark Gray
            this.ctx.beginPath();
            this.ctx.moveTo(0, -6);
            this.ctx.quadraticCurveTo(4 + wiggle, 0, 0, 8); // Tail
            this.ctx.quadraticCurveTo(-4, 0, 0, -6); // Head
            this.ctx.fill();

            // Tail bristles
            this.ctx.strokeStyle = '#888';
            this.ctx.lineWidth = 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 8); this.ctx.lineTo(0, 12);
            this.ctx.moveTo(0, 8); this.ctx.lineTo(-2, 11);
            this.ctx.moveTo(0, 8); this.ctx.lineTo(2, 11);
            this.ctx.moveTo(0, 8); this.ctx.lineTo(2, 11);
            this.ctx.stroke();

            // Antennae
            this.ctx.beginPath();
            this.ctx.moveTo(0, -6); this.ctx.lineTo(-3, -10);
            this.ctx.fill();

            // Thorax/Head
            this.ctx.fillStyle = '#222';
            this.ctx.beginPath();
            this.ctx.arc(0, -4, 3.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Mandibles
            this.ctx.strokeStyle = '#522';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(-2, -6); this.ctx.lineTo(-1, -9);
            this.ctx.moveTo(2, -6); this.ctx.lineTo(1, -9);
            this.ctx.stroke();

        } else if (insect.type === 'SPIDER') {
            // Wolf Spider
            this.ctx.rotate(insect.angle + Math.PI / 2);

            // 8 Legs (Long, jointed)
            this.drawLegs(8, 12, '#3e2723', 1.0);

            // Abdomen (Large, fuzzy)
            this.ctx.fillStyle = '#1a1a1a'; // Much darker (Black)
            this.ctx.strokeStyle = '#AAA'; // Light Grey Outline
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 3, 5, 6, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Cephalothorax (Smaller)
            this.ctx.fillStyle = '#000'; // Pure Black
            this.ctx.beginPath();
            this.ctx.ellipse(0, -4, 4, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Eyes (Many)
            this.ctx.fillStyle = '#F00'; // Glowing Red Eyes
            this.ctx.beginPath();
            this.ctx.rect(-1.5, -7, 1, 1);
            this.ctx.rect(0.5, -7, 1, 1);
            this.ctx.rect(-3.5, -6, 1, 1); // Extra eyes
            this.ctx.rect(2.5, -6, 1, 1);
            this.ctx.fill();

        } else if (insect.type === 'BEETLE') {
            // Hard Shell Beetle
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.drawLegs(6, 5, '#000', 0.8);

            // Body (Oval)
            const grad = this.ctx.createLinearGradient(-5, 0, 5, 0);
            grad.addColorStop(0, '#111');
            grad.addColorStop(0.5, '#333'); // Shiny
            grad.addColorStop(1, '#111');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2);
            this.ctx.fill();
            // Outline for visibility
            this.ctx.strokeStyle = '#DDD';
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();

            // Elytra Line (Wing case split)
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -2); this.ctx.lineTo(0, 7);
            this.ctx.stroke();

            // Head
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(0, -6, 3, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'LADYBUG') {
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.drawLegs(6, 4, '#000', 1.0);

            // Shell
            const grad = this.ctx.createRadialGradient(-2, -2, 0, 0, 0, 6);
            grad.addColorStop(0, '#FF4400');
            grad.addColorStop(1, '#CC0000');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 5, 6, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Spots
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(-2.5, -2, 1.2, 0, Math.PI * 2);
            this.ctx.arc(2.5, -2, 1.2, 0, Math.PI * 2);
            this.ctx.arc(-2, 3, 1.2, 0, Math.PI * 2);
            this.ctx.arc(2, 3, 1.2, 0, Math.PI * 2);
            this.ctx.arc(0, 0, 1, 0, Math.PI * 2);
            this.ctx.fill();

            // Head (Pronotum)
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(0, -5, 3, 0, Math.PI * 2);
            this.ctx.fill();

            // White spots on head
            this.ctx.fillStyle = '#FFF';
            this.ctx.beginPath();
            this.ctx.arc(-1.5, -6, 0.8, 0, Math.PI * 2);
            this.ctx.arc(1.5, -6, 0.8, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'PREDATOR') {
            // Tiger Beetle / Aggressive Bug
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.drawLegs(6, 8, '#800000', 1.5); // Long, dark red legs

            // Body (Elongated, metallic)
            const grad = this.ctx.createLinearGradient(0, -8, 0, 8);
            grad.addColorStop(0, '#FF0000'); // Red
            grad.addColorStop(0.5, '#B71C1C'); // Dark Red
            grad.addColorStop(1, '#800000'); // Maroon
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 5, 9, 0, 0, Math.PI * 2); // Slightly larger
            this.ctx.fill();

            // Head (Large mandibles)
            this.ctx.fillStyle = '#B71C1C';
            this.ctx.beginPath();
            this.ctx.arc(0, -8, 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Mandibles (Huge)
            this.ctx.strokeStyle = '#FFF';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-2, -8); this.ctx.lineTo(-2, -14); this.ctx.lineTo(2, -11);
            this.ctx.moveTo(2, -8); this.ctx.lineTo(2, -14); this.ctx.lineTo(-2, -11);
            this.ctx.stroke();

            // Eyes (Big, bulging)
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(-3.5, -8, 1.8, 0, Math.PI * 2);
            this.ctx.arc(3.5, -8, 1.8, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'APHID') {
            // APHID
            this.ctx.rotate(insect.angle + Math.PI / 2);

            // Legs (Small, translucent)
            this.drawLegs(6, 3, 'rgba(100, 200, 100, 0.5)', 0.5);

            // Body (Plump, pear-shaped)
            // Head
            this.ctx.fillStyle = '#AEEA00'; // Lime Green
            this.ctx.beginPath();
            this.ctx.arc(0, -3, 2, 0, Math.PI * 2);
            this.ctx.fill();

            // Abdomen
            this.ctx.beginPath();
            this.ctx.ellipse(0, 1, 3.5, 4.5, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Eyes
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(-1.5, -3.5, 0.5, 0, Math.PI * 2);
            this.ctx.arc(1.5, -3.5, 0.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Cornicles (Tail pipes - characteristic of aphids)
            this.ctx.strokeStyle = '#33691E'; // Dark Green
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(-2, 3); this.ctx.lineTo(-2.5, 5);
            this.ctx.moveTo(2, 3); this.ctx.lineTo(2.5, 5);
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

    bakeInsectCanvas(type: string): HTMLCanvasElement {
        return this.bakeCentered(64, () => this.drawInsect({ x: 0, y: 0, type, angle: 0 }));
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
        ctx.rotate(g.angle); // Sparse rotation is fine

        // Scale
        const s = g.size * 0.3; // Adjust scale to match sprite size
        ctx.scale(s, s);

        // Simple sway for HIGH/ULTRA only
        if (PerformanceManager.settings.grassAnimation) {
            const sway = Math.sin(Date.now() * 0.002 + g.x * 0.01) * 0.1;
            ctx.rotate(sway);
        }

        ctx.drawImage(sprite, -30, -60); // Centered bottom
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

        // Draw Shadows for Ants
        for (const ant of world.ants) {
            if (ant.location === 'WORLD') {
                ctx.beginPath();
                ctx.ellipse(ant.x + shadowOffsetX, ant.y + shadowOffsetY, 3, 3, 0, 0, Math.PI * 2);
                ctx.fill();
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
