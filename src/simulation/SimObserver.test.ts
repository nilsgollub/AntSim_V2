import { describe, it, expect } from 'vitest';
import { SimObserver } from './SimObserver';
import type { World } from './World';

// Minimal fake world covering only what SimObserver.observe() reads.
interface FakeOpts {
    antCount: number;
    soldiers?: number;
    foraging?: number;   // workers in FORAGING (active)
    attacking?: number;
    fleeing?: number;
    energy?: number;     // per-ant energy
    queenEnergy?: number;
    queenStress?: number;
    sugar?: number;
    protein?: number;
    brood?: number;
    larvae?: number;
    enemies?: number;
}

function fakeWorld(age: number, o: FakeOpts): World {
    const soldiers = o.soldiers ?? 0;
    const workers = o.antCount - soldiers;
    const energy = o.energy ?? 1500;
    const foraging = o.foraging ?? Math.floor(workers * 0.5);
    const attacking = o.attacking ?? 0;
    const fleeing = o.fleeing ?? 0;

    const ants: any[] = [];
    for (let i = 0; i < workers; i++) {
        let state = 'IDLE';
        if (i < foraging) state = 'FORAGING';
        else if (i < foraging + attacking) state = 'ATTACKING';
        else if (i < foraging + attacking + fleeing) state = 'FLEEING';
        ants.push({ type: 'WORKER', state, energy });
    }
    for (let i = 0; i < soldiers; i++) ants.push({ type: 'SOLDIER', state: 'PATROLLING', energy });

    const brood: any[] = [];
    const larvae = o.larvae ?? Math.floor((o.brood ?? 0) / 2);
    for (let i = 0; i < (o.brood ?? 0); i++) brood.push({ stage: i < larvae ? 'LARVA' : 'EGG' });

    const insects: any[] = [];
    for (let i = 0; i < (o.enemies ?? 0); i++) insects.push({ type: 'PREDATOR' });

    return {
        age,
        ants,
        brood,
        insects,
        queen: { energy: o.queenEnergy ?? 1500, stress: o.queenStress ?? 0 },
        sugarStockpile: o.sugar ?? 1000,
        proteinStockpile: o.protein ?? 500,
    } as unknown as World;
}

describe('SimObserver', () => {
    it('asks for more data with fewer than 2 snapshots', () => {
        const obs = new SimObserver();
        obs.observe(fakeWorld(600, { antCount: 50 }));
        const result = obs.analyze();
        expect(result).toHaveLength(1);
        expect(result[0].severity).toBe('info');
        expect(result[0].metric).toBe('Datenmenge');
    });

    it('only samples once per interval', () => {
        const obs = new SimObserver();
        obs.observe(fakeWorld(600, { antCount: 50 }));
        obs.observe(fakeWorld(601, { antCount: 50 })); // too soon, ignored
        expect(obs.snapshotCount).toBe(1);
        obs.observe(fakeWorld(1200, { antCount: 50 })); // next interval
        expect(obs.snapshotCount).toBe(2);
    });

    it('flags a collapsing population as critical', () => {
        const obs = new SimObserver();
        obs.observe(fakeWorld(600,  { antCount: 100 }));
        obs.observe(fakeWorld(1200, { antCount: 60, energy: 1200 }));
        const result = obs.analyze();
        const pop = result.find(r => r.metric === 'Populationstrend');
        expect(pop).toBeDefined();
        expect(pop!.severity).toBe('critical');
        // The suggestion must name a concrete config key and explain the effect
        expect(pop!.suggestion).toContain('CONFIG.');
        expect(pop!.effect.length).toBeGreaterThan(10);
    });

    it('flags starving ants as a critical energy problem', () => {
        const obs = new SimObserver();
        obs.observe(fakeWorld(600,  { antCount: 50, energy: 400 }));
        obs.observe(fakeWorld(1200, { antCount: 50, energy: 300 }));
        const result = obs.analyze();
        const energy = result.find(r => r.metric === 'Durchschnittliche Energie');
        expect(energy).toBeDefined();
        expect(energy!.severity).toBe('critical');
    });

    it('flags overwhelming combat pressure', () => {
        const obs = new SimObserver();
        const heavy = { antCount: 40, attacking: 12, fleeing: 6 };
        obs.observe(fakeWorld(600,  heavy));
        obs.observe(fakeWorld(1200, heavy));
        const result = obs.analyze();
        const combat = result.find(r => r.metric === 'Kampfbelastung');
        expect(combat).toBeDefined();
        expect(combat!.severity).toBe('critical');
    });

    it('reports a healthy colony with no critical issues', () => {
        const obs = new SimObserver();
        const healthy = {
            antCount: 50, soldiers: 8, foraging: 25,
            energy: 1400, queenEnergy: 1800, queenStress: 2,
            sugar: 1500, protein: 600, brood: 25, larvae: 12,
        };
        obs.observe(fakeWorld(600,  { ...healthy, antCount: 48 }));
        obs.observe(fakeWorld(1200, healthy)); // slight growth
        const result = obs.analyze();
        expect(result.every(r => r.severity !== 'critical')).toBe(true);
    });

    it('every suggestion carries an actionable explanation', () => {
        const obs = new SimObserver();
        obs.observe(fakeWorld(600,  { antCount: 80, energy: 500, enemies: 5 }));
        obs.observe(fakeWorld(1200, { antCount: 50, energy: 400, attacking: 10, queenStress: 30 }));
        const result = obs.analyze();
        for (const r of result) {
            expect(r.metric).toBeTruthy();
            expect(r.observed).toBeTruthy();
            expect(r.suggestion).toBeTruthy();
            expect(r.effect).toBeTruthy();
            expect(['good', 'info', 'warn', 'critical']).toContain(r.severity);
        }
    });
});
