const isLandscape = window.innerWidth > window.innerHeight;

// Define a target "playable area" in logical pixels.
// 1000x600 = 600,000 pixels.
// This ensures the world is always roughly this "size" to the ants, regardless of screen resolution.
const TARGET_AREA = 1000 * 600;
const aspect = window.innerWidth / window.innerHeight;

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
    sugarValue: 20,
    proteinValue: 5,

    // Ant Stats
    antSpeed: 2.5,
    antSensorAngle: Math.PI / 4, // 45 degrees
    antSensorDist: 40,
    antTurnSpeed: 0.15,
    workerHealth: 20,
    soldierHealth: 60,
    soldierDamage: 8,
    workerDamage: 3,
    antMaxEnergy: 3000,
    antEnergyDecay: 0.15,

    // Queen
    queenPosition: { x: logicalWidth / 2, y: logicalHeight / 2 },
    eggCost: 20,

    // Pheromones
    pheromoneDecay: 0.995,
    evaporationRate: 0.02,

    // World Generation
    obstacleCount: 12,

    // Ecosystem
    sugarSourceCount: 5,
    maxPrey: 10,
    preySpawnRate: 0.01,

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
