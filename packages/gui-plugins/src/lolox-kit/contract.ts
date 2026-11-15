import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

/** The exit Cloudflare reports for this machine, as `cdn-cgi/trace` answers it. */
export const Exit = Schema.Struct({
  ip: Schema.String,
  warp: Schema.String,
  loc: Schema.optional(Schema.String),
})

export const Status = Schema.Struct({
  state: Schema.Literals(["connected", "disconnected", "unknown"]),
  network: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String),
  proxyPort: Schema.optional(Schema.Number),
  exit: Schema.optional(Exit),
})

export const Rotate = Schema.Struct({
  ok: Schema.Boolean,
  previousIP: Schema.optional(Schema.String),
  exitIP: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})

/** The moment the appended prompt's default was switched on, epoch milliseconds; absent while it is off. */
export const PromptDefault = Schema.Struct({
  since: Schema.optional(Schema.Number),
})

/**
 * Everything that needs a process: WARP is driven through `warp-cli`, which a window cannot run and which must
 * outlive any one window, so it lives in main and the composer controls call it over this Ipc. The default switch's
 * marker lives here too: core reads the file main owns.
 */
export const LoloxKit = Ipc.define({
  id: "lolox-kit",
  methods: {
    /** Reads WARP's connection state and the IP Cloudflare sees. */
    status: { output: Status },
    /** Registers a fresh WARP device, reconnects, and waits for a new exit IP. */
    rotate: { output: Rotate },
    /** Reads the marker that turns the appended prompt on for new sessions. */
    promptDefault: { output: PromptDefault },
    /** Writes or clears that marker; core reads it for every session it builds. */
    setPromptDefault: { input: PromptDefault, output: PromptDefault },
  },
})
