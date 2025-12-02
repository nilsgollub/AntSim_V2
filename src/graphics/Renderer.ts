import { CONFIG } from '../config';
import { World } from '../simulation/World';
import { PerformanceManager, QualityLevel } from '../PerformanceManager';

export class Renderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;

    // Pheromone Rendering
    pheromoneCanvas: HTMLCanvasElement;
    pheromoneCtx: CanvasRenderingContext2D;
    pheroImageData: ImageData;
    pheroBuf32: Uint32Array;

    // Nest Pheromone Rendering
    nestPheromoneCanvas: HTMLCanvasElement;
    nestPheromoneCtx: CanvasRenderingContext2D;
    nestPheroImageData: ImageData;
    nestPheroBuf32: Uint32Array;

    nestCanvas: HTMLCanvasElement;
    nestCtx: CanvasRenderingContext2D;
    showPheromones: boolean = false;

    // Background Texture
    bgCanvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false })!;
        this.width = canvas.width;
        this.height = canvas.height;

        // Setup Pheromone Offscreen Canvas (1/2 resolution)
        const scale = 0.5;
        this.pheromoneCanvas = document.createElement('canvas');
        this.pheromoneCanvas.width = Math.ceil(this.width * scale);
        this.pheromoneCanvas.height = Math.ceil(this.height * scale);
        this.pheromoneCtx = this.pheromoneCanvas.getContext('2d', { alpha: false })!;
        this.pheroImageData = this.pheromoneCtx.createImageData(this.pheromoneCanvas.width, this.pheromoneCanvas.height);
        this.pheroBuf32 = new Uint32Array(this.pheroImageData.data.buffer);

        this.nestCanvas = document.getElementById('nestCanvas') as HTMLCanvasElement;
        this.nestCtx = this.nestCanvas.getContext('2d')!;

        // Setup Nest Pheromone Offscreen Canvas (1/4 resolution)
        this.nestPheromoneCanvas = document.createElement('canvas');
        this.nestPheromoneCanvas.width = Math.ceil(this.nestCanvas.width * scale);
        this.nestPheromoneCanvas.height = Math.ceil(this.nestCanvas.height * scale);
        this.nestPheromoneCtx = this.nestPheromoneCanvas.getContext('2d', { alpha: false })!;
        this.nestPheroImageData = this.nestPheromoneCtx.createImageData(this.nestPheromoneCanvas.width, this.nestPheromoneCanvas.height);
        this.nestPheroBuf32 = new Uint32Array(this.nestPheroImageData.data.buffer);

        // Generate Background Texture
        this.bgCanvas = document.createElement('canvas');
        this.bgCanvas.width = this.width;
        this.bgCanvas.height = this.height;
        this.generateBackground();
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
        // 0. Background (Texture)
        // Draw to fill the simulation bounds
        this.ctx.drawImage(this.bgCanvas, 0, 0, this.width, this.height);

        // 1. Pheromones (Overlay)
        if (this.showPheromones) {
            const toHome = world.grid.toHome;
            const toSugar = world.grid.toSugar;
            const toProtein = world.grid.toProtein;
            const toDanger = world.grid.toDanger;

            // Iterate over the smaller buffer
            for (let i = 0; i < this.pheroBuf32.length; i++) {
                const home = toHome[i];
                const sugar = toSugar[i];
                const protein = toProtein[i];
                const danger = toDanger[i];

                if (home > 0.01 || sugar > 0.01 || protein > 0.01 || danger > 0.01) {
                    let r = protein + sugar; // Sugar adds Red (Yellow = R+G)
                    let g = sugar;
                    let b = home;

                    // Add danger
                    r += danger;
                    b += danger;

                    const rVal = Math.min(255, Math.floor(r * 255));
                    const gVal = Math.min(255, Math.floor(g * 255));
                    const bVal = Math.min(255, Math.floor(b * 255));

                    this.pheroBuf32[i] = (255 << 24) | (bVal << 16) | (gVal << 8) | rVal;
                } else {
                    this.pheroBuf32[i] = 0; // Transparent
                }
            }

            // Put data to offscreen canvas
            this.pheromoneCtx.putImageData(this.pheroImageData, 0, 0);

            // Draw scaled up to main canvas
            this.ctx.imageSmoothingEnabled = true; // Smooth scaling
            this.ctx.globalAlpha = 0.6; // Slight transparency for pheromones

            // Apply blur to simulate smoke/diffusion
            if (PerformanceManager.level !== QualityLevel.LOW) {
                this.ctx.filter = 'blur(4px)';
            }
            this.ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
            this.ctx.filter = 'none'; // Reset filter

            this.ctx.globalAlpha = 1.0;
            this.ctx.imageSmoothingEnabled = false;
        }



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
        const isLandscape = CONFIG.width > CONFIG.height;

        if (isLandscape) {
            // Right edge
            const entranceY = this.height / 2;
            const entranceX = CONFIG.width - 15;

            // Dirt Mound (Gradient)
            const moundGrad = this.ctx.createRadialGradient(entranceX, entranceY, 10, entranceX, entranceY, 40);
            moundGrad.addColorStop(0, '#3a2a1a'); // Dark Earth
            moundGrad.addColorStop(1, 'rgba(58, 42, 26, 0)'); // Fade out
            this.ctx.fillStyle = moundGrad;
            this.ctx.beginPath();
            this.ctx.arc(entranceX, entranceY, 40, 0, Math.PI * 2);
            this.ctx.fill();

            // The Hole (Dark Tunnel)
            this.ctx.fillStyle = '#050505'; // Almost black
            this.ctx.beginPath();
            this.ctx.ellipse(entranceX + 5, entranceY, 15, 25, 0, 0, Math.PI * 2);
            this.ctx.fill();

        } else {
            // Bottom edge (Portrait)
            const entranceX = this.width / 2;
            const entranceY = CONFIG.height - 15;

            // Dirt Mound
            const moundGrad = this.ctx.createRadialGradient(entranceX, entranceY, 10, entranceX, entranceY, 40);
            moundGrad.addColorStop(0, '#3a2a1a');
            moundGrad.addColorStop(1, 'rgba(58, 42, 26, 0)');
            this.ctx.fillStyle = moundGrad;
            this.ctx.beginPath();
            this.ctx.arc(entranceX, entranceY, 40, 0, Math.PI * 2);
            this.ctx.fill();

            // The Hole
            this.ctx.fillStyle = '#050505';
            this.ctx.beginPath();
            this.ctx.ellipse(entranceX, entranceY + 5, 25, 15, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fill();
        }

        // 4.5 Vegetation (Grass)
        // Only draw grass if not in LOW mode (or check specific setting)
        if (PerformanceManager.level !== QualityLevel.LOW) {
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

        // ULTRA EFFECTS
        if (PerformanceManager.level === QualityLevel.ULTRA) {
            this.drawGodRays();
            this.drawVignette();
        }
    }

    renderNest(world: World) {
        const ctx = this.nestCtx;
        const w = CONFIG.nestWidth;
        const h = CONFIG.nestHeight;

        // Clear
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, w, h);

        // 0. Nest Pheromones (Background)
        if (this.showPheromones) {
            const toHome = world.nestGrid.toHome;
            const toSugar = world.nestGrid.toSugar;
            const toProtein = world.nestGrid.toProtein;
            const toDanger = world.nestGrid.toDanger;

            // Iterate over the smaller buffer
            for (let i = 0; i < this.nestPheroBuf32.length; i++) {
                const home = toHome[i];
                const sugar = toSugar[i];
                const protein = toProtein[i];
                const danger = toDanger[i];

                if (home > 0.01 || sugar > 0.01 || protein > 0.01 || danger > 0.01) {
                    let r = protein + sugar; // Sugar adds Red (Yellow = R+G)
                    let g = sugar;
                    let b = home;

                    // Add danger
                    r += danger;
                    b += danger;

                    const rVal = Math.min(255, Math.floor(r * 255));
                    const gVal = Math.min(255, Math.floor(g * 255));
                    const bVal = Math.min(255, Math.floor(b * 255));

                    this.nestPheroBuf32[i] = (255 << 24) | (bVal << 16) | (gVal << 8) | rVal;
                } else {
                    this.nestPheroBuf32[i] = 0xFF222222; // Match background
                }
            }

            // Put data to offscreen canvas
            this.nestPheromoneCtx.putImageData(this.nestPheroImageData, 0, 0);

            // Draw scaled up to nest canvas
            ctx.imageSmoothingEnabled = true; // Smooth scaling
            ctx.drawImage(this.nestPheromoneCanvas, 0, 0, w, h);
            ctx.imageSmoothingEnabled = false; // Reset
        }

        // Draw Tunnels & Chambers
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;

        // Draw Organic Nest Structure (Nodes)

        // 1. Wall Cut (The "rim" of the tunnel)
        ctx.strokeStyle = '#8d7a6a'; // Much lighter, distinct cut
        ctx.lineWidth = 6; // Thick border
        for (const node of world.nest.nodes) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 2. Chamber Floor (Depth)
        for (const node of world.nest.nodes) {
            const grad = ctx.createRadialGradient(node.x, node.y, node.radius * 0.2, node.x, node.y, node.radius);
            grad.addColorStop(0, '#4e3e30'); // Lighter Floor
            grad.addColorStop(1, '#1f1510'); // Shadow Edge

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Texture (Subtle Noise)
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (const node of world.nest.nodes) {
            if (node.type === 'CHAMBER') {
                // Draw some random noise circles
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(node.x + (Math.random() - 0.5) * node.radius, node.y + (Math.random() - 0.5) * node.radius, Math.random() * 10, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.globalCompositeOperation = 'source-over';

        // Draw Queen (Detailed)
        this.drawQueen(world.queen, ctx);

        // Draw Brood
        for (const b of world.brood) {
            this.drawBrood(b, ctx);
        }

        // Draw Ants (Nest only)
        for (const ant of world.ants) {
            if (ant.location === 'NEST') {
                this.drawAnt(ant, ctx);
            }
        }

        // Draw Stored Food in Storage Chamber
        const storage = world.nest.chambers.find(c => c.type === 'STORAGE');
        if (storage) {
            this.drawFoodPile(storage.x, storage.y, storage.radius, world.sugarStockpile, 'SUGAR', ctx);
            this.drawFoodPile(storage.x, storage.y, storage.radius, world.proteinStockpile, 'PROTEIN', ctx);
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
            // This ensures they look random but don't move every frame
            const cluster = clusters[i % clusters.length];

            // Pseudo-random offsets
            const offsetX = Math.sin(i * 12.9898) * (radius * 0.35);
            const offsetY = Math.cos(i * 78.233) * (radius * 0.35);

            const px = cluster.x + offsetX;
            const py = cluster.y + offsetY;

            // Keep within bounds roughly
            const dist = Math.sqrt(px * px + py * py);
            if (dist > radius) continue;

            if (type === 'SUGAR') {
                // Crystals - YELLOW
                ctx.fillStyle = `rgba(255, 255, 100, ${0.6 + (i % 5) * 0.1})`;
                ctx.beginPath();
                ctx.rect(px - 1.5, py - 1.5, 3, 3);
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
        const time = Date.now() * 0.02 * speed;

        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const legIndex = Math.floor(i / 2);
            // Spread legs out more for spiders/beetles
            const spread = (count > 6) ? 3 : 2;
            const legOffset = (legIndex - (count / 4) + 0.5) * spread;

            const move = Math.sin(time + i * Math.PI) * 0.5;

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

    drawAnt(ant: any, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.save();
        ctx.translate(ant.x, ant.y);
        ctx.rotate(ant.angle);

        if (PerformanceManager.settings.simpleInsects) {
            // Simplified Ant (No legs, simple shapes)
            ctx.fillStyle = ant.type === 'SOLDIER' ? '#8B4513' : '#AAA';
            ctx.beginPath();
            // Body
            ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Head
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.arc(3, 0, 1.5, 0, Math.PI * 2);
            ctx.fill();

            if (ant.carrying !== 'NONE') {
                ctx.fillStyle = ant.carrying === 'SUGAR' ? '#0F0' : '#F00';
                ctx.beginPath();
                ctx.arc(5, 0, 2, 0, Math.PI * 2);
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
            // Pheidole Soldier (Big-headed Ant)

            // Thorax (Small, compressed)
            const gradThorax = ctx.createRadialGradient(0, 0, 0, 0, 0, 3);
            gradThorax.addColorStop(0, '#FFF');
            gradThorax.addColorStop(1, '#CCC');
            ctx.fillStyle = gradThorax;
            ctx.beginPath();
            ctx.ellipse(-1, 0, 2.0, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Abdomen (Standard size, smaller than head)
            ctx.beginPath();
            ctx.ellipse(-5, 0, 2.5, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Head (Massive, Heart-shaped/Square)
            const gradHead = ctx.createRadialGradient(3, 0, 0, 3, 0, 5);
            gradHead.addColorStop(0, '#A0522D'); // Sienna (Reddish Brown)
            gradHead.addColorStop(1, '#5D4037'); // Darker Brown
            ctx.fillStyle = gradHead;

            ctx.beginPath();
            // Draw a rounded square/heart shape for the head
            // Slightly smaller: +/- 4.0
            ctx.moveTo(1, -4.0);
            ctx.lineTo(5, -4.0); // Top edge
            ctx.quadraticCurveTo(7, -4.0, 7, 0); // Front curve
            ctx.quadraticCurveTo(7, 4.0, 5, 4.0); // Bottom edge
            ctx.lineTo(1, 4.0);
            ctx.quadraticCurveTo(0, 0, 1, -4.0); // Back curve
            ctx.fill();

            // Mandibles (Thick, short)
            ctx.strokeStyle = '#3e2723'; // Dark Brown
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(6.5, 3.0); ctx.lineTo(9, 1.0);
            ctx.moveTo(6.5, -3.0); ctx.lineTo(9, -1.0);
            ctx.stroke();

        } else {
            // WORKER
            // Head
            const gradHead = ctx.createRadialGradient(2, 0, 0, 2, 0, 2);
            gradHead.addColorStop(0, '#FFF');
            gradHead.addColorStop(1, '#AAA');
            ctx.fillStyle = gradHead;
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
            ctx.fillStyle = '#F00';
            ctx.beginPath();
            ctx.rect(4, -1.5, 3, 3);
            ctx.fill();
        }

        // Attack Animation
        if (ant.attackCooldown > 15) {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(4, -2); ctx.lineTo(8, 0); ctx.lineTo(4, 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawInsect(insect: any) {
        this.ctx.save();
        this.ctx.translate(insect.x, insect.y);

        if (PerformanceManager.settings.simpleInsects) {
            this.ctx.rotate(insect.angle + Math.PI / 2);
            this.ctx.fillStyle = '#555';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
            return;
        }

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
            this.ctx.fillStyle = '#4e342e';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 3, 5, 6, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Cephalothorax (Smaller)
            this.ctx.fillStyle = '#3e2723';
            this.ctx.beginPath();
            this.ctx.ellipse(0, -4, 4, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Eyes (Many)
            this.ctx.fillStyle = '#FFF';
            this.ctx.beginPath();
            this.ctx.rect(-1.5, -7, 1, 1);
            this.ctx.rect(0.5, -7, 1, 1);
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

    drawFood(food: any) {
        const ctx = this.ctx;
        const radius = Math.sqrt(food.amount) * 0.5;

        // Shadow
        ctx.save();
        ctx.translate(food.x, food.y);
        this.drawShadow(0, 0, radius, ctx);
        ctx.restore();

        if (food.type === 'SUGAR') {
            // Bloom Effect (ULTRA)
            if (PerformanceManager.level === QualityLevel.ULTRA) {
                ctx.save();
                ctx.translate(food.x, food.y);
                ctx.globalCompositeOperation = 'lighter'; // Additive blending
                ctx.shadowColor = '#FF5'; // Yellowish glow
                ctx.shadowBlur = 15;
                ctx.fillStyle = 'rgba(255, 255, 100, 0.1)'; // Yellow tint
                ctx.beginPath();
                ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.translate(food.x, food.y);
            const count = Math.min(10, Math.ceil(food.amount / 100));
            for (let i = 0; i < count; i++) {
                const angle = i * 137.5;
                const r = (i / count) * radius;
                const dx = Math.cos(angle) * r;
                const dy = Math.sin(angle) * r;
                ctx.beginPath();
                ctx.arc(dx, dy, 3 + (i % 3), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 100, 0.6)`; // Yellow crystals
                ctx.fill();
            }
            ctx.restore();
        } else {
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
            ctx.fillStyle = '#A33';
            ctx.fill();
            ctx.strokeStyle = '#611';
            ctx.stroke();
            ctx.fillStyle = '#EAA';
            ctx.beginPath();
            ctx.arc(-2, -2, radius * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    drawGrass(g: any) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(g.x, g.y);

        // Sway animation (shared for the tuft)
        // Only animate if enabled in settings (ULTRA)
        const animate = PerformanceManager.settings.grassAnimation;
        const baseSway = animate ? Math.sin(Date.now() * 0.002 + g.x * 0.01) * 0.3 : 0;

        // Shadow for the tuft
        if (PerformanceManager.settings.shadows) {
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw a Tuft (Cluster of blades)
        const bladeCount = 5;
        for (let i = 0; i < bladeCount; i++) {
            // Randomize each blade slightly based on index
            const offsetAngle = (i - bladeCount / 2) * 0.3; // Spread out
            const lengthVar = 0.8 + Math.abs(Math.sin(i * 123.45)) * 0.4; // Random length

            ctx.save();
            ctx.rotate(g.angle + offsetAngle + baseSway * (1 + i * 0.1));

            // Blade Gradient
            const gradient = ctx.createLinearGradient(0, 0, baseSway * 5, -g.size * 5 * lengthVar);
            gradient.addColorStop(0, '#1a331a'); // Dark base
            gradient.addColorStop(1, '#4d804d'); // Light tip
            ctx.fillStyle = gradient;

            ctx.beginPath();
            ctx.moveTo(-1.5, 0);
            ctx.quadraticCurveTo(0, -g.size * 2 * lengthVar, baseSway * 5, -g.size * 5 * lengthVar);
            ctx.quadraticCurveTo(0, -g.size * 2 * lengthVar, 1.5, 0);
            ctx.fill();

            ctx.restore();
        }

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
        const ctx = this.ctx;
        const time = world.timeOfDay; // 0-1

        let ambientColor = 'rgba(0,0,0,0)';

        // Day/Night Cycle
        // 0.0 - 0.2: Dawn (Dark -> Orange)
        // 0.2 - 0.7: Day (Clear)
        // 0.7 - 0.8: Dusk (Orange -> Dark)
        // 0.8 - 1.0: Night (Dark Blue)

        if (time < 0.2) {
            // Dawn
            const t = time / 0.2;
            // Fade from Night (0.7) to Day (0.0)
            const alpha = 0.7 * (1 - t);
            ambientColor = `rgba(0, 10, 30, ${alpha})`;
        } else if (time < 0.7) {
            // Day
            ambientColor = 'rgba(0,0,0,0)';
        } else if (time < 0.8) {
            // Dusk
            const t = (time - 0.7) / 0.1;
            // Fade from Day (0.0) to Night (0.7)
            const alpha = 0.7 * t;
            ambientColor = `rgba(0, 10, 30, ${alpha})`;
        } else {
            // Night
            ambientColor = 'rgba(0, 10, 30, 0.7)';
        }

        // Apply Ambient Light
        ctx.save();
        ctx.fillStyle = ambientColor;
        ctx.fillRect(0, 0, this.width, this.height);

        // Sun/Moon Glow
        if (time > 0.8 || time < 0.2) {
            // Moon Glow
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (time > 0.2 && time < 0.3) {
            // Morning Glow
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(255, 200, 100, 0.2)';
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (time > 0.6 && time < 0.7) {
            // Evening Glow
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(255, 100, 50, 0.2)';
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
