const isLandscape = window.innerWidth > window.innerHeight;

// Define a target "playable area" in logical pixels.
// 1600x900 = 1,440,000 pixels.
// This ensures the world is always roughly this "size" to the ants, regardless of screen resolution.
// Define a target "playable area" in logical pixels.
// 1000x600 = 600,000 pixels. (Was 1600x900)
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
    // Landscape: Nest is 20% of width (Was 25%)
    // Portrait: Nest is 20% of height (Was 25%)
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
    antSensorDist: 40, // Increased from 30 to 40 to look further ahead
    antTurnSpeed: 0.15,
    workerHealth: 20,
    soldierHealth: 60,
    soldierDamage: 8,
    workerDamage: 3,
    antMaxEnergy: 3000,
    antEnergyDecay: 0.15,

    // Queen
    queenPosition: { x: logicalWidth / 2, y: logicalHeight / 2 }, // Will be overridden by Nest logic but good default
    eggCost: 20,

    // Pheromones
    // Pheromones
    pheromoneDecay: 0.995, // Faster decay (was 0.998)
    evaporationRate: 0.02, // Faster evaporation (was 0.015)

    // World Generation
    obstacleCount: 12,

    // Ecosystem
    sugarSourceCount: 5,
    maxPrey: 8,
    maxPredators: 2,
    preySpawnRate: 0.005,

    // Enemy Spawning
    gracePeriod: 3000,
    predatorSpawnRate: 0.0002,
    spiderSpawnRate: 0.0001,
    beetleSpawnRate: 0.0002,
    ladybugSpawnRate: 0.0005,
};
