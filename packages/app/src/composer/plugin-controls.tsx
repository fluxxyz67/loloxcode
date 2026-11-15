import { createMemo, For, Show } from "solid-js"
import { ComposerControl, type MountedSession } from "@opencode/plugin/gui"
import { useOptionalPluginHost } from "@/runtime/plugin/host"
import { Contribution } from "@/runtime/plugin/render"

/**
 * Plugin controls in the composer's footer, beside the model chip and the effort picker. A component without a plugin
 * host, such as a story, renders nothing.
 */
export function ComposerPluginControls(props: { session?: MountedSession }) {
  const host = useOptionalPluginHost()

  if (!host) return null

  const items = createMemo(() =>
    host.items(ComposerControl).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)),
  )

  // Do not destructure: `session` reads the prop again on every routing.
  const input = {
    get session() {
      return props.session
    },
  }

  return (
    <Show when={items().length > 0}>
      <For each={items()}>
        {(item) => (
          <Show when={item.value.show(input)}>
            <Contribution plugin={item.plugin}>{() => item.value.render(input)}</Contribution>
          </Show>
        )}
      </For>
    </Show>
  )
}
