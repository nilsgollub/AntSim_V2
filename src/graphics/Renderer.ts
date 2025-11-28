

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
    showPheromones: boolean = true;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false })!;
        this.width = canvas.width;
        this.height = canvas.height;

        // Setup Pheromone Offscreen Canvas (1/4 resolution)
        const scale = 0.25;
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
    }

    render(world: World) {
        this.renderWorld(world);
        this.renderNest(world);
    }

    renderWorld(world: World) {
        // 1. Pheromones (Background)
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
                    this.pheroBuf32[i] = 0xFF000000;
                }
            }

            // Put data to offscreen canvas
            this.pheromoneCtx.putImageData(this.pheroImageData, 0, 0);

            // Draw scaled up to main canvas
            this.ctx.imageSmoothingEnabled = true; // Smooth scaling
            this.ctx.drawImage(this.pheromoneCanvas, 0, 0, this.width, this.height);
            this.ctx.imageSmoothingEnabled = false; // Reset for sprites if needed

        } else {
            // Clear background
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // 2. Obstacles (Rocks)
        this.ctx.fillStyle = '#555';
        for (const obs of world.terrain.obstacles) {
            this.drawRock(obs.x, obs.y, obs.radius);
        }

        // 3. Food
        for (const food of world.foods) {
            this.drawFood(food);
        }

        // 4. Nest Entrance (Visual Marker)
        this.ctx.fillStyle = '#222';
        this.ctx.strokeStyle = '#444';

        const isLandscape = CONFIG.width > CONFIG.height;

        if (isLandscape) {
            // Right edge
            const entranceY = this.height / 2;
            this.ctx.fillRect(CONFIG.width - 20, entranceY - 25, 20, 50);
            this.ctx.strokeRect(CONFIG.width - 20, entranceY - 25, 20, 50);
        } else {
            // Bottom edge
            const entranceX = this.width / 2;
            this.ctx.fillRect(entranceX - 25, CONFIG.height - 20, 50, 20);
            this.ctx.strokeRect(entranceX - 25, CONFIG.height - 20, 50, 20);
        }

        // 5. Insects
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

        // Draw all nodes as a merged shape (simple approach: draw all circles)
        // To make it look merged, we can draw them all filled first, then maybe outline?
        // Outlining merged circles is hard without path logic.
        // Let's just draw them filled for now, maybe with a slight border on each for texture.

        for (const node of world.nest.nodes) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Optional: Draw "floor" texture or detail
        // ...

        // Draw Queen (Detailed)
        ctx.save();
        ctx.translate(world.queen.x, world.queen.y);
        // Queen is large, maybe facing down or idle

        // Legs
        this.drawLegs(6, 8, '#AAA', 0.2, ctx);

        // Abdomen (Large, swollen)
        ctx.fillStyle = '#444'; // Dark grey/black
        ctx.beginPath();
        ctx.ellipse(0, 5, 12, 8, Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
        // Stripes
        ctx.strokeStyle = '#666';
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
                // Deterministic random position
                const r = Math.sqrt(hash(i * 13.37)) * (storage.radius * 0.7);
                const angle = hash(i * 7.91 + 2.4) * Math.PI * 2;

                const x = storage.x + Math.cos(angle) * r;
                const y = storage.y + Math.sin(angle) * r;

                ctx.fillStyle = '#4F4'; // Bright Green for Sugar
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Visualize Protein
            const proteinCount = Math.min(50, Math.ceil(world.proteinStockpile / 10));
            for (let i = 0; i < proteinCount; i++) {
                // Deterministic random position (different seeds)
                const r = Math.sqrt(hash(i * 23.17 + 5)) * (storage.radius * 0.7);
                const angle = hash(i * 11.33 + 4.1) * Math.PI * 2;

                const x = storage.x + Math.cos(angle) * r;
                const y = storage.y + Math.sin(angle) * r;

                ctx.fillStyle = '#F44'; // Red for Protein
                ctx.beginPath();
                ctx.rect(x - 2, y - 2, 4, 4); // Square for protein
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
            // Simple worm shape
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
            const legOffset = (legIndex - 1) * 2; // -2, 0, 2

            // Procedural animation
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

    drawAnt(ant: any, ctx: CanvasRenderingContext2D = this.ctx) {
        ctx.save();
        ctx.translate(ant.x, ant.y);
        ctx.rotate(ant.angle);

        // Legs
        this.drawLegs(6, 5, '#AAA', 1.0, ctx);

        if (ant.type === 'SOLDIER') {
            // Thorax & Abdomen (White)
            ctx.fillStyle = '#FFF';

            // Thorax
            ctx.beginPath();
            ctx.ellipse(0, 0, 2.2, 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Abdomen
            ctx.beginPath();
            ctx.ellipse(-3.5, 0, 2.8, 1.8, 0, 0, Math.PI * 2); // Much smaller than before
            ctx.fill();

            // Head (Reddish-Brown, Very Large)
            ctx.fillStyle = '#A52A2A'; // Reddish Brown
            ctx.beginPath();
            ctx.arc(3.5, 0, 3.0, 0, Math.PI * 2); // Big head
            ctx.fill();

            // Mandibles (Large)
            ctx.strokeStyle = '#A52A2A';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(4, 1.5);
            ctx.lineTo(8, 3);
            ctx.moveTo(4, -1.5);
            ctx.lineTo(8, -3);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#FFF';

            // Head
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

        // Attack Animation (Bite effect)
        if (ant.attackCooldown > 15) { // Just bit
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

        if (insect.type === 'PREY') {
            // Prey: Green Beetle/Bug
            this.ctx.rotate(Math.sin(Date.now() * 0.01) * 0.1); // Slight wiggle
            this.drawLegs(6, 6, '#008888', 0.5);

            // Body
            this.ctx.fillStyle = '#00FFFF';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Head
            this.ctx.fillStyle = '#00AAAA';
            this.ctx.beginPath();
            this.ctx.arc(5, 0, 3, 0, Math.PI * 2);
            this.ctx.fill();

        } else if (insect.type === 'PREDATOR') {
            // Generic Predator: Red Spider/Beetle
            this.drawLegs(8, 12, '#AA0000', 1.5);

            // Body
            this.ctx.fillStyle = '#FF0000';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 7, 0, Math.PI * 2);
            this.ctx.fill();

            // Mandibles
            this.ctx.fillStyle = '#550000';
            this.ctx.beginPath();
        } else if (insect.type === 'LADYBUG') {
            // Ladybug: Red with spots
            this.drawLegs(6, 4, '#000', 1.0);

            // Body
            this.ctx.fillStyle = '#FF2200';
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
            // APHID (Green, small, cute)
            this.ctx.rotate(Math.sin(Date.now() * 0.005) * 0.1);
            this.drawLegs(6, 3, '#00AA00', 0.2);

            // Body
            this.ctx.fillStyle = '#55FF55';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Eyes
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

        // Use position as seed for consistent shape
        const seed = Math.floor(x * y);
        const vertices = 12;

        ctx.beginPath();
        for (let i = 0; i < vertices; i++) {
            const angle = (i / vertices) * Math.PI * 2;
            // Pseudo-random radius variation based on angle and seed
            const r = radius * (0.8 + 0.4 * Math.abs(Math.sin(seed + i * 132.1)));
            const vx = Math.cos(angle) * r;
            const vy = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
        }
        ctx.closePath();

        // Gradient for 3D look
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

        if (food.type === 'SUGAR') {
            // Nectar/Sugar: Cluster of translucent droplets
            ctx.save();
            ctx.translate(food.x, food.y);
            const count = Math.min(10, Math.ceil(food.amount / 100));

            for (let i = 0; i < count; i++) {
                const angle = i * 137.5; // Golden angle
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
            // Protein: Meat chunk
            ctx.save();
            ctx.translate(food.x, food.y);

            ctx.beginPath();
            // Irregular shape
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

            // "Bone" or detail
            ctx.fillStyle = '#EAA';
            ctx.beginPath();
            ctx.arc(-2, -2, radius * 0.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }
}
