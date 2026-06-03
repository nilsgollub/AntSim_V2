import { describe, it, expect } from 'vitest';
import { seedRng } from '../rng';
import { World } from './World';
import { CONFIG } from '../config';

describe('day/night activity', () => {
    const w = new World();
    const brightnessAt = (t: number) => { w.timeOfDay = t; return w.dayBrightness(); };
    const activityAt = (t: number) => { w.timeOfDay = t; return w.activityFactor(); };

    it('is full by day and darkest at night', () => {
        expect(brightnessAt(0.45)).toBe(1);      // midday
        expect(brightnessAt(0.9)).toBe(0);       // deep night
        expect(brightnessAt(0.1)).toBeCloseTo(0.5, 5); // dawn ramp
        expect(brightnessAt(0.75)).toBeCloseTo(0.5, 5); // dusk ramp
    });

    it('outdoor activity ramps from nightActivityMin to 1 with daylight', () => {
        expect(activityAt(0.45)).toBeCloseTo(1, 5);
        expect(activityAt(0.9)).toBeCloseTo(CONFIG.environment.nightActivityMin, 5);
    });
});

describe('rain washes outdoor trails', () => {
    it('a shower fades an outdoor pheromone road', () => {
        seedRng(1);
        const w = new World();
        w.grid.deposit(60, 60, 'HOME', 50); // a strong outdoor road
        const before = w.grid.get(60, 60, 'HOME');
        expect(before).toBeGreaterThan(0);

        // Force a shower to start, then let it rain.
        const saved = CONFIG.environment.rainChance;
        CONFIG.environment.rainChance = 1;
        w.update();
        CONFIG.environment.rainChance = saved;
        expect(w.raining).toBe(true);

        for (let i = 0; i < 40; i++) w.update();
        // Per-frame washout (×rainWashout) drives the road well down.
        expect(w.grid.get(60, 60, 'HOME')).toBeLessThan(before * 0.5);
    });
});
