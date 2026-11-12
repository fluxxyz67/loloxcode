import { For, Show, onCleanup, onMount, type Component } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useTheme, type DesktopTheme } from "@opencode/ui/theme"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { themeSwatch, type ThemeSwatch } from "./theme-swatch"
import "@/settings/settings.css"
import "./theme-gallery.css"

function swatchStyle(swatch: ThemeSwatch) {
  return [
    `--tg-background:${swatch.background}`,
    `--tg-text:${swatch.text}`,
    `--tg-primary:${swatch.primary}`,
    `--tg-accent:${swatch.accent}`,
    ...swatch.code.map((color, index) => `--tg-code-${index}:${color}`),
  ].join(";")
}

const Miniature: Component<{ swatch: ThemeSwatch }> = (props) => (
  <span data-slot="theme-card-mini">
    <span data-slot="theme-card-dots">
      <i />
      <i />
      <i />
    </span>
    <span data-slot="theme-card-chip-row">
      <i data-slot="theme-card-chip" />
      <i data-slot="theme-card-accent" />
    </span>
    <span data-slot="theme-card-code">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  </span>
)

const Half: Component<{ mode: "light" | "dark"; swatch: ThemeSwatch }> = (props) => (
  <span data-slot="theme-card-half" data-mode={props.mode} style={swatchStyle(props.swatch)}>
    <Miniature swatch={props.swatch} />
  </span>
)

const PREVIEW_DELAY_MS = 80

export const ThemeGallery: Component = () => {
  const theme = useTheme()
  const language = useLanguage()
  let grid: HTMLDivElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const cached = new Map<string, { id: string; name: string; theme: DesktopTheme }>()

  const cards = () => {
    const loaded = theme.themes()
    const live = new Set<string>()

    const result = theme.ids().flatMap((id) => {
      const value = loaded[id]

      if (!value) return []

      live.add(id)
      const existing = cached.get(id)

      if (existing && existing.theme === value && existing.name === value.name) return [existing]

      const card = { id, name: value.name, theme: value }
      cached.set(id, card)

      return [card]
    })

    for (const id of cached.keys()) if (!live.has(id)) cached.delete(id)

    return result
  }

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const schedulePreview = (id: string) => {
    clearTimer()

    if (id === theme.themeId()) {
      theme.cancelPreview()

      return
    }

    timer = setTimeout(() => {
      timer = undefined
      theme.previewTheme(id)
    }, PREVIEW_DELAY_MS)
  }

  const commit = (id: string) => {
    clearTimer()
    theme.setTheme(id)
    theme.commitPreview()
  }

  const tabStop = () => {
    const items = cards()
    const selected = theme.themeId()

    return items.some((card) => card.id === selected) ? selected : items[0]?.id
  }

  onMount(() => void theme.loadThemes())

  onCleanup(() => {
    clearTimer()
    theme.cancelPreview()
  })

  return (
    <section data-component="theme-gallery">
      <div data-slot="theme-gallery-header">
        <h3 data-slot="theme-gallery-title">{language.t("settings.general.row.theme.title")}</h3>
        <p data-slot="theme-gallery-description">
          {language.t("settings.general.row.theme.description")}{" "}
          <ExternalLink class="settings-link" href="https://opencode.ai/docs/themes">
            {language.t("common.learnMore")}
          </ExternalLink>
        </p>
      </div>

      <div
        ref={grid}
        data-slot="theme-gallery-grid"
        role="radiogroup"
        aria-label={language.t("settings.appearance.theme.gallery.label")}
        onPointerLeave={() => {
          clearTimer()

          if (!grid?.contains(document.activeElement)) theme.cancelPreview()
        }}
        onFocusOut={(event) => {
          const related = event.relatedTarget

          if (related instanceof Node && grid?.contains(related)) return

          clearTimer()
          theme.cancelPreview()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clearTimer()
            theme.cancelPreview()

            return
          }

          const items = cards()
          const focused = document.activeElement
          const focusedId = focused instanceof HTMLElement ? focused.dataset.themeId : undefined
          const index = items.findIndex((card) => card.id === focusedId)

          const target =
            event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? index - 1
              : event.key === "ArrowRight" || event.key === "ArrowDown"
                ? index + 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : undefined

          if (target === undefined) return
          event.preventDefault()
          const id = items[Math.min(Math.max(target, 0), items.length - 1)]?.id

          if (id) grid?.querySelector<HTMLElement>(`[data-theme-id="${CSS.escape(id)}"]`)?.focus()
        }}
      >
        <For each={cards()}>
          {(card) => (
            <button
              type="button"
              role="radio"
              aria-checked={card.id === theme.themeId()}
              aria-label={card.name}
              data-slot="theme-card"
              data-theme-id={card.id}
              tabIndex={card.id === tabStop() ? 0 : -1}
              onPointerEnter={() => schedulePreview(card.id)}
              onFocus={() => schedulePreview(card.id)}
              onClick={() => commit(card.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                commit(card.id)
              }}
            >
              <span data-slot="theme-card-preview">
                <Half mode="light" swatch={themeSwatch(card.theme, "light")} />
                <Half mode="dark" swatch={themeSwatch(card.theme, "dark")} />
              </span>
              <span data-slot="theme-card-footer">
                <span data-slot="theme-card-name">{card.name}</span>
                <Show when={card.id === theme.themeId()}>
                  <span data-slot="theme-card-check">
                    <Icon name="check" size="small" />
                  </span>
                </Show>
              </span>
            </button>
          )}
        </For>
      </div>

      <p data-slot="theme-gallery-hint">{language.t("settings.appearance.theme.gallery.hint")}</p>
    </section>
  )
}
