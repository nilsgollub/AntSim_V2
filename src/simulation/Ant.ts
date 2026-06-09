import { rand } from '../rng';
import { CONFIG } from '../config';
import { World } from './World';
import type { Colony } from './Colony';
import { handleNursing, handleResting, handleNurseIdle, handleTransporting, handlePatrolling, handleFleeing, handleCombat, handleForaging, handleHarvesting, handleReturning, handleHungry, handleMilking, handleRaiding } from './antStates';

export class Ant {
    x: number;
    y: number;
    angle: number;
    type: 'WORKER' | 'SOLDIER' | 'QUEEN';
    state: 'FORAGING' | 'RETURNING' | 'IDLE' | 'NURSING' | 'PATROLLING' | 'FLEEING' | 'ATTACKING' | 'TRANSPORTING' | 'HARVESTING' | 'HUNGRY' | 'MILKING' | 'RESTING' | 'RAIDING';
    carrying: 'NONE' | 'SUGAR' | 'PROTEIN' | 'BROOD' | 'CORPSE';
    carryingAmount: number = 0;
    carryingInstance: any = null;
    energy: number;
    health: number;
    location: 'WORLD' | 'NEST';

    // The colony this ant belongs to (set in Colony.spawnAnt). Phase 1: present but
    // not yet consulted by the FSM handlers — they still read world.* (= colony 0).
    colony!: Colony;

    // Ageing: ants die of old age once `age` exceeds `maxAge` (jittered per ant).
    age: number = 0;
    maxAge: number;

    // Site fidelity: last productive food location this ant harvested (-1 = none).
    foodMemoryX: number = -1;
    foodMemoryY: number = -1;

    // Trail strength to lay on the way home, set from the source's richness (0..1).
    carryingQuality: number = 1;

    // Trophallaxis: crop (social stomach) fuel gathered in the field, shared
    // mouth-to-mouth with hungry nestmates back home.
    cropSugar: number = 0;
    trophTimer: number = 0;

    // Stable per-ant value (0..1) used to split the workforce between sugar and
    // protein foraging when both are needed, without per-frame flicker.
    forageSeed: number = rand();

    // Functional polymorphism: caste-correlated body size driving draw scale AND
    // real stats (HP/bite/speed/upkeep). Assigned in the constructor from `type`.
    sizeVar: number = 1;
    attackDamage: number = CONFIG.workerDamage; // melee bite, scaled by size
    sizeSpeed: number = 1;   // movement speed factor (bigger = slower)
    sizeUpkeep: number = 1;  // energy-decay factor (bigger = costlier)
    shade: number = Math.floor(rand() * 4); // cached-sprite brightness variant

    // Pathfinding/Movement
    obstacleTimer: number = 0;
    exitTimer: number = 0;
    fleeTimer: number = 0;
    attackCooldown: number = 0;
    sprintTimer: number = 0;
    sprintCooldown: number = 0;
    speedMultiplier: number = 1.0;
    thinkTimer: number = 0;
    harvestTimer: number = 0;
    restTimer: number = 0;

    // Patrol logic
    patrolAngle: number = 0;
    patrolRadius: number = 100;
    patrolTarget: { x: number, y: number } | null = null;
    // Raid: the rival nest entrance (world point) this ant is marching on, set when
    // its colony launches a raid (rival-colony mode only). null = not raiding.
    raidTarget: { x: number, y: number } | null = null;
    // A chamber target committed once (e.g. which nursery a carried brood goes to),
    // so per-frame "nearest chamber" recomputation can't make the ant thrash between
    // rooms and never arrive.
    carryTarget: { x: number, y: number } | null = null;
    stuckTimer: number = 0;
    lastX: number = 0;
    lastY: number = 0;
    // Nest anti-jitter: a short "escape" burst that overrides the handler's heading
    // and walks the ant to an open node centre, breaking corner-oscillation. Plus a
    // windowed progress anchor that detects net-zero movement the per-frame test
    // misses (an ant vibrating a few px back and forth still "moves" each frame).
    nestEscapeTimer: number = 0;
    nestEscapeX: number = 0;
    nestEscapeY: number = 0;
    progressX: number = 0;
    progressY: number = 0;
    progressTimer: number = 0;
    // Did the ant actually hit a nest wall during the current progress window? The
    // windowed escape only fires when low net progress coincides with a real wall
    // collision — so a slow ant merely jostling in a crowded chamber (separation, no
    // wall) isn't yanked to a node centre; only a genuinely wedged one is.
    wallSlidInWindow: boolean = false;

    constructor(x: number, y: number, type: 'WORKER' | 'SOLDIER' | 'QUEEN') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = rand() * Math.PI * 2;
        this.energy = CONFIG.antMaxEnergy;

        // Functional polymorphism (size → stats). Soldiers are bigger, workers smaller.
        const poly = CONFIG.ant.poly;
        let sizeMin: number, sizeRange: number;
        if (type === 'SOLDIER') { sizeMin = poly.soldierSizeMin; sizeRange = poly.soldierSizeRange; }
        else if (type === 'WORKER') { sizeMin = poly.workerSizeMin; sizeRange = poly.workerSizeRange; }
        else { sizeMin = 1.55; sizeRange = 0.1; } // queen-typed ant (rare/cosmetic)
        this.sizeVar = sizeMin + rand() * sizeRange;

        const baseHealth = type === 'SOLDIER' ? CONFIG.soldierHealth : CONFIG.workerHealth;
        const baseDamage = type === 'SOLDIER' ? CONFIG.soldierDamage : CONFIG.workerDamage;
        // HP + bite: scaled by size but centred on the caste mean, so caste *averages*
        // (and the tuned combat balance) stay put — only intra-caste variety is added.
        const sizeRel = this.sizeVar / (sizeMin + sizeRange / 2);
        this.health = Math.round(baseHealth * sizeRel);
        this.attackDamage = baseDamage * sizeRel;
        // Speed + upkeep: scaled by absolute size → a real cross-caste difference.
        this.sizeSpeed = 1 / (poly.speedBias + (1 - poly.speedBias) * this.sizeVar);
        this.sizeUpkeep = poly.upkeepBase + (1 - poly.upkeepBase) * this.sizeVar;

        this.maxAge = CONFIG.ant.lifespan + rand() * CONFIG.ant.lifespanJitter;
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
            this.state = rand() > 0.3 ? 'FORAGING' : 'NURSING';
            if (this.state === 'NURSING') this.location = 'NEST';
        }
    }

    update(world: World) {
        // Ageing: die of old age. Setting health to 0 lets World handle removal
        // (and corpse spawning when above ground) uniformly with combat deaths.
        this.age++;
        if (this.type !== 'QUEEN' && this.age > this.maxAge) {
            this.health = 0;
            return;
        }

        // Metabolism
        if (this.state === 'RESTING') {
            this.energy -= CONFIG.antEnergyDecay * 0.1 * this.sizeUpkeep; // Sleep: low usage
        } else {
            this.energy -= CONFIG.antEnergyDecay * this.sizeUpkeep;
        }

        if (this.energy <= 0) {
            this.health--;
            if (this.health <= 0) {
                // Die
                const index = world.ants.indexOf(this);
                if (index > -1) world.ants.splice(index, 1);
                return;
            }
        }

        // Critically Hungry -> Force Eat (override other states mostly)
        // FIX: Don't interrupt if already looking for food (FORAGING) or eating (HARVESTING) to prevent Death Loop when Nest is empty
        if (this.energy < CONFIG.ant.hungryThreshold &&
            this.state !== 'HUNGRY' &&
            this.state !== 'ATTACKING' &&
            this.state !== 'FORAGING' &&
            this.state !== 'HARVESTING') {
            this.state = 'HUNGRY';
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.obstacleTimer > 0) this.obstacleTimer--;

        this.speedMultiplier = 1.0; // Reset speed every frame

        // State Machine
        switch (this.state) {
            case 'FORAGING':
                handleForaging(this, world);
                break;
            case 'RETURNING':
                handleReturning(this, world);
                break;
            case 'NURSING':
                handleNursing(this, world);
                break;
            case 'PATROLLING':
                handlePatrolling(this, world);
                break;
            case 'FLEEING':
                handleFleeing(this, world);
                break;
            case 'ATTACKING':
                handleCombat(this, world);
                break;
            case 'RAIDING':
                handleRaiding(this, world);
                break;
            case 'TRANSPORTING':
                handleTransporting(this, world);
                break;
            case 'HARVESTING':
                handleHarvesting(this, world);
                break;
            case 'MILKING':
                handleMilking(this, world);
                break;
            case 'HUNGRY':
                handleHungry(this, world);
                break;
            case 'RESTING':
                handleResting(this, world);
                break;
            case 'IDLE':
                if (this.type === 'QUEEN') {
                    // Queen idle logic
                } else if (this.type === 'WORKER') {
                    handleNurseIdle(this, world);
                } else if (this.type === 'SOLDIER') {
                    this.state = 'PATROLLING';
                }
                break;
        }

        // Trophallaxis: share crop with hungry nestmates while in the nest (throttled).
        if (this.location === 'NEST' && this.type !== 'QUEEN') {
            if (this.trophTimer > 0) this.trophTimer--;
            else { this.trophTimer = CONFIG.ant.troph.interval; this.trophallaxis(world); }
        }

        this.move(world);
    }

    senseAndSteer(world: World, pheromoneType: 'HOME' | 'SUGAR' | 'PROTEIN'): boolean {
        const grid = this.location === 'NEST' ? this.colony.nestGrid : this.colony.outdoorField;
        // Shorter sensing range at night for outdoor ants.
        const sensorDist = CONFIG.antSensorDist * (this.location === 'WORLD' ? world.activityFactor() : 1);
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
            // this.wander(); // Caller handles wandering if false
            return false;
        }

        // Steering Logic
        if (center > left && center > right) {
            // Continue straight (with tiny jitter)
            this.angle += (rand() - 0.5) * 0.05;
        } else if (center < left && center < right) {
            // Confused / Surrounded -> Rotate randomly but decisively
            // Don't just jitter, pick a direction to break the loop
            if (rand() < 0.5) this.angle -= turnSpeed;
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

    senseAndAvoid(_world: World, pheromoneType: 'HOME' | 'SUGAR' | 'PROTEIN') {
        const grid = this.location === 'NEST' ? this.colony.nestGrid : this.colony.outdoorField;
        const sensorDist = CONFIG.antSensorDist;
        const sensorAngle = CONFIG.antSensorAngle;
        const turnSpeed = CONFIG.antTurnSpeed;

        const getLevel = (angleOffset: number) => {
            const sx = this.x + Math.cos(this.angle + angleOffset) * sensorDist;
            const sy = this.y + Math.sin(this.angle + angleOffset) * sensorDist;
            return grid.get(sx, sy, pheromoneType);
        };

        const center = getLevel(0);
        const left = getLevel(-sensorAngle);
        const right = getLevel(sensorAngle);

        // If no pheromone detected, just wander (keep exploring)
        if (center < 0.05 && left < 0.05 && right < 0.05) {
            this.wander();
            return;
        }

        // Avoidance Logic: Turn towards the LOWEST concentration
        if (center > left && center > right) {
            // Blocked ahead! Turn randomly L or R
            if (rand() < 0.5) this.angle -= turnSpeed;
            else this.angle += turnSpeed;
        } else if (left > right) {
            // Left is worse, turn Right
            this.angle += turnSpeed;
        } else if (right > left) {
            // Right is worse, turn Left
            this.angle -= turnSpeed;
        } else {
            this.wander();
        }
    }

    disperseFromNest(_world: World): boolean {
        const e = this.colony.entranceWorld;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const distSq = dx * dx + dy * dy;
        const r = CONFIG.ant.dispersalRadius;
        if (distSq > r * r || distSq < 1) return false; // far enough out → free wander

        const outward = Math.atan2(dy, dx);
        let diff = outward - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * CONFIG.ant.dispersalStrength + (rand() - 0.5) * 0.3;
        return true;
    }

    // Site fidelity: steer back toward the last productive source. Returns true if
    // a heading was applied. On arriving with no food present (source depleted —
    // otherwise the food-detection scan would have caught it), the memory is
    // forgotten so the ant explores again.
    // Steer toward a target INSIDE the nest. If the straight line is clear (stays
    // inside the nest the whole way) we head straight — most nest trips are, e.g.
    // inward toward the central hub. Only when a wall actually blocks the line do we
    // fall back to the node graph, so the heading rounds the tunnel corner instead of
    // sticking/jittering against the wall. No rand() → deterministic.
    steerThroughNest(targetX: number, targetY: number) {
        // The robust chamber-tree router: returns the actual target when the straight
        // line is comfortably clear (body-clearance buffer), else the centre of the next
        // chamber on the tree path — a point guaranteed reachable in a straight line, so
        // the ant rounds the wall instead of grazing/wedging along it.
        const wp = this.colony.nest.nestWaypoint(this.x, this.y, targetX, targetY);
        const tx = wp ? wp.x : targetX;
        const ty = wp ? wp.y : targetY;
        this.angle = Math.atan2(ty - this.y, tx - this.x);
    }

    steerToMemory(): boolean {
        if (this.foodMemoryX < 0) return false;
        const dx = this.foodMemoryX - this.x;
        const dy = this.foodMemoryY - this.y;
        if (dx * dx + dy * dy < CONFIG.ant.arriveRangeSq) {
            this.foodMemoryX = -1;
            this.foodMemoryY = -1;
            return false;
        }
        const target = Math.atan2(dy, dx);
        let diff = target - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * CONFIG.ant.memoryBias + (rand() - 0.5) * 0.2;
        return true;
    }



    wander() {
        this.angle += (rand() - 0.5) * 0.2;
    }

    // Temporal polyethism: per-frame probability that an idle worker leaves to
    // forage, ramping from young (nurse-biased) to old (forage-biased).
    forageUrge(): number {
        const f = this.maxAge > 0 ? this.age / this.maxAge : 0;
        const young = CONFIG.ant.nurseAgeFraction;
        const old = CONFIG.ant.forageAgeFraction;
        const lo = CONFIG.ant.forageUrgeYoung;
        const hi = CONFIG.ant.forageUrgeOld;
        if (f <= young) return lo;
        if (f >= old) return hi;
        const t = (f - young) / (old - young);
        return lo + t * (hi - lo);
    }

    // Refill energy from the colony's sugar stockpile. Sugar is consumed in
    // proportion to the energy actually restored (CONFIG.sugarEnergyValue energy
    // per unit), so a meal has a real cost and a low stockpile only partially
    // refills the ant — instead of the old "5 sugar → full energy" freebie.
    eatFromStockpile(_world: World) {
        const deficit = CONFIG.antMaxEnergy - this.energy;
        if (deficit <= 0 || this.colony.sugarStockpile <= 0) return;
        const sugarNeeded = deficit / CONFIG.sugarEnergyValue;
        const sugarEaten = Math.min(this.colony.sugarStockpile, sugarNeeded);
        this.colony.sugarStockpile -= sugarEaten;
        this.energy += sugarEaten * CONFIG.sugarEnergyValue;
    }

    move(world: World) {
        this.applySeparation(world);
        // Nest escape burst: if we flagged this ant as wedged/oscillating, steer it to a
        // committed open node centre for a few frames, overriding whatever the FSM handler
        // aimed at this frame (the handler re-aims at the unreachable spot every frame, so
        // a one-off recovery angle gets clobbered — this wins until the burst expires).
        let speedMul = this.speedMultiplier;
        if (this.location === 'NEST' && this.nestEscapeTimer > 0) {
            this.nestEscapeTimer--;
            this.angle = Math.atan2(this.nestEscapeY - this.y, this.nestEscapeX - this.x);
            speedMul = Math.max(speedMul, 0.6); // don't crawl out at sleep speed
        }
        // Outdoor ants slow down at night (the nest is unaffected — it's dark anyway)
        // and slog through a passing shower.
        const night = this.location === 'WORLD' ? world.activityFactor() : 1;
        const rain = (this.location === 'WORLD' && world.raining) ? CONFIG.environment.rainSpeed : 1;
        const speed = CONFIG.antSpeed * speedMul * this.sizeSpeed * night * rain;
        const nextX = this.x + Math.cos(this.angle) * speed;
        const nextY = this.y + Math.sin(this.angle) * speed;

        if (this.location === 'WORLD') {
            // Entrance crossing: edge-based trigger at THIS colony's world entrance
            // (RIGHT/BOTTOM reproduce the original checks → colony 0 byte-identical);
            // landing taken from the colony's nest-local anchor.
            const e0 = this.colony.entranceWorld;
            let hitEntrance: boolean;
            switch (this.colony.entranceSide) {
                case 'RIGHT':  hitEntrance = nextX > CONFIG.width - 10 && Math.abs(nextY - e0.y) < 50; break;
                case 'LEFT':   hitEntrance = nextX < 10 && Math.abs(nextY - e0.y) < 50; break;
                case 'BOTTOM': hitEntrance = nextY > CONFIG.height - 10 && Math.abs(nextX - e0.x) < 50; break;
                default:       hitEntrance = nextY < 10 && Math.abs(nextX - e0.x) < 50; break; // TOP
            }
            if (hitEntrance) {
                this.location = 'NEST';
                const e = this.colony.entranceNestLocal;
                this.x = e.x;
                this.y = e.y;
                this.angle = this.colony.entranceNestAngle;
                return;
            }

            if (!world.terrain.isBlocked(nextX, nextY) && nextX > 0 && nextX < CONFIG.width && nextY > 0 && nextY < CONFIG.height) {
                this.x = nextX;
                this.y = nextY;
            } else {
                this.angle = world.terrain.getCollisionAngle(this.x, this.y, this.angle);
                this.obstacleTimer = 10 + Math.floor(rand() * 10);
                this.x += Math.cos(this.angle) * speed;
                this.y += Math.sin(this.angle) * speed;
            }
        } else {
            // NEST
            const isLandscape = this.colony.nest.height > this.colony.nest.width;

            // Exit crossing: nest-local trigger (mouth at x/y≈0), landing taken from
            // the colony's world-space exit anchor.
            const hitExit = isLandscape
                ? (nextX < 5 && Math.abs(nextY - this.colony.nest.height / 2) < 50)
                : (nextY < 5 && Math.abs(nextX - this.colony.nest.width / 2) < 50);
            if (hitExit) {
                this.location = 'WORLD';
                const x = this.colony.worldExitPoint;
                this.x = x.x;
                this.y = x.y;
                this.angle = this.colony.worldExitAngle;
                this.exitTimer = 45; // Force move away
                return;
            }

            const NEST_BUFFER = 5;

            if (this.colony.nest.isInside(nextX, nextY, NEST_BUFFER)) {
                this.x = nextX;
                this.y = nextY;
            } else {
                this.wallSlidInWindow = true; // a real wall collision this window
                // Blocked by a wall. Wall-slide: rotate the heading just enough to
                // find a walkable direction and step there, so ants flow around
                // curved chamber/tunnel boundaries instead of oscillating.
                const probe = CONFIG.antSpeed * Math.max(0.5, this.speedMultiplier) * this.sizeSpeed;
                let slid = false;
                for (let k = 1; k <= 6 && !slid; k++) {
                    const off = k * 0.4; // up to ~2.4 rad either way
                    for (const dir of [1, -1]) {
                        const a = this.angle + dir * off;
                        const tx = this.x + Math.cos(a) * probe;
                        const ty = this.y + Math.sin(a) * probe;
                        if (this.colony.nest.isInside(tx, ty, NEST_BUFFER)) {
                            this.angle = a;
                            this.x = tx;
                            this.y = ty;
                            slid = true;
                            break;
                        }
                    }
                }
                if (!slid) {
                    // Last resort: ease back toward the nearest node centre.
                    const nearest = this.colony.nest.getNearestNode(this.x, this.y);
                    if (nearest) {
                        const angleToCenter = Math.atan2(nearest.y - this.y, nearest.x - this.x);
                        this.x += Math.cos(angleToCenter) * 2;
                        this.y += Math.sin(angleToCenter) * 2;
                        this.angle = angleToCenter + (rand() - 0.5) * 0.6;
                    }
                }
            }

            // Nest stuck-recovery: if wedged solid (barely moving) for a while, start an
            // escape burst toward the nearest open node centre to break out of a concave
            // pocket. The burst overrides the handler heading (see top of move()).
            if (this.stuckTimer > 25 && this.nestEscapeTimer === 0) {
                this.startNestEscape();
                this.stuckTimer = 0;
            }
        }
        // Stuck Detection (per-frame): catches an ant wedged near-solid against a wall.
        // Only while it INTENDS to move — a sleeping/resting ant (speedMultiplier 0) sits
        // still on purpose; counting that as "stuck" used to fire an escape burst every
        // ~25 frames and yank dozing ants to a node centre (they could never actually rest).
        const movedDist = (this.x - this.lastX) ** 2 + (this.y - this.lastY) ** 2;
        if (this.speedMultiplier > 0 && movedDist < 0.25) {
            this.stuckTimer++;
        } else {
            this.stuckTimer = 0;
        }
        this.lastX = this.x;
        this.lastY = this.y;

        // Stuck Detection (windowed): an ant oscillating a few px back and forth still
        // "moves" each frame, so the per-frame test never fires. Compare net displacement
        // over a window instead. Only for nest ants that INTEND to move — a sleeping ant
        // (speedMultiplier 0) sits still on purpose and must not be disturbed.
        if (this.location === 'NEST' && speedMul > 0 && this.nestEscapeTimer === 0) {
            if (++this.progressTimer >= 20) {
                const pdx = this.x - this.progressX;
                const pdy = this.y - this.progressY;
                // Jittering = low net progress AND a real wall collision this window.
                if (pdx * pdx + pdy * pdy < 36 && this.wallSlidInWindow) {
                    this.startNestEscape();
                }
                this.progressX = this.x;
                this.progressY = this.y;
                this.progressTimer = 0;
                this.wallSlidInWindow = false;
            }
        } else {
            // Stationary, mid-escape, or outdoors: keep the anchor fresh so resuming
            // movement doesn't immediately false-trigger against a stale position.
            this.progressX = this.x;
            this.progressY = this.y;
            this.progressTimer = 0;
            this.wallSlidInWindow = false;
        }
    }

    // Begin a short escape burst toward the nearest open node centre. move() steers
    // there (overriding the handler) until the timer expires, walking the ant out of
    // the concave corner it was stuck in. No rand() → deterministic.
    startNestEscape() {
        const node = this.colony.nest.getNearestNode(this.x, this.y);
        if (!node) return;
        this.nestEscapeX = node.x;
        this.nestEscapeY = node.y;
        this.nestEscapeTimer = 25;
    }

    // Trophallaxis: a fed forager back in the nest shares crop — food gathered in
    // the field — mouth-to-mouth with a hungry nestmate, so nurses get topped up in
    // passing instead of all trekking to the storage pile (eases the storage bottleneck).
    trophallaxis(world: World) {
        const t = CONFIG.ant.troph;
        if (this.cropSugar <= 0 || this.energy < t.donorMinEnergy) return;
        const nearby = world.spatialGrid.getNearby(this.x, this.y, t.donateRadius);
        for (const other of nearby) {
            if (other === this || other.location !== 'NEST' || other.type === 'QUEEN') continue;
            if (other.colony !== this.colony) continue; // never feed the enemy
            if (other.energy >= t.recipientHungry) continue;
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            if (dx * dx + dy * dy > t.donateRadius * t.donateRadius) continue;
            const give = Math.min(t.donateChunk, this.cropSugar, CONFIG.antMaxEnergy - other.energy);
            if (give <= 0) continue;
            other.energy += give;
            this.cropSugar -= give;
            this.colony.trophallaxisCount++;
            return; // one exchange per attempt
        }
    }

    applySeparation(world: World) {
        if (this.location === 'NEST') return;

        const separationRadius = 15;
        const nearby = world.spatialGrid.getNearby(this.x, this.y, separationRadius);

        let dx = 0;
        let dy = 0;
        let count = 0;

        for (const other of nearby) {
            // Only jostle nestmates of the same colony — two colonies' nest ants share
            // overlapping nest-local coordinates in the spatial grid, so cross-colony
            // separation there would be spurious.
            if (other !== this && other.location === this.location && other.colony === this.colony) {
                const distSq = (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
                if (distSq < separationRadius * separationRadius && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const force = (separationRadius - dist) / separationRadius;
                    dx += (this.x - other.x) / dist * force;
                    dy += (this.y - other.y) / dist * force;
                    count++;
                }
            }
        }

        if (count > 0) {
            this.x += dx * 0.5;
            this.y += dy * 0.5;
        }
    }

    countNearbyAllies(world: World, radius: number): number {
        const nearby = world.spatialGrid.getNearby(this.x, this.y, radius);
        let count = 0;
        for (const ant of nearby) {
            // Same colony only — a rival's ants are not allies.
            if (ant !== this && ant.type !== 'QUEEN' && ant.location === this.location && ant.colony === this.colony) {
                const dx = ant.x - this.x;
                const dy = ant.y - this.y;
                if (dx * dx + dy * dy < radius * radius) {
                    count++;
                }
            }
        }
        return count;
    }

    // Count dangerous enemies within radius (predators/spiders/beetles + rival-colony
    // ants outdoors) — used to judge local numerical superiority for mobbing vs fleeing.
    countNearbyEnemies(world: World, radius: number): number {
        if (this.location === 'NEST') return 0;
        const r2 = radius * radius;
        let count = 0;
        for (const ins of world.insects) {
            if (ins.type === 'PREDATOR' || ins.type === 'SPIDER' || ins.type === 'BEETLE') {
                const dx = ins.x - this.x;
                const dy = ins.y - this.y;
                if (dx * dx + dy * dy < r2) count++;
            }
        }
        // Rival-colony ants (outdoors) are enemies too.
        const nearby = world.spatialGrid.getNearby(this.x, this.y, radius);
        for (const other of nearby) {
            if (other.colony !== this.colony && other.location === 'WORLD' && other.type !== 'QUEEN') {
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                if (dx * dx + dy * dy < r2) count++;
            }
        }
        return count;
    }
}
