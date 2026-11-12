import { For, Show, onMount, type Component } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useTheme } from "@opencode/ui/theme"
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

export const ThemeGallery: Component = () => {
  const theme = useTheme()
  const language = useLanguage()

  const cards = () => {
    const loaded = theme.themes()
    return theme.ids().flatMap((id) => {
      const value = loaded[id]
      return value ? [{ id, name: value.name, theme: value }] : []
    })
  }

  onMount(() => void theme.loadThemes())

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
        data-slot="theme-gallery-grid"
        role="radiogroup"
        aria-label={language.t("settings.appearance.theme.gallery.label")}
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
              tabIndex={card.id === theme.themeId() ? 0 : -1}
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
