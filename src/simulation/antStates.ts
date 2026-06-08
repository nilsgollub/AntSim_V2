import { CONFIG } from '../config';
import { rand } from '../rng';
import { Brood } from './Brood';
import type { Ant } from './Ant';
import type { World } from './World';

// FSM state handlers, extracted from Ant.ts. Each acts on the given ant
// (and world where needed); the Ant class keeps the low-level primitives
// (move, sensing, separation, steering helpers) these call via ant.*.

export function handleNursing(ant: Ant, _world: World) {
    // If not carrying protein, go get some (via IDLE state)
    if (ant.carrying !== 'PROTEIN') {
        ant.state = 'IDLE';
        return;
    }

    // Target Selection Priority:
    // 1. Queen if hungry (< 1500) - CRITICAL
    // 2. Critical Larvae (Starving)
    // 3. Queen if not full (< 1900) - Maintain
    // 4. Normal Larvae

    let target: any = null;

    if (ant.colony.queen.energy < CONFIG.ant.queenCriticalEnergy) {
        target = ant.colony.queen;
    } else {
        const criticalLarva = ant.colony.brood.find(b => b.stage === 'LARVA' && b.hunger > 50);
        if (criticalLarva) {
            target = criticalLarva;
        } else if (ant.colony.queen.energy < CONFIG.ant.queenMaintainEnergy) {
            target = ant.colony.queen;
        } else {
            const hungryLarva = ant.colony.brood.find(b => b.stage === 'LARVA' && b.hunger > 20);
            if (hungryLarva) {
                target = hungryLarva;
            }
        }
    }

    if (!target) {
        // No one hungry, dump in stockpile
        ant.state = 'RETURNING';
        return;
    }

    // Move to target
    const targetX = target.x;
    const targetY = target.y;
    const dx = targetX - ant.x;
    const dy = targetY - ant.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    ant.steerThroughNest(targetX, targetY);

    if (dist < 10) {
        // Feed
        if (target === ant.colony.queen) {
            ant.colony.queen.energy += CONFIG.ant.queenFeedAmount; // Feed queen
        } else {
            target.feed(CONFIG.ant.larvaFeedAmount); // Feed larva
        }

        ant.carryingAmount -= CONFIG.ant.larvaFeedAmount; // Assume protein chunk is large
        // Simplified: One protein item feeds one thing fully for now
        ant.carrying = 'NONE';
        ant.carryingAmount = 0;
        ant.state = 'IDLE'; // Go back to idle to check for more work
    }
}


export function handleResting(ant: Ant, world: World) {
    if (ant.location === 'WORLD') {
        // Go Home to Rest
        ant.speedMultiplier = 1.0;
        ant.patrolTarget = null; // Clear any existing target

        const home = ant.colony.entranceWorld;
        const dx = home.x - ant.x;
        const dy = home.y - ant.y;
        ant.angle = Math.atan2(dy, dx);
    } else {
        // In Nest: Find a cozy spot

        // 1. If not already targeting a spot, find one
        if (!ant.patrolTarget) {
            // Check if we are currently inside a chamber
            const currentChamber = ant.colony.nest.chambers.find(c => (ant.x - c.x) ** 2 + (ant.y - c.y) ** 2 < (c.radius * 0.9) ** 2);

            if (currentChamber) {
                // If we are in STORAGE, we probably just finished work. Don't sleep here!
                // 80% chance to go find another room (dispersal)
                if (currentChamber.type === 'STORAGE' && rand() < 0.8) {
                    // Just leave the current chamber!
                    const otherChambers = ant.colony.nest.chambers.filter(c => c !== currentChamber);
                    if (otherChambers.length > 0) {
                        ant.wander();
                        ant.applySeparation(world);
                        return;
                    }
                }

                // We are in a valid resting chamber (or decided to stay). Pick a random spot HERE to sleep.
                const angle = rand() * Math.PI * 2;
                const r = rand() * (currentChamber.radius * 0.7); // Stay well inside
                ant.patrolTarget = {
                    x: currentChamber.x + Math.cos(angle) * r,
                    y: currentChamber.y + Math.sin(angle) * r
                };
            } else {
                // In a corridor / tunnel.
                // Don't just walk straight (walls!). Wander randomly until we hit a chamber.
                ant.wander();
                ant.applySeparation(world);
                return;
            }
        }

        // 2. Move to Bed (Linear, but short distance since valid target is in same chamber)
        const dx = ant.patrolTarget.x - ant.x;
        const dy = ant.patrolTarget.y - ant.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 100) { // Arrived (within 10px)
            ant.speedMultiplier = 0; // Zzz...
            ant.restTimer--;

            // Wake up
            if (ant.restTimer <= 0 || ant.energy < CONFIG.ant.restWakeThreshold) {
                ant.state = 'IDLE';
                ant.patrolTarget = null;
            }
        } else {
            // Walking to local bed spot
            ant.speedMultiplier = 0.5; // Walk slowly to bed
            ant.angle = Math.atan2(dy, dx);
            ant.applySeparation(world); // Don't sleep on top of others
        }
    }
}


export function handleNurseIdle(ant: Ant, world: World) {
    if (ant.location === 'WORLD') {
        // Go to this colony's entrance
        const home = ant.colony.entranceWorld;
        ant.angle = Math.atan2(home.y - ant.y, home.x - ant.x);
        return;
    }

    // 1. Rest Chance (Top Priority)
    // Tune: 0.1% chance per frame
    if (rand() < 0.001) {
        ant.state = 'RESTING';
        ant.restTimer = 300 + rand() * 300; // Short nap (5-10s)
        return;
    }

    // In Nest
    // 0. Self-Preservation (Eat if hungry)
    if (ant.energy < CONFIG.ant.nurseEatThreshold) {
        const storage = ant.colony.nest.getChamber('STORAGE');
        if (storage) {
            const dx = storage.x - ant.x;
            const dy = storage.y - ant.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < CONFIG.ant.arriveRangeSq) {
                ant.eatFromStockpile(world);
            } else {
                // Route to storage via the node graph (around corners, not through walls)
                ant.steerThroughNest(storage.x, storage.y);
            }
            return;
        }
    }

    // Check if work needed
    if (ant.carrying === 'NONE') {
        // 1. Check for Misplaced Brood (Priority). With several nurseries, brood is
        // "misplaced" only if it lies outside *every* brood chamber.
        const broodChambers = ant.colony.nest.getChambers('BROOD');
        const broodHomes = broodChambers.length > 0 ? broodChambers : [ant.colony.nest.getChamber('BROOD')];
        if (broodHomes[0]) {
            const misplacedBrood = ant.colony.brood.find(b => {
                if (b.carrier) return false;
                for (const ch of broodHomes) {
                    const dx = b.x - ch.x;
                    const dy = b.y - ch.y;
                    if (dx * dx + dy * dy <= ch.radius * ch.radius) return false; // inside a nursery
                }
                return true; // outside all nurseries
            });

            if (misplacedBrood) {
                // Go pick it up
                const dx = misplacedBrood.x - ant.x;
                const dy = misplacedBrood.y - ant.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < CONFIG.ant.arriveRangeSq) {
                    ant.carrying = 'BROOD';
                    ant.carryingInstance = misplacedBrood;
                    misplacedBrood.carrier = ant;
                    ant.state = 'TRANSPORTING';
                    // Commit to one nursery (nearest to the brood) for the whole haul,
                    // so the target can't flip between rooms frame-to-frame.
                    const home = ant.colony.nest.nearestChamber('BROOD', misplacedBrood.x, misplacedBrood.y)
                        ?? ant.colony.nest.getChamber('BROOD');
                    ant.carryTarget = home ? { x: home.x, y: home.y } : null;
                } else {
                    ant.steerThroughNest(misplacedBrood.x, misplacedBrood.y);
                }
                return;
            }
        }

        // 2. Check if Queen or Larva needs food AND we have stockpile
        if (ant.colony.proteinStockpile >= 10) {
            // FIXED: Aggressive check for Queen (keep her > 1800 energy)
            const queenHungry = ant.colony.queen.energy < CONFIG.ant.queenHungryEnergy;
            const larvaHungry = ant.colony.brood.some(b => b.stage === 'LARVA' && b.hunger > 20);

            if (queenHungry || larvaHungry) {
                // Go to the primary granary (stable target; stockpile is global)
                const storage = ant.colony.nest.getChamber('STORAGE');
                if (!storage) return;

                const dx = storage.x - ant.x;
                const dy = storage.y - ant.y;

                if (dx * dx + dy * dy < CONFIG.ant.arriveRangeSq) {
                    // Grab from stockpile
                    ant.colony.proteinStockpile -= 10;
                    ant.carrying = 'PROTEIN';
                    ant.carryingAmount = 10;
                    ant.state = 'NURSING';
                } else {
                    // Route to storage via the node graph (around corners, not through walls)
                    ant.steerThroughNest(storage.x, storage.y);
                }
                return;
            }
        }
    }

    // Worker Logic: leave the nest to forage. Emergency (low stockpiles)
    // always pulls workers out; otherwise the urge to forage is age-weighted
    // (temporal polyethism: young ants nurse, old ants forage).
    if (ant.type === 'WORKER') {
        const emergency = ant.colony.sugarStockpile < CONFIG.ant.forageEmergencySugar
            || ant.colony.proteinStockpile < CONFIG.ant.forageEmergencyProtein;
        if (emergency || rand() < ant.forageUrge()) {
            ant.state = 'FORAGING';
            return;
        }
    }

    // 5. No task found: Rest or Loiter
    // If we are deep in the nest and have nothing to do, REST.
    if (rand() < 0.005) { // 0.5% chance per frame
        ant.state = 'RESTING';
        ant.restTimer = 300 + rand() * 300; // 5-10s nap
    } else {
        // Wander in nest (loiter)
        ant.wander();
        ant.speedMultiplier = 0.3; // Walk very slowly when loitering
        ant.applySeparation(world); // Spread out
    }
}


export function handleTransporting(ant: Ant, _world: World) {
    if (!ant.carryingInstance) {
        ant.state = 'IDLE';
        ant.carrying = 'NONE';
        ant.carryTarget = null;
        return;
    }

    // Carry the brood
    ant.carryingInstance.x = ant.x;
    ant.carryingInstance.y = ant.y;

    // Head to the nursery committed at pickup (resolving from the fixed target coord
    // keeps the chamber — and thus the destination — stable for the whole haul).
    const target = ant.carryTarget;
    const broodChamber = (target ? ant.colony.nest.nearestChamber('BROOD', target.x, target.y) : null)
        ?? ant.colony.nest.getChamber('BROOD');
    if (!broodChamber) return;
    const dx = broodChamber.x - ant.x;
    const dy = broodChamber.y - ant.y;
    const distSq = dx * dx + dy * dy;

    // If inside chamber (with some random offset to spread them out), drop it
    if (distSq < (broodChamber.radius * 0.8) * (broodChamber.radius * 0.8)) {
        // Wander to spread out (Don't force angle to center!)
        ant.wander();

        // Random chance to drop
        if (rand() < 0.05) {
            // Drop
            ant.carryingInstance.carrier = null;
            ant.carryingInstance = null;
            ant.carrying = 'NONE';
            ant.carryTarget = null;
            ant.state = 'IDLE';

            // Move away a bit
            ant.angle += Math.PI;
        }
    } else {
        // Move towards center of brood chamber
        ant.angle = Math.atan2(dy, dx);
    }
}


export function handlePatrolling(ant: Ant, world: World) {
    // Active Enemy Scan (Soldiers should not ignore threats while patrolling)
    if (ant.type === 'SOLDIER') {
        for (const insect of world.insects) {
            if (insect.type === 'SPIDER' || insect.type === 'PREDATOR' || insect.type === 'BEETLE') {
                const distSq = (ant.x - insect.x) ** 2 + (ant.y - insect.y) ** 2;
                if (distSq < CONFIG.combat.soldierSightRangeSq) { // soldiers spot threats from further (170px)
                    ant.state = 'ATTACKING';
                    return; // Switch immediately
                }
            }
        }
        // Rival-colony ants near the patrol → engage.
        if (ant.location === 'WORLD') {
            const foes = world.spatialGrid.getNearby(ant.x, ant.y, 100);
            for (const o of foes) {
                if (o.colony !== ant.colony && o.location === 'WORLD' && o.type !== 'QUEEN') {
                    if ((ant.x - o.x) ** 2 + (ant.y - o.y) ** 2 < CONFIG.ant.detectEnemyRangeSq) {
                        ant.state = 'ATTACKING';
                        return;
                    }
                }
            }
        }
        // Alarm response: rally toward a DANGER trail even without a visible enemy
        // (ATTACKING then follows the danger gradient to the alarm source).
        if (ant.colony.outdoorField.get(ant.x, ant.y, 'DANGER') > CONFIG.combat.alarmThreshold) {
            ant.state = 'ATTACKING';
            return;
        }
    }

    if (ant.energy < CONFIG.ant.foragingHungerThreshold) {
        ant.state = 'HUNGRY';
        return;
    }

    // Check if colony needs protein
    // If low on protein, Soldiers go hunting (FORAGING state handles hunting if protein is needed)
    if (ant.colony.proteinStockpile < 20) {
        ant.state = 'FORAGING';
        return;
    }

    if (rand() < 0.00005) {
        ant.state = 'RESTING';
        ant.restTimer = 300 + rand() * 600;
        return;
    }

    if (ant.location === 'NEST') {
        // If in nest, go to entrance to start patrol
        const entrance = ant.colony.nest.getEntrance();
        const nextNode = ant.colony.nest.getNextNodeTowards(ant.x, ant.y, entrance.x, entrance.y);
        if (nextNode) {
            const angle = Math.atan2(nextNode.y - ant.y, nextNode.x - ant.x);
            ant.angle = angle + (rand() - 0.5) * 0.5;
        } else {
            // Fallback: If no path found, steer directly towards entrance
            const dx = entrance.x - ant.x;
            const dy = entrance.y - ant.y;
            ant.angle = Math.atan2(dy, dx) + (rand() - 0.5) * 1.0;
        }
        return;
    }

    // Patrol near this colony's entrance (world side), set back ~150px from the mouth.
    const eW = ant.colony.entranceWorld;
    const entranceX = ant.colony.isLandscape ? eW.x - 150 : eW.x;
    const entranceY = ant.colony.isLandscape ? eW.y : eW.y - 150;

    // Initialize or Update Patrol Target
    let distSq = 0;
    if (ant.patrolTarget) {
        const dx = ant.patrolTarget.x - ant.x;
        const dy = ant.patrolTarget.y - ant.y;
        distSq = dx * dx + dy * dy;
    }

    if (!ant.patrolTarget || distSq < 400 || rand() < 0.005) {
        // Pick new point — usually near the entrance, occasionally a far sweep so
        // soldiers also scout the wider territory.
        const angle = rand() * Math.PI * 2;
        const r = rand(); // single draw: decides near-vs-far AND the distance
        const longChance = CONFIG.combat.patrolLongChance;
        const dist = r < longChance
            ? 200 + (r / longChance) * Math.max(CONFIG.width, CONFIG.height) * CONFIG.combat.patrolLongRangeFrac
            : 50 + ((r - longChance) / (1 - longChance)) * 200;

        let tx = entranceX + Math.cos(angle) * dist;
        let ty = entranceY + Math.sin(angle) * dist;

        tx = Math.max(10, Math.min(CONFIG.width - 10, tx));
        ty = Math.max(10, Math.min(CONFIG.height - 10, ty));

        ant.patrolTarget = { x: tx, y: ty };

        const dx = tx - ant.x;
        const dy = ty - ant.y;
        distSq = dx * dx + dy * dy;
    }

    // Move towards patrol point
    const dx = ant.patrolTarget.x - ant.x;
    const dy = ant.patrolTarget.y - ant.y;
    const desiredAngle = Math.atan2(dy, dx);

    // Turn towards target
    let diff = desiredAngle - ant.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    ant.angle += diff * 0.2;
    ant.angle += (rand() - 0.5) * 0.2;
}


// Raiders march on the rival nest entrance. Any rival met en route is engaged with
// the existing combat (→ ATTACKING). On reaching the enemy doorstep they (Increment 1)
// abandon the push; Increment 2 loots the rival's stockpile here. Rival-colony mode
// only — never reached with a single colony, so the golden run is unaffected.
export function handleRaiding(ant: Ant, world: World) {
    // Engage any nearby rival (same trigger the patrol uses).
    if (ant.location === 'WORLD') {
        const foes = world.spatialGrid.getNearby(ant.x, ant.y, 100);
        for (const o of foes) {
            if (o.colony !== ant.colony && o.location === 'WORLD' && o.type !== 'QUEEN' && o.health > 0) {
                if ((ant.x - o.x) ** 2 + (ant.y - o.y) ** 2 < CONFIG.ant.detectEnemyRangeSq) {
                    ant.state = 'ATTACKING';
                    return;
                }
            }
        }
    }

    const t = ant.raidTarget;
    if (!t) { ant.state = 'PATROLLING'; return; }

    const dx = t.x - ant.x;
    const dy = t.y - ant.y;
    if (dx * dx + dy * dy < CONFIG.combat.raidArriveRangeSq) {
        // At the enemy doorstep → loot the rival's stockpile and haul it home. Prefer
        // protein (the war-critical resource), fall back to sugar. The stolen chunk is
        // exactly what RETURNING deposits at home (sugarValue/proteinValue), so it's a
        // true transfer: the rival loses what we gain. Then RETURNING carries it back to
        // OUR nest (handleReturning steers to ant.colony.entranceWorld) and deposits.
        const enemy = world.colonies.find(c => c !== ant.colony);
        if (enemy) {
            // Priority: snatch brood (slave-making raid) — it hurts the rival most
            // (a lost future ant) and is carried home to be raised as our own. Skip
            // brood a nurse is already holding, to avoid dangling carrier refs.
            let snatched = false;
            for (let i = enemy.brood.length - 1; i >= 0; i--) {
                if (!enemy.brood[i].carrier) { enemy.brood.splice(i, 1); snatched = true; break; }
            }
            if (snatched) {
                ant.carrying = 'BROOD';
                ant.carryingInstance = null; // adopted as a fresh egg on arrival
                ant.carryingAmount = 1;
            } else if (enemy.proteinStockpile >= CONFIG.proteinValue) {
                enemy.proteinStockpile -= CONFIG.proteinValue;
                ant.carrying = 'PROTEIN';
                ant.carryingAmount = CONFIG.proteinValue;
                ant.carryingQuality = 1;
            } else if (enemy.sugarStockpile >= CONFIG.sugarValue) {
                enemy.sugarStockpile -= CONFIG.sugarValue;
                ant.carrying = 'SUGAR';
                ant.carryingAmount = CONFIG.sugarValue;
                ant.carryingQuality = 1;
            }
        }
        ant.raidTarget = null;
        ant.state = 'RETURNING'; // haul the loot/brood home (or just retreat if nothing to take)
        return;
    }
    ant.angle = Math.atan2(dy, dx);
}


export function handleFleeing(ant: Ant, _world: World) {
    ant.speedMultiplier = 2.5; // Run fast!
    ant.fleeTimer--;

    if (ant.obstacleTimer > 0) return; // Sliding along wall

    // Move generally towards home (Entrance), but with high noise (panic)
    let homeX, homeY;

    if (ant.location === 'WORLD') {
        homeX = ant.colony.entranceWorld.x;
        homeY = ant.colony.entranceWorld.y;
    } else {
        // Nest Location: Determine exit based on nest shape
        // Tall Nest (Landscape Mode) -> Exit is Left (x=0)
        // Wide Nest (Portrait Mode) -> Exit is Top (y=0)
        if (CONFIG.nestWidth < CONFIG.nestHeight) {
            homeX = 0;
            homeY = CONFIG.nestHeight / 2;
        } else {
            homeX = CONFIG.nestWidth / 2;
            homeY = 0;
        }
    }

    const dx = homeX - ant.x;
    const dy = homeY - ant.y;
    const homeAngle = Math.atan2(dy, dx);

    // Robust Angle Interpolation (Shortest path)
    let diff = homeAngle - ant.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    ant.angle += diff * 0.5; // High turn rate for fleeing
    ant.angle += (rand() - 0.5) * 0.5; // Panic jitter

    // Drop Danger trail while fleeing to warn others
    if (ant.fleeTimer % 5 === 0) {
        const grid = ant.location === 'NEST' ? ant.colony.nestGrid : ant.colony.outdoorField;
        grid.depositCircle(ant.x, ant.y, 'DANGER', CONFIG.pheromone.depositTrail, 10); // Increased trail size
    }

    if (ant.fleeTimer <= 0) {
        ant.state = 'FORAGING';
    }
}


export function handleCombat(ant: Ant, world: World) {
    ant.speedMultiplier = 1.5; // Combat adrenaline

    // 0. Panic check — workers flee when a REAL threat outnumbers their local support.
    // Only dangerous foes count (countNearbyEnemies = predators/spiders/beetles + rivals),
    // so a lone worker hunting harmless prey no longer panics and raises a false alarm.
    if (ant.type !== 'SOLDIER') {
        const enemies = ant.countNearbyEnemies(world, 100);
        if (enemies > 0) {
            const allies = ant.countNearbyAllies(world, 100);
            const outmatched = allies < Math.max(CONFIG.combat.mobMinAllies, enemies * CONFIG.combat.mobSuperiority);
            if (outmatched) {
                ant.state = 'FLEEING';
                ant.fleeTimer = 60;
                ant.angle += Math.PI + (rand() - 0.5);
                return;
            }
        }
    }

    // Find nearest enemy
    let nearestEnemy = null;
    let minDist = Infinity;



    for (const insect of world.insects) {
        if (insect.type !== 'APHID') {
            const dx = ant.x - insect.x;
            const dy = ant.y - insect.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minDist) {
                minDist = d2;
                nearestEnemy = insect;
            }
        }
    }

    // Rival-colony ants (outdoors) are valid targets too — the spoils of war.
    if (ant.location === 'WORLD') {
        const foes = world.spatialGrid.getNearby(ant.x, ant.y, 110);
        for (const other of foes) {
            if (other.colony !== ant.colony && other.location === 'WORLD' && other.type !== 'QUEEN' && other.health > 0) {
                const dx = ant.x - other.x;
                const dy = ant.y - other.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minDist) {
                    minDist = d2;
                    nearestEnemy = other;
                }
            }
        }
    }

    // Soldiers chase from further than workers (proactive vanguard); workers keep the 100px range.
    const chaseRangeSq = ant.type === 'SOLDIER' ? CONFIG.combat.soldierSightRangeSq : CONFIG.ant.detectEnemyRangeSq;
    if (nearestEnemy && minDist < chaseRangeSq) {
        // Mob rally vs a MAJOR threat: don't suicide-charge one by one. Mill at a
        // standoff ring (the "Gewusel"), pulse alarm to recruit, and only rush in
        // once the colony has gathered overwhelming local numbers — so the attack
        // reads as a coordinated swarm, not a trickle. (Prey / lone rivals: no gate.)
        const et = (nearestEnemy as { type: string }).type;
        const majorThreat = et === 'SPIDER' || et === 'PREDATOR' || et === 'BEETLE';
        if (majorThreat) {
            const allies = ant.countNearbyAllies(world, 90);
            const enemies = ant.countNearbyEnemies(world, 90);
            // Soldiers are the vanguard: they commit with far fewer allies than workers.
            const rushAllies = ant.type === 'SOLDIER' ? CONFIG.combat.soldierRushAllies : CONFIG.combat.mobRushAllies;
            const rushReady = allies >= rushAllies && allies >= enemies * CONFIG.combat.mobSuperiority;
            // Pulse a DANGER alarm so more ants converge on the threat.
            if (world.age % 6 === 0) {
                ant.colony.outdoorField.depositCircle(ant.x, ant.y, 'DANGER', CONFIG.pheromone.depositTrail, 10);
            }
            if (!rushReady) {
                const toEnemy = Math.atan2(nearestEnemy.y - ant.y, nearestEnemy.x - ant.x);
                if (minDist < CONFIG.combat.rallyStandoffSq) {
                    ant.angle = toEnemy + Math.PI + (rand() - 0.5) * 0.9; // too close → recoil (panic)
                } else {
                    ant.angle = toEnemy + Math.PI / 2 + (rand() - 0.5) * 1.4; // circle the threat + jitter
                }
                ant.speedMultiplier = 1.3;
                return;
            }
            // rushReady → fall through and charge in together.
        }
        // (Cowardice handled by the local-superiority panic check above.)
        const dx = nearestEnemy.x - ant.x;
        const dy = nearestEnemy.y - ant.y;

        // Move towards enemy with jitter to prevent stacking
        ant.angle = Math.atan2(dy, dx);
        ant.angle += (rand() - 0.5) * 0.1;

        // Sprint Logic
        if (ant.sprintTimer > 0) {
            ant.speedMultiplier = 2.5; // Sprint!
            ant.sprintTimer--;
        } else if (ant.sprintCooldown > 0) {
            ant.sprintCooldown--;
        } else if (minDist > CONFIG.ant.attackRangeSq) { // If > 30px away
            // Trigger Sprint to catch up
            ant.sprintTimer = 30; // 0.5s sprint
            ant.sprintCooldown = 180; // 3s cooldown
        }

        if (minDist < CONFIG.ant.attackRangeSq) { // Attack range (30px)
            ant.speedMultiplier = 0; // Stop moving to attack!
            if (ant.attackCooldown <= 0) {
                const dmg = ant.attackDamage; // size-scaled bite (see Ant constructor)
                nearestEnemy.health -= dmg;
                world.addParticle(nearestEnemy.x, nearestEnemy.y, 'red', 'BLOOD');
                ant.attackCooldown = 20;
            }
        }
    } else {
        // No enemy found, return to foraging or check for danger
        let brave = false;

        if (ant.type === 'SOLDIER') {
            brave = true;
        } else {
            // Worker Mob Courage
            const allies = ant.countNearbyAllies(world, 150); // Check wider area for support
            if (allies >= 4) { // Need 4 allies to charge into danger
                brave = true;
            }
        }

        if (brave) {
            // Charge towards danger!
            ant.speedMultiplier = ant.type === 'SOLDIER' ? 2.0 : 1.3;

            // Follow gradient strongly
            const sensorDist = CONFIG.antSensorDist;
            const sensorAngle = CONFIG.antSensorAngle;
            const getDanger = (a: number) => ant.colony.outdoorField.get(ant.x + Math.cos(ant.angle + a) * sensorDist, ant.y + Math.sin(ant.angle + a) * sensorDist, 'DANGER');

            const l = getDanger(-sensorAngle);
            const c = getDanger(0);
            const r = getDanger(sensorAngle);

            // FIX: If no danger, stop charging
            if (c < 0.01 && l < 0.01 && r < 0.01) {
                ant.state = 'FORAGING';
                ant.speedMultiplier = 1.0;
                return;
            }

            if (c > l && c > r) { /* straight */ }
            else if (l > r) ant.angle -= CONFIG.antTurnSpeed * 2;
            else ant.angle += CONFIG.antTurnSpeed * 2;

            ant.move(world);
            return;
        } else {
            ant.speedMultiplier = 1.0; // Reset speed
            ant.state = 'FORAGING'; // Enemy lost or dead
        }
    }
}

// Standard Slime Mold / Ant Steering Algorithm

export function handleForaging(ant: Ant, world: World) {
    if (ant.energy < CONFIG.ant.foragingHungerThreshold) {
        ant.state = 'HUNGRY';
        return;
    }

    // Check if we are already performing an evasive maneuver
    if (ant.obstacleTimer > 0) return;

    if (ant.obstacleTimer > 0) return; // Sliding along wall

    // Seek shelter during a shower: foragers outside hustle back to the entrance, and
    // those already inside wait it out instead of marching back into the rain. The world
    // empties, the (unsheltered) outdoor trails wash away, then everyone streams back out
    // once it clears — a visible weather rhythm rather than a cosmetic-only overlay.
    if (world.raining) {
        if (ant.location === 'WORLD') {
            const home = ant.colony.entranceWorld;
            ant.angle = Math.atan2(home.y - ant.y, home.x - ant.x) + (rand() - 0.5) * 0.4;
            ant.speedMultiplier = 1.2;
        } else {
            ant.speedMultiplier = 0.2;               // loiter inside, don't head for the exit
            ant.angle += (rand() - 0.5) * 0.6;
        }
        return;
    }

    if (ant.location === 'NEST') {
        // Go to Exit
        const entrance = ant.colony.nest.getEntrance();
        const targetX = entrance.x;
        const targetY = entrance.y;

        const nextNode = ant.colony.nest.getNextNodeTowards(ant.x, ant.y, targetX, targetY);
        if (nextNode) {
            const angle = Math.atan2(nextNode.y - ant.y, nextNode.x - ant.x);
            ant.angle = angle + (rand() - 0.5) * 0.5;
        } else {
            ant.angle = Math.atan2(targetY - ant.y, targetX - ant.x) + (rand() - 0.5) * 1.0;
        }
        return;
    }

    // 0.5 Exit Momentum
    // If just exited nest, keep moving forward to clear the entrance area
    if (ant.exitTimer > 0) {
        ant.exitTimer--;
        // Keep moving away from the nest mouth to clear the entrance area.
        ant.angle = ant.colony.worldExitAngle;
        ant.angle += (rand() - 0.5) * 1.0; // Spread out
        return;
    }

    const proteinLow = ant.colony.proteinStockpile < CONFIG.eggCost * 25;
    const sugarLow = ant.colony.sugarStockpile < 1000;

    let prioritizeProtein = false;
    if (ant.type === 'SOLDIER') {
        prioritizeProtein = true;
    } else {
        const share = CONFIG.ant.proteinForagerShare; // stable per-ant split (forageSeed)
        if (proteinLow && sugarLow) {
            // Both short: split the workforce so protein (brood food) doesn't
            // collapse while everyone chases sugar.
            prioritizeProtein = ant.forageSeed < share;
        } else if (proteinLow) {
            prioritizeProtein = true;
        } else if (sugarLow) {
            prioritizeProtein = false;
        } else {
            // Both fine: a minority keeps topping up protein for the brood.
            prioritizeProtein = ant.forageSeed < share * 0.6;
        }
    }

    // The resource this worker is out to fetch this trip.
    const wantType: 'SUGAR' | 'PROTEIN' = prioritizeProtein ? 'PROTEIN' : 'SUGAR';

    // 2. Food - Check EVERY FRAME to prevent overshooting
    for (let i = 0; i < world.foods.length; i++) {
        const food = world.foods[i];
        if (food.amount <= 0) continue;
        if (ant.type === 'SOLDIER' && food.type === 'SUGAR') continue;

        // Focus: a well-fed worker ignores the resource it isn't after and keeps
        // searching for the needed one (so a sugar crisis isn't "solved" by
        // hauling protein). A hungry worker grabs whatever it finds to survive.
        if (ant.type === 'WORKER' && ant.energy > CONFIG.ant.foragingHungerThreshold) {
            const matches = food.type === wantType || (wantType === 'PROTEIN' && food.type === 'CORPSE');
            if (!matches) continue;
        }


        const dx = food.x - ant.x;
        const dy = food.y - ant.y;
        const distSq = dx * dx + dy * dy;

        const foodRadius = Math.max(8, Math.sqrt(food.amount) * 0.35);
        const harvestRange = foodRadius + 5; // Tighter range (User request: ants must be AT the source)
        const harvestRangeSq = harvestRange * harvestRange;

        if (distSq < harvestRangeSq) {
            // Corpses are now harvested as food in place.
            // Logic falls through to HARVESTING below.

            ant.state = 'HARVESTING';
            ant.harvestTimer = food.type === 'SUGAR' ? 60 : 120; // 1s for sugar, 2s for protein
            ant.carryingInstance = food;
            return;
        } else if (distSq < CONFIG.ant.detectEnemyRangeSq) {
            // Anti-Clustering: If stuck while approaching food, back off
            if (ant.stuckTimer > 20) {
                world.addParticle(ant.x, ant.y, 'yellow'); // Debug Visual: Unstuck Triggered
                ant.angle += Math.PI + (rand() - 0.5);
                ant.obstacleTimer = 45; // Move away for 0.75s (increased from 30)
                ant.stuckTimer = 0;
                return;
            }

            // If visible, turn towards it
            ant.angle = Math.atan2(dy, dx);
            ant.angle += (rand() - 0.5) * 0.1;
            return;
        }
    }

    // Throttled Perception
    if (ant.thinkTimer > 0) {
        ant.thinkTimer--;
    } else {
        ant.thinkTimer = 3 + Math.floor(rand() * 3);

        // 0. Alarm response: graduated. With local numerical superiority, a forager
        // joins the defence (mob); otherwise it flees and spreads the alarm.
        const dangerLevel = ant.colony.outdoorField.get(ant.x, ant.y, 'DANGER');
        if (dangerLevel > CONFIG.combat.alarmThreshold) {
            const allies = ant.countNearbyAllies(world, 100);
            const enemies = ant.countNearbyEnemies(world, 100);
            if (allies >= CONFIG.combat.mobMinAllies && allies >= Math.max(1, enemies) * CONFIG.combat.mobSuperiority) {
                ant.state = 'ATTACKING'; // rally to the threat
            } else {
                ant.state = 'FLEEING';
                ant.fleeTimer = 30;
                ant.angle += Math.PI;
            }
            return;
        }

        // Direct contact with rival-colony ants (e.g. at contested food) → mob if locally
        // superior, else flee and raise the alarm. (No-op for a single colony.)
        if (ant.location === 'WORLD') {
            let rivals = 0;
            const near = world.spatialGrid.getNearby(ant.x, ant.y, 60);
            for (const o of near) {
                if (o.colony !== ant.colony && o.location === 'WORLD' && o.type !== 'QUEEN') {
                    if ((o.x - ant.x) ** 2 + (o.y - ant.y) ** 2 < 3600) rivals++;
                }
            }
            if (rivals > 0) {
                const allies = ant.countNearbyAllies(world, 100);
                if (allies >= CONFIG.combat.mobMinAllies && allies >= rivals * CONFIG.combat.mobSuperiority) {
                    ant.state = 'ATTACKING';
                } else {
                    ant.state = 'FLEEING';
                    ant.fleeTimer = 30;
                    ant.angle += Math.PI;
                }
                return;
            }
        }

        // 1. Hunt
        for (const insect of world.insects) {
            const isPrey = insect.type === 'PREY' || insect.type === 'BEETLE' || insect.type === 'LADYBUG' || insect.type === 'SPIDER' || insect.type === 'PREDATOR';

            if (isPrey) {
                const dx = ant.x - insect.x;
                const dy = ant.y - insect.y;
                const distSq = dx * dx + dy * dy;

                // Soldiers always hunt. Workers hunt if protein needed or self-defense (close)
                if (ant.type === 'SOLDIER' || prioritizeProtein || distSq < 2500) {
                    if (distSq < 4900) {
                        if (ant.type === 'WORKER') {
                            if (insect.type === 'BEETLE') {
                                const allies = ant.countNearbyAllies(world, 80);
                                if (allies < 5) continue;
                            }
                            if (insect.type === 'SPIDER' || insect.type === 'PREDATOR') {
                                const allies = ant.countNearbyAllies(world, 100);
                                if (allies < 2) continue;
                            }
                        }
                        ant.state = 'ATTACKING';
                        return;
                    }
                }
            }
        }

        // 1.5 Aphids
        if (ant.type === 'WORKER') {
            for (const insect of world.insects) {
                if (insect.type === 'APHID') {
                    const dx = ant.x - insect.x;
                    const dy = ant.y - insect.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < CONFIG.ant.attackRangeSq) { // 30px close enough
                        ant.state = 'MILKING';
                        ant.harvestTimer = 60; // 1 second milking duration represents interaction
                        ant.carryingInstance = insect;
                        return;
                    } else if (distSq < CONFIG.ant.detectEnemyRangeSq) {
                        ant.angle = Math.atan2(dy, dx);
                        return;
                    }
                }
            }
        }


    }

    // 3. Pheromones
    const targetPheromone = prioritizeProtein ? 'PROTEIN' : 'SUGAR';
    const foundFood = ant.senseAndSteer(world, targetPheromone);

    if (!foundFood) {
        // No collective trail: head back to a remembered source (site fidelity),
        // else push out of the congested nest zone, else wander.
        if (!ant.steerToMemory() && !ant.disperseFromNest(world)) ant.wander();
    }

    ant.colony.outdoorField.depositCircle(ant.x, ant.y, 'HOME', CONFIG.pheromone.depositTrail, CONFIG.pheromone.trailRadius);
}

// Steer a trail-less explorer radially away from the nest entrance while it
// is still inside the dispersal radius. Returns true if a bias was applied.
// This breaks the random-walk's tendency to loiter at the nest door and
// spreads foraging activity across the whole map.

export function handleHarvesting(ant: Ant, world: World) {
    ant.harvestTimer--;
    ant.speedMultiplier = 0; // Stand still

    if (ant.harvestTimer <= 0) {
        // Done!
        const food = ant.carryingInstance;
        if (food && food.amount > 0) {
            // Undertaker: an ant corpse is carried whole to the graveyard (once one
            // exists) for sanitation, rather than eaten. Insect corpses — and any
            // corpse before a cemetery is dug — stay food and are harvested as protein.
            if (food.type === 'CORPSE' && food.corpseType === 'ANT'
                && ant.colony.nest.getChambers('CEMETERY').length > 0) {
                ant.carrying = 'CORPSE';
                ant.carryingInstance = food;          // keep it to drop at the cemetery
                const idx = world.foods.indexOf(food); // remove so it isn't re-grabbed mid-haul
                if (idx >= 0) world.foods.splice(idx, 1);
                ant.state = 'RETURNING';
                ant.energy = CONFIG.antMaxEnergy;
                ant.angle += Math.PI;
                return;
            }
            food.harvest(1);
            ant.carrying = food.type === 'CORPSE' ? 'PROTEIN' : food.type;
            ant.state = 'RETURNING';
            ant.energy = CONFIG.antMaxEnergy;
            ant.cropSugar = CONFIG.ant.troph.cropCapacity; // fill the social stomach to share at home
            ant.angle += Math.PI;
            // Site fidelity: remember this productive source to return to later.
            ant.foodMemoryX = food.x;
            ant.foodMemoryY = food.y;
            // Trail quality ∝ how rich the source still is.
            ant.carryingQuality = Math.max(
                CONFIG.pheromone.minQuality,
                Math.min(1, food.amount / CONFIG.pheromone.qualityRef),
            );
            ant.carryingInstance = null;
        } else {
            // Food gone?
            ant.state = 'FORAGING';
            ant.carryingInstance = null;
        }
    }
}


export function handleReturning(ant: Ant, world: World) {
    if (ant.obstacleTimer > 0) return;

    // Stuck Check
    if (ant.stuckTimer > 20) {
        ant.angle += Math.PI + (rand() - 0.5);
        ant.stuckTimer = 0;
        ant.obstacleTimer = 10;
        return;
    }

    if (ant.carrying === 'CORPSE') {
        const corpse = ant.carryingInstance;

        if (ant.location === 'WORLD') {
            // Carry the body home to this colony's entrance first (the cemetery is inside the nest).
            const home = ant.colony.entranceWorld;
            if (corpse) { corpse.x = ant.x; corpse.y = ant.y; } // the body travels with its bearer
            ant.angle = Math.atan2(home.y - ant.y, home.x - ant.x);
            return;
        }

        // In the nest: take the body to the nearest graveyard chamber and lay it there.
        const grave = ant.colony.nest.nearestChamber('CEMETERY', ant.x, ant.y);
        if (!grave) {
            // No graveyard (shouldn't happen — we only undertake when one exists):
            // recycle the body as protein so it isn't lost.
            ant.colony.proteinStockpile = Math.min(ant.colony.storageCapacity(), ant.colony.proteinStockpile + CONFIG.proteinValue);
            ant.carrying = 'NONE';
            ant.carryingInstance = null;
            ant.state = 'IDLE';
            return;
        }

        const dx = grave.x - ant.x;
        const dy = grave.y - ant.y;
        if (dx * dx + dy * dy < (grave.radius * 0.7) * (grave.radius * 0.7)) {
            if (corpse) {
                corpse.x = grave.x + (rand() - 0.5) * grave.radius;
                corpse.y = grave.y + (rand() - 0.5) * grave.radius;
                corpse.colonyId = ant.colony.id; // tag so only its own nest panel shows it
                world.graveyard.push(corpse); // laid to rest — out of the foraging pool
            }
            ant.carrying = 'NONE';
            ant.carryingInstance = null;
            ant.state = 'IDLE';
            ant.angle += Math.PI;
            return;
        }
        const nextNode = ant.colony.nest.getNextNodeTowards(ant.x, ant.y, grave.x, grave.y);
        ant.angle = nextNode ? Math.atan2(nextNode.y - ant.y, nextNode.x - ant.x) : Math.atan2(dy, dx);
        return;
    }

    const grid = ant.location === 'NEST' ? ant.colony.nestGrid : ant.colony.outdoorField;

    const trail = CONFIG.pheromone.depositFood * ant.carryingQuality;
    if (ant.carrying === 'SUGAR') {
        grid.depositCircle(ant.x, ant.y, 'SUGAR', trail, CONFIG.pheromone.trailRadius);
    } else if (ant.carrying === 'PROTEIN') {
        grid.depositCircle(ant.x, ant.y, 'PROTEIN', trail, CONFIG.pheromone.trailRadius);
    }

    if (ant.location === 'WORLD') {
        const home = ant.colony.entranceWorld;
        const angleToHome = Math.atan2(home.y - ant.y, home.x - ant.x);

        // React to a close dangerous insect instead of marching obliviously past it:
        // raise the alarm (so soldiers rally) and veer away in a panic, while still
        // biasing toward home — a laden forager keeps its cargo but bolts.
        let threat: { x: number; y: number } | null = null;
        let threatD2 = CONFIG.ant.detectEnemyRangeSq;
        for (const ins of world.insects) {
            if (ins.type === 'PREDATOR' || ins.type === 'SPIDER' || ins.type === 'BEETLE') {
                const d2 = (ins.x - ant.x) ** 2 + (ins.y - ant.y) ** 2;
                if (d2 < threatD2) { threatD2 = d2; threat = ins; }
            }
        }
        if (threat) {
            ant.colony.outdoorField.depositCircle(ant.x, ant.y, 'DANGER', CONFIG.pheromone.depositTrail, 10);
            ant.angle = Math.atan2(ant.y - threat.y, ant.x - threat.x); // flee directly away
            let dh = angleToHome - ant.angle;
            while (dh < -Math.PI) dh += Math.PI * 2;
            while (dh > Math.PI) dh -= Math.PI * 2;
            ant.angle += dh * 0.4; // …but bias the escape back toward home
            ant.speedMultiplier = 2.0; // bolt
            return;
        }

        const foundTrail = ant.senseAndSteer(world, 'HOME');
        const biasStrength = foundTrail ? 0.15 : 0.3;

        let diff = angleToHome - ant.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        ant.angle += diff * biasStrength;

    } else {
        // Deliver to the primary granary (a single stable target — the stockpile is
        // global anyway, and recomputing "nearest" each frame made ants thrash and
        // never arrive once the nest had several granaries).
        const storage = ant.colony.nest.getChamber('STORAGE');

        if (storage) {
            const dx = storage.x - ant.x;
            const dy = storage.y - ant.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 2500) {
                // Clamp to the colony's storage capacity (scales with granary count).
                const cap = ant.colony.storageCapacity();
                if (ant.carrying === 'SUGAR') ant.colony.sugarStockpile = Math.min(cap, ant.colony.sugarStockpile + CONFIG.sugarValue);
                else if (ant.carrying === 'PROTEIN') ant.colony.proteinStockpile = Math.min(cap, ant.colony.proteinStockpile + CONFIG.proteinValue);
                else if (ant.carrying === 'BROOD') {
                    // Raided enemy brood is adopted — it joins our colony as a fresh egg,
                    // to be raised as our own (slave-making). The rival already lost it.
                    ant.colony.brood.push(new Brood(ant.colony.queen.x, ant.colony.queen.y));
                }

                ant.carrying = 'NONE';

                // Check Hunger after dropping food
                if (ant.energy < CONFIG.ant.nurseEatThreshold) {
                    ant.state = 'HUNGRY';
                } else {
                    ant.state = 'IDLE'; // Go IDLE to check for rest/nursing
                }

                ant.angle += Math.PI;
                return;
            } else {
                const nextNode = ant.colony.nest.getNextNodeTowards(ant.x, ant.y, storage.x, storage.y);
                if (nextNode) {
                    const dx = nextNode.x - ant.x;
                    const dy = nextNode.y - ant.y;
                    ant.angle = Math.atan2(dy, dx);
                } else {
                    ant.angle = Math.atan2(dy, dx);
                }
            }
        }
    }
}


export function handleHungry(ant: Ant, world: World) {
    if (ant.location === 'WORLD') {
        // Use returning logic to get back to nest
        // Temporarily switch to RETURNING state logic without changing state enum?
        // Or just manually move to nest.
        // Simplest: Switch to RETURNING, but we need to know we are hungry.
        // Let's just copy the "Go Home" logic or force RETURNING state but with 'NONE' carrying?
        // If carrying is NONE, handleReturning still works to get home.
        ant.state = 'RETURNING';
        return;
    }

    // In Nest: Go to the primary granary and eat (stable target; stockpile is global)
    const storage = ant.colony.nest.getChamber('STORAGE');
    if (storage) {
        const dx = storage.x - ant.x;
        const dy = storage.y - ant.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < CONFIG.ant.arriveRangeSq) {
            // Eat (consumes sugar proportional to the energy restored). Whether
            // or not sugar was available, leave the storage and resume work.
            ant.eatFromStockpile(world);
            if (ant.type === 'SOLDIER') ant.state = 'PATROLLING';
            else ant.state = 'FORAGING';
        } else {
            // Move to storage
            const nextNode = ant.colony.nest.getNextNodeTowards(ant.x, ant.y, storage.x, storage.y);
            if (nextNode) {
                ant.angle = Math.atan2(nextNode.y - ant.y, nextNode.x - ant.x);
            } else {
                ant.angle = Math.atan2(dy, dx);
            }
        }
    }
}




export function handleMilking(ant: Ant, world: World) {
    ant.harvestTimer--;
    ant.speedMultiplier = 0; // Stand still

    // Face the aphid
    if (ant.carryingInstance) {
        const dx = ant.carryingInstance.x - ant.x;
        const dy = ant.carryingInstance.y - ant.y;
        ant.angle = Math.atan2(dy, dx);
    }

    if (ant.harvestTimer <= 0) {
        // Milking Complete
        ant.carrying = 'SUGAR';
        ant.carryingAmount = 200;
        ant.carryingQuality = 0.7; // aphid honeydew: a steady, moderate trail
        ant.state = 'RETURNING';
        ant.energy = CONFIG.antMaxEnergy;
        ant.angle += Math.PI;
        ant.carryingInstance = null;

        // Particles
        world.addParticle(ant.x, ant.y, '#FFD700', 'DEFAULT');
    }
}


