/**
 * pi-copium — TUI header component
 *
 * Mascot concept from pi-buddy by apat183 (MIT)
 */

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { seededShuffle } from "./helpers.ts";

const EYE_ANIMS: string[][] = [
  ["· ·", "• ·", "· •", "• •"],
  ["◉ ◉", "◉ •", "◉ ◉", "• ◉"],
  ["⌕ ⌕", "• ⌕", "⌕ •", "◉ ◉"],
  ["> _", "_ <", "> _", "• •"],
  ["• •", "· •", "• ·", "• •"],
];

const ANIM_COLORS: ThemeColor[] = [
  "accent",
  "border",
  "success",
  "warning",
  "error",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
];

const MAX_INNER_WIDTH = 66;
const MIN_WIDTH = 28;
const FRAME_MS = 120;
const CYCLES_PER_SEGMENT = 2;
const BLINK_FRAMES = 12;
const BLINK_EYES = [
  "— —",
  "— —",
  "— —",
  "• •",
  "• •",
  "• •",
  "— —",
  "— —",
  "— —",
  "• •",
  "• •",
  "• •",
];

const shuffle = <T>(arr: T[]): T[] =>
  seededShuffle(arr, Math.floor(Math.random() * 0xffffffff));

// --- LAUNCH HEADER ---
// one-shot animated banner with the pi-buddy mascot + copium vibes

export class CopiumHeader implements Component {
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly tagline: string;
  private readonly modelName: string;
  private readonly eyes: string[][];
  private readonly eyeColors: ThemeColor[];
  private readonly segmentFrames: number;
  private readonly totalFrames: number;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(tui: TUI, theme: Theme, tagline: string, modelName: string) {
    this.tui = tui;
    this.theme = theme;
    this.tagline = tagline;
    this.modelName = modelName;

    // pick 3 random eye anims + 3 random colours
    this.eyes = shuffle(EYE_ANIMS).slice(0, 3);
    this.eyeColors = shuffle(ANIM_COLORS).slice(0, 3);
    this.segmentFrames = this.eyes.reduce(
      (sum, e) => sum + e.length * CYCLES_PER_SEGMENT,
      0,
    );
    this.totalFrames = this.segmentFrames + BLINK_FRAMES;

    this.timer = setInterval(() => {
      this.frame += 1;
      this.tui.requestRender();
      if (this.frame >= this.totalFrames) this.stop();
    }, FRAME_MS);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  render(width: number): string[] {
    if (width < MIN_WIDTH) {
      return [
        truncateToWidth(
          this.theme.fg("accent", this.theme.bold("π COPIUM")),
          width,
        ),
        truncateToWidth(this.theme.fg("dim", `pi ${VERSION}`), width),
      ];
    }

    const cap = Math.min(MAX_INNER_WIDTH, width - 2);
    const border = (t: string) => this.theme.fg("borderMuted", t);
    const paint = (t: string, c: ThemeColor) => this.theme.fg(c, t);

    // find current segment + local frame
    let eyes = "• •";
    let eyeColor: ThemeColor = "accent";
    if (this.frame < this.segmentFrames) {
      let offset = 0;
      for (const [i, seg] of this.eyes.entries()) {
        const segFrames = seg.length * CYCLES_PER_SEGMENT;
        if (this.frame < offset + segFrames) {
          const local = this.frame - offset;
          eyes = seg[local % seg.length] ?? "• •";
          eyeColor = this.eyeColors[i] ?? "accent";
          break;
        }
        offset += segFrames;
      }
    } else if (this.frame < this.totalFrames) {
      const blinkLocal = this.frame - this.segmentFrames;
      eyes = BLINK_EYES[blinkLocal % BLINK_EYES.length] ?? "• •";
    }

    const cwd = process.cwd().split("/").pop() || process.cwd();

    // build content rows, measure widest, fit border to content
    const contentRows = [
      `  ${paint("╭─ π ─╮", "accent")}   ${this.theme.fg("accent", this.theme.bold("π COPIUM"))}`,
      `  ${paint("│ ", "accent")}${paint(eyes, eyeColor)}${paint(" │", "accent")}   ${this.theme.fg("muted", this.tagline)}`,
      `  ${paint("╰─┬─┬─╯", "accent")}   ${this.theme.fg("text", this.modelName)}${this.theme.fg("dim", ` · ${VERSION}`)}`,
      this.theme.fg("dim", `  ${cwd}  •  tokens go brrr`),
    ];
    const maxVisible = Math.max(...contentRows.map((r) => visibleWidth(r)));
    const boxWidth = Math.min(cap, maxVisible + 2);

    const row = (content: string): string => {
      const padding = " ".repeat(Math.max(0, boxWidth - visibleWidth(content)));
      return truncateToWidth(
        `${border("│")}${content}${padding}${border("│")}`,
        width,
        "",
      );
    };

    return [
      border(`╭${"─".repeat(boxWidth)}╮`),
      ...contentRows.map(row),
      border(`╰${"─".repeat(boxWidth)}╯`),
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
