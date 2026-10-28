/**
 * pi-copium — statusline
 *
 * Compact one-line footer. Refreshes on lifecycle events that can change
 * tokens, cost, context usage, model, or extension statuses.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { renderLine } from "./render.ts";

export interface Statusline {
  install(ctx: ExtensionContext): void;
  refresh(): void;
  dispose(ctx: ExtensionContext): void;
}

export function createStatusline(): Statusline {
  let requestRender: (() => void) | undefined;
  let installed = false;

  return {
    install(ctx) {
      if (ctx.mode !== "tui" || installed) return;
      installed = true;

      ctx.ui.setFooter((tui, _theme, footerData) => {
        const render = () => tui.requestRender();
        requestRender = render;
        const unsubscribe = footerData.onBranchChange(render);

        return {
          dispose() {
            unsubscribe();
            if (requestRender === render) requestRender = undefined;
            installed = false;
          },
          invalidate() {},
          render(width: number): string[] {
            return [renderLine(ctx, footerData, width)];
          },
        };
      });
    },

    refresh() {
      requestRender?.();
    },

    dispose(ctx) {
      requestRender = undefined;
      if (!installed) return;
      installed = false;
      ctx.ui.setFooter(undefined);
    },
  };
}

export function installStatusline(pi: ExtensionAPI): void {
  const statusline = createStatusline();

  pi.on("session_start", (_event, ctx) => statusline.install(ctx));
  pi.on("model_select", () => statusline.refresh());

  // Lifecycle events that can change footer data.
  pi.on("agent_start", () => statusline.refresh());
  pi.on("agent_settled", () => statusline.refresh());
  pi.on("tool_execution_start", () => statusline.refresh());
  pi.on("message_end", () => statusline.refresh());
  pi.on("turn_end", () => statusline.refresh());
  pi.on("tool_execution_end", () => statusline.refresh());
  pi.on("session_compact", () => statusline.refresh());
  pi.on("session_tree", () => statusline.refresh());

  pi.on("session_shutdown", (_event, ctx) => statusline.dispose(ctx));
}
