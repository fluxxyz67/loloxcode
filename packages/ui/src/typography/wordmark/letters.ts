/**
 * The "loloXcode" wordmark, in the same blocky letterform as the original logo: 24 unit round letters with 6 unit
 * stems, a 6 unit ascender, and a bottom-centre pivot at `cx`. Letters sit 6 units apart by ink, so the narrow `l`
 * takes less room than the rest.
 *
 * One source for every place the wordmark appears: the new-session wordmark and its pin board, the first-launch
 * splash, the About page scramble, the error screen's logo, and the server connect screen.
 */

export const WORDMARK_WIDTH = 228

export const WORDMARK_HEIGHT = 42

/** The wordmark sits on a 3 unit pin grid, which is what the new-session pin board and brick breaker are built on. */
export const PIN_COLUMNS = 76

export const PIN_ROWS = 14

/**
 * Each glyph's own box, starting at x 0: `weak` is the counter shadow drawn under it, `stem` the letter itself.
 * `width` is the ink width, so the layout below can space letters by ink instead of by a uniform cell.
 */
export const GLYPHS = {
  l: { width: 6, weak: "", stem: "M0 0H6V36H0Z" },
  o: { width: 24, weak: "M6 18H18V30H6Z", stem: "M0 6H24V36H0ZM18 12H6V30H18Z" },
  x: { width: 24, weak: "", stem: "M0 6H8L24 36H16ZM16 6H24L8 36H0Z" },
  c: { width: 24, weak: "M6 18H24V30H6Z", stem: "M24 12H6V30H24V36H0V6H24Z" },
  d: { width: 24, weak: "M6 18H18V30H6Z", stem: "M0 6H18V36H0ZM18 12H6V30H18ZM18 0H24V36H18Z" },
  e: { width: 24, weak: "M6 24H24V30H6Z", stem: "M24 24H6V30H24V36H0V6H24ZM18 12H6V18H18Z" },
} as const

export type GlyphKey = keyof typeof GLYPHS

/** The word, with the ink of every letter 6 units from the next. */
export const WORD: readonly { readonly key: GlyphKey; readonly x: number }[] = [
  { key: "l", x: 0 },
  { key: "o", x: 12 },
  { key: "l", x: 42 },
  { key: "o", x: 54 },
  { key: "x", x: 84 },
  { key: "c", x: 114 },
  { key: "o", x: 144 },
  { key: "d", x: 174 },
  { key: "e", x: 204 },
]

/**
 * Translates a glyph's path by `dx`, so it can be placed from its own box. The glyphs use absolute `M`, `L`, `H` and
 * `V` commands only, so each command's x coordinates move and its y coordinates stay. Rewriting the command's own
 * numbers, rather than every adjacent pair, is what keeps `H`/`V` (single-coordinate commands) intact.
 */
const shift = (d: string, dx: number) => {
  if (dx === 0) return d
  return d.replace(/([MLHV])([^MLHVZ]*)/g, (_, command: string, args: string) => {
    const values = (args.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (command === "V") return `V${values.join(" ")}`
    return `${command}${values.map((value, index) => (index % 2 === 0 ? value + dx : value)).join(" ")}`
  })
}

/**
 * The letters of the wordmark in place: `cx` is the bottom-centre pivot, `weak` the counter shadow, `stem` the letter.
 * `fill` splits the wordmark in half, the way "open" and "code" are split in the original logo.
 */
export const LETTERS = WORD.map(({ key, x }, index) => ({
  key,
  cx: x + GLYPHS[key].width / 2,
  weak: GLYPHS[key].weak ? shift(GLYPHS[key].weak, x) : "",
  stem: shift(GLYPHS[key].stem, x),
  fill: index < 4 ? "var(--icon-base)" : "var(--icon-strong-base)",
}))
