/**
 * pi-copium — TUI header component
 *
 * Mascot concept from pi-buddy by apat183 (MIT)
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import { faceLines } from "./helpers.ts";

// --- LAUNCH HEADER ---
// one-shot animated banner with the pi-buddy mascot + copium vibes

export class CopiumHeader implements Component {
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly tagline: string;
  private readonly modelName: string;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(tui: TUI, theme: Theme, tagline: string, modelName: string) {
    this.tui = tui;
    this.theme = theme;
    this.tagline = tagline;
    this.modelName = modelName;
    // animate for 16 frames then freeze
    this.timer = setInterval(() => {
      this.frame += 1;
      this.tui.requestRender();
      if (this.frame >= 16) this.stop();
    }, 120);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  render(width: number): string[] {
    if (width < 28) {
      return [
        truncateToWidth(
          this.theme.fg("accent", this.theme.bold("π copium")),
          width,
        ),
        truncateToWidth(this.theme.fg("dim", `pi ${VERSION}`), width),
      ];
    }

    const border = (t: string) => this.theme.fg("borderMuted", t);
    const accentToken = (
      ["accent", "borderAccent", "thinkingHigh", "borderAccent"] as const
    )[Math.floor(this.frame / 2) % 4];
    const mascot = (t: string) => this.theme.fg(accentToken, t);
    // blink every 6 frames
    const eyes = this.frame % 6 === 4 ? "— —" : "• •";
    const face = faceLines(eyes);
    const cwd = process.cwd().split("/").pop() || process.cwd();

    const rows = [
      `${mascot(`  ${face[0]}`)}   ${this.theme.fg("accent", this.theme.bold("π COPIUM"))}`,
      `${mascot(`  ${face[1]}`)}   ${this.theme.fg("muted", this.tagline)}`,
      `${mascot(`  ${face[2]}`)}   ${this.theme.fg("text", this.modelName)}${this.theme.fg("dim", ` · pi ${VERSION}`)}`,
      this.theme.fg("dim", `  ${cwd}  •  tokens go brrr`),
    ];
    const contentWidth = Math.max(...rows.map(visibleWidth));
    const innerWidth = Math.min(contentWidth + 1, width - 2);

    const row = (content: string): string => {
      const padding = " ".repeat(
        Math.max(0, innerWidth - visibleWidth(content)),
      );
      return truncateToWidth(
        `${border("│")}${content}${padding}${border("│")}`,
        width,
        "",
      );
    };

    return [
      border(`╭${"─".repeat(innerWidth)}╮`),
      ...rows.map(row),
      border(`╰${"─".repeat(innerWidth)}╯`),
      "",
    ].map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {
    this.tui.requestRender();
  }

  dispose(): void {
    this.stop();
  }
}
