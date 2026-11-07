/**
 * Give pi-code-previews' tool frames a per-tool identity.
 *
 * Upstream hardcodes the idle border to the `success` token and draws a plain `╭` corner. Wrapping
 * the tool renderers lets us keep the frame subtle (`borderMuted`) and color only the top-left
 * Nerd Font icon per tool, Blink-style, with a one-cell gap before the top border continues.
 * Error states retain the `error` color so failed calls remain obvious. Idle (`success`) and
 * in-progress (`warning`) frames both use the subtle frame color, so only failures turn red.
 *
 * Icons must be one cell wide so the border layout stays aligned.
 */

import type { ExtensionAPI, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

const PREVIEW_TOOLS = new Set(["bash", "read", "write", "edit", "grep", "find", "ls"]);
const BOX_DRAWING = /[─│╭╮╰╯]/;
const TOP_LEFT = "╭";

type ToolBorder = {
  icon: string;
  color: ThemeColor;
};

const DEFAULT_BORDER: ToolBorder = { icon: "󰇙", color: "borderAccent" };
const FRAME_COLOR: ThemeColor = "borderMuted";

const TOOL_BORDERS: Record<string, ToolBorder> = {
  bash: { icon: "󰆍", color: "success" },
  read: { icon: "󰈙", color: "mdLink" },
  write: { icon: "󰈔", color: "mdHeading" },
  edit: { icon: "󰏫", color: "syntaxFunction" },
  grep: { icon: "󰱼", color: "syntaxKeyword" },
  find: { icon: "󰈞", color: "syntaxType" },
  ls: { icon: "󰉖", color: "mdCode" },
  web_search: { icon: "󰖟", color: "accent" },
  source_check: { icon: "󰄬", color: "success" },
  fetch_content: { icon: "󰇚", color: "mdLink" },
  get_search_content: { icon: "󰈙", color: "mdHeading" },
};

const themeCache = new WeakMap<Theme, Map<string, Theme>>();

export function accentBorderTheme(theme: Theme, toolName = ""): Theme {
  let toolThemes = themeCache.get(theme);
  if (!toolThemes) {
    toolThemes = new Map();
    themeCache.set(theme, toolThemes);
  }

  const cached = toolThemes.get(toolName);
  if (cached) return cached;

  const border = TOOL_BORDERS[toolName] ?? DEFAULT_BORDER;
  // The top border may be drawn as separate fg() calls when a right-side label is present. Hold
  // the gap until the next border segment, then turn its first dash into the gap.
  let pendingGap = false;

  const proxied = new Proxy(theme, {
    get(target, property) {
      if (property === "fg") {
        return (color: ThemeColor, text: string) => {
          if (!BOX_DRAWING.test(text)) return target.fg(color, text);

          // Keep errors visible; idle and in-progress frames get the subtle border color.
          const frameColor = color === "error" ? color : FRAME_COLOR;
          if (!text.includes(TOP_LEFT)) {
            if (pendingGap) {
              pendingGap = false;
              if (text.startsWith("─")) return target.fg(frameColor, ` ${text.slice(1)}`);
            }
            return target.fg(frameColor, text);
          }

          const rest = text.replace(TOP_LEFT, () => "");
          const icon = target.fg(border.color, border.icon);
          if (!rest) {
            pendingGap = true;
            return icon;
          }

          // Replace the first dash with a space so the frame keeps its original width.
          pendingGap = false;
          const spaced = rest.startsWith("─") ? ` ${rest.slice(1)}` : rest;
          return `${icon}${target.fg(frameColor, spaced)}`;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  toolThemes.set(toolName, proxied);
  return proxied;
}

export function installAccentPreviewBorders(pi: ExtensionAPI): void {
  pi.registerToolRenderer((toolName, next) => {
    if (!PREVIEW_TOOLS.has(toolName)) return next();

    const renderers = next();
    if (!renderers) return renderers;

    const { renderCall, renderResult } = renderers;
    return {
      ...renderers,
      renderCall: renderCall
        ? (args, theme, context) => renderCall(args, accentBorderTheme(theme, toolName), context)
        : undefined,
      renderResult: renderResult
        ? (result, options, theme, context) =>
            renderResult(result, options, accentBorderTheme(theme, toolName), context)
        : undefined,
    };
  });
}
