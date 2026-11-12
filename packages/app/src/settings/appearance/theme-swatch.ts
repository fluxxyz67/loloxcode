import type { DesktopTheme } from "@opencode/ui/theme"
import { resolveThemeVariant } from "@opencode/ui/theme/resolve"

export type ThemeSwatch = {
  background: string
  text: string
  primary: string
  accent: string
  code: readonly [string, string, string, string, string] // keyword, string, primitive, constant, comment
}

function pick(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.startsWith("#"))
}

export function themeSwatch(theme: DesktopTheme, mode: "light" | "dark"): ThemeSwatch {
  const variant = theme[mode]
  const palette = variant.palette
  const tokens = palette ? undefined : resolveThemeVariant(variant, mode === "dark")
  const overrides = variant.overrides ?? {}

  const background = pick(palette?.neutral, tokens?.["background-base"])
  const text = pick(palette?.ink, tokens?.["text-base"], background) ?? "#000000"
  const primary = pick(palette?.primary, tokens?.["button-primary-base"], text) ?? text
  const accent = pick(palette?.accent, palette?.primary, tokens?.["syntax-keyword"], text) ?? text

  const keyword = pick(overrides["syntax-keyword"], accent) ?? accent
  const string = pick(overrides["syntax-string"], palette?.success, tokens?.["syntax-string"], primary) ?? primary
  const primitive = pick(overrides["syntax-primitive"], palette?.primary, tokens?.["syntax-primitive"], primary) ?? primary
  const constant = pick(overrides["syntax-constant"], palette?.info, tokens?.["syntax-constant"], primary) ?? primary
  const comment = pick(overrides["syntax-comment"], palette?.ink, tokens?.["syntax-comment"], text) ?? text

  return {
    background: background ?? text,
    text,
    primary,
    accent,
    code: [keyword, string, primitive, constant, comment],
  }
}
