import { CONFIG } from '../config';
import { World } from './World';


export type AntState = 'IDLE' | 'FORAGING' | 'RETURNING' | 'ATTACKING' | 'FLEEING';
export type AntType = 'WORKER' | 'SOLDIER';

export class Ant {
    x: number;
    y: number;
    angle: number;
    type: AntType;
    state: AntState;

    health: number;
    energy: number;
    carrying: 'NONE' | 'SUGAR' | 'PROTEIN';
    attackCooldown: number = 0;

    targetId: string | null = null; // ID of target (food or enemy)

    prevHealth: number;
    speedMultiplier: number = 1.0;
    fleeTimer: number = 0;
    obstacleTimer: number = 0;

    constructor(x: number, y: number, type: AntType) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.type = type;
        this.state = 'FORAGING'; // Default to foraging
        this.health = type === 'SOLDIER' ? CONFIG.soldierHealth : CONFIG.workerHealth;
        this.prevHealth = this.health;
        this.energy = CONFIG.antMaxEnergy;
        this.carrying = 'NONE';
    }

    update(world: World) {
        this.speedMultiplier = 1.0; // Reset speed

        if (this.health <= 0) {
            // Death Pheromone
            world.grid.depositCircle(this.x, this.y, 'DANGER', 1.0, 10);
            return;
        }

        // Check for damage -> Alarm Pheromone & Panic
        if (this.health < this.prevHealth) {
            world.grid.depositCircle(this.x, this.y, 'DANGER', 0.8, 8); // Stronger alarm
            this.prevHealth = this.health;

            if (this.type === 'WORKER') {
                this.state = 'FLEEING';
                this.fleeTimer = 60; // Flee for 1 second
                this.angle += Math.PI; // Turn around immediately
            }
        }

        // Energy decay
        this.energy -= CONFIG.antEnergyDecay;
        if (this.energy <= 0) {
            // Try to eat from colony stockpile
            if (world.sugarStockpile >= 1) {
                world.sugarStockpile -= 1;
                this.energy = CONFIG.antMaxEnergy;
            } else {
                this.health -= 0.1; // Starving
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.obstacleTimer > 0) this.obstacleTimer--;

        // Self Defense for Workers: If attacked or near enemy, fight back!
        if (this.type === 'WORKER' && this.state !== 'ATTACKING' && this.state !== 'FLEEING') {
            // Simple check for nearby predators
            for (const insect of world.insects) {
                if (insect.type === 'PREDATOR') {
                    const dx = this.x - insect.x;
                    const dy = this.y - insect.y;
                    if (dx * dx + dy * dy < 900) { // 30px range
                        // 50% chance to flee, 50% to fight
                        if (Math.random() < 0.5) {
                            this.state = 'FLEEING';
                            this.fleeTimer = 40;
                            this.angle = Math.atan2(dy, dx) + Math.PI; // Run away
                        } else {
                            this.state = 'ATTACKING';
                            this.targetId = 'PREDATOR';
                        }
                        break;
                    }
                }
            }
        }

        // State Machine
        switch (this.state) {
            case 'FORAGING':
                this.handleForaging(world);
                break;
            case 'RETURNING':
                this.handleReturning(world);
                break;
            case 'ATTACKING':
                this.handleCombat(world);
                break;
            case 'FLEEING':
                this.handleFleeing(world);
                break;
        }

        // Movement
        this.move(world);
    }

    handleFleeing(world: World) {
        this.speedMultiplier = 2.5; // Run fast!
        this.fleeTimer--;

        if (this.obstacleTimer > 0) return; // Sliding along wall

        // Move generally towards home, but with high noise (panic)
        const dx = CONFIG.queenPosition.x - this.x;
        const dy = CONFIG.queenPosition.y - this.y;
        const homeAngle = Math.atan2(dy, dx);

        // Mix home direction with current direction + noise
        this.angle = this.angle * 0.8 + homeAngle * 0.2 + (Math.random() - 0.5) * 1.0;

        // Drop Danger trail while fleeing to warn others
        if (this.fleeTimer % 5 === 0) {
            world.grid.depositCircle(this.x, this.y, 'DANGER', 0.2, 4);
        }

        if (this.fleeTimer <= 0) {
            this.state = 'FORAGING';
        }
    }

    handleCombat(world: World) {
        this.speedMultiplier = 1.5; // Combat adrenaline

        // Find nearest enemy
        let nearestEnemy = null;
        let minDist = Infinity;

        const needsProtein = world.proteinStockpile < CONFIG.eggCost * 3;
        const canHunt = this.type === 'SOLDIER' || (this.type === 'WORKER' && needsProtein);

        for (const insect of world.insects) {
            if (insect.type === 'PREDATOR' || (canHunt && insect.type === 'PREY')) {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDist) {
                    minDist = d2;
                    nearestEnemy = insect;
                }
            }
        }

        if (nearestEnemy && minDist < 2500) { // 50px chase range
            const dx = nearestEnemy.x - this.x;
            const dy = nearestEnemy.y - this.y;
            this.angle = Math.atan2(dy, dx);

            if (minDist < 100) { // Attack range
                if (this.attackCooldown <= 0) {
                    const dmg = this.type === 'SOLDIER' ? CONFIG.soldierDamage : CONFIG.workerDamage;
                    nearestEnemy.health -= dmg;
                    this.attackCooldown = 20; // 1 second cooldown (approx)
                }
            }
        } else {
            this.state = 'FORAGING'; // Enemy lost or dead
        }
    }

    handleForaging(world: World) {
        if (this.obstacleTimer > 0) return; // Sliding along wall

        const needsProtein = world.proteinStockpile < CONFIG.eggCost * 3;

        // 0. Check for DANGER
        const dangerLevel = world.grid.get(this.x, this.y, 'DANGER');
        if (dangerLevel > 0.05) { // Sensitive to danger
            if (this.type === 'WORKER') {
                // Panic!
                this.state = 'FLEEING';
                this.fleeTimer = 30 + Math.random() * 30;
                this.angle += Math.PI + (Math.random() - 0.5);
                return;
            } else if (this.type === 'SOLDIER') {
                // Charge!
                this.speedMultiplier = 2.0;

                // Follow gradient strongly
                const sensorDist = CONFIG.antSensorDist;
                const sensorAngle = CONFIG.antSensorAngle;
                const getDanger = (a: number) => world.grid.get(this.x + Math.cos(this.angle + a) * sensorDist, this.y + Math.sin(this.angle + a) * sensorDist, 'DANGER');

                const l = getDanger(-sensorAngle);
                const c = getDanger(0);
                const r = getDanger(sensorAngle);

                if (c > l && c > r) { /* straight */ }
                else if (l > r) this.angle -= CONFIG.antTurnSpeed * 2;
                else this.angle += CONFIG.antTurnSpeed * 2;

                this.move(world);
                return;
            }
        }

        // 1. Hunt if protein needed
        if (needsProtein) {
            for (const insect of world.insects) {
                if (insect.type === 'PREY') {
                    const dx = this.x - insect.x;
                    const dy = this.y - insect.y;
                    if (dx * dx + dy * dy < 4900) { // 70px range (agressive search)
                        this.state = 'ATTACKING';
                        return;
                    }
                }
            }
        }

        // 1.5 Check for Aphids (Farming)
        for (const insect of world.insects) {
            if (insect.type === 'APHID') {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < 400) { // Close enough to milk
                    this.carrying = 'SUGAR';
                    this.state = 'RETURNING';
                    this.energy = CONFIG.antMaxEnergy;
                    this.angle += Math.PI;
                    world.addParticle(this.x, this.y, '#00FF00'); // Farming particle
                    return;
                } else if (distSq < 2500) { // Visual range
                    // Move towards aphid
                    this.angle = Math.atan2(dy, dx);
                    return;
                }
            }
        }

        // 2. Check for nearby food (Visual/Smell)
        for (const food of world.foods) {
            if (food.amount <= 0) continue;

            const dx = food.x - this.x;
            const dy = food.y - this.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 400) { // Grab range
                // Take food
                food.harvest(1);
                this.carrying = food.type;
                this.state = 'RETURNING';
                this.energy = CONFIG.antMaxEnergy; // Eat a bit while harvesting
                this.angle += Math.PI; // Turn around
                return;
            } else if (distSq < 2500) { // Visual range
                // Move towards it
                this.angle = Math.atan2(dy, dx);
                return;
            }
        }

        // 3. Follow Pheromones
        const sensorDist = CONFIG.antSensorDist;
        const sensorAngle = CONFIG.antSensorAngle;

        const getPheromoneLevel = (angleOffset: number) => {
            const sx = this.x + Math.cos(this.angle + angleOffset) * sensorDist;
            const sy = this.y + Math.sin(this.angle + angleOffset) * sensorDist;

            if (needsProtein) {
                return world.grid.get(sx, sy, 'PROTEIN');
            } else {
                return world.grid.get(sx, sy, 'SUGAR');
            }
        };

        const left = getPheromoneLevel(-sensorAngle);
        const center = getPheromoneLevel(0);
        const right = getPheromoneLevel(sensorAngle);

        if (center > 0.05 || left > 0.05 || right > 0.05) {
            if (center > left && center > right) {
                this.angle += (Math.random() - 0.5) * 0.1;
            } else if (center < left && center < right) {
                this.angle += (Math.random() - 0.5) * 2 * CONFIG.antTurnSpeed;
            } else if (left > right) {
                this.angle -= CONFIG.antTurnSpeed;
            } else if (right > left) {
                this.angle += CONFIG.antTurnSpeed;
            }
        } else {
            this.wander();
        }

        // Drop Home Trail (Thicker)
        world.grid.depositCircle(this.x, this.y, 'HOME', 0.5, 3);
    }

    handleReturning(world: World) {
        if (this.obstacleTimer > 0) return; // Sliding along wall

        // 1. Check proximity to Nest
        const dx = CONFIG.queenPosition.x - this.x;
        const dy = CONFIG.queenPosition.y - this.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 900) { // Nest range
            // Drop food
            if (this.carrying === 'SUGAR') {
                world.sugarStockpile += CONFIG.sugarValue;
            } else if (this.carrying === 'PROTEIN') {
                world.proteinStockpile += CONFIG.proteinValue;
            }
            this.carrying = 'NONE';
            this.state = 'FORAGING';
            this.energy = CONFIG.antMaxEnergy; // Refuel at nest
            this.angle += Math.PI;
            return;
        }

        // 2. Follow Home Pheromones
        const sensorDist = CONFIG.antSensorDist;
        const sensorAngle = CONFIG.antSensorAngle;

        const getHomeLevel = (angleOffset: number) => {
            const sx = this.x + Math.cos(this.angle + angleOffset) * sensorDist;
            const sy = this.y + Math.sin(this.angle + angleOffset) * sensorDist;
            return world.grid.get(sx, sy, 'HOME');
        };

        const left = getHomeLevel(-sensorAngle);
        const center = getHomeLevel(0);
        const right = getHomeLevel(sensorAngle);

        if (center > 0.05 || left > 0.05 || right > 0.05) {
            if (center > left && center > right) {
                this.angle += (Math.random() - 0.5) * 0.1;
            } else if (left > right) {
                this.angle -= CONFIG.antTurnSpeed;
            } else if (right > left) {
                this.angle += CONFIG.antTurnSpeed;
            }
        } else {
            this.angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
        }

        // Drop Food Trail (Specific Type, Thicker)
        if (this.carrying === 'SUGAR') {
            world.grid.depositCircle(this.x, this.y, 'SUGAR', 1.0, 3);
        } else if (this.carrying === 'PROTEIN') {
            world.grid.depositCircle(this.x, this.y, 'PROTEIN', 1.0, 3);
        }
    }

    move(world: World) {
        const speed = CONFIG.antSpeed * this.speedMultiplier;
        const nextX = this.x + Math.cos(this.angle) * speed;
        const nextY = this.y + Math.sin(this.angle) * speed;

        if (!world.terrain.isBlocked(nextX, nextY)) {
            this.x = nextX;
            this.y = nextY;
        } else {
            // Slide along obstacle
            this.angle = world.terrain.getCollisionAngle(this.x, this.y, this.angle);
            this.obstacleTimer = 10 + Math.floor(Math.random() * 10); // Stick to wall for a bit

            // Push out of obstacle slightly to prevent getting stuck
            this.x += Math.cos(this.angle) * speed;
            this.y += Math.sin(this.angle) * speed;
        }
    }

    wander() {
        this.angle += (Math.random() - 0.5) * CONFIG.antTurnSpeed;
    }
}
