export const CONFIG = {
    width: window.innerWidth,
    height: window.innerHeight,

    // Simulation Settings
    initialWorkers: 15, // Increased slightly
    soldierUnlockThreshold: 30, // Earlier soldiers

    // Resources
    sugarValue: 20, // More energy from sugar
    proteinValue: 5, // More protein per unit (faster growth)

    // Ant Stats
    antSpeed: 2.5, // Slightly faster
    antSensorAngle: Math.PI / 3, // Wider field of view
    antSensorDist: 40, // Further vision
    antTurnSpeed: 0.6,
    workerHealth: 15,
    soldierHealth: 60,
    soldierDamage: 8,
    workerDamage: 2, // Workers can bite back now
    antMaxEnergy: 1500, // More stamina
    antEnergyDecay: 0.8, // Faster hunger (needs more sugar)

    // Queen
    queenPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    eggCost: 20, // Cheaper eggs (faster growth)

    // Pheromones
    pheromoneDecay: 0.992, // Slightly faster decay to prevent mess
    evaporationRate: 0.015,

    // World Generation
    obstacleCount: 12, // Fewer obstacles

    // Ecosystem
    sugarSourceCount: 3, // Less sugar (scarcity)
    maxPrey: 15, // More food
    maxPredators: 2, // Fewer enemies initially
    preySpawnRate: 0.01, // Faster prey spawn
    predatorSpawnRate: 0.0005, // Slower predator spawn
};
