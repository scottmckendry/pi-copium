/**
 * pi-copium — helper functions
 */

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// --- MASCOT (from pi-buddy, MIT, apat183) ---
export function faceLines(eyes: string): string[] {
  return ["╭─ π ─╮", `│ ${eyes} │`, "╰─┬─┬─╯"];
}
