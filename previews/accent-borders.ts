/**
 * Recolor pi-code-previews' normal tool-call frame to the theme's accent border color.
 *
 * Upstream hardcodes the idle border to the `success` token. Wrapping the tool renderers lets us
 * remap `success` to `borderAccent` only for box-drawing text, so success-colored content inside
 * the preview (checkmarks, counters) keeps its normal color.
 */

import type { ExtensionAPI, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

const PREVIEW_TOOLS = new Set(["bash", "read", "write", "edit", "grep", "find", "ls"]);
const BOX_DRAWING = /[─│╭╮╰╯]/;

const themeCache = new WeakMap<Theme, Theme>();

function accentBorderTheme(theme: Theme): Theme {
  const cached = themeCache.get(theme);
  if (cached) return cached;

  const proxied = new Proxy(theme, {
    get(target, property) {
      if (property === "fg") {
        return (color: ThemeColor, text: string) =>
          target.fg(color === "success" && BOX_DRAWING.test(text) ? "borderAccent" : color, text);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  themeCache.set(theme, proxied);
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
        ? (args, theme, context) => renderCall(args, accentBorderTheme(theme), context)
        : undefined,
      renderResult: renderResult
        ? (result, options, theme, context) =>
            renderResult(result, options, accentBorderTheme(theme), context)
        : undefined,
    };
  });
}
