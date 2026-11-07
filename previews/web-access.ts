/**
 * pi-copium previews — pi-web-access support
 *
 * pi-web-access registers its own tools and renderers, so we cannot decorate its tool
 * definitions the way pi-code-previews decorates the built-ins. Wrap its registered renderers
 * with pi-code-previews' public shell instead, then apply the same accent-colored frame used by
 * the built-in previews.
 */

import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { withCodePreviewShell as WithCodePreviewShell } from "pi-code-previews";

import { accentBorderTheme } from "./accent-borders.ts";

const WEB_ACCESS_PACKAGE = "pi-web-access";

/** Default pi-web-access tool names, used when tool discovery is unavailable. */
const DEFAULT_WEB_ACCESS_TOOLS = [
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
] as const;

const webAccessTools = new Set<string>(DEFAULT_WEB_ACCESS_TOOLS);

/**
 * Find pi-web-access tools by their source. This also picks up custom names configured through
 * `toolNames` in web-search.json, which the defaults alone would miss.
 */
function refreshWebAccessTools(pi: ExtensionAPI): void {
  const discovered = new Set<string>(DEFAULT_WEB_ACCESS_TOOLS);
  const getAllTools = (pi as Partial<ExtensionAPI>).getAllTools;

  if (typeof getAllTools === "function") {
    try {
      for (const tool of getAllTools.call(pi)) {
        const source = tool.sourceInfo;
        if (
          source?.path?.includes(WEB_ACCESS_PACKAGE) ||
          source?.source?.includes(WEB_ACCESS_PACKAGE)
        ) {
          discovered.add(tool.name);
        }
      }
    } catch {
      // Tool discovery is best effort; default names still cover the common setup.
    }
  }

  webAccessTools.clear();
  for (const name of discovered) webAccessTools.add(name);
}

export function installWebAccessPreviews(
  pi: ExtensionAPI,
  withCodePreviewShell: typeof WithCodePreviewShell,
): void {
  refreshWebAccessTools(pi);
  pi.on("session_start", () => {
    refreshWebAccessTools(pi);
  });

  pi.registerToolRenderer((toolName, next) => {
    if (!webAccessTools.has(toolName)) return next();

    const renderers = next();
    if (!renderers) return renderers;

    // Respect tools that already draw their own frame.
    if (renderers.renderShell === "self") return renderers;

    // withCodePreviewShell() decorates a tool definition, not a renderer set. Give it a synthetic
    // definition carrying the real renderers so we can reuse its shell without owning the tool.
    // This relies on the public helper only reading renderers; if that contract changes, leave the
    // tool's own renderers alone rather than breaking the call.
    try {
      const shell = withCodePreviewShell(
        {
          name: toolName,
          label: toolName,
          description: "",
          parameters: {},
          ...renderers,
        } as unknown as ToolDefinition,
        { preserveSelfShell: true },
      );

      return {
        ...renderers,
        renderShell: shell.renderShell,
        renderCall: shell.renderCall
          ? (args, theme, context) =>
              shell.renderCall!(args, accentBorderTheme(theme, toolName), context)
          : undefined,
        renderResult: shell.renderResult
          ? (result, options, theme, context) =>
              shell.renderResult!(result, options, accentBorderTheme(theme, toolName), context)
          : undefined,
      };
    } catch {
      return renderers;
    }
  });
}
