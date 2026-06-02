// Screen dimensions. Guarded so the module can be imported in a non-DOM
// environment (e.g. Vitest under the `node` environment) without crashing.
const screenW = typeof window !== 'undefined' ? window.innerWidth : 1000;
const screenH = typeof window !== 'undefined' ? window.innerHeight : 600;

const isLandscape = screenW > screenH;

// Size of the playable world in logical pixels. Base is 1000×600; WORLD_SCALE is
// a linear multiplier (so the area grows with its square). A bigger world means
// more room to roam / longer trails (use the camera to zoom in).
const WORLD_SCALE = 1.4;
// Share of the world the nest occupies (per axis, landscape).
const NEST_FRACTION = 0.28;

const TARGET_AREA = 1000 * 600 * WORLD_SCALE * WORLD_SCALE;
const aspect = screenW / screenH;

// Calculate logical dimensions that preserve the aspect ratio but approximate the target area
const logicalHeight = Math.sqrt(TARGET_AREA / aspect);
const logicalWidth = logicalHeight * aspect;

// How much bigger the world is than the 1000×600 baseline. Food + ecosystem
// caps scale by this so a larger world keeps the same density (otherwise prey —
// the protein supply — gets too sparse and the colony starves).
const areaFactor = (logicalWidth * logicalHeight) / (1000 * 600);
const scaleCount = (base: number) => Math.max(base, Math.round(base * areaFactor));

export const CONFIG = {
    // Logical World Dimensions
    width: Math.floor(logicalWidth),
    height: Math.floor(logicalHeight),

    // Nest Dimensions (Relative to Logical World)
    nestWidth: isLandscape ? Math.floor(logicalWidth * NEST_FRACTION) : Math.floor(logicalWidth),
    nestHeight: isLandscape ? Math.floor(logicalHeight) : Math.floor(logicalHeight * NEST_FRACTION),

    // Simulation Settings
    initialWorkers: 15,
    soldierUnlockThreshold: 30,

    // Resources. Yield per delivery scales with the linear world size: a bigger
    // world means longer round trips, so each trip must carry proportionally more
    // to keep the income *rate* (and thus the carrying capacity) stable.
    sugarValue: Math.round(10 * WORLD_SCALE),
    // Protein yield per hunt. Raised (5→7 base) to give the protein economy real
    // margin: the death-spiral diagnosis showed protein income ≈ demand with no
    // buffer, so any combat disruption tipped the colony. More yield per hunt lets
    // a battered colony rebuild brood and trend toward the population target.
    proteinValue: Math.round(7 * WORLD_SCALE),

    // Starting stockpiles (a modest founding buffer, not a huge head start)
    startSugar: 600,
    startProtein: 300,

    // Resource economy (consumption sinks)
    sugarEnergyValue: 100,    // energy restored per 1 unit of sugar eaten
    colonyUpkeep: 0.001,      // sugar drained per ant per frame (passive nest metabolism)
    queenSugarRegen: 0.3,     // energy/frame the queen regenerates by consuming sugar
    broodProteinUpkeep: 0.0006, // protein drained per larva per frame (raising brood); lowered for resilience

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
    queenLayInterval: 180, // frames between egg-laying attempts. Equilibrium pop ≈ ant.lifespan / this.

    // Pheromones
    pheromoneDecay: 0.990,
    evaporationRate: 0.02,

    // Grouped pheromone tuning (used by PheromoneGrid + Ant trail deposits)
    pheromone: {
        decay: 0.990,          // per-update decay for the HOME field
        foodDecay: 0.994,      // SUGAR/PROTEIN trails fade slower → roads persist + get reinforced
        dangerDecay: 0.95,     // DANGER fades faster
        minThreshold: 0.001,   // values below this are clamped to 0
        diffusionEnabled: true,// master switch for spatial diffusion
        diffuseFood: false,    // keep SUGAR/PROTEIN sharp (roads); only the HOME field diffuses
        diffusionRate: 0.12,   // 0..1 share of a cell that bleeds into neighbours
        depositTrail: 0.5,     // amount dropped on a normal trail (HOME / DANGER)
        depositFood: 1.0,      // amount dropped while carrying food (× source quality)
        trailRadius: 3,        // radius (logical px) of a deposited trail blob
        // Trail strength scales with source richness: a source holding `qualityRef`
        // units lays a full-strength trail; poorer/depleting sources lay fainter
        // ones (so rich finds recruit more and exhausted ones lose their road).
        qualityRef: 300,
        minQuality: 0.2,
    },

    // Brood lifecycle (frames)
    brood: {
        eggDuration: 1000,
        larvaDuration: 2000,
        pupaDuration: 1500,
        larvaStarveLimit: 200, // hunger above this = larva dies
        hungerRate: 0.005,     // hunger gained per frame while a larva
        // Caste by nutrition (no extra protein cost). Each frame a larva spends
        // while the colony holds more than `soldierProteinLevel` protein counts as
        // "well-fed"; a larva that accumulates `soldierFoodThreshold` such frames
        // (out of larvaDuration) hatches as a soldier. So a protein-rich colony
        // raises more soldiers, a lean one stays workers — the player's lever.
        soldierProteinLevel: 150,
        soldierFoodThreshold: 1700,
        maxSoldierFraction: 0.30, // nutrition raises soldiers only up to this share
    },

    // Ant behaviour tuning (extracted magic numbers; values unchanged)
    ant: {
        // Natural ageing / lifespan (frames). Longer-lived ants raise the
        // equilibrium population (≈ lifespan / queenLayInterval).
        lifespan: 38000,
        lifespanJitter: 12000,
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
        // Exploration dispersal: trail-less foragers within this radius of the
        // entrance get pushed radially outward, so activity spreads across the
        // map instead of clogging the nest door.
        dispersalRadius: Math.round(280 * WORLD_SCALE), // scales with world so it stays effective
        dispersalStrength: 0.10,
        // Temporal polyethism: an idle worker's per-frame urge to leave the nest
        // and forage ramps up with age (young nurse, old forage).
        nurseAgeFraction: 0.2,   // below this age fraction → minimum forage urge
        forageAgeFraction: 0.6,  // above this → maximum forage urge
        forageUrgeYoung: 0.001,  // per-frame P(go forage) for the youngest
        forageUrgeOld: 0.02,     // per-frame P(go forage) for the oldest
        // Site fidelity: how strongly a trail-less forager steers back toward its
        // last productive source (0 = off, pure exploration).
        memoryBias: 0.3,
        // Stockpile levels that force idle workers out to forage regardless of age
        // (kept above 0 so the colony maintains a buffer instead of bottoming out).
        forageEmergencySugar: 200,
        forageEmergencyProtein: 40,
        // Fraction of foragers that fetch protein (brood food) when both resources
        // are short — stops protein collapsing and capping the population.
        proteinForagerShare: 0.4,
    },

    // Defence & alarm behaviour (combat, fleeing, recruitment, swarming).
    combat: {
        alarmThreshold: 0.04,   // DANGER pheromone level that rallies soldiers / triggers a response
        mobMinAllies: 2,        // a worker needs at least this many local allies to consider fighting
        mobSuperiority: 1.5,    // …and roughly this much local numerical superiority over enemies
        grappleRadius: 22,      // ants this close to an enemy are "biting/holding" it
        grappleSlowPerAnt: 0.15,// each holding ant slows the enemy by this (fraction)
        grappleMaxSlow: 0.8,    // …capped here (a swarmed enemy can still struggle a little)
        patrolLongChance: 0.2,  // chance a new patrol target is a far-ranging sweep
        patrolLongRangeFrac: 0.35, // long patrols reach up to this fraction of the world size
    },

    // Enemy combat stats (HP + per-hit damage to ants). Tuned so a predator is a
    // real threat that takes a few ants with it before the colony swarms it down.
    enemy: {
        predatorHealth: 42, predatorDamage: 6,
        spiderHealth: 32,   spiderDamage: 7,
        beetleHealth: 88,   beetleDamage: 12,
    },

    // Reference used to size nest chambers (rScale = nestMinDim / nestScaleRef).
    // It tracks WORLD_SCALE and NEST_FRACTION so chambers keep ~the same absolute
    // size as the baseline nest — a bigger nest gains room, not bigger rooms.
    nestScaleRef: 300 * WORLD_SCALE * (NEST_FRACTION / 0.20),

    // Dynamic nest excavation: the colony digs extra satellite chambers as it grows.
    nest: {
        excavateEvery: 10,                      // +1 satellite chamber per this many ants
        maxExtraChambers: scaleCount(14),       // more room → more chambers in a bigger nest
        // Granaries give the colony real storage capacity: the global stockpile is
        // capped at base + perGranary × (number of STORAGE chambers). Generous, so
        // it rewards digging granaries (headroom) without ever starving the colony.
        storageBaseCapacity: 1200,              // cap per resource with no dedicated granary yet
        storagePerGranary: 600,                 // …each granary chamber raises it by this
    },

    // World Generation
    obstacleCount: 12,

    // Ecosystem
    // Food sources scale with world area so the colony's supply (esp. prey →
    // protein) keeps the same density in a larger world. Threats deliberately do
    // NOT scale — a bigger world is roomier/safer, which offsets the longer trips.
    sugarSourceCount: scaleCount(4), // spread-out sources → activity fans out
    maxPrey: scaleCount(7),
    preySpawnRate: 0.005 * areaFactor,

    // Enemy Spawning (kept at baseline counts/rates regardless of world size)
    gracePeriod: 4000, // Increased grace period (~60-70s)

    predatorSpawnRate: 0.0005,
    spiderSpawnRate: 0.0003,
    beetleSpawnRate: 0.0003,
    ladybugSpawnRate: 0.0005,

    maxSpiders: 1,
    maxBeetles: 1,
    maxLadybugs: 2,
    maxPredators: 2,
};
