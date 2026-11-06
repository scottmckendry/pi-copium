/**
 * Generate the preview Shiki theme from the active Pi theme.
 *
 * pi-code-previews resolves the Shiki theme name when it first initializes Shiki, which happens
 * inside its own `session_start` handler. Pi's active theme is only available from `ctx` at
 * `session_start`, so pi-copium registers a lazy theme loader here and fills in the source theme
 * from an earlier `session_start` handler.
 */

import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import { colorToHex } from "@earendil-works/pi-tui";
import { bundledThemes, bundledThemesInfo, type ThemeRegistration } from "shiki";

export const PI_SHIKI_THEME = "pi-theme";

let source: Theme | undefined;

/** Called from pi-copium's session_start handler, before pi-code-previews initializes Shiki. */
export function setPiShikiThemeSource(theme: Theme): void {
  source = theme;
}

interface TokenColor {
  scope: string | string[];
  settings: { foreground?: string; fontStyle?: string };
}

function generateTokenColors(theme: Theme): TokenColor[] {
  const hex = (token: ThemeColor | ThemeBg) => colorToHex(theme.colors[token]);

  return [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: hex("syntaxComment"), fontStyle: "italic" },
    },
    {
      scope: ["keyword", "storage", "storage.modifier"],
      settings: { foreground: hex("syntaxKeyword") },
    },
    { scope: ["keyword.operator"], settings: { foreground: hex("syntaxOperator") } },
    {
      scope: ["string", "punctuation.definition.string", "string.regexp", "string.regex"],
      settings: { foreground: hex("syntaxString") },
    },
    { scope: ["constant.numeric"], settings: { foreground: hex("syntaxNumber") } },
    {
      scope: ["constant", "support.constant", "variable.language", "boolean"],
      settings: { foreground: hex("syntaxNumber") },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "entity.name.method",
      ],
      settings: { foreground: hex("syntaxFunction") },
    },
    {
      scope: [
        "entity.name.type",
        "support.type",
        "support.class",
        "entity.name.class",
        "storage.type.primitive",
      ],
      settings: { foreground: hex("syntaxType") },
    },
    {
      scope: [
        "variable",
        "variable.parameter",
        "variable.other",
        "meta.object-literal.key",
        "variable.other.property",
        "support.variable.property",
      ],
      settings: { foreground: hex("syntaxVariable") },
    },
    {
      scope: ["entity.name.tag", "entity.name.tag.html"],
      settings: { foreground: hex("syntaxKeyword") },
    },
    { scope: ["entity.other.attribute-name"], settings: { foreground: hex("syntaxType") } },
    {
      scope: ["punctuation", "meta.brace"],
      settings: { foreground: hex("syntaxPunctuation") },
    },
    {
      scope: ["markup.heading", "markup.heading.1"],
      settings: { foreground: hex("mdHeading"), fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.2", "markup.heading.3"],
      settings: { foreground: hex("mdLink"), fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.4", "markup.heading.5", "markup.heading.6"],
      settings: { foreground: hex("mdListBullet"), fontStyle: "bold" },
    },
    { scope: ["markup.inserted"], settings: { foreground: hex("toolDiffAdded") } },
    { scope: ["markup.deleted"], settings: { foreground: hex("toolDiffRemoved") } },
    { scope: ["markup.changed"], settings: { foreground: hex("warning") } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.underline"], settings: { fontStyle: "underline" } },
    { scope: ["markup.strikethrough"], settings: { fontStyle: "strikethrough" } },
    { scope: ["markup.raw", "markup.inline.raw"], settings: { foreground: hex("mdCode") } },
    { scope: ["invalid", "invalid.illegal"], settings: { foreground: hex("error") } },
    {
      scope: ["entity.name.namespace", "entity.name.module", "entity.name.label"],
      settings: { foreground: hex("syntaxType") },
    },
  ];
}

export function createPiShikiTheme(theme: Theme): ThemeRegistration {
  const hex = (token: ThemeColor | ThemeBg) => colorToHex(theme.colors[token]);

  return {
    name: PI_SHIKI_THEME,
    displayName: `Pi (${theme.name ?? "active theme"})`,
    type: theme.appearance,
    colors: {
      "editor.background": hex("userMessageBg"),
      "editor.foreground": hex("text"),
      "editor.lineHighlightBackground": hex("selectedBg"),
      "editor.selectionBackground": hex("selectedBg"),
      foreground: hex("text"),
      "terminal.ansiBlack": hex("userMessageBg"),
      "terminal.ansiRed": hex("error"),
      "terminal.ansiGreen": hex("success"),
      "terminal.ansiYellow": hex("warning"),
      "terminal.ansiBlue": hex("mdLink"),
      "terminal.ansiMagenta": hex("syntaxKeyword"),
      "terminal.ansiCyan": hex("mdCode"),
      "terminal.ansiWhite": hex("text"),
    },
    tokenColors: generateTokenColors(theme),
  };
}

/**
 * Fallback used if Shiki initializes before a Pi theme is available (for example, from a command
 * before the first session starts).
 */
const FALLBACK_THEME: ThemeRegistration = {
  name: PI_SHIKI_THEME,
  displayName: "Pi",
  type: "dark",
  colors: { "editor.background": "#16181a", "editor.foreground": "#ebecef" },
  tokenColors: [{ scope: ["comment"], settings: { foreground: "#7b8496", fontStyle: "italic" } }],
};

/**
 * Register the generated theme with Shiki so pi-code-previews can resolve it by name.
 * Must run before pi-code-previews is imported.
 */
export function installPiShikiTheme(): string {
  const themes = bundledThemes as unknown as Record<string, () => Promise<ThemeRegistration>>;
  if (!(PI_SHIKI_THEME in themes)) {
    themes[PI_SHIKI_THEME] = async () => (source ? createPiShikiTheme(source) : FALLBACK_THEME);
  }

  try {
    const info = bundledThemesInfo as Array<{
      id: string;
      displayName: string;
      type: "dark" | "light";
    }>;
    if (!info.some((theme) => theme.id === PI_SHIKI_THEME)) {
      // The theme type is read when pi-code-previews is imported, before the active Pi theme is
      // available. Previews mostly use this to tune contrast for light themes; default to dark
      // and let the generated theme carry the real `type` for Shiki itself.
      info.push({ id: PI_SHIKI_THEME, displayName: "Pi", type: "dark" });
    }
  } catch {
    // Older Shiki versions may expose a read-only theme list; the theme still loads.
  }

  return PI_SHIKI_THEME;
}
