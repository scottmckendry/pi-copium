/**
 * pi-copium — statusline rendering
 *
 * Hardcoded equivalent of the minimal pi-starship config:
 *   $model$tokens$cost$fill$turn$context$extension_status
 */

import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
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

function readTotals(ctx: ExtensionContext): Totals {
  const totals: Totals = { input: 0, output: 0, cost: 0 };

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        addUsage(totals, entry.message.usage);
      } else if (entry.message.role === "toolResult") {
        addUsage(totals, entry.message.usage);
      }
    } else if (entry.type === "compaction" || entry.type === "branch_summary") {
      addUsage(totals, entry.usage);
    }
  }

  return totals;
}

function countTurns(ctx: ExtensionContext): number {
  return ctx.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "message" && entry.message.role === "user")
    .length;
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
): string {
  const totals = readTotals(ctx);
  const contextUsage = ctx.getContextUsage();
  const percent =
    contextUsage?.percent === null || contextUsage?.percent === undefined
      ? "?"
      : `${contextUsage.percent.toFixed(1)}%`;

  let left = "";
  if (ctx.model) left += paint(`${ctx.model.id} `, STYLE.model);
  left += paint(
    ` ↑${formatCount(totals.input)} ↓${formatCount(totals.output)} `,
    STYLE.tokens,
  );
  left += paint(` $${formatCost(totals.cost)} `, costStyle(totals.cost));

  let right = paint(` #${countTurns(ctx)} `, STYLE.turn);
  right += paint(` ${percent} `, STYLE.context);
  const statuses = formatStatuses(footerData);
  if (statuses) right += paint(statuses, STYLE.status);

  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + " ".repeat(gap) + right, width, "");
}
