/**
 * pi-copium — format utilities
 *
 * Shimmer effect ported from pi-topping by Eric Sison (MIT)
 * https://github.com/underactive/pi-topping
 */

import type { Theme } from "@earendil-works/pi-coding-agent";

// --- SHIMMER ---

const SHIMMER_SWEEP_S = 2.0;
const SHIMMER_BAND_HALF = 5.0;
const SHIMMER_PADDING = 10;
export const SHIMMER_INTERVAL_MS = 50;
export const METER_INTERVAL_MS = 100;

/** Pi's default working-indicator frames (same braille spinner as pi-tui's Loader). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Milliseconds per spinner frame, matching pi-tui's Loader cadence. */
export const SPINNER_FRAME_MS = 80;

const METER_WIDTH = 8;
const METER_BRAILLE = ["⢀", "⣀", "⣠", "⣤", "⣴", "⣶", "⣾", "⣿"] as const;
const RATE_THRESHOLDS = [0, 5, 10, 15, 22, 30, 40] as const;

/** EMA-smoothed output-token rate based on cumulative token estimates. */
export class TokenRateTracker {
  #lastTotal = 0;
  #lastTime = 0;
  #rate = 0;
  #hasSample = false;

  get rate(): number {
    return this.#rate;
  }

  sample(totalTokens: number, now: number): number {
    if (!this.#hasSample) {
      this.#lastTotal = totalTokens;
      this.#lastTime = now;
      this.#hasSample = true;
      return this.#rate;
    }
    const elapsed = (now - this.#lastTime) / 1_000;
    if (elapsed <= 0) return this.#rate;
    const instant = Math.max(0, totalTokens - this.#lastTotal) / elapsed;
    this.#rate = 0.4 * instant + 0.6 * this.#rate;
    this.#lastTotal = totalTokens;
    this.#lastTime = now;
    return this.#rate;
  }

  reset(): void {
    this.#lastTotal = 0;
    this.#lastTime = 0;
    this.#rate = 0;
    this.#hasSample = false;
  }
}

/** Eight-cell scrolling braille meter for output-token activity. */
export class ActivityMeter {
  #levels = Array<number>(METER_WIDTH).fill(0);

  push(tokensPerSecond: number): void {
    let level = 0;
    for (let i = RATE_THRESHOLDS.length - 1; i >= 0; i--) {
      if (tokensPerSecond > RATE_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }
    this.#levels.pop();
    this.#levels.unshift(level);
  }

  render(theme: Pick<Theme, "fg">): string {
    return this.#levels
      .map((level) => theme.fg(level === 0 ? "dim" : "accent", METER_BRAILLE[level]!))
      .join("");
  }

  reset(): void {
    this.#levels.fill(0);
  }
}

export function formatTokenRate(tokensPerSecond: number): string {
  const rounded = Math.round(Math.max(0, tokensPerSecond));
  return rounded === 0 ? "--- tok/s" : `${rounded.toString().padStart(3)} tok/s`;
}

/**
 * Codex-style light-sweep shimmer using the active Pi theme.
 * Ported from pi-topping/src/format.ts (MIT, Eric Sison).
 */
export function shimmerString(
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
    (elapsedMs / 1000) %
    (enterS + litS + (period - litExit) / unitsPerS);
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

// --- FORMATTERS ---

/** A user-orderable piece of the working indicator. */
type LoaderElement = "spinner" | "text" | "meter" | "elapsed" | "tokens" | "tokenRate";

/** Default working-indicator element order. */
const DEFAULT_LOADER_ORDER: readonly LoaderElement[] = ["spinner", "text", "meter", "tokenRate", "elapsed", "tokens"];

/** Elements share a detail group; separators and non-rate details are dimmed. */
const DETAIL_ELEMENTS: ReadonlySet<LoaderElement> = new Set(["elapsed", "tokens", "tokenRate"]);

/**
 * Assemble the working indicator from already-styled pieces, laid out in `order`.
 *
 * Empty/omitted pieces are dropped, and any run of detail elements left adjacent
 * after that renders as one visual group with dim separators.
 * Ported from pi-topping/src/format.ts (MIT, Eric Sison).
 */
export function buildWorkingMessage(
  theme: Pick<Theme, "fg">,
  parts: Partial<Record<LoaderElement, string>>,
  order: readonly LoaderElement[] = DEFAULT_LOADER_ORDER,
): string {
  const segments: string[] = [];
  let details: string[] = [];
  const flushDetails = (): void => {
    if (details.length) segments.push(details.join(theme.fg("dim", " · ")));
    details = [];
  };

  for (const element of order) {
    const value = parts[element];
    if (!value) continue;
    if (DETAIL_ELEMENTS.has(element)) {
      // tokenRate arrives pre-colored; dimming it here would replace its configured color.
      details.push(element === "tokenRate" ? value : theme.fg("dim", value));
      continue;
    }
    flushDetails();
    segments.push(value);
  }
  flushDetails();

  return segments.join(" ");
}

export function formatElapsed(ms: number): string {
  let totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const parts: string[] = [];

  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

const TOKEN_UNITS = [
  { threshold: 10_000, divisor: 1_000, decimals: 1, suffix: "k" },
  { threshold: 999_500, divisor: 1_000, decimals: 0, suffix: "k" },
  { threshold: 10_000_000, divisor: 1_000_000, decimals: 1, suffix: "M" },
  { threshold: 1_000_000_000, divisor: 1_000_000, decimals: 0, suffix: "M" },
  { threshold: 1e15, divisor: 1_000_000_000, decimals: 1, suffix: "B" },
] as const;

/** Format output-token count. */
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  const unit = TOKEN_UNITS.find((u) => count < u.threshold);
  if (unit) {
    const value =
      unit.decimals > 0
        ? (count / unit.divisor).toFixed(unit.decimals)
        : `${Math.round(count / unit.divisor)}`;
    return `${value}${unit.suffix}`;
  }
  return `${(count / 1_000_000_000).toFixed(1)}B`;
}

// --- WORD COUNTER ---

/**
 * Incremental whitespace-boundary word counter.
 * Ported from pi-topping/src/format.ts (MIT, Eric Sison).
 */
export class StreamingWordCounter {
  #inWord = false;

  count(text: string): number {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (isWhitespace(code)) {
        this.#inWord = false;
      } else if (!this.#inWord) {
        count++;
        this.#inWord = true;
      }
    }
    return count;
  }

  reset(): void {
    this.#inWord = false;
  }
}

function isWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}
