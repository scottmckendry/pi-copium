/**
 * pi-copium previews
 *
 * Wraps pi-code-previews with a Shiki theme generated from the active Pi theme and accent-colored
 * tool frames.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installAccentPreviewBorders } from "./accent-borders.ts";
import { installPiShikiTheme, setPiShikiThemeSource } from "./pi-shiki.ts";

export async function installPreviews(pi: ExtensionAPI): Promise<void> {
  // Runs before pi-code-previews' own session_start handler, which initializes Shiki.
  pi.on("session_start", (_event, ctx) => {
    setPiShikiThemeSource(ctx.ui.theme);
  });

  // These defaults are read by pi-code-previews when it is first imported.
  // Set them before the dynamic import so an explicit user setting still wins.
  process.env.CODE_PREVIEW_THEME ??= installPiShikiTheme();
  process.env.CODE_PREVIEW_TOOL_CALL_BACKGROUND ??= "border";

  const { default: codePreviews } = await import("pi-code-previews");
  await codePreviews(pi);

  installAccentPreviewBorders(pi);
}
