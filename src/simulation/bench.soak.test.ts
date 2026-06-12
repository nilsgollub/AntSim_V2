import { it } from 'vitest';
import { seedRng } from '../rng';
import { World } from './World';
import { CONFIG } from '../config';

it('bench: sim ticks/sec at mature population', () => {
    seedRng(7);
    const w = new World();
    for (let i = 0; i < 8000; i++) w.update(); // grow the colony first
    const pop = w.ants.length;
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) w.update();
    const dt = performance.now() - t0;
    console.log(`1 Kolonie, pop=${pop}: ${(2000 / (dt / 1000)).toFixed(0)} ticks/s (${(dt / 2000).toFixed(3)} ms/tick)`);

    CONFIG.colonyCount = 2;
    seedRng(42);
    const w2 = new World();
    for (let i = 0; i < 8000; i++) w2.update();
    const pop2 = w2.colonies[0].ants.length + w2.colonies[1].ants.length;
    const t1 = performance.now();
    for (let i = 0; i < 2000; i++) w2.update();
    const dt2 = performance.now() - t1;
    console.log(`2 Kolonien, pop=${pop2}: ${(2000 / (dt2 / 1000)).toFixed(0)} ticks/s (${(dt2 / 2000).toFixed(3)} ms/tick)`);
    CONFIG.colonyCount = 1;
}, 120000);
