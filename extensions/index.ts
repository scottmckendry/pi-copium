/**
 * pi-copium
 *
 * something to smoke while you burn tokens.
 *
 * Mascot, animations, and spinner concept from pi-buddy by apat183
 * https://github.com/apat183/pi-buddy
 * Copyright (c) 2026 Anand Patel — MIT License
 *
 * Shimmer effect and streaming word counter ported from pi-topping by Eric Sison
 * https://github.com/underactive/pi-topping
 * Copyright (c) 2026 Eric Sison — MIT License
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { TAGLINES, WORKING_MESSAGES } from "./data.ts";
import {
  ActivityMeter,
  buildWorkingMessage,
  formatElapsed,
  formatTokenRate,
  formatTokens,
  METER_INTERVAL_MS,
  SHIMMER_INTERVAL_MS,
  shimmerString,
  SPINNER_FRAME_MS,
  SPINNER_FRAMES,
  StreamingWordCounter,
  TokenRateTracker,
} from "./format.ts";
import { pick, createDeck } from "./helpers.ts";
import { CopiumHeader } from "./components.ts";

// --- SPINNER ---
// --- TOKEN TRACKING ---
interface TurnState {
  startTime: number;
  currentWord: string;
  shimmerOrigin: number;
  confirmTokens: number;
  liveTokens: number;
  counter: StreamingWordCounter;
  activityMeter: ActivityMeter;
  rateTracker: TokenRateTracker;
  lastRateSampleAt: number;
  busy: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastMessage: string | undefined;
  currentCtx: ExtensionContext | null;
}

function makeTurnState(): TurnState {
  return {
    startTime: 0,
    currentWord: "",
    shimmerOrigin: 0,
    confirmTokens: 0,
    liveTokens: 0,
    counter: new StreamingWordCounter(),
    activityMeter: new ActivityMeter(),
    rateTracker: new TokenRateTracker(),
    lastRateSampleAt: 0,
    busy: false,
    timer: null,
    lastMessage: undefined,
    currentCtx: null,
  };
}

// --- MAIN EXTENSION ---
export default function (pi: ExtensionAPI) {
  const tagline = pick(TAGLINES);
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

    const now = Date.now();
    const total = state.confirmTokens + state.liveTokens;

    // Spinner rendered inside the message (not leading indicator) for consistent appearance.
    const spinner = ctx.ui.theme.fg(
      "accent",
      SPINNER_FRAMES[
        Math.floor(now / SPINNER_FRAME_MS) % SPINNER_FRAMES.length
      ]!,
    );
    const shimmered = shimmerString(
      state.currentWord,
      now - state.shimmerOrigin,
      ctx.ui.theme,
    );
    if (now - state.lastRateSampleAt >= METER_INTERVAL_MS) {
      state.activityMeter.push(state.rateTracker.sample(total, now));
      state.lastRateSampleAt = now;
    }
    const meter = state.activityMeter.render(ctx.ui.theme);
    const rate = formatTokenRate(state.rateTracker.rate);
    const elapsed = formatElapsed(now - state.startTime);
    const tokens = `↓ ${formatTokens(total)} tokens`;

    const msg = buildWorkingMessage(ctx.ui.theme, {
      spinner,
      text: shimmered,
      meter,
      tokenRate: rate ? ctx.ui.theme.fg("warning", rate) : "",
      elapsed,
      tokens,
    });

    if (msg !== state.lastMessage) {
      state.lastMessage = msg;
      ctx.ui.setWorkingMessage(msg);
    }
  }

  // --- SESSION START ---
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    // launch header (one-shot animation)
    const modelName = ctx.model?.id ?? "choose a model";
    ctx.ui.setHeader(
      (tui, theme) => new CopiumHeader(tui, theme, tagline, modelName),
    );

    // Disable Pi's native leading indicator; spinner is rendered inside the message.
    ctx.ui.setWorkingIndicator({ frames: [] });
  });

  // --- AGENT START (turn begins) ---
  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    state.startTime = Date.now();
    state.shimmerOrigin = state.startTime;
    state.currentWord = nextWorkingMessage();
    state.confirmTokens = 0;
    state.liveTokens = 0;
    state.counter.reset();
    state.activityMeter.reset();
    state.rateTracker.reset();
    state.lastRateSampleAt = 0;
    state.busy = true;
    state.lastMessage = undefined;
    state.currentCtx = ctx;

    stopTimer();
    state.timer = setInterval(() => tick(), SHIMMER_INTERVAL_MS);
    tick();
  });

  // --- MESSAGE TRACKING (token counting) ---
  pi.on("message_start", (event, ctx) => {
    if (ctx.mode !== "tui" || !state.busy) return;
    if (event.message.role === "assistant") {
      state.liveTokens = 0;
      state.counter.reset();
    }
  });

  pi.on("message_update", (event, ctx) => {
    if (ctx.mode !== "tui" || !state.busy) return;
    const e = event.assistantMessageEvent;
    if (e && (e.type === "text_delta" || e.type === "thinking_delta")) {
      state.liveTokens += state.counter.count(e.delta);
    }
  });

  pi.on("message_end", (event, ctx) => {
    if (ctx.mode !== "tui" || !state.busy) return;
    if (event.message.role !== "assistant") return;
    const exact = event.message.usage?.output;
    state.confirmTokens += exact ?? state.liveTokens;
    state.liveTokens = 0;
    state.counter.reset();
  });

  // --- TOOL EXECUTION (re-randomize word) ---
  pi.on("tool_execution_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || !state.busy) return;
    state.currentWord = nextWorkingMessage();
    state.shimmerOrigin = Date.now();
  });

  // --- AGENT SETTLED (turn ends) ---
  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    state.busy = false;
    stopTimer();
    ctx.ui.setWorkingMessage();

    state.currentCtx = null;
    state.lastMessage = undefined;
  });

  // --- SHUTDOWN ---
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    stopTimer();
    ctx.ui.setWorkingIndicator();
    ctx.ui.setHeader(undefined);
  });
}
