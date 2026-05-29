import { CONFIG } from './config';

// Persists user parameter overrides (from the tuner + live sliders) to
// localStorage so tuning survives a reload. Only scalar, per-frame-read CONFIG
// values are ever stored here — never derived dimensions like width/height.

const STORAGE_KEY = 'antsim.overrides.v1';

let overrides: Record<string, number> = {};

/** Read a numeric CONFIG value by dot-path, e.g. 'antSpeed' or 'ant.queenFeedAmount'. */
export function getByPath(path: string): number {
    return path.split('.').reduce((o: any, k) => (o == null ? o : o[k]), CONFIG) as number;
}

/** Write a numeric CONFIG value by dot-path (no persistence). */
export function setByPath(path: string, value: number) {
    const keys = path.split('.');
    const last = keys.pop()!;
    const obj = keys.reduce((o: any, k) => o[k], CONFIG);
    if (obj) obj[last] = value;
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
        // localStorage unavailable (private mode / non-DOM env) — ignore.
    }
}

/** Apply a value to CONFIG and remember it for next session. */
export function setOverride(path: string, value: number) {
    setByPath(path, value);
    overrides[path] = value;
    save();
}

/** Load persisted overrides and apply them to CONFIG. Call once at startup. */
export function loadOverrides() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, number>;
        overrides = {};
        for (const [path, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                setByPath(path, value);
                overrides[path] = value;
            }
        }
    } catch {
        // Corrupt or unavailable storage — start clean.
    }
}

/** Whether any overrides are currently active. */
export function hasOverrides(): boolean {
    return Object.keys(overrides).length > 0;
}

/** Forget all overrides (CONFIG keeps current in-memory values until reload). */
export function clearOverrides() {
    overrides = {};
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}
