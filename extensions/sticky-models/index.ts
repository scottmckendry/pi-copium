/**
 * pi-copium — sticky models
 *
 * Picking or cycling to a model saves it as the global default.
 */

import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function installStickyModels(pi: ExtensionAPI): void {
  pi.on("model_select", async (event, ctx) => {
    // Restoring a session model should not overwrite the global default.
    if (event.source === "restore") return;

    const settings = SettingsManager.create(ctx.cwd);
    settings.setDefaultModelAndProvider(event.model.provider, event.model.id);
    await settings.flush();
  });
}
