// Screen dimensions. Guarded so the module can be imported in a non-DOM
// environment (e.g. Vitest under the `node` environment) without crashing.
const screenW = typeof window !== 'undefined' ? window.innerWidth : 1000;
const screenH = typeof window !== 'undefined' ? window.innerHeight : 600;

const isLandscape = screenW > screenH;

// Define a target "playable area" in logical pixels.
// 1000x600 = 600,000 pixels.
// This ensures the world is always roughly this "size" to the ants, regardless of screen resolution.
const TARGET_AREA = 1000 * 600;
const aspect = screenW / screenH;

// Calculate logical dimensions that preserve the aspect ratio but approximate the target area
const logicalHeight = Math.sqrt(TARGET_AREA / aspect);
const logicalWidth = logicalHeight * aspect;

export const CONFIG = {
    // Logical World Dimensions
    width: Math.floor(logicalWidth),
    height: Math.floor(logicalHeight),

    // Nest Dimensions (Relative to Logical World)
    nestWidth: isLandscape ? Math.floor(logicalWidth * 0.20) : Math.floor(logicalWidth),
    nestHeight: isLandscape ? Math.floor(logicalHeight) : Math.floor(logicalHeight * 0.20),

    // Simulation Settings
    initialWorkers: 15,
    soldierUnlockThreshold: 30,

    // Resources
    sugarValue: 10,
    proteinValue: 5,

    // Resource economy (consumption sinks)
    sugarEnergyValue: 100,    // energy restored per 1 unit of sugar eaten
    colonyUpkeep: 0.001,      // sugar drained per ant per frame (passive nest metabolism)
    queenSugarRegen: 0.3,     // energy/frame the queen regenerates by consuming sugar
    broodProteinUpkeep: 0.0015, // protein drained per larva per frame (raising brood)

    // Ant Stats
    antSpeed: 2.5,
    antSensorAngle: Math.PI / 4, // 45 degrees
    antSensorDist: 40,
    antTurnSpeed: 0.15,
    workerHealth: 20,
    soldierHealth: 60,
    soldierDamage: 8,
    workerDamage: 3,
    antMaxEnergy: 2000,
    antEnergyDecay: 0.30,

    // Queen
    queenPosition: { x: logicalWidth / 2, y: logicalHeight / 2 },
    eggCost: 20,

    // Pheromones
    pheromoneDecay: 0.990,
    evaporationRate: 0.02,

    // Grouped pheromone tuning (used by PheromoneGrid + Ant trail deposits)
    pheromone: {
        decay: 0.990,          // per-update decay for HOME/SUGAR/PROTEIN
        dangerDecay: 0.95,     // DANGER fades faster
        minThreshold: 0.001,   // values below this are clamped to 0
        diffusionEnabled: true,// master switch for spatial diffusion
        diffusionRate: 0.12,   // 0..1 share of a cell that bleeds into neighbours
        depositTrail: 0.5,     // amount dropped on a normal trail (HOME / DANGER)
        depositFood: 1.0,      // amount dropped while carrying food
        trailRadius: 3,        // radius (logical px) of a deposited trail blob
    },

    // Brood lifecycle (frames)
    brood: {
        eggDuration: 1000,
        larvaDuration: 2000,
        pupaDuration: 1500,
        larvaStarveLimit: 200, // hunger above this = larva dies
        hungerRate: 0.005,     // hunger gained per frame while a larva
    },

    // Ant behaviour tuning (extracted magic numbers; values unchanged)
    ant: {
        // Natural ageing / lifespan (frames). ~5min base at 60fps.
        lifespan: 18000,
        lifespanJitter: 6000,
        // Squared detection / interaction ranges (px^2)
        detectEnemyRangeSq: 10000, // 100px - spot/chase enemies
        attackRangeSq: 900,        // 30px - melee range
        arriveRangeSq: 400,        // 20px - "arrived at target"
        // Feeding amounts
        queenFeedAmount: 500,
        larvaFeedAmount: 50,
        // Energy thresholds
        hungryThreshold: 200,       // critical: force HUNGRY state
        foragingHungerThreshold: 600,// forager/patroller heads home to eat
        nurseEatThreshold: 1000,    // nurse tops up energy from storage
        restWakeThreshold: 500,     // wake from RESTING if below this
        // Queen feeding thresholds
        queenCriticalEnergy: 1500,  // feed queen first, urgently
        queenMaintainEnergy: 1900,  // top queen up to here
        queenHungryEnergy: 1800,    // nurse decides queen needs food
    },

    // World Generation
    obstacleCount: 12,

    // Ecosystem
    sugarSourceCount: 2, // Reduced from 3
    maxPrey: 7,          // Reduced from 10
    preySpawnRate: 0.005, // Reduced to 0.5%

    // Enemy Spawning
    gracePeriod: 4000, // Increased grace period (~60-70s)

    predatorSpawnRate: 0.0005, // Slower spawn
    spiderSpawnRate: 0.0003,   // Slower spawn
    beetleSpawnRate: 0.0003,   // Slower spawn
    ladybugSpawnRate: 0.0005,  // Slower spawn

    maxSpiders: 1, // Start with fewer
    maxBeetles: 1,
    maxLadybugs: 2,
    maxPredators: 2, // Was 5
};
