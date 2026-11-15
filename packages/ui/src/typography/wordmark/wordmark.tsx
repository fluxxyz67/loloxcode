import { createUniqueId, For, type ComponentProps } from "solid-js"
import { LETTERS, WORDMARK_HEIGHT, WORDMARK_WIDTH } from "./letters"

/**
 * The "loloXcode" wordmark. `outline` draws it as strokes that `pathLength` can animate (the first-launch splash
 * draws it in), and `fade` masks its lower half.
 */
export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <For each={LETTERS}>
              {(letter) => (
                <>
                  {letter.weak ? (
                    <path pathLength={props.outline ? 1 : undefined} d={letter.weak} />
                  ) : undefined}
                  <path pathLength={props.outline ? 1 : undefined} d={letter.stem} />
                </>
              )}
            </For>
          </g>
        </g>
      </g>
      <defs>
        <mask
          id={mask}
          style="mask-type:alpha"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={WORDMARK_WIDTH}
          height={WORDMARK_HEIGHT}
        >
          <rect width={WORDMARK_WIDTH} height={WORDMARK_HEIGHT} fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient
          id={maskGradient}
          x1={WORDMARK_WIDTH / 2}
          y1={WORDMARK_HEIGHT / 2}
          x2={WORDMARK_WIDTH / 2}
          y2={WORDMARK_HEIGHT}
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
