/**
 * pi-copium
 *
 * something to smoke while you burn tokens.
 *
 * Components:
 * - working messages: shimmering message shown while the agent works
 * - statusline: compact one-line footer
 * - sticky models: persists the selected model as the global default
 *
 * Shimmer effect ported from pi-topping by Eric Sison
 * https://github.com/underactive/pi-topping
 * Copyright (c) 2026 Eric Sison — MIT License
 *
 * Working message list from dmmulroy's whimsical extension
 * https://github.com/dmmulroy/.dotfiles
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installStatusline } from "./statusline/index.ts";
import { installStickyModels } from "./sticky-models/index.ts";
import { installWorkingMessages } from "./working-messages/index.ts";

export default function (pi: ExtensionAPI) {
  installWorkingMessages(pi);
  installStatusline(pi);
  installStickyModels(pi);
}
