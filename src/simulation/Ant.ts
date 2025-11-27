import { CONFIG } from '../config';
import { World } from './World';

export type AntState = 'FORAGING' | 'RETURNING' | 'ATTACKING' | 'FLEEING' | 'IDLE' | 'NURSING' | 'PATROLLING';

export class Ant {
    x: number;
    y: number;
    type: 'WORKER' | 'SOLDIER';
    state: AntState = 'FORAGING';
    angle: number;
    energy: number = CONFIG.antMaxEnergy;
    maxEnergy: number = CONFIG.antMaxEnergy;
    health: number;
    maxHealth: number;
    carrying: 'NONE' | 'SUGAR' | 'PROTEIN' = 'NONE';
    carryingAmount: number = 0;

    // Timers
    attackCooldown: number = 0;
    fleeTimer: number = 0;
    obstacleTimer: number = 0;
    patrolAngle: number = 0; // For patrolling soldiers
    patrolRadius: number = 100 + Math.random() * 100;

    // Helper for smoothing
    prevHealth: number;
    speedMultiplier: number = 1.0;

    constructor(x: number, y: number, type: 'WORKER' | 'SOLDIER') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = Math.random() * Math.PI * 2;

        if (type === 'WORKER') {
            this.maxHealth = CONFIG.workerHealth;
            this.state = 'FORAGING';
        } else {
            this.maxHealth = CONFIG.soldierHealth;
            this.state = 'PATROLLING'; // Soldiers patrol by default
        }
        this.health = this.maxHealth;
        this.prevHealth = this.health;
    }

    update(world: World) {
        this.speedMultiplier = 1.0; // Reset speed

        if (this.health <= 0) {
            // Death Pheromone - Massive range to alert everyone
            world.grid.depositCircle(this.x, this.y, 'DANGER', 1.0, 30);
            return;
        }

        // Check for damage -> Alarm Pheromone & Panic
        if (this.health < this.prevHealth) {
            // Stronger alarm with larger range
            world.grid.depositCircle(this.x, this.y, 'DANGER', 1.0, 20);
            this.prevHealth = this.health;

            if (this.type === 'WORKER') {
                // Check if we should fight or flight
                const allies = this.countNearbyAllies(world, 100);
                if (allies >= 3) {
                    this.state = 'ATTACKING';
                    this.speedMultiplier = 1.3;
                } else {
                    this.state = 'FLEEING';
                    this.fleeTimer = 60;
                    this.angle += Math.PI;
                }
            } else if (this.type === 'SOLDIER') {
                this.state = 'ATTACKING'; // Soldiers always fight back
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

        // Self Defense / Aggression
        if (this.state !== 'ATTACKING' && this.state !== 'FLEEING') {
            // Check for enemies
            for (const insect of world.insects) {
                if (insect.type === 'PREDATOR' || insect.type === 'SPIDER' || insect.type === 'BEETLE') {
                    const distSq = (this.x - insect.x) ** 2 + (this.y - insect.y) ** 2;
                    if (distSq < 2500) { // 50px
                        if (this.type === 'SOLDIER') {
                            this.state = 'ATTACKING';
                        } else {
                            const allies = this.countNearbyAllies(world, 100);
                            if (allies >= 4) this.state = 'ATTACKING';
                            else {
                                this.state = 'FLEEING';
                                this.fleeTimer = 40;
                                this.angle = Math.atan2(this.y - insect.y, this.x - insect.x) + Math.PI;
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Worker Nursing Check
        if (this.type === 'WORKER' && this.state === 'RETURNING' && this.carrying === 'PROTEIN') {
            // Check if Queen needs food
            if (world.queen.energy < 1000 || world.brood.some(b => b.stage === 'LARVA' && b.hunger > 50)) {
                this.state = 'NURSING';
            }
        }

        // State Machine
        switch (this.state) {
            case 'FORAGING': this.handleForaging(world); break;
            case 'RETURNING': this.handleReturning(world); break;
            case 'ATTACKING': this.handleCombat(world); break;
            case 'FLEEING': this.handleFleeing(world); break;
            case 'NURSING': this.handleNursing(world); break;
            case 'PATROLLING': this.handlePatrolling(world); break;
        }

        // Movement
        this.move(world);
    }

    countNearbyAllies(world: World, radius: number): number {
        let count = 0;
        const rSq = radius * radius;

        // Use Spatial Grid for O(1) lookup
        const potentialNeighbors = world.spatialGrid.getNearby(this.x, this.y, radius);

        for (const ant of potentialNeighbors) {
            if (ant === this) continue;
            const dx = this.x - ant.x;
            const dy = this.y - ant.y;
            if (dx * dx + dy * dy < rSq) {
                count++;
            }
        }
        return count;
    }

    handleNursing(world: World) {
        // Prioritize Queen
        let targetX = world.queen.x;
        let targetY = world.queen.y;
        let target: any = world.queen;

        // If Queen is full, find hungry Larva
        if (world.queen.energy > 1500) {
            const hungryLarva = world.brood.find(b => b.stage === 'LARVA' && b.hunger > 20);
            if (hungryLarva) {
                targetX = hungryLarva.x;
                targetY = hungryLarva.y;
                target = hungryLarva;
            } else {
                // No one hungry, dump in stockpile
                this.state = 'RETURNING';
                return;
            }
        }

        // Move to target
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.angle = Math.atan2(dy, dx);

        if (dist < 10) {
            // Feed
            if (target === world.queen) {
                world.queen.energy += 500; // Feed queen
            } else {
                target.feed(50); // Feed larva
            }

            this.carryingAmount -= 50; // Assume protein chunk is large
            // Simplified: One protein item feeds one thing fully for now
            this.carrying = 'NONE';
            this.carryingAmount = 0;
            this.state = 'FORAGING';
        }
    }

    handlePatrolling(_world: World) {
        // Circle around the nest
        const centerX = CONFIG.queenPosition.x;
        const centerY = CONFIG.queenPosition.y;

        // Orbit logic
        this.patrolAngle += 0.01;
        const targetX = centerX + Math.cos(this.patrolAngle) * this.patrolRadius;
        const targetY = centerY + Math.sin(this.patrolAngle) * this.patrolRadius;

        const dx = targetX - this.x;
        const dy = targetY - this.y;

        // Move towards patrol point
        const desiredAngle = Math.atan2(dy, dx);

        // Smooth turn
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * 0.1;

        // Look for trouble (handled in update loop)

        // Occasionally stop to scan
        if (Math.random() < 0.005) {
            this.angle += Math.PI; // Turn around to look
        }
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
            world.grid.depositCircle(this.x, this.y, 'DANGER', 0.5, 10); // Increased trail size
        }

        if (this.fleeTimer <= 0) {
            this.state = 'FORAGING';
        }
    }

    handleCombat(world: World) {
        this.speedMultiplier = 1.5; // Combat adrenaline

        // Cowardice Check for Workers: If fighting alone, run away!
        if (this.type === 'WORKER' && this.attackCooldown % 30 === 0) {
            const allies = this.countNearbyAllies(world, 100);
            if (allies < 2) { // Need at least 2 friends to keep fighting
                this.state = 'FLEEING';
                this.fleeTimer = 60;
                this.angle += Math.PI;
                return;
            }
        }

        // Find nearest enemy
        let nearestEnemy = null;
        let minDist = Infinity;

        const needsProtein = world.proteinStockpile < CONFIG.eggCost * 3;
        // Workers hunt if they need protein OR if they are in a mob (courage)

        for (const insect of world.insects) {
            // Attack everything except Aphids (unless hungry?)
            if (insect.type !== 'APHID' || needsProtein) {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDist) {
                    minDist = d2;
                    nearestEnemy = insect;
                }
            }
        }

        if (nearestEnemy && minDist < 10000) { // 100px chase range (increased)
            const dx = nearestEnemy.x - this.x;
            const dy = nearestEnemy.y - this.y;
            this.angle = Math.atan2(dy, dx);

            if (minDist < 100) { // Attack range
                if (this.attackCooldown <= 0) {
                    const dmg = this.type === 'SOLDIER' ? CONFIG.soldierDamage : CONFIG.workerDamage;
                    nearestEnemy.health -= dmg;
                    this.attackCooldown = 20;
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
        if (dangerLevel > 0.05) {
            let brave = false;

            if (this.type === 'SOLDIER') {
                brave = true;
            } else {
                // Worker Mob Courage
                const allies = this.countNearbyAllies(world, 150); // Check wider area for support
                if (allies >= 4) { // Need 4 allies to charge into danger
                    brave = true;
                }
            }

            if (brave) {
                // Charge towards danger!
                this.speedMultiplier = this.type === 'SOLDIER' ? 2.0 : 1.3;

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
            } else {
                // Panic!
                this.state = 'FLEEING';
                this.fleeTimer = 30 + Math.random() * 30;
                this.angle += Math.PI + (Math.random() - 0.5);
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
                        // Workers need a group to hunt Prey
                        if (this.type === 'WORKER') {
                            const allies = this.countNearbyAllies(world, 80);
                            if (allies < 3) continue; // Ignore prey if alone
                        }

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
