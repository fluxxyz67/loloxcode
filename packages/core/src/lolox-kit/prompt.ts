export * as LoloxKit from "./prompt.js"

import path from "path"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode/util/fs-util"
import {
  ABLITERATED_DEFAULT_FILENAME as DEFAULT_FILENAME,
  ABLITERATED_FILENAME as FILENAME,
  ABLITERATED_KEY as METADATA_KEY,
} from "@opencode/schema/lolox-kit"
import { Instructions } from "../instructions/index.js"
import BUNDLED from "./abliterated.md" with { type: "text" }

/**
 * The session annotation that carries the toggle: `ABLITERATED_KEY`, shared with the desktop switch that writes it. Set
 * it to true and the appended prompt joins the session's instruction sources; set it to false and it does not, even
 * while the desktop's default is on. Leave it out and the default decides.
 */
export { DEFAULT_FILENAME, FILENAME, METADATA_KEY }

export const KEY = Instructions.Key.make("lolox/abliterated")

/** The session's own annotation: true or false when the user set it on that session, undefined when they did not. */
export const annotation = (metadata: Readonly<Record<string, Schema.Json>> | undefined): boolean | undefined =>
  metadata?.[METADATA_KEY] === true ? true : metadata?.[METADATA_KEY] === false ? false : undefined

/** Whether a session's metadata turns the appended prompt on, ignoring the desktop's default. */
export const enabled = (metadata: Readonly<Record<string, Schema.Json>> | undefined): boolean =>
  annotation(metadata) === true

/** The user's file when it exists and holds text, the bundled copy otherwise. */
const load = (fs: FSUtil.Interface, data: string) =>
  fs.readFileStringSafe(path.join(data, FILENAME)).pipe(
    Effect.map((text) => (text !== undefined && text.trim().length > 0 ? text : BUNDLED)),
    Effect.orElseSucceed(() => BUNDLED),
  )

/** Whether the desktop's marker is present: its presence means the prompt on for sessions without their own annotation. */
const defaultOn = (fs: FSUtil.Interface, data: string) =>
  fs.readFileStringSafe(path.join(data, DEFAULT_FILENAME)).pipe(
    Effect.map((text) => text !== undefined && text.trim().length > 0),
    Effect.orElseSucceed(() => false),
  )

/**
 * The instruction source for one session: its `read` re-evaluates the toggle, so switching it on
 * mid-session renders the prompt as an instruction update instead of requiring a new session. A session the user
 * never annotated follows the desktop's default: the marker's presence, so the switch means the same thing on the
 * new-session screen and inside a session.
 */
export const source = (input: {
  readonly fs: FSUtil.Interface
  readonly data: string
  readonly metadata: Readonly<Record<string, Schema.Json>> | undefined
}): Instructions.List =>
  Instructions.make({
    key: KEY,
    codec: Schema.toCodecJson(Schema.String),
    read: Effect.gen(function* () {
      const own = annotation(input.metadata)
      if (own === true) return yield* load(input.fs, input.data)
      if (own === false) return Instructions.removed
      if (!(yield* defaultOn(input.fs, input.data))) return Instructions.removed
      return yield* load(input.fs, input.data)
    }),
    render: {
      initial: (text) => text,
      changed: (_previous, text) => text,
      removed: () =>
        "The additional lolox instructions are no longer active. Return to the harness's default behaviour.",
    },
  })
