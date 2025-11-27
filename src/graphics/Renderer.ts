
import { CONFIG } from '../config';
import { World } from '../simulation/World';

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
    }

    render(world: World) {
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

        // 4. Nest & Queen
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(CONFIG.queenPosition.x, CONFIG.queenPosition.y, 20, 0, Math.PI * 2);
        this.ctx.fill();

        // Queen
        this.ctx.fillStyle = '#FFF';
        this.ctx.beginPath();
        this.ctx.arc(world.queen.x, world.queen.y, 8, 0, Math.PI * 2);
        this.ctx.fill();

        // 5. Insects
        for (const insect of world.insects) {
            this.drawInsect(insect);
        }

        // 6. Brood (Eggs, Larvae, Pupae)
        for (const b of world.brood) {
            this.drawBrood(b);
        }

        // 7. Ants
        for (const ant of world.ants) {
            this.drawAnt(ant);
        }

        // 8. Particles
        this.drawParticles(world);

        this.drawNestCam(world);
    }

    drawBrood(b: any) {
        this.ctx.save();
        this.ctx.translate(b.x, b.y);

        if (b.stage === 'EGG') {
            this.ctx.fillStyle = '#FFF';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 2, 1.5, Math.random(), 0, Math.PI * 2);
            this.ctx.fill();
        } else if (b.stage === 'LARVA') {
            this.ctx.fillStyle = '#EEE';
            this.ctx.beginPath();
            // Simple worm shape
            this.ctx.ellipse(0, 0, 3 + b.age / 100, 1.5, 0, 0, Math.PI * 2);
            this.ctx.fill();
            // Segments
            this.ctx.strokeStyle = '#CCC';
            this.ctx.lineWidth = 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(-1, -1); this.ctx.lineTo(-1, 1);
            this.ctx.moveTo(1, -1); this.ctx.lineTo(1, 1);
            this.ctx.stroke();
        } else if (b.stage === 'PUPA') {
            this.ctx.fillStyle = '#D2B48C'; // Tan
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#8B4513';
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawParticles(world: World) {
        for (const p of world.particles) {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, 2, 2);
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawLegs(count: number, length: number, color: string, speed: number) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 0.5;
        const time = Date.now() * 0.02 * speed;

        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const legIndex = Math.floor(i / 2);
            const legOffset = (legIndex - 1) * 2; // -2, 0, 2

            // Procedural animation
            const move = Math.sin(time + i * Math.PI) * 0.5;

            this.ctx.beginPath();
            this.ctx.moveTo(legOffset, 0);

            // Knee
            const kx = legOffset + move;
            const ky = side * length * 0.5;

            // Foot
            const fx = kx + move;
            const fy = side * length;

            this.ctx.quadraticCurveTo(kx, ky, fx, fy);
            this.ctx.stroke();
        }
    }

    drawAnt(ant: any) {
        this.ctx.save();
        this.ctx.translate(ant.x, ant.y);
        this.ctx.rotate(ant.angle);

        // Legs
        this.drawLegs(6, 5, '#AAA', 1.0);

        if (ant.type === 'SOLDIER') {
            // Thorax & Abdomen (White)
            this.ctx.fillStyle = '#FFF';

            // Thorax
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 2.2, 1.2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            // Abdomen
            this.ctx.beginPath();
            this.ctx.ellipse(-3.5, 0, 2.8, 1.8, 0, 0, Math.PI * 2); // Much smaller than before
            this.ctx.fill();

            // Head (Reddish-Brown, Very Large)
            this.ctx.fillStyle = '#A52A2A'; // Reddish Brown
            this.ctx.beginPath();
            this.ctx.arc(3.5, 0, 3.0, 0, Math.PI * 2); // Big head
            this.ctx.fill();

            // Mandibles (Large)
            this.ctx.strokeStyle = '#A52A2A';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(4, 1.5);
            this.ctx.lineTo(8, 3);
            this.ctx.moveTo(4, -1.5);
            this.ctx.lineTo(8, -3);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = '#FFF';

            // Head
            this.ctx.beginPath();
            this.ctx.arc(2, 0, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            // Thorax
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 2, 1, 0, 0, Math.PI * 2);
            this.ctx.fill();
            // Abdomen
            this.ctx.beginPath();
            this.ctx.ellipse(-3, 0, 2.5, 1.5, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Attack Animation (Bite effect)
        if (ant.attackCooldown > 15) { // Just bit
            this.ctx.strokeStyle = '#FFF';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(4, -2);
            this.ctx.lineTo(8, 0);
            this.ctx.lineTo(4, 2);
            this.ctx.stroke();
        }

        this.ctx.restore();
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
            this.ctx.moveTo(5, -3); this.ctx.lineTo(10, -1); this.ctx.lineTo(5, 0);
            this.ctx.moveTo(5, 3); this.ctx.lineTo(10, 1); this.ctx.lineTo(5, 0);
            this.ctx.fill();

        } else if (insect.type === 'SPIDER') {
            // Spider: Black, long legs
            this.drawLegs(8, 14, '#222', 2.0);

            // Abdomen
            this.ctx.fillStyle = '#111';
            this.ctx.beginPath();
            this.ctx.ellipse(-2, 0, 6, 5, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Cephalothorax
            this.ctx.fillStyle = '#333';
            this.ctx.beginPath();
            this.ctx.arc(4, 0, 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Eyes (Many)
            this.ctx.fillStyle = '#F00';
            this.ctx.fillRect(5, -1, 1, 1);
            this.ctx.fillRect(5, 1, 1, 1);
            this.ctx.fillRect(6, -2, 1, 1);
            this.ctx.fillRect(6, 2, 1, 1);

        } else if (insect.type === 'BEETLE') {
            // Beetle: Dark Blue, Tanky
            this.drawLegs(6, 5, '#000044', 0.5);

            // Body (Elytra)
            this.ctx.fillStyle = '#000088';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Stripe
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(-8, 0);
            this.ctx.lineTo(8, 0);
            this.ctx.stroke();

            // Head
            this.ctx.fillStyle = '#000044';
            this.ctx.beginPath();
            this.ctx.arc(6, 0, 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Mandibles
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.moveTo(8, -2); this.ctx.lineTo(12, -1); this.ctx.lineTo(8, 0);
            this.ctx.moveTo(8, 2); this.ctx.lineTo(12, 1); this.ctx.lineTo(8, 0);
            this.ctx.fill();

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

    drawNestCam(world: World) {
        const ctx = this.nestCtx;
        const w = this.nestCanvas.width;
        const h = this.nestCanvas.height;
        ctx.clearRect(0, 0, w, h);

        // Draw Stats Text
        ctx.fillStyle = '#FFF';
        ctx.font = '12px monospace';
        ctx.fillText(`Protein: ${world.proteinStockpile}`, 10, 20);
        ctx.fillText(`Sugar: ${world.sugarStockpile}`, 10, 35);

        // Draw Queen (Large central figure)
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.fillStyle = '#444'; // Dark body
        // Abdomen (Huge)
        ctx.beginPath();
        ctx.ellipse(0, 10, 15, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        // Thorax
        ctx.beginPath();
        ctx.ellipse(0, -15, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(0, -30, 6, 0, Math.PI * 2);
        ctx.fill();
        // Legs (simplified)
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, -15); ctx.lineTo(-20, -10);
        ctx.moveTo(8, -15); ctx.lineTo(20, -10);
        ctx.moveTo(-8, -5); ctx.lineTo(-22, 5);
        ctx.moveTo(8, -5); ctx.lineTo(22, 5);
        ctx.stroke();
        ctx.restore();

        // Draw Brood Visuals
        // Eggs (White dots)
        ctx.fillStyle = '#EEE';
        for (let i = 0; i < Math.min(world.eggs, 50); i++) {
            const x = 20 + (i * 1337 % 40);
            const y = 40 + (i * 7 % 30);
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.fillText(`Eggs: ${world.eggs}`, 10, 80);

        // Larvae (White worms)
        ctx.fillStyle = '#DDD';
        for (let i = 0; i < Math.min(world.larvae, 30); i++) {
            const seed = i * 1337;
            const x = 80 + (seed % 40);
            const y = 40 + ((seed * 7) % 30);
            ctx.beginPath();
            ctx.ellipse(x, y, 3, 1, (seed % 3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillText(`Larvae: ${world.larvae}`, 70, 80);

        // Pupae (Brown ovals)
        ctx.fillStyle = '#C88';
        for (let i = 0; i < Math.min(world.pupae, 20); i++) {
            const seed = i * 999;
            const x = 140 + (seed % 40);
            const y = 40 + ((seed * 3) % 30);
            ctx.beginPath();
            ctx.ellipse(x, y, 3, 1.5, (seed % 3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillText(`Pupae: ${world.pupae}`, 130, 80);

        ctx.fillStyle = '#AAA';
        ctx.fillText(`Ants: ${world.ants.length}`, 10, 100);
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
