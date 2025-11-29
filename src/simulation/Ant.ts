import { CONFIG } from '../config';
import { World } from './World';

export class Ant {
    x: number;
    y: number;
    angle: number;
    type: 'WORKER' | 'SOLDIER' | 'QUEEN';
    state: 'FORAGING' | 'RETURNING' | 'IDLE' | 'NURSING' | 'PATROLLING' | 'FLEEING' | 'ATTACKING' | 'TRANSPORTING';
    carrying: 'NONE' | 'SUGAR' | 'PROTEIN' | 'BROOD';
    carryingAmount: number = 0;
    carryingInstance: any = null;
    energy: number;
    health: number;
    location: 'WORLD' | 'NEST';

    // Pathfinding/Movement
    obstacleTimer: number = 0;
    fleeTimer: number = 0;
    attackCooldown: number = 0;
    speedMultiplier: number = 1.0;

    // Patrol logic
    patrolAngle: number = 0;
    patrolRadius: number = 100;
    patrolTarget: { x: number, y: number } | null = null;

    constructor(x: number, y: number, type: 'WORKER' | 'SOLDIER' | 'QUEEN') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = Math.random() * Math.PI * 2;
        this.energy = CONFIG.antMaxEnergy;
        this.health = type === 'SOLDIER' ? CONFIG.soldierHealth : CONFIG.workerHealth;
        this.carrying = 'NONE';
        this.location = 'WORLD'; // Start in world

        // Initial State Assignment
        if (type === 'QUEEN') {
            this.state = 'IDLE'; // Queen just chills
            this.location = 'NEST';
        } else if (type === 'SOLDIER') {
            this.state = 'PATROLLING';
        } else {
            // Workers split between Foraging and Nursing
            this.state = Math.random() > 0.3 ? 'FORAGING' : 'NURSING';
            if (this.state === 'NURSING') this.location = 'NEST';
        }
    }

    update(world: World) {
        this.energy -= CONFIG.antEnergyDecay;
        if (this.energy <= 0) {
            this.health--;
            if (this.health <= 0) {
                // Die
                const index = world.ants.indexOf(this);
                if (index > -1) world.ants.splice(index, 1);
                return;
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.obstacleTimer > 0) this.obstacleTimer--;

        this.speedMultiplier = 1.0; // Reset speed every frame

        // State Machine
        switch (this.state) {
            case 'FORAGING':
                this.handleForaging(world);
                break;
            case 'RETURNING':
                this.handleReturning(world);
                break;
            case 'NURSING':
                this.handleNursing(world);
                break;
            case 'PATROLLING':
                this.handlePatrolling(world);
                break;
            case 'FLEEING':
                this.handleFleeing(world);
                break;
            case 'ATTACKING':
                this.handleCombat(world);
                break;
            case 'TRANSPORTING':
                this.handleTransporting(world);
                break;
            case 'IDLE':
                if (this.type === 'QUEEN') {
                    // Queen idle logic
                } else if (this.type === 'WORKER') {
                    this.handleNurseIdle(world);
                }
                break;
        }

        this.move(world);
    }

    handleNursing(world: World) {
        // If not carrying protein, go get some (via IDLE state)
        if (this.carrying !== 'PROTEIN') {
            this.state = 'IDLE';
            return;
        }

        // Prioritize Queen
        let targetX = world.queen.x;
        let targetY = world.queen.y;
        let target: any = world.queen;

        // 1. Critical Larvae (Starving) - Priority #1
        const criticalLarva = world.brood.find(b => b.stage === 'LARVA' && b.hunger > 50);
        if (criticalLarva) {
            targetX = criticalLarva.x;
            targetY = criticalLarva.y;
            target = criticalLarva;
        } else {
            // 2. Queen (if not full) - Priority #2
            if (world.queen.energy < 1500) {
                // Target Queen
                // (Already set as default target)
            } else {
                // 3. Normal Larvae (Hungry) - Priority #3
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
            this.state = 'IDLE'; // Go back to idle to check for more work
        }
    }

    handleNurseIdle(world: World) {
        if (this.location === 'WORLD') {
            // Go to Entrance (Right edge of World)
            const dx = CONFIG.width - this.x;
            const dy = (CONFIG.height / 2) - this.y;
            this.angle = Math.atan2(dy, dx);
            return;
        }

        // In Nest
        // 0. Self-Preservation (Eat if hungry)
        if (this.energy < 1000) {
            const storage = world.nest.chambers.find(c => c.type === 'STORAGE');
            if (storage) {
                const dx = storage.x - this.x;
                const dy = storage.y - this.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < 400) {
                    // Eat Sugar
                    if (world.sugarStockpile > 0) {
                        world.sugarStockpile = Math.max(0, world.sugarStockpile - 5);
                        this.energy = CONFIG.antMaxEnergy;
                    }
                } else {
                    // Move to storage
                    this.angle = Math.atan2(dy, dx);
                }
                return;
            }
        }

        // Check if work needed
        if (this.carrying === 'NONE') {
            // 1. Check for Misplaced Brood (Priority)
            const broodChamber = world.nest.chambers.find(c => c.type === 'BROOD');
            if (broodChamber) {
                // Find brood that is NOT in the brood chamber and NOT being carried
                const misplacedBrood = world.brood.find(b => {
                    if (b.carrier) return false; // Already being moved
                    const dx = b.x - broodChamber.x;
                    const dy = b.y - broodChamber.y;
                    return dx * dx + dy * dy > broodChamber.radius * broodChamber.radius;
                });

                if (misplacedBrood) {
                    // Go pick it up
                    const dx = misplacedBrood.x - this.x;
                    const dy = misplacedBrood.y - this.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < 400) {
                        // Pick up
                        this.carrying = 'BROOD';
                        this.carryingInstance = misplacedBrood;
                        misplacedBrood.carrier = this;
                        this.state = 'TRANSPORTING';
                    } else {
                        // Move towards it
                        this.angle = Math.atan2(dy, dx);
                    }
                    return;
                }
            }

            // 2. Check if Queen or Larva needs food AND we have stockpile
            if (world.proteinStockpile >= 10) {
                const queenHungry = world.queen.energy < 1000;
                const larvaHungry = world.brood.some(b => b.stage === 'LARVA' && b.hunger > 20);

                if (queenHungry || larvaHungry) {
                    // Go to Storage (Find it dynamically)
                    const storage = world.nest.chambers.find(c => c.type === 'STORAGE');
                    if (!storage) return; // Should not happen

                    const dx = storage.x - this.x;
                    const dy = storage.y - this.y;

                    if (dx * dx + dy * dy < 400) {
                        // Grab from stockpile
                        world.proteinStockpile -= 10;
                        this.carrying = 'PROTEIN';
                        this.carryingAmount = 10;
                        this.state = 'NURSING';
                    } else {
                        // Move to storage
                        this.angle = Math.atan2(dy, dx);
                    }
                    return;
                }
            }
        }

        // Wander in nest
        this.wander();
    }

    handleTransporting(world: World) {
        if (!this.carryingInstance) {
            this.state = 'IDLE';
            this.carrying = 'NONE';
            return;
        }

        // Carry the brood
        this.carryingInstance.x = this.x;
        this.carryingInstance.y = this.y;

        // Go to Brood Chamber
        const broodChamber = world.nest.chambers.find(c => c.type === 'BROOD');
        if (!broodChamber) return;
        const dx = broodChamber.x - this.x;
        const dy = broodChamber.y - this.y;
        const distSq = dx * dx + dy * dy;

        // If inside chamber (with some random offset to spread them out), drop it
        if (distSq < (broodChamber.radius * 0.8) * (broodChamber.radius * 0.8)) {
            // Wander to spread out (Don't force angle to center!)
            this.wander();

            // Random chance to drop
            if (Math.random() < 0.05) {
                // Drop
                this.carryingInstance.carrier = null;
                this.carryingInstance = null;
                this.carrying = 'NONE';
                this.state = 'IDLE';

                // Move away a bit
                this.angle += Math.PI;
            }
        } else {
            // Move towards center of brood chamber
            this.angle = Math.atan2(dy, dx);
        }
    }

    handlePatrolling(world: World) {
        if (this.location === 'NEST') {
            // If in nest, go to entrance to start patrol
            const entrance = world.nest.getEntrance();
            const nextNode = world.nest.getNextNodeTowards(this.x, this.y, entrance.x, entrance.y);
            if (nextNode) {
                const angle = Math.atan2(nextNode.y - this.y, nextNode.x - this.x);
                this.angle = angle + (Math.random() - 0.5) * 0.5;
            } else {
            }
            return;
        }

        // Patrol near Entrance (World side)
        let entranceX, entranceY;

        if (CONFIG.width > CONFIG.height) {
            // Landscape: Entrance at Right Edge
            entranceX = CONFIG.width - 50;
            entranceY = CONFIG.height / 2;
        } else {
            // Portrait: Entrance at Bottom Edge
            entranceX = CONFIG.width / 2;
            entranceY = CONFIG.height - 50;
        }

        // Initialize or Update Patrol Target
        let distSq = 0;
        if (this.patrolTarget) {
            const dx = this.patrolTarget.x - this.x;
            const dy = this.patrolTarget.y - this.y;
            distSq = dx * dx + dy * dy;
        }

        if (!this.patrolTarget || distSq < 400 || Math.random() < 0.005) {
            // Pick new point
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 200;

            let tx = entranceX + Math.cos(angle) * dist;
            let ty = entranceY + Math.sin(angle) * dist;

            tx = Math.max(10, Math.min(CONFIG.width - 10, tx));
            ty = Math.max(10, Math.min(CONFIG.height - 10, ty));

            this.patrolTarget = { x: tx, y: ty };

            const dx = tx - this.x;
            const dy = ty - this.y;
            distSq = dx * dx + dy * dy;
        }

        // Move towards patrol point
        const dx = this.patrolTarget.x - this.x;
        const dy = this.patrolTarget.y - this.y;
        const desiredAngle = Math.atan2(dy, dx);

        // Turn towards target
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        this.angle += diff * 0.2;
        this.angle += (Math.random() - 0.5) * 0.2;
    }

    handleFleeing(world: World) {
        this.speedMultiplier = 2.5; // Run fast!
        this.fleeTimer--;

        if (this.obstacleTimer > 0) return; // Sliding along wall

        // Move generally towards home (Entrance), but with high noise (panic)
        let homeX, homeY;

        if (this.location === 'WORLD') {
            homeX = CONFIG.width;
            homeY = CONFIG.height / 2;
        } else {
            homeX = 0; // Nest Exit
            homeY = world.nest.height / 2;
        }

        const dx = homeX - this.x;
        const dy = homeY - this.y;
        const homeAngle = Math.atan2(dy, dx);

        this.angle = this.angle * 0.5 + homeAngle * 0.5 + (Math.random() - 0.5) * 0.5;

        // Drop Danger trail while fleeing to warn others
        if (this.fleeTimer % 5 === 0) {
            const grid = this.location === 'NEST' ? world.nestGrid : world.grid;
            grid.depositCircle(this.x, this.y, 'DANGER', 0.5, 10); // Increased trail size
        }

        if (this.fleeTimer <= 0) {
            this.state = 'FORAGING';
        }
    }

    handleCombat(world: World) {
        this.speedMultiplier = 1.5; // Combat adrenaline

        // 0. Check for Overwhelming Danger (Panic)
        const dangerLevel = world.grid.get(this.x, this.y, 'DANGER');
        if (dangerLevel > 0.5) { // High danger area
            const allies = this.countNearbyAllies(world, 100);
            if (allies < 3) { // Run if outnumbered/overwhelmed
                this.state = 'FLEEING';
                this.fleeTimer = 60;
                this.angle += Math.PI + (Math.random() - 0.5);
                return;
            }
        }

        // Find nearest enemy
        let nearestEnemy = null;
        let minDist = Infinity;

        const starvingForProtein = world.proteinStockpile < CONFIG.eggCost;

        for (const insect of world.insects) {
            if (insect.type !== 'APHID' || starvingForProtein) {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDist) {
                    minDist = d2;
                    nearestEnemy = insect;
                }
            }
        }

        if (nearestEnemy && minDist < 10000) { // 100px chase range

            // Cowardice Check for Workers
            if (this.type === 'WORKER' && this.attackCooldown % 10 === 0) {
                const isDangerous = nearestEnemy.type === 'PREDATOR' || nearestEnemy.type === 'SPIDER' || nearestEnemy.type === 'BEETLE';

                if (isDangerous) {
                    const allies = this.countNearbyAllies(world, 100);
                    if (allies < 3) { // Need 3 friends to be brave against bosses
                        this.state = 'FLEEING';
                        this.fleeTimer = 60;
                        this.angle += Math.PI;
                        return;
                    }
                }
            }

            const dx = nearestEnemy.x - this.x;
            const dy = nearestEnemy.y - this.y;

            // Move towards enemy with jitter to prevent stacking
            this.angle = Math.atan2(dy, dx);
            this.angle += (Math.random() - 0.5) * 0.1;

            if (minDist < 400) { // Close range
                this.speedMultiplier = 0.5; // Slow down for precision

                if (minDist < 100) { // Attack range
                    this.speedMultiplier = 0; // Stop moving to attack!
                    if (this.attackCooldown <= 0) {
                        const dmg = this.type === 'SOLDIER' ? CONFIG.soldierDamage : CONFIG.workerDamage;
                        nearestEnemy.health -= dmg;
                        this.attackCooldown = 20;
                    }
                }
            }
        } else {
            // No enemy found, return to foraging or check for danger
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

                // FIX: If no danger, stop charging
                if (c < 0.01 && l < 0.01 && r < 0.01) {
                    this.state = 'FORAGING';
                    this.speedMultiplier = 1.0;
                    return;
                }

                if (c > l && c > r) { /* straight */ }
                else if (l > r) this.angle -= CONFIG.antTurnSpeed * 2;
                else this.angle += CONFIG.antTurnSpeed * 2;

                this.move(world);
                return;
            } else {
                this.speedMultiplier = 1.0; // Reset speed
                this.state = 'FORAGING'; // Enemy lost or dead
            }
        }
    }

    // Standard Slime Mold / Ant Steering Algorithm
    senseAndSteer(world: World, pheromoneType: 'HOME' | 'SUGAR' | 'PROTEIN'): boolean {
        const grid = this.location === 'NEST' ? world.nestGrid : world.grid;
        const sensorDist = CONFIG.antSensorDist;
        const sensorAngle = CONFIG.antSensorAngle;
        const turnSpeed = CONFIG.antTurnSpeed;

        // Helper to sample grid
        const getLevel = (angleOffset: number) => {
            const sx = this.x + Math.cos(this.angle + angleOffset) * sensorDist;
            const sy = this.y + Math.sin(this.angle + angleOffset) * sensorDist;
            return grid.get(sx, sy, pheromoneType);
        };

        const center = getLevel(0);
        const left = getLevel(-sensorAngle);
        const right = getLevel(sensorAngle);

        // Random Wander if no trail found
        if (center < 0.05 && left < 0.05 && right < 0.05) {
            this.wander();
            return false;
        }

        // Steering Logic
        if (center > left && center > right) {
            // Continue straight (with tiny jitter)
            this.angle += (Math.random() - 0.5) * 0.05;
        } else if (center < left && center < right) {
            // Confused / Surrounded -> Rotate randomly but decisively
            // Don't just jitter, pick a direction to break the loop
            if (Math.random() < 0.5) this.angle -= turnSpeed;
            else this.angle += turnSpeed;
        } else if (left > right) {
            // Turn Left
            this.angle -= turnSpeed;
        } else if (right > left) {
            // Turn Right
            this.angle += turnSpeed;
        }
        return true;
    }

    handleForaging(world: World) {
        if (this.obstacleTimer > 0) return; // Sliding along wall

        if (this.location === 'NEST') {
            // Go to Exit
            const entrance = world.nest.getEntrance();
            const targetX = entrance.x;
            const targetY = entrance.y;

            const nextNode = world.nest.getNextNodeTowards(this.x, this.y, targetX, targetY);
            if (nextNode) {
                const angle = Math.atan2(nextNode.y - this.y, nextNode.x - this.x);
                this.angle = angle + (Math.random() - 0.5) * 0.5;
            } else {
                this.angle = Math.atan2(targetY - this.y, targetX - this.x) + (Math.random() - 0.5) * 1.0;
            }
            return;
        }

        const needsProtein = world.proteinStockpile < CONFIG.eggCost * 25;

        // 0. Check for DANGER
        const dangerLevel = world.grid.get(this.x, this.y, 'DANGER');
        if (dangerLevel > 0.05) {
            this.state = 'FLEEING';
            this.fleeTimer = 30;
            this.angle += Math.PI;
            return;
        }

        // 1. Hunt if protein needed OR opportunistic
        for (const insect of world.insects) {
            const isPrey = insect.type === 'PREY' || insect.type === 'BEETLE' || insect.type === 'LADYBUG' || insect.type === 'SPIDER' || insect.type === 'PREDATOR';

            if (isPrey) {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const distSq = dx * dx + dy * dy;

                if (needsProtein || distSq < 2500) {
                    if (distSq < 4900) { // 70px range
                        if (this.type === 'WORKER') {
                            if (insect.type === 'BEETLE') {
                                const allies = this.countNearbyAllies(world, 80);
                                if (allies < 5) continue;
                            }
                            if (insect.type === 'SPIDER' || insect.type === 'PREDATOR') {
                                const allies = this.countNearbyAllies(world, 100);
                                if (allies < 4) continue;
                            }
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

                if (distSq < 400) {
                    this.carrying = 'SUGAR';
                    this.state = 'RETURNING';
                    this.energy = CONFIG.antMaxEnergy;
                    this.angle += Math.PI;
                    world.addParticle(this.x, this.y, '#00FF00');
                    return;
                } else if (distSq < 10000) {
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

            if (distSq < 400) {
                food.harvest(1);
                this.carrying = food.type;
                this.state = 'RETURNING';
                this.energy = CONFIG.antMaxEnergy;
                this.angle += Math.PI;
                return;
            } else if (distSq < 10000) {
                // Move directly to food
                this.angle = Math.atan2(dy, dx);

                // Add slight jitter to prevent perfect stacking
                this.angle += (Math.random() - 0.5) * 0.1;

                // Slow down for precise arrival
                if (distSq < 900) {
                    this.speedMultiplier = 0.5;
                }
                return;
            }
        }

        // 3. Follow Pheromones using Standard Algorithm
        this.senseAndSteer(world, needsProtein ? 'PROTEIN' : 'SUGAR');

        // Drop Home Trail
        world.grid.depositCircle(this.x, this.y, 'HOME', 0.5, 3);
    }

    handleReturning(world: World) {
        if (this.obstacleTimer > 0) return;

        const grid = this.location === 'NEST' ? world.nestGrid : world.grid;

        // Drop Food Trail
        if (this.carrying === 'SUGAR') {
            grid.depositCircle(this.x, this.y, 'SUGAR', 1.0, 3);
        } else if (this.carrying === 'PROTEIN') {
            grid.depositCircle(this.x, this.y, 'PROTEIN', 1.0, 3);
        }

        if (this.location === 'WORLD') {
            // Calculate Angle to Home (Entrance)
            let targetX, targetY;
            if (CONFIG.width > CONFIG.height) {
                targetX = CONFIG.width;
                targetY = CONFIG.height / 2;
            } else {
                targetX = CONFIG.width / 2;
                targetY = CONFIG.height;
            }
            const angleToHome = Math.atan2(targetY - this.y, targetX - this.x);

            // Follow Home Pheromones
            const foundTrail = this.senseAndSteer(world, 'HOME');

            // Apply Bias towards Home
            // If trail found: Weak bias to keep them moving in the right general direction along the trail
            // If no trail: Stronger bias to guide them back
            const biasStrength = foundTrail ? 0.15 : 0.3;

            let diff = angleToHome - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            this.angle += diff * biasStrength;

        } else {
            // NEST: Go to Storage
            const storage = world.nest.chambers.find(c => c.type === 'STORAGE');

            if (storage) {
                const dx = storage.x - this.x;
                const dy = storage.y - this.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < 2500) {
                    if (this.carrying === 'SUGAR') world.sugarStockpile += CONFIG.sugarValue;
                    else world.proteinStockpile += CONFIG.proteinValue;

                    this.carrying = 'NONE';
                    this.state = 'FORAGING';
                    this.energy = CONFIG.antMaxEnergy;
                    this.angle += Math.PI;
                    return;
                } else {
                    const nextNode = world.nest.getNextNodeTowards(this.x, this.y, storage.x, storage.y);
                    if (nextNode) {
                        const dx = nextNode.x - this.x;
                        const dy = nextNode.y - this.y;
                        this.angle = Math.atan2(dy, dx);
                    } else {
                        this.angle = Math.atan2(dy, dx);
                    }
                }
            }
        }
    }

    wander() {
        this.angle += (Math.random() - 0.5) * 0.2;
    }

    move(world: World) {
        const speed = CONFIG.antSpeed * this.speedMultiplier;
        const nextX = this.x + Math.cos(this.angle) * speed;
        const nextY = this.y + Math.sin(this.angle) * speed;

        if (this.location === 'WORLD') {
            // Check Entrance
            // Landscape: Right edge of World -> Left edge of Nest
            // Portrait: Bottom edge of World -> Top edge of Nest

            const isLandscape = CONFIG.width > CONFIG.height;

            if (isLandscape) {
                if (nextX > CONFIG.width - 10 && Math.abs(nextY - CONFIG.height / 2) < 50) {
                    this.location = 'NEST';
                    this.x = 10; // Enter at left side of nest
                    this.y = world.nest.height / 2;
                    this.angle = 0; // Face into nest
                    return;
                }
            } else {
                // Portrait
                if (nextY > CONFIG.height - 10 && Math.abs(nextX - CONFIG.width / 2) < 50) {
                    this.location = 'NEST';
                    this.x = world.nest.width / 2; // Enter at center x of nest
                    this.y = 10; // Top of nest
                    this.angle = Math.PI / 2; // Face down into nest
                    return;
                }
            }

            if (!world.terrain.isBlocked(nextX, nextY) && nextX > 0 && nextX < CONFIG.width && nextY > 0 && nextY < CONFIG.height) {
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
        } else {
            // NEST
            // Check Exit
            // Landscape: Left edge of Nest -> Right edge of World
            // Portrait: Top edge of Nest -> Bottom edge of World

            const isLandscape = CONFIG.width > CONFIG.height;

            if (isLandscape) {
                if (nextX < 5 && Math.abs(nextY - world.nest.height / 2) < 50) {
                    this.location = 'WORLD';
                    this.x = CONFIG.width - 10; // Enter at right side of world
                    this.y = CONFIG.height / 2;
                    this.angle = Math.PI; // Face into world
                    return;
                }
            } else {
                // Portrait
                if (nextY < 5 && Math.abs(nextX - world.nest.width / 2) < 50) {
                    this.location = 'WORLD';
                    this.x = CONFIG.width / 2; // Enter at center x of world
                    this.y = CONFIG.height - 10; // Bottom of world
                    this.angle = -Math.PI / 2; // Face up into world
                    return;
                }
            }
            // Use a buffer to keep ants away from walls
            const NEST_BUFFER = 5;

            if (world.nest.isInside(nextX, nextY, NEST_BUFFER)) {
                this.x = nextX;
                this.y = nextY;
            } else {
                // Wall collision in nest - Robust recovery
                // Push towards the nearest node center (guaranteed to be inside)
                const nearest = world.nest.getNearestNode(this.x, this.y);
                if (nearest) {
                    const dx = nearest.x - this.x;
                    const dy = nearest.y - this.y;
                    const angleToCenter = Math.atan2(dy, dx);

                    // Push gently back inside
                    this.x += Math.cos(angleToCenter) * 2;
                    this.y += Math.sin(angleToCenter) * 2;

                    // Align angle with tunnel direction (tangent)
                    // Tangent is perpendicular to normal (radius vector)
                    // But we don't know which way is "forward".
                    // Just randomize slightly to unstuck, but keep generally inside.
                    this.angle = angleToCenter + (Math.random() - 0.5) * 2.0;
                } else {
                    // Fallback
                    this.angle += Math.PI;
                    this.x += Math.cos(this.angle) * 2;
                    this.y += Math.sin(this.angle) * 2;
                }
            }
        }
    }

    countNearbyAllies(world: World, radius: number): number {
        let count = 0;
        for (const ant of world.ants) {
            if (ant !== this && ant.type !== 'QUEEN' && ant.location === this.location) {
                const dx = ant.x - this.x;
                const dy = ant.y - this.y;
                if (dx * dx + dy * dy < radius * radius) {
                    count++;
                }
            }
        }
        return count;
    }
}
