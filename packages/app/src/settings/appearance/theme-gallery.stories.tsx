import { createSignal, Show } from "solid-js"
import { ThemeGallery } from "./theme-gallery"

export default {
  title: "App/Settings/Theme gallery",
  id: "app-theme-gallery",
  parameters: {
    layout: "fullscreen",
  },
}

export const Gallery = {
  render: () => (
    <div class="w-[560px] bg-v2-background-bg-base p-6">
      <ThemeGallery />
    </div>
  ),
}

export const Unmount = {
  render: () => {
    const [visible, setVisible] = createSignal(true)

    return (
      <div class="w-[560px] bg-v2-background-bg-base p-6">
        <button data-action="unmount-gallery" type="button" onClick={() => setVisible((value) => !value)}>
          Toggle gallery
        </button>
        <Show when={visible()}>
          <ThemeGallery />
        </Show>
      </div>
    )
  },
}
