import { rand } from '../rng';
import { CONFIG } from '../config';

import { World } from './World';
import { Ant } from './Ant';

export type InsectType = 'PREY' | 'PREDATOR' | 'APHID' | 'SPIDER' | 'BEETLE' | 'LADYBUG';

export class Insect {
    x: number;
    y: number;
    type: InsectType;
    health: number;
    angle: number;
    speed: number;

    attackCooldown: number = 0;

    // New AI properties
    // New AI properties
    state: 'IDLE' | 'WANDER' | 'FLEE' | 'HUNT' = 'WANDER';
    stateTimer: number = 0;
    thinkTimer: number = 0;
    targetX: number = 0;
    targetY: number = 0;

    constructor(x: number, y: number, type: InsectType) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = rand() * Math.PI * 2;
        this.targetX = x;
        this.targetY = y;

        switch (type) {
            case 'PREY':
                this.health = 20;
                this.speed = 1.0;
                break;
            case 'PREDATOR': // Generic Bug
                this.health = CONFIG.enemy.predatorHealth;
                this.speed = 1.3;
                break;
            case 'SPIDER':
                this.health = CONFIG.enemy.spiderHealth;
                this.speed = 1.8;
                break;
            case 'BEETLE':
                this.health = CONFIG.enemy.beetleHealth;
                this.speed = 0.6;
                break;
            case 'LADYBUG':
                this.health = 80;
                this.speed = 1.0;
                break;
            case 'APHID':
                this.health = 10;
                this.speed = 0.2;
                break;
        }
    }

    update(world: World) {
        if (this.health <= 0) return;
        if (this.attackCooldown > 0) this.attackCooldown--;

        // Throttled AI
        if (this.thinkTimer > 0) {
            this.thinkTimer--;
        } else {
            this.thinkTimer = 3 + Math.floor(rand() * 3); // Think every 3-6 frames

            // Default behavior: Wander
            // Specific behaviors override this by setting state/target
            // We don't reset state to WANDER here blindly, we let the logic decide

            switch (this.type) {
                case 'PREY': this.updatePrey(world); break;
                case 'PREDATOR': this.updatePredator(world); break;
                case 'SPIDER': this.updateSpider(world); break;
                case 'BEETLE': this.updateBeetle(world); break;
                case 'LADYBUG': this.updateLadybug(world); break;
                case 'APHID': this.updateAphid(world); break;
            }
        }

        this.executeMovement(world);
    }

    executeMovement(world: World) {
        if (this.state === 'IDLE') {
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                this.state = 'WANDER';
                this.pickRandomTarget();
            }
            return;
        }

        // Move towards target
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) {
            if (this.state === 'WANDER') {
                this.state = 'IDLE';
                this.stateTimer = 30 + rand() * 60; // Pause for 0.5-1.5s
            }
            return;
        }

        // Smooth turn
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const turnSpeed = 0.15;
        this.angle += Math.max(-turnSpeed, Math.min(turnSpeed, diff));

        // Move — slowed (pinned) when ants are biting/holding it.
        const speed = this.speed * (1 - this.grappleSlow(world));
        const nextX = this.x + Math.cos(this.angle) * speed;
        const nextY = this.y + Math.sin(this.angle) * speed;

        if (!world.terrain.isBlocked(nextX, nextY)) {
            this.x = nextX;
            this.y = nextY;
        } else {
            // Hit wall, pick new target
            this.angle += Math.PI; // Bounce
            this.pickRandomTarget();
        }
    }

    // Fraction of speed lost to ants biting/holding this insect (0..grappleMaxSlow).
    // Aphids are farmed, not attacked, so they're never grappled.
    grappleSlow(world: World): number {
        if (this.type === 'APHID') return 0;
        const r = CONFIG.combat.grappleRadius;
        const r2 = r * r;
        let holders = 0;
        for (const ant of world.spatialGrid.getNearby(this.x, this.y, r)) {
            if (ant.location !== 'WORLD') continue;
            const dx = ant.x - this.x;
            const dy = ant.y - this.y;
            if (dx * dx + dy * dy < r2) holders++;
        }
        return Math.min(CONFIG.combat.grappleMaxSlow, holders * CONFIG.combat.grappleSlowPerAnt);
    }

    pickRandomTarget() {
        const range = 100;
        this.targetX = this.x + (rand() - 0.5) * range * 2;
        this.targetY = this.y + (rand() - 0.5) * range * 2;
    }

    updatePrey(world: World) {
        // Flee from nearby ants
        let nearestAnt: Ant | null = null;
        let minDst = 10000;

        for (const ant of world.ants) {
            const dx = this.x - ant.x;
            const dy = this.y - ant.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minDst) {
                minDst = d2;
                nearestAnt = ant;
            }
        }

        if (nearestAnt && minDst < 3600) { // 60px flee range
            this.state = 'FLEE';
            // Run away from ant
            const dx = this.x - nearestAnt.x;
            const dy = this.y - nearestAnt.y;
            // Set target far away in opposite direction
            this.targetX = this.x + dx * 5;
            this.targetY = this.y + dy * 5;
            this.speed = 3.5; // Sprint (Slightly slower than hunting ant at 3.75)
        } else {
            this.speed = 1.0;
            // If we were fleeing and are now safe, go back to wander
            if (this.state === 'FLEE') {
                this.state = 'WANDER';
                this.pickRandomTarget();
            }
        }
    }

    updatePredator(world: World) {
        this.huntAnts(world, 15000, CONFIG.enemy.predatorDamage);
    }

    updateSpider(world: World) {
        this.huntAnts(world, 20000, CONFIG.enemy.spiderDamage);
    }

    updateBeetle(world: World) {
        this.huntAnts(world, 3000, CONFIG.enemy.beetleDamage); // Only bites if very close
        this.speed = 0.6;
    }

    updateLadybug(world: World) {
        // Hunt Aphids
        let nearestAphid: Insect | null = null;
        let minDst = Infinity;

        for (const insect of world.insects) {
            if (insect.type === 'APHID') {
                const dx = this.x - insect.x;
                const dy = this.y - insect.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDst) {
                    minDst = d2;
                    nearestAphid = insect;
                }
            }
        }

        if (nearestAphid && minDst < 20000) {
            this.state = 'HUNT';
            this.targetX = nearestAphid.x;
            this.targetY = nearestAphid.y;

            if (minDst < 100) {
                if (this.attackCooldown <= 0) {
                    nearestAphid.health -= 10;
                    world.addParticle(nearestAphid.x, nearestAphid.y, 'red', 'BLOOD');
                    this.attackCooldown = 60;
                }
            }
        }
    }

    updateAphid(_world: World) {
        // Near-sessile: real aphids sit on a plant sucking sap. They only shuffle a few
        // pixels (a tight local target, not the 100px roam), so a spawned cluster stays a
        // compact, tendable herd that ants farm — instead of drifting apart across the map.
        if (rand() < 0.01 && this.state !== 'WANDER') {
            this.state = 'WANDER';
            this.targetX = this.x + (rand() - 0.5) * 24;
            this.targetY = this.y + (rand() - 0.5) * 24;
        }
        this.speed = 0.15;
    }

    huntAnts(world: World, rangeSq: number, damage: number) {
        let nearestAnt: Ant | null = null;
        let minDst = Infinity;

        for (const ant of world.ants) {
            const dx = this.x - ant.x;
            const dy = this.y - ant.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minDst) {
                minDst = d2;
                nearestAnt = ant;
            }
        }

        if (nearestAnt && minDst < rangeSq) {
            this.state = 'HUNT';
            this.targetX = nearestAnt.x;
            this.targetY = nearestAnt.y;

            if (minDst < 100) { // Attack range
                if (this.attackCooldown <= 0) {
                    // Bite the ant it's locked onto. (A whole-swarm AoE bite was too
                    // punishing — it could wipe a mobbing squad and collapse the colony.)
                    nearestAnt.health -= damage;
                    world.addParticle(nearestAnt.x, nearestAnt.y, 'red', 'BLOOD');
                    this.attackCooldown = 30;
                }
            }
        } else {
            // If we were hunting and lost target, go back to wander
            if (this.state === 'HUNT') {
                this.state = 'WANDER';
                this.pickRandomTarget();
            }
        }
    }
}
