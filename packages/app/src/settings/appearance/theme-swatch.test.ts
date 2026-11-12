import { describe, expect, test } from "bun:test"
import type { DesktopTheme } from "@opencode/ui/theme"
import { themeSwatch } from "./theme-swatch"

const paletteTheme = {
  name: "Fixture",
  id: "fixture",
  light: {
    palette: {
      neutral: "#fbf1c7", ink: "#3c3836", primary: "#076678", accent: "#9d0006",
      success: "#79740e", warning: "#b57614", error: "#9d0006", info: "#8f3f71",
    },
    overrides: {
      "syntax-keyword": "#9d0006", "syntax-string": "#79740e", "syntax-primitive": "#076678",
      "syntax-constant": "#8f3f71", "syntax-comment": "#928374",
    },
  },
  dark: {
    palette: {
      neutral: "#282828", ink: "#ebdbb2", primary: "#83a598", accent: "#fb4934",
      success: "#b8bb26", warning: "#fabd2f", error: "#fb4934", info: "#d3869b",
    },
    overrides: { "syntax-comment": "var(--not-a-color)" },
  },
} satisfies DesktopTheme

describe("themeSwatch", () => {
  test("maps the palette and syntax overrides for one mode", () => {
    expect(themeSwatch(paletteTheme, "light")).toEqual({
      background: "#fbf1c7", text: "#3c3836", primary: "#076678", accent: "#9d0006",
      code: ["#9d0006", "#79740e", "#076678", "#8f3f71", "#928374"],
    })
  })

  test("falls back to the palette when an override is a variable", () => {
    expect(themeSwatch(paletteTheme, "dark").code[4]).toBe("#ebdbb2")
  })

  test("uses primary when the palette has no accent", () => {
    const { accent, ...palette } = paletteTheme.light.palette
    const theme = { ...paletteTheme, light: { palette } } satisfies DesktopTheme

    expect(themeSwatch(theme, "light").accent).toBe("#076678")
  })

  test("keeps a seeds theme's primary and info identity", () => {
    const theme = {
      name: "Seeds",
      id: "seeds",
      light: { seeds: { neutral: "#fbf1c7", primary: "#076678", success: "#79740e", warning: "#b57614", error: "#9d0006", info: "#8f3f71", interactive: "#076678", diffAdd: "#79740e", diffDelete: "#9d0006" } },
      dark: { seeds: { neutral: "#282828", primary: "#83a598", success: "#b8bb26", warning: "#fabd2f", error: "#fb4934", info: "#d3869b", interactive: "#83a598", diffAdd: "#b8bb26", diffDelete: "#fb4934" } },
    } satisfies DesktopTheme

    const light = themeSwatch(theme, "light")

    expect(light.primary).toBe("#076678")
    expect(light.accent).toBe("#8f3f71")
    expect(light.code.slice(0, 4)).toEqual(["#8f3f71", "#79740e", "#076678", "#8f3f71"])
    expect(light.code[4]).toMatch(/^#[0-9a-f]{6}$/i)

    for (const color of [light, themeSwatch(theme, "dark")].flatMap((s) => [s.background, s.text, s.primary, s.accent, ...s.code]))
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
