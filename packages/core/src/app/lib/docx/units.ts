/** Word's units, from CSS pixels at 96 dpi. */

export function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Twips, 1/20 pt: lengths, spacing, indents. */
export function twips(pixels: number): number {
  return Math.round(pixels * 15);
}

export function twipsFromMm(mm: number): number {
  return Math.round((mm / 25.4) * 1440);
}

/** Half-points: type sizes. */
export function halfPoints(pixels: number): number {
  return Math.max(2, Math.round(pixels * 1.5));
}

/** Points: how far a border stands off from the text. */
export function points(pixels: number): number {
  return Math.round(pixels * 0.75);
}

/** EMU: a picture's extent. */
export function emu(pixels: number): number {
  return Math.round(pixels * 9525);
}

/** Eighths of a point: border widths, within the range Word accepts. */
export function eighths(pixels: number): number {
  return Math.min(96, Math.max(2, Math.round(pixels * 6)));
}
