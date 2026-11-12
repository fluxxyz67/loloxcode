import { For, Show, batch, createEffect, createSignal, onCleanup, onMount, type Component } from "solid-js"
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

const Miniature: Component = () => (
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
    <Miniature />
  </span>
)

const PREVIEW_DELAY_MS = 80

type PreviewSource = "pointer" | "focus"

export const ThemeGallery: Component = () => {
  const theme = useTheme()
  const language = useLanguage()
  let grid: HTMLDivElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { id: string; source: PreviewSource } | undefined
  const cached = new Map<string, { id: string; name: string; theme: DesktopTheme }>()
  const [selectedId, setSelectedId] = createSignal(theme.themeId())
  const [tabStopId, setTabStopId] = createSignal(theme.themeId())
  const [previewed, setPreviewed] = createSignal<{ id: string; source: PreviewSource }>()

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
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }

  const clearPending = (source: PreviewSource) => {
    if (pending?.source === source) clearTimer()
  }

  const cancelActivePreview = () => {
    if (!previewed()) return

    batch(() => {
      setPreviewed(undefined)
      theme.cancelPreview()
    })
  }

  const schedulePreview = (id: string, source: PreviewSource) => {
    clearTimer()

    const current = previewed()

    // Re-entering the card that is already previewed keeps it, instead of cancelling and restoring the committed theme.
    if (current?.id === id) return

    if (id === selectedId()) {
      cancelActivePreview()

      return
    }

    pending = { id, source }
    timer = setTimeout(() => {
      timer = undefined
      const next = pending

      pending = undefined

      if (!next) return

      batch(() => {
        theme.previewTheme(next.id)
        setPreviewed(next)
      })
    }, PREVIEW_DELAY_MS)
  }

  const commit = (id: string) => {
    clearTimer()

    batch(() => {
      setPreviewed(undefined)
      setSelectedId(id)
      setTabStopId(id)
      theme.setTheme(id)
    })
  }

  const tabStop = () => {
    const items = cards()
    const stop = tabStopId()

    return items.some((card) => card.id === stop) ? stop : items[0]?.id
  }

  // Keeps the selection and tab stop on the committed theme; `theme.themeId()` also follows a preview, so it cannot
  // drive either until the preview ends.
  createEffect(() => {
    const shown = theme.themeId()
    const current = previewed()

    if (current && current.id === shown) return

    if (current) setPreviewed(undefined)

    setSelectedId(shown)

    if (!grid?.contains(document.activeElement)) setTabStopId(shown)
  })

  onMount(() => void theme.loadThemes())

  onCleanup(() => {
    clearTimer()
    cancelActivePreview()
  })

  return (
    <section data-component="theme-gallery" data-action="settings-theme">
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
          clearPending("pointer")

          if (previewed()?.source === "pointer") cancelActivePreview()
        }}
        onFocusOut={(event) => {
          const related = event.relatedTarget

          if (related instanceof Node && grid?.contains(related)) return

          clearPending("focus")

          if (previewed()?.source === "focus") cancelActivePreview()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clearTimer()
            cancelActivePreview()

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
              aria-checked={card.id === selectedId()}
              aria-label={card.name}
              data-slot="theme-card"
              data-theme-id={card.id}
              tabIndex={card.id === tabStop() ? 0 : -1}
              onPointerEnter={() => schedulePreview(card.id, "pointer")}
              onFocus={() => {
                setTabStopId(card.id)
                schedulePreview(card.id, "focus")
              }}
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
                <Show when={card.id === selectedId()}>
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
