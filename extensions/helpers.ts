/**
 * pi-copium — helper functions
 */

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// mulberry32 PRNG — deterministic, fast, good distribution
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded PRNG
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// Cycle through a shuffled deck, reshuffling when exhausted
export function createDeck<T>(arr: T[], seed: number): () => T {
  let deck: T[] = [];
  let idx = 0;
  let currentSeed = seed;

  return () => {
    if (idx >= deck.length) {
      deck = seededShuffle(arr, currentSeed);
      currentSeed = mulberry32(currentSeed)() * 0xffffffff; // advance seed
      idx = 0;
    }
    return deck[idx++]!;
  };
}
