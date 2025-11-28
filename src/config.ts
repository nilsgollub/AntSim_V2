const isLandscape = window.innerWidth > window.innerHeight;

export const CONFIG = {
    // Landscape: World 75% width, Nest 25% width (Side by Side)
    // Portrait: World 100% width, Nest 25% height (Top/Bottom)
    width: isLandscape ? Math.floor(window.innerWidth * 0.75) : window.innerWidth,
    height: isLandscape ? window.innerHeight : Math.floor(window.innerHeight * 0.75),

    nestWidth: isLandscape ? Math.floor(window.innerWidth * 0.25) : window.innerWidth,
    nestHeight: isLandscape ? window.innerHeight : Math.floor(window.innerHeight * 0.25),

    // Simulation Settings
    initialWorkers: 15, // Increased slightly
    soldierUnlockThreshold: 30, // Earlier soldiers

    // Resources
    sugarValue: 20, // More energy from sugar
    proteinValue: 5, // More protein per unit (faster growth)

    // Ant Stats
    antSpeed: 2.5, // Slightly faster
    antSensorAngle: Math.PI / 2.5, // Wider field of view (was PI/3)
    antSensorDist: 80, // Further vision (was 60)
    antTurnSpeed: 0.2, // Smoother turning to prevent circling
    workerHealth: 20, // Was 15
    soldierHealth: 60,
    soldierDamage: 8,
    workerDamage: 3, // Was 2
    antMaxEnergy: 3000, // More stamina
    antEnergyDecay: 0.15, // Much slower hunger (was 0.8)

    // Queen
    queenPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    eggCost: 20, // Cheaper eggs (faster growth)

    // Pheromones
    pheromoneDecay: 0.998, // Slower decay (trails last longer, was 0.996)
    evaporationRate: 0.015,

    // World Generation
    obstacleCount: 12, // Fewer obstacles

    // Ecosystem
    sugarSourceCount: 5, // More sugar to help early game
    maxPrey: 15, // More food
    maxPredators: 2, // Fewer enemies initially
    preySpawnRate: 0.01, // Faster prey spawn

    // Enemy Spawning
    gracePeriod: 3000, // No enemies for first ~50 seconds (at 60fps)
    predatorSpawnRate: 0.0002, // Slower predator spawn
    spiderSpawnRate: 0.0001, // Very rare
    beetleSpawnRate: 0.0002, // Rare
    ladybugSpawnRate: 0.0005, // Occasional
};
