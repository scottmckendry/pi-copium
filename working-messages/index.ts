/**
 * pi-copium — working messages
 *
 * Shimmering message shown while the agent works. The message changes for
 * each turn and each tool execution.
 *
 * Shimmer effect ported from pi-topping by Eric Sison (MIT)
 * https://github.com/underactive/pi-topping
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

import { WORKING_MESSAGES } from "./data.ts";

// --- DECK ---

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
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// Cycle through a shuffled deck, reshuffling when exhausted
function createDeck<T>(arr: T[], seed: number): () => T {
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

// --- SHIMMER ---

const SHIMMER_SWEEP_S = 2.0;
const SHIMMER_BAND_HALF = 5.0;
const SHIMMER_PADDING = 10;
const SHIMMER_INTERVAL_MS = 50;

/**
 * Codex-style light-sweep shimmer using the active Pi theme.
 * Ported from pi-topping/src/format.ts (MIT, Eric Sison).
 */
function shimmerString(
  text: string,
  elapsedMs: number,
  theme: Pick<Theme, "getFgAnsi" | "fg">,
): string {
  const chars = [...text];
  if (chars.length === 0) return "";

  const shimmerBase = ansiToRgb(theme.getFgAnsi("dim"));
  const shimmerHighlight = ansiToRgb(theme.getFgAnsi("text"));
  if (!shimmerBase || !shimmerHighlight) return theme.fg("text", text);

  const period = chars.length + SHIMMER_PADDING * 2;
  const unitsPerS = period / SHIMMER_SWEEP_S;
  const litEnter = SHIMMER_PADDING - SHIMMER_BAND_HALF;
  const litExit = SHIMMER_PADDING + chars.length - 1 + SHIMMER_BAND_HALF;
  const enterS = litEnter / unitsPerS;
  const litS = (litExit - litEnter) / unitsPerS;
  const phase =
    (elapsedMs / 1000) % (enterS + litS + (period - litExit) / unitsPerS);
  const linear =
    phase < enterS
      ? phase * unitsPerS
      : phase < enterS + litS
        ? litEnter + ((phase - enterS) / litS) * (litExit - litEnter)
        : litExit + (phase - enterS - litS) * unitsPerS;

  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const dist = Math.abs(i + SHIMMER_PADDING - linear);
    const t =
      dist <= SHIMMER_BAND_HALF
        ? 0.5 * (1 + Math.cos((Math.PI * dist) / SHIMMER_BAND_HALF))
        : 0;
    const alpha = t * 0.9;
    const r = Math.round(
      shimmerHighlight[0] * alpha + shimmerBase[0] * (1 - alpha),
    );
    const g = Math.round(
      shimmerHighlight[1] * alpha + shimmerBase[1] * (1 - alpha),
    );
    const b = Math.round(
      shimmerHighlight[2] * alpha + shimmerBase[2] * (1 - alpha),
    );
    const bold = t > 0.2 ? "\x1b[1m" : "";
    out += `${bold}\x1b[38;2;${r};${g};${b}m${ch}\x1b[22m`;
  }
  return out + "\x1b[0m";
}

function ansiToRgb(ansi: string): [number, number, number] | null {
  const match = ansi.match(/^\x1b\[38;2;(\d+);(\d+);(\d+)m$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// --- LIFECYCLE ---

interface TurnState {
  currentWord: string;
  shimmerOrigin: number;
  busy: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastMessage: string | undefined;
  currentCtx: ExtensionContext | null;
}

function makeTurnState(): TurnState {
  return {
    currentWord: "",
    shimmerOrigin: 0,
    busy: false,
    timer: null,
    lastMessage: undefined,
    currentCtx: null,
  };
}

export function installWorkingMessages(pi: ExtensionAPI): void {
  const nextWorkingMessage = createDeck(WORKING_MESSAGES, Date.now());
  const state = makeTurnState();

  function stopTimer(): void {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function tick(): void {
    const ctx = state.currentCtx;
    if (!state.busy || !ctx) return;

    const msg = shimmerString(
      state.currentWord,
      Date.now() - state.shimmerOrigin,
      ctx.ui.theme,
    );

    if (msg !== state.lastMessage) {
      state.lastMessage = msg;
      ctx.ui.setWorkingMessage(msg);
    }
  }

  // Disable Pi's native leading indicator; the shimmer is rendered inside the
  // message itself.
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingIndicator({ frames: [] });
  });

  // Turn begins.
  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    state.currentWord = nextWorkingMessage();
    state.shimmerOrigin = Date.now();
    state.busy = true;
    state.lastMessage = undefined;
    state.currentCtx = ctx;

    stopTimer();
    state.timer = setInterval(() => tick(), SHIMMER_INTERVAL_MS);
    tick();
  });

  // Re-randomize the word for each tool execution.
  pi.on("tool_execution_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || !state.busy) return;
    state.currentWord = nextWorkingMessage();
    state.shimmerOrigin = Date.now();
  });

  // Turn ends. Idempotent: safe during normal settle and session shutdown.
  function stop(): void {
    state.busy = false;
    stopTimer();
    state.currentCtx = null;
    state.lastMessage = undefined;
  }

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    stop();
    ctx.ui.setWorkingMessage();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stop();
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingIndicator();
  });
}
