import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG } from './config';
import { getByPath, setByPath, setOverride, loadOverrides, clearOverrides, hasOverrides } from './configStore';

// Minimal in-memory localStorage stand-in for the node test environment.
beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
    };
    clearOverrides();
});

describe('configStore', () => {
    it('reads flat and nested CONFIG paths', () => {
        expect(getByPath('antSpeed')).toBe(CONFIG.antSpeed);
        expect(getByPath('ant.queenFeedAmount')).toBe(CONFIG.ant.queenFeedAmount);
    });

    it('writes by path without persisting', () => {
        const original = CONFIG.antSpeed;
        setByPath('antSpeed', original + 1);
        expect(CONFIG.antSpeed).toBe(original + 1);
        expect(hasOverrides()).toBe(false);
        setByPath('antSpeed', original); // restore
    });

    it('setOverride persists and loadOverrides re-applies', () => {
        const original = CONFIG.antSpeed;
        setOverride('antSpeed', 4.2);
        expect(CONFIG.antSpeed).toBe(4.2);
        expect(hasOverrides()).toBe(true);

        // Simulate a fresh session: a different in-memory value, then load.
        CONFIG.antSpeed = 99;
        loadOverrides();
        expect(CONFIG.antSpeed).toBe(4.2);

        CONFIG.antSpeed = original; // restore for other tests in-file
    });

    it('clearOverrides forgets persisted values', () => {
        setOverride('antSpeed', 5);
        clearOverrides();
        expect(hasOverrides()).toBe(false);
        CONFIG.antSpeed = 99;
        loadOverrides(); // nothing persisted -> no change
        expect(CONFIG.antSpeed).toBe(99);
    });

    it('ignores corrupt persisted data', () => {
        localStorage.setItem('antsim.overrides.v1', '{ not json');
        expect(() => loadOverrides()).not.toThrow();
    });
});
