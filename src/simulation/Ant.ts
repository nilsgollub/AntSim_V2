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

        wander() {
            this.angle += (Math.random() - 0.5) * CONFIG.antTurnSpeed;
        }
    }
