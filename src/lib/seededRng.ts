/**
 * Deterministic PRNG for replay / scenario simulation (E8 / T8-2).
 * Mulberry32 — fast, seedable, adequate for shuffles and timeout picks.
 */

export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Fisher–Yates shuffle using the provided RNG (deterministic when seeded). */
export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
