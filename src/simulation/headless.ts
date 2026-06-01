import { World } from './World';
import { seedRng } from '../rng';

export interface HeadlessMetrics {
    ticks: number;
    population: number;
    workers: number;
    soldiers: number;
    brood: number;
    larvae: number;
    sugar: number;
    protein: number;
    queenEnergy: number;
    extraChambers: number;
    peakPopulation: number;
    minPopulation: number;
}

/**
 * Run the simulation headless (no DOM/rendering) for a fixed number of ticks
 * from a given seed, and return aggregate metrics. Because all simulation
 * randomness flows through the seeded PRNG, the same (seed, ticks) reproduces
 * the same result exactly — which is what lets tests assert on emergent outcomes.
 */
export function runHeadless(seed: number, ticks: number): HeadlessMetrics {
    seedRng(seed);
    const world = new World();

    let peak = world.ants.length;
    let min = world.ants.length;

    for (let i = 0; i < ticks; i++) {
        world.update();
        const n = world.ants.length;
        if (n > peak) peak = n;
        if (n < min) min = n;
    }

    return {
        ticks,
        population: world.ants.length,
        workers: world.ants.filter(a => a.type === 'WORKER').length,
        soldiers: world.ants.filter(a => a.type === 'SOLDIER').length,
        brood: world.brood.length,
        larvae: world.larvae,
        sugar: Math.floor(world.sugarStockpile),
        protein: Math.floor(world.proteinStockpile),
        queenEnergy: Math.floor(world.queen.energy),
        extraChambers: world.nest.extraChambers,
        peakPopulation: peak,
        minPopulation: min,
    };
}
