// Deterministic, seedable pseudo-random number generator (mulberry32).
//
// The whole simulation draws randomness through `rand()` instead of
// `Math.random()`, so a given seed reproduces a run exactly. This enables the
// headless test harness (src/simulation/headless.ts) to assert on emergent
// behaviour, and makes "it got stuck / it collapsed" bugs reproducible.
//
// Rendering-only randomness (background noise, grass sprites) deliberately
// stays on Math.random() — it doesn't affect simulation state.

let state = 0x9e3779b9; // arbitrary non-zero default

/** Seed the generator. The same seed reproduces the same sequence. */
export function seedRng(seed: number) {
    state = seed >>> 0;
    if (state === 0) state = 0x9e3779b9; // avoid a degenerate all-zero state
}

/** Uniform float in [0, 1) — drop-in replacement for Math.random(). */
export function rand(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Current internal state — useful for snapshotting/restoring a run. */
export function getRngState(): number {
    return state;
}

/** Restore a previously captured state. */
export function setRngState(s: number) {
    state = s >>> 0;
}
