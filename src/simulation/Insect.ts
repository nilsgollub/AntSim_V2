
import { World } from './World';
import { Ant } from './Ant';

export type InsectType = 'PREY' | 'PREDATOR' | 'APHID';

export class Insect {
    x: number;
    y: number;
    type: InsectType;
    health: number;
    angle: number;
    speed: number;

    attackCooldown: number = 0;

    constructor(x: number, y: number, type: InsectType) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = Math.random() * Math.PI * 2;

        if (type === 'PREY') {
            this.health = 20;
            this.speed = 1.0;
        } else if (type === 'PREDATOR') {
            this.health = 50; // Reduced from 100
            this.speed = 1.3; // Slightly slower
        } else {
            // APHID
            this.health = 10;
            this.speed = 0.2; // Very slow
        }
    }

    update(world: World) {
        if (this.health <= 0) return;
        if (this.attackCooldown > 0) this.attackCooldown--;

        // Behavior
        if (this.type === 'PREY') {
            this.updatePrey(world);
        } else if (this.type === 'PREDATOR') {
            this.updatePredator(world);
        } else {
            // Aphid behavior: wander very slowly
            this.angle += (Math.random() - 0.5) * 0.5;
        }

        // Movement
        const nextX = this.x + Math.cos(this.angle) * this.speed;
        const nextY = this.y + Math.sin(this.angle) * this.speed;

        if (!world.terrain.isBlocked(nextX, nextY)) {
            this.x = nextX;
            this.y = nextY;
        } else {
            this.angle += Math.PI;
            // Push out of obstacle slightly to prevent getting stuck
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
        }
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

        if (nearestAnt && minDst < 2500) { // 50px flee range
            const dx = this.x - nearestAnt.x;
            const dy = this.y - nearestAnt.y;
            this.angle = Math.atan2(dy, dx); // Run away
        } else {
            // Wander
            this.angle += (Math.random() - 0.5) * 0.2;
        }
    }

    updatePredator(world: World) {
        // Hunt nearby ants
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

        if (nearestAnt && minDst < 10000) { // 100px hunt range
            const dx = nearestAnt.x - this.x;
            const dy = nearestAnt.y - this.y;
            this.angle = Math.atan2(dy, dx); // Chase

            if (minDst < 100) { // Attack
                if (this.attackCooldown <= 0) {
                    nearestAnt.health -= 5; // Reduced damage (was instant 5 per frame?)
                    this.attackCooldown = 30; // 0.5s cooldown (60fps)
                }
            }
        } else {
            // Wander
            this.angle += (Math.random() - 0.5) * 0.2;
        }
    }
}
