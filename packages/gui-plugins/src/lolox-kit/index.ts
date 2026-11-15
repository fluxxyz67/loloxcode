import { Plugin, Store } from "@opencode/plugin/gui"
import { Schema } from "effect"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    /**
     * Whether a free-limit failure rotates the exit IP and sends `continue` by itself. On by default: this build's
     * free tier is metered by the exit, so the recovery is the expected behavior, and the pill can turn it off.
     */
    autoContinue: Store.global(Schema.Struct({ on: Schema.Boolean }), { on: true }),
  },
  i18n: { en },
})
