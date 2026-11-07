/**
 * pi-copium — statusline rendering
 *
 * Hardcoded equivalent of the minimal pi-starship config:
 *   $model$tokens$cost$fill$turn$context$extension_status
 */

import type {
  ContextUsage,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const paint = (text: string, code: string) => `${ESC}${code}m${text}${RESET}`;

const STYLE = {
  model: "35",
  tokens: "1;36",
  turn: "1;35",
  context: "1;32",
  status: "2;37",
  costLow: "1;32",
  costMid: "1;33",
  costHigh: "1;31",
} as const;

interface UsageLike {
  input?: number;
  output?: number;
  cost?: { total?: number };
}

interface Totals {
  input: number;
  output: number;
  cost: number;
}

function addUsage(totals: Totals, usage: UsageLike | undefined): void {
  if (!usage) return;
  totals.input += usage.input ?? 0;
  totals.output += usage.output ?? 0;
  totals.cost += usage.cost?.total ?? 0;
}

function addEntry(totals: Totals, entry: SessionEntry): void {
  if (entry.type === "message") {
    if (entry.message.role === "assistant" || entry.message.role === "toolResult") {
      addUsage(totals, entry.message.usage);
    }
  } else if (entry.type === "usage") {
    addUsage(totals, entry.usage);
  } else if (entry.type === "compaction" || entry.type === "branch_summary") {
    addUsage(totals, entry.usage);
  }
}

function isUserMessage(entry: SessionEntry): boolean {
  return entry.type === "message" && entry.message.role === "user";
}

function countTurns(ctx: ExtensionContext): number {
  return ctx.sessionManager
    .getBranch()
    .filter((entry) => isUserMessage(entry))
    .length;
}

function entryCount(ctx: ExtensionContext): number {
  const manager = ctx.sessionManager as ExtensionContext["sessionManager"] & {
    getEntryCount?: () => number;
  };
  return typeof manager.getEntryCount === "function"
    ? manager.getEntryCount()
    : manager.getEntries().length;
}

const CONTEXT_REFRESH_MS = 250;

export interface StatuslineStats {
  readonly input: number;
  readonly output: number;
  readonly cost: number;
  readonly turns: number;
  recompute(ctx: ExtensionContext): void;
  update(ctx: ExtensionContext, recomputeTurns?: boolean): void;
  invalidateContext(): void;
  contextPercent(ctx: ExtensionContext): string;
}

/**
 * Keeps footer values off the per-frame path. Entries are append-only, so token
 * totals can be advanced incrementally instead of rescanning the session on
 * every render. Context usage is the expensive part and is throttled separately.
 */
export function createStatuslineStats(): StatuslineStats {
  const totals: Totals = { input: 0, output: 0, cost: 0 };
  let knownEntries = 0;
  let turns = 0;
  let contextUsage: ContextUsage | undefined;
  let contextUpdatedAt = 0;

  function invalidateContext(): void {
    contextUpdatedAt = 0;
  }

  function recomputeValues(ctx: ExtensionContext): void {
    totals.input = 0;
    totals.output = 0;
    totals.cost = 0;

    const entries = ctx.sessionManager.getEntries();
    for (const entry of entries) addEntry(totals, entry);

    knownEntries = entries.length;
    turns = countTurns(ctx);
    invalidateContext();
  }

  return {
    get input() {
      return totals.input;
    },
    get output() {
      return totals.output;
    },
    get cost() {
      return totals.cost;
    },
    get turns() {
      return turns;
    },
    recompute: recomputeValues,
    update(ctx, recomputeTurns = false) {
      const count = entryCount(ctx);
      if (count < knownEntries) {
        recomputeValues(ctx);
        return;
      }

      let addedUsers = 0;
      if (count > knownEntries) {
        const entries = ctx.sessionManager.getEntries();
        for (let i = knownEntries; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry) continue;
          addEntry(totals, entry);
          if (isUserMessage(entry)) addedUsers++;
        }
        knownEntries = entries.length;
        invalidateContext();
      }

      if (recomputeTurns) {
        turns = countTurns(ctx);
        invalidateContext();
      } else {
        turns += addedUsers;
      }
    },
    invalidateContext,
    contextPercent(ctx) {
      const now = Date.now();
      if (now - contextUpdatedAt >= CONTEXT_REFRESH_MS) {
        contextUsage = ctx.getContextUsage();
        contextUpdatedAt = now;
      }

      const percent = contextUsage?.percent;
      return percent === null || percent === undefined ? "?" : `${percent.toFixed(1)}%`;
    },
  };
}

function formatCount(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function formatCost(value: number): string {
  return value.toFixed(value >= 1 ? 2 : 3);
}

function costStyle(value: number): string {
  if (value < 0.5) return STYLE.costLow;
  if (value < 1) return STYLE.costMid;
  return STYLE.costHigh;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatStatus(key: string, value: string): string {
  return value
    .trim()
    .replace(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*`, "i"), "")
    .replace(/\bready\b/gi, "✓")
    .replace(/\bmissing\b/gi, "✗")
    .replace(/,\s*/g, " ")
    .replace(/\s+\([^)]*\)\s*$/u, "")
    .replace(/\s+/gu, " ");
}

function formatStatuses(footerData: ReadonlyFooterDataProvider): string {
  return [...footerData.getExtensionStatuses()]
    .filter(([key, value]) => key !== "starship" && value.trim())
    .map(([key, value]) => formatStatus(key, value))
    .join(" ");
}

export function renderLine(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  width: number,
  stats: StatuslineStats,
): string {
  let left = "";
  if (ctx.model) left += paint(`${ctx.model.id} `, STYLE.model);
  left += paint(
    ` ↑${formatCount(stats.input)} ↓${formatCount(stats.output)} `,
    STYLE.tokens,
  );
  left += paint(` $${formatCost(stats.cost)} `, costStyle(stats.cost));

  let right = paint(` #${stats.turns} `, STYLE.turn);
  right += paint(` ${stats.contextPercent(ctx)} `, STYLE.context);
  const statuses = formatStatuses(footerData);
  if (statuses) right += paint(statuses, STYLE.status);

  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + " ".repeat(gap) + right, width, "");
}
