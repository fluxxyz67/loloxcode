import type { Plugin } from "@opencode/plugin/gui/main"
import { ABLITERATED_DEFAULT_FILENAME } from "@opencode/schema/lolox-kit"
import { roots } from "@opencode/util/global-roots"
import fs from "node:fs/promises"
import path from "node:path"
import { LoloxKit } from "./contract"
import { exec } from "./warp"
import { createWarpRunner, type Cli } from "./warp-run"

/** The marker core reads: its presence turns the appended prompt on for sessions without their own annotation. */
const DEFAULT_MARKER = path.join(roots("opencode").data, ABLITERATED_DEFAULT_FILENAME)

/** How long the app's own service is left alone before its routing is checked against WARP. */
const RECONCILE_DELAY_MS = 8_000

const setup: Plugin.MainSetup = (ctx) => {
  const [binary, ...prefix] = ctx.cli.command
  const cli: Cli = {
    command: ctx.cli.command,
    run: (args, timeoutMs) =>
      binary === undefined
        ? Promise.resolve({ ok: false, stdout: "", stderr: "The opencode CLI is unavailable.", code: "ENOENT" })
        : exec(binary, [...prefix, ...args], timeoutMs),
  }

  const warp = createWarpRunner(
    {
      write: (level, message, detail) => ctx.log.write(level, message, detail),
    },
    cli,
  )

  /** The marker's moment, or an empty result while no marker holds one. */
  const promptDefault = async () => {
    const text = await fs.readFile(DEFAULT_MARKER, "utf8").catch(() => undefined)
    const since = text === undefined ? Number.NaN : Number(text.trim())
    return Number.isFinite(since) ? { since } : {}
  }

  /** Turns the default on, or off by clearing the marker. The moment it is written only tells when. */
  const setPromptDefault = async (since: number | undefined) => {
    if (since === undefined) {
      await fs.rm(DEFAULT_MARKER, { force: true })
      return {}
    }

    await fs.mkdir(path.dirname(DEFAULT_MARKER), { recursive: true })
    await fs.writeFile(DEFAULT_MARKER, String(since), "utf8")
    return { since }
  }

  ctx.provide(LoloxKit, {
    status: (_, caller) => warp.status(caller.signal),
    rotate: (_, caller) => warp.rotate(caller.signal),
    promptDefault: () => promptDefault(),
    setPromptDefault: (input) => setPromptDefault(input.since),
  })

  // The server keeps the proxy only while WARP answers on it. Checking once the app settled keeps a leftover env
  // from breaking the first chat after Cloudflare One Client was stopped, and applies the port after an update.
  const timer = setTimeout(() => {
    const controller = new AbortController()
    void warp
      .reconcile(controller.signal)
      .then((result) => {
        if (result.ok) return
        ctx.log.write("warn", "lolox routing not applied", { message: result.message })
      })
      .catch((cause) => ctx.log.write("warn", "lolox routing check failed", { error: String(cause) }))
  }, RECONCILE_DELAY_MS)
  timer.unref?.()
}

export default setup
