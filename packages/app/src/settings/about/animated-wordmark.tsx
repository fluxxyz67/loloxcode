import { createEffect, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { GLYPHS, type GlyphKey, WORD, WORDMARK_HEIGHT, WORDMARK_WIDTH } from "@opencode/ui/wordmark/letters"

const target = WORD.map((letter) => letter.key)

/** Glyphs of the same ink width as the slot's own, so a scramble never overlaps its neighbours. */
const choices = (key: GlyphKey) =>
  (Object.keys(GLYPHS) as GlyphKey[]).filter((other) => GLYPHS[other].width === GLYPHS[key].width)

const random = (key: GlyphKey) => {
  const options = choices(key)
  return options[Math.floor(Math.random() * options.length)]
}

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...target] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || prefersReducedMotion()) {
          setState("letters", [...target])

          return
        }

        const starts = target.map(random)
        const settles = target.map(() => 6 + Math.floor(Math.random() * 8))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState("letters", target.map((letter, index) => (tick >= settles[index] ? letter : random(letter))))
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <svg class="settings-about-wordmark" viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`} aria-hidden="true">
      <For each={state.letters}>
        {(key, index) => (
          <g transform={`translate(${WORD[index()].x} 0)`}>
            <Show when={GLYPHS[key].weak}>
              <path class="settings-about-letter-shadow" d={GLYPHS[key].weak} />
            </Show>
            <path d={GLYPHS[key].stem} />
          </g>
        )}
      </For>
    </svg>
  )
}
