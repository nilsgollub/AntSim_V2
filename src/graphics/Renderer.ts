
import { World } from '../simulation/World';
import { CONFIG } from '../config';

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
        // Base Dirt Color
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Noise / Texture
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const size = Math.random() * 2 + 1;
            const opacity = Math.random() * 0.1;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(x, y, size, size);
        }

        // Darker patches
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const r = Math.random() * 50 + 20;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fill();
        }
    }

    render(world: World) {
        this.renderWorld(world);
        this.renderNest(world);
    }

    renderWorld(world: World) {
        // 0. Background (Texture)
        this.ctx.drawImage(this.bgCanvas, 0, 0);

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
                    let r = protein;
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
            this.ctx.filter = 'blur(4px)';
            this.ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
            this.ctx.filter = 'none'; // Reset filter

            this.ctx.globalAlpha = 1.0;
            this.ctx.imageSmoothingEnabled = false;
        }

        // 2. Obstacles (Rocks) with Shadows
        for (const obs of world.terrain.obstacles) {
            this.drawRock(obs.x, obs.y, obs.radius);
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
    }

    renderNest(world: World) {
        const ctx = this.nestCtx;
        const w = this.nestCanvas.width;
        const h = this.nestCanvas.height;

        // Clear
        ctx.fillStyle = '#222';
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
                    let r = protein;
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
        ctx.fillStyle = '#3a2a1a'; // Dark earth color
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;

        for (const node of world.nest.nodes) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Queen (Detailed)
        ctx.save();
        ctx.translate(world.queen.x, world.queen.y);

        // Shadow
        this.drawShadow(0, 0, 10, ctx);

        // Legs
        this.drawLegs(6, 8, '#AAA', 0.2, ctx);

        // Abdomen (Large, swollen)
        const gradAbd = ctx.createRadialGradient(-2, 2, 0, 0, 5, 12);
        gradAbd.addColorStop(0, '#666');
        gradAbd.addColorStop(1, '#333');
        ctx.fillStyle = gradAbd;

        ctx.beginPath();
        ctx.ellipse(0, 5, 12, 8, Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
        // Stripes
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(-7, 4); ctx.lineTo(7, 4);
        ctx.moveTo(-6, 8); ctx.lineTo(6, 8);
        ctx.stroke();

        // Thorax
        ctx.fillStyle = '#8B4513'; // Brownish
        ctx.beginPath();
        ctx.ellipse(0, -6, 6, 5, Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#A52A2A'; // Reddish
        ctx.beginPath();
        ctx.arc(0, -12, 5, 0, Math.PI * 2);
        ctx.fill();

        // Mandibles
        ctx.strokeStyle = '#A52A2A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-2, -15); ctx.lineTo(-4, -18);
        ctx.moveTo(2, -15); ctx.lineTo(4, -18);
        ctx.stroke();

        ctx.restore();

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
            // Helper for deterministic random
            const hash = (n: number) => {
                const t = Math.sin(n) * 43758.5453123;
                return t - Math.floor(t);
            };

            // Visualize Sugar
            const sugarCount = Math.min(50, Math.ceil(world.sugarStockpile / 10));
            for (let i = 0; i < sugarCount; i++) {
                const r = Math.sqrt(hash(i * 13.37)) * (storage.radius * 0.7);
                const angle = hash(i * 7.91 + 2.4) * Math.PI * 2;
                const x = storage.x + Math.cos(angle) * r;
                const y = storage.y + Math.sin(angle) * r;

                ctx.fillStyle = '#4F4';
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Visualize Protein
            const proteinCount = Math.min(50, Math.ceil(world.proteinStockpile / 10));
            for (let i = 0; i < proteinCount; i++) {
                const r = Math.sqrt(hash(i * 23.17 + 5)) * (storage.radius * 0.7);
                const angle = hash(i * 11.33 + 4.1) * Math.PI * 2;

                const x = storage.x + Math.cos(angle) * r;
                const y = storage.y + Math.sin(angle) * r;

                ctx.fillStyle = '#F44';
                ctx.beginPath();
                ctx.rect(x - 2, y - 2, 4, 4);
                ctx.fill();
            }
        }
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

    drawLegs(count: number, length: number, color: string, speed: number, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        const time = Date.now() * 0.02 * speed;

        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const legIndex = Math.floor(i / 2);
            const legOffset = (legIndex - 1) * 2;

            const move = Math.sin(time + i * Math.PI) * 0.5;

            ctx.beginPath();
            ctx.moveTo(legOffset, 0);

            // Knee
            const kx = legOffset + move;
            const ky = side * length * 0.5;

            // Foot
            const fx = kx + move;
            const fy = side * length;

            ctx.quadraticCurveTo(kx, ky, fx, fy);
            ctx.stroke();
        }
    }

    drawShadow(x: number, y: number, radius: number, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 2, radius, radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    drawAnt(ant: any, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.save();
        ctx.translate(ant.x, ant.y);
        ctx.rotate(ant.angle);

        // Shadow
        this.drawShadow(0, 0, 3, ctx);

        // Legs
        const animSpeed = (ant.speedMultiplier !== undefined) ? ant.speedMultiplier : 1.0;
        this.drawLegs(6, 5, '#AAA', animSpeed, ctx);

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
            const gradHead = ctx.createRadialGradient(3, 0, 0, 3, 0, 6);
            gradHead.addColorStop(0, '#A52A2A'); // Reddish Brown
            gradHead.addColorStop(1, '#500');
            ctx.fillStyle = gradHead;

            ctx.beginPath();
            // Draw a rounded square/heart shape for the head
            // Wider: +/- 5.0
            ctx.moveTo(1, -5.0);
            ctx.lineTo(6, -5.0); // Top edge
            ctx.quadraticCurveTo(8, -5.0, 8, 0); // Front curve
            ctx.quadraticCurveTo(8, 5.0, 6, 5.0); // Bottom edge
            ctx.lineTo(1, 5.0);
            ctx.quadraticCurveTo(0, 0, 1, -5.0); // Back curve
            ctx.fill();

            // Mandibles (Thick, short)
            ctx.strokeStyle = '#300'; // Very Dark
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(7.5, 3.5); ctx.lineTo(10, 1.0);
            ctx.moveTo(7.5, -3.5); ctx.lineTo(10, -1.0);
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
            ctx.fillStyle = '#0F0';
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

        // Shadow
        this.drawShadow(0, 0, 6, this.ctx);

        if (insect.type === 'PREY') {
            this.ctx.rotate(Math.sin(Date.now() * 0.01) * 0.1);
            this.drawLegs(6, 6, '#008888', 0.5);

            // Body
            const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
            grad.addColorStop(0, '#00FFFF');
            grad.addColorStop(1, '#008888');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Head
            this.ctx.fillStyle = '#00AAAA';
            this.ctx.beginPath();
            this.ctx.arc(5, 0, 3, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'PREDATOR') {
            this.drawLegs(8, 12, '#AA0000', 1.5);
            const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 7);
            grad.addColorStop(0, '#FF0000');
            grad.addColorStop(1, '#550000');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 7, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'LADYBUG') {
            this.drawLegs(6, 4, '#000', 1.0);
            const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
            grad.addColorStop(0, '#FF2200');
            grad.addColorStop(1, '#AA1100');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();
            // Spots
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(-2, -2, 1, 0, Math.PI * 2);
            this.ctx.arc(-2, 2, 1, 0, Math.PI * 2);
            this.ctx.arc(2, -2, 1, 0, Math.PI * 2);
            this.ctx.arc(2, 2, 1, 0, Math.PI * 2);
            this.ctx.fill();
            // Head
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
            this.ctx.fill();

        } else {
            // APHID
            this.ctx.rotate(Math.sin(Date.now() * 0.005) * 0.1);
            this.drawLegs(6, 3, '#00AA00', 0.2);
            this.ctx.fillStyle = '#55FF55';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(2, -1, 1, 1);
            this.ctx.fillRect(2, 1, 1, 1);
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

        const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
        grad.addColorStop(0, '#777');
        grad.addColorStop(1, '#333');
        ctx.fillStyle = grad;
        ctx.fill();
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
                ctx.fillStyle = `rgba(100, 255, 100, 0.6)`;
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
}
