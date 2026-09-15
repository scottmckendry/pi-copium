/**
 * pi-copium
 *
 * something to smoke while you burn tokens.
 *
 * Shimmer effect ported from pi-topping by Eric Sison
 * https://github.com/underactive/pi-topping
 * Copyright (c) 2026 Eric Sison — MIT License
 *
 * Working message list from dmmulroy's whimsical extension
 * https://github.com/dmmulroy/.dotfiles
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { WORKING_MESSAGES } from "./data.ts";
import { SHIMMER_INTERVAL_MS, shimmerString } from "./format.ts";
import { createDeck } from "./helpers.ts";

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

// --- MAIN EXTENSION ---
export default function (pi: ExtensionAPI) {
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

  // --- SESSION START ---
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    // Disable Pi's native leading indicator; shimmer is rendered inside the message.
    ctx.ui.setWorkingIndicator({ frames: [] });
  });

  // --- AGENT START (turn begins) ---
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
    ctx.ui.setEditorComponent(undefined);
  });
}
