import {
  DEFAULT_PROXY_PORT,
  ipKey,
  isProxyMode,
  parseMode,
  parsePort,
  parseStatus,
  parseTrace,
  portOpen,
  run,
  traceViaProxy,
  type Run,
} from "./warp"

const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace"
const TRACE_TIMEOUT_MS = 15_000
const PROXY_TRACE_TIMEOUT_MS = 8_000
/** A cold MASQUE start answers long after the connection reports Connected, so the trace is polled this long. */
const CONNECT_TIMEOUT_MS = 45_000
const POLL_INTERVAL_MS = 1_000
/** Cloudflare throttles rapid `registration new` bursts with 429, so two rotations stay this far apart. */
const ROTATE_COOLDOWN_MS = 10_000
/** The tunnel teardown has to settle before a new registration is accepted, and `delete` returns too early. */
const REGISTRATION_SETTLE_MS = 1_000
/** The app's server needs the proxy in its own environment, which only a restart reads. */
const ROUTING_TIMEOUT_MS = 30_000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The daemon's own last non-empty line, which names the failure far better than an exit code. */
const lastLine = (result: Run) =>
  [...`${result.stdout}\n${result.stderr}`.split(/\r?\n/)].map((line) => line.trim()).filter(Boolean).pop()

/** Where the runner writes what it did; the plugin hands it main's logger. */
export interface Log {
  write(level: "info" | "warn" | "error", message: string, detail?: Record<string, unknown>): void
}

export interface Settings {
  readonly mode?: string
  readonly proxyPort?: number
}

/** What a rotation reports back to the pill: the proven exit, or the reason there is none. */
export interface RotateResult {
  readonly ok: boolean
  readonly previousIP?: string
  readonly exitIP?: string
  readonly message?: string
}

/** The app's CLI, which owns the background service and its settings. */
export interface Cli {
  readonly command: readonly string[]
  run(args: string[], timeoutMs?: number): Promise<Run>
}

/** What routing the server through WARP did: whether the env changed, and what failed when it did. */
export interface RoutingResult {
  readonly ok: boolean
  readonly changed: boolean
  readonly url?: string
  readonly message?: string
}

const PROXY_ENV = ["HTTPS_PROXY", "HTTP_PROXY"] as const
const BYPASS_ENV = "NO_PROXY"
/** Loopback traffic stays direct, or the app could not reach its own server. */
const BYPASS_VALUE = "localhost,127.0.0.1,::1"

/** Everything that drives `warp-cli` and the app's service, split from the plugin so a script can exercise it. */
export const createWarpRunner = (log: Log, cli: Cli) => {
  let lastRotateAt = 0

  /** The mode and local proxy port WARP runs with. `--accept-tos` is what the reference launcher passes to every call. */
  const settings = async (): Promise<Settings> => {
    const result = await run(["--accept-tos", "settings", "list"])
    const text = `${result.stdout}\n${result.stderr}`
    return { mode: parseMode(text), proxyPort: parsePort(text) }
  }

  /**
   * What Cloudflare reports for this machine right now. In proxy mode the trace goes through the local proxy port,
   * which is the only path that proves the exit; a tunnel (or a stopped client) is read directly.
   */
  const trace = async (signal: AbortSignal, configured?: Settings, timeoutMs = TRACE_TIMEOUT_MS) => {
    const active = configured ?? (await settings())

    if (isProxyMode(active.mode)) {
      const port = active.proxyPort ?? DEFAULT_PROXY_PORT
      if (!(await portOpen(port))) return undefined
      const text = await traceViaProxy(port, Math.min(timeoutMs, PROXY_TRACE_TIMEOUT_MS), signal).catch(() => undefined)
      return text === undefined ? undefined : parseTrace(text)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${TRACE_URL}?ts=${Date.now()}`, {
        signal: AbortSignal.any([signal, controller.signal]),
        cache: "no-store",
      })
      return parseTrace(await response.text())
    } finally {
      clearTimeout(timer)
    }
  }

  const status = async (signal: AbortSignal) => {
    const [current, configured] = await Promise.all([run(["--accept-tos", "status"]), settings()])
    const connection = parseStatus(`${current.stdout}\n${current.stderr}`)
    const exit = await trace(signal, configured).catch(() => undefined)
    return {
      state: connection.state,
      network: connection.network,
      mode: configured.mode,
      proxyPort: configured.proxyPort,
      exit:
        exit?.ip === undefined
          ? undefined
          : { ip: exit.ip, warp: exit.warp ?? "off", loc: exit.loc ?? undefined },
    }
  }

  /** Polls `warp-cli status` until it reports the wanted state, or the deadline passes. */
  const waitStatus = async (wanted: "connected" | "disconnected", timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const current = await run(["--accept-tos", "status"], 15_000)
      if (parseStatus(`${current.stdout}\n${current.stderr}`).state === wanted) return true
      await wait(POLL_INTERVAL_MS)
    }
    return false
  }

  /**
   * Drops the current registration and waits until the daemon stops answering `registration show`. `delete` returns
   * before the old device is torn down, and a `registration new` in between fails with "Old registration is still
   * around"; a registration that is gone after the polls counts as removed even when `delete` printed an error.
   */
  const registrationDrop = async () => {
    await run(["--accept-tos", "disconnect"], 30_000)
    await wait(REGISTRATION_SETTLE_MS)
    const removed = await run(["--accept-tos", "registration", "delete"], 30_000)
    if (!removed.ok) log.write("info", "warp registration delete skipped", { detail: lastLine(removed) })

    for (let attempt = 0; attempt < 6; attempt++) {
      const shown = await run(["--accept-tos", "registration", "show"], 15_000)
      if (!shown.ok) return true
      await wait(REGISTRATION_SETTLE_MS)
    }
    log.write("warn", "warp registration still present after delete")
    return false
  }

  /**
   * Creates a registration, retrying once behind a full drop and once after a five second pause: the daemon rejects
   * a bare `registration new` on a half-torn state, and "Old registration is still around" only needs time.
   */
  const registrationNew = async () => {
    const first = await run(["--accept-tos", "registration", "new"], 60_000)
    if (first.ok) return true

    await registrationDrop()
    const second = await run(["--accept-tos", "registration", "new"], 60_000)
    if (second.ok) return true

    await wait(5_000)
    const third = await run(["--accept-tos", "registration", "new"], 60_000)
    if (third.ok) return true

    log.write("error", "warp registration new failed", { detail: lastLine(third) })
    return false
  }

  /**
   * Brings WARP up in WarpProxy mode on the port the app's `HTTP_PROXY` points at: MASQUE protocol, proxy mode, the
   * port, connect, then Connected plus an open port. The mode is never switched to a tunnel: WarpProxy is what this
   * machine runs, and only a proxy survives the app's already-captured environment.
   */
  const warpUp = async (port: number) => {
    await run(["--accept-tos", "disconnect"], 30_000)
    await waitStatus("disconnected", 15_000)

    const steps: [string, string[]][] = [
      ["tunnel protocol set MASQUE", ["tunnel", "protocol", "set", "MASQUE"]],
      ["mode proxy", ["mode", "proxy"]],
      [`proxy port ${port}`, ["proxy", "port", String(port)]],
    ]
    for (const [name, args] of steps) {
      const step = await run(["--accept-tos", ...args], 30_000)
      if (step.ok) continue
      log.write("error", "warp rotate failed", { step: name, detail: lastLine(step) })
      return false
    }

    const connected = await run(["--accept-tos", "connect"], 45_000)
    if (!connected.ok) {
      // Without a registration behind it every later call fails; a clean one and a second connect is the fix.
      const shown = await run(["--accept-tos", "registration", "show"], 15_000)
      if (!shown.ok && !(await registrationNew())) return false
      const retry = await run(["--accept-tos", "connect"], 45_000)
      if (!retry.ok) {
        log.write("error", "warp connect failed", { detail: lastLine(retry) })
        return false
      }
    }

    if (!(await waitStatus("connected", 25_000))) {
      log.write("error", "warp rotate failed", { step: "wait for Connected" })
      return false
    }
    return portOpen(port)
  }

  /**
   * Polls the trace through the proxy port until it reports `warp=on`, the way the reference launcher verifies an
   * exit: a closed port means the client is off, and an answer without `warp=on` is not a usable exit.
   */
  const poll = async (port: number, signal: AbortSignal) => {
    if (!(await portOpen(port))) {
      return {
        ok: false as const,
        message: `Cloudflare One Client is not answering on port ${port}. Start it, then reset the limit again.`,
      }
    }

    const deadline = Date.now() + CONNECT_TIMEOUT_MS
    let answered = false
    while (Date.now() < deadline) {
      if (signal.aborted) return { ok: false as const, message: "cancelled" }

      const text = await traceViaProxy(port, PROXY_TRACE_TIMEOUT_MS, signal).catch(() => undefined)
      if (text !== undefined) {
        answered = true
        const parsed = parseTrace(text)
        if (parsed.ip !== undefined && parsed.warp === "on") return { ok: true as const, exitIP: parsed.ip }
      }
      await wait(POLL_INTERVAL_MS)
    }

    return {
      ok: false as const,
      message: answered
        ? `WARP answered on port ${port} but never reported warp=on within ${CONNECT_TIMEOUT_MS / 1000}s.`
        : `Nothing answered through port ${port} within ${CONNECT_TIMEOUT_MS / 1000}s. Check Cloudflare One Client.`,
    }
  }

  /** The URL a service command printed, which is where the restarted server answers. */
  const printedURL = (result: Run) =>
    `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^https?:\/\//.test(line))

  /** The service's proxy env, as the CLI stores it. An empty object means none. */
  const serviceEnv = async (): Promise<{ ok: true; env: Record<string, string> } | { ok: false; message: string }> => {
    const result = await cli.run(["service", "get", "env"], 20_000)
    if (!result.ok) {
      return { ok: false, message: lastLine(result) ?? "The app's service settings could not be read." }
    }

    try {
      const parsed: unknown = JSON.parse(result.stdout)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
      return {
        ok: true,
        env: Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      }
    } catch {
      return { ok: false, message: "The app's service settings did not decode." }
    }
  }

  /** Writes one env key, or removes it when `value` is undefined. A failure is reported, not thrown. */
  const applyEnv = async (key: string, value: string | undefined) => {
    const args = value === undefined ? ["service", "unset", "env", key] : ["service", "set", "env", key, value]
    const result = await cli.run(args, 90_000)
    if (result.ok) return undefined

    const detail = lastLine(result)
    log.write("error", "lolox routing update failed", { args, detail })
    return `${key}: ${detail ?? `exit ${result.code ?? "unknown"}`}`
  }

  /** Restarts the background service, which is the only way a new env reaches the running server. */
  const restartService = async (): Promise<{ ok: true; url?: string } | { ok: false; message: string }> => {
    const first = await cli.run(["service", "restart"], 120_000)
    if (first.ok) return { ok: true, url: printedURL(first) }

    // The desktop's own reconnect can race the restart; a second call adopts or starts the winner.
    await wait(2_000)
    const second = await cli.run(["service", "restart"], 120_000)
    if (second.ok) return { ok: true, url: printedURL(second) }

    log.write("error", "lolox service restart failed", { detail: lastLine(second) ?? lastLine(first) })
    return { ok: false, message: lastLine(second) ?? "The app's server did not restart." }
  }

  /** Polls the restarted server until it answers; a 401 still proves the process is up. */
  const reachable = async (url: string, signal: AbortSignal) => {
    const deadline = Date.now() + ROUTING_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (signal.aborted) return false

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2_000)
      try {
        const response = await fetch(new URL("/api/info", url), {
          signal: AbortSignal.any([signal, controller.signal]),
          cache: "no-store",
        })
        if (response.status === 200 || response.status === 401) return true
      } catch {
        // Still starting.
      } finally {
        clearTimeout(timer)
      }
      await wait(500)
    }
    return false
  }

  /**
   * Points the app's server at WARP's proxy port, or back at a direct connection when `proxyPort` is absent. A change
   * is written through the CLI, which stops the service; one restart brings it back with the new env. `force` restarts
   * even when the env already matches, because a fresh registration dropped every proxy connection the server held.
   */
  const ensureRouting = async (input: {
    proxyPort?: number
    force?: boolean
    signal: AbortSignal
  }): Promise<RoutingResult> => {
    const proxy = input.proxyPort === undefined ? undefined : `http://127.0.0.1:${input.proxyPort}`
    const desired: Record<string, string | undefined> = {
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      [BYPASS_ENV]: input.proxyPort === undefined ? undefined : BYPASS_VALUE,
    }

    const current = await serviceEnv()
    if (!current.ok) return { ok: false, changed: false, message: current.message }

    let touched = false
    let failure: string | undefined
    for (const key of [...PROXY_ENV, BYPASS_ENV]) {
      const want = desired[key]
      if (current.env[key] === want) continue
      touched = true
      const applied = await applyEnv(key, want)
      if (applied !== undefined) failure ??= applied
    }

    if (!touched && !input.force) return { ok: true, changed: false }

    const restarted = await restartService()
    if (!restarted.ok) return { ok: false, changed: touched, message: restarted.message }

    const url = restarted.url ?? printedURL(await cli.run(["service", "status"], 20_000))
    if (url === undefined) {
      return { ok: false, changed: touched, message: "The app's server did not report its address after the restart." }
    }
    if (!(await reachable(url, input.signal))) {
      return { ok: false, changed: touched, url, message: "The app's server did not answer after the restart." }
    }

    log.write("info", "lolox routing applied", { proxyPort: input.proxyPort, changed: touched })
    if (failure !== undefined) return { ok: false, changed: touched, url, message: failure }
    return { ok: true, changed: touched, url }
  }

  /**
   * Brings the server's routing in line with what WARP is doing now: through the proxy port while WarpProxy is up,
   * direct otherwise. Called once at startup so a leftover proxy never outlives the client that answered on it.
   */
  const reconcile = async (signal: AbortSignal): Promise<RoutingResult> => {
    const alive = await run(["--accept-tos", "status"], 15_000)
    if (!alive.ok) return ensureRouting({ signal })

    const configured = await settings()
    if (!isProxyMode(configured.mode)) return ensureRouting({ signal })

    const port = configured.proxyPort ?? DEFAULT_PROXY_PORT
    if (!(await portOpen(port))) return ensureRouting({ signal })
    return ensureRouting({ proxyPort: port, signal })
  }

  /** One full rotation: fresh registration, WarpProxy up, then a new exit proven through the proxy. */
  const attempt = async (
    signal: AbortSignal,
    port: number,
    previousIP: string | undefined,
  ): Promise<RotateResult> => {
    await registrationDrop()
    if (!(await registrationNew())) {
      return {
        ok: false,
        previousIP,
        message: "Cloudflare refused a new registration. Restart Cloudflare One Client, then reset the limit again.",
      }
    }

    if (!(await warpUp(port))) {
      return {
        ok: false,
        previousIP,
        message: "WARP did not come back up in proxy mode. Check Cloudflare One Client, then reset the limit again.",
      }
    }

    const polled = await poll(port, signal)
    if (!polled.ok) return { ok: false, previousIP, message: polled.message }

    const exitIP = polled.exitIP
    if (ipKey(exitIP) === ipKey(previousIP)) {
      return {
        ok: false,
        previousIP,
        exitIP,
        message: "Cloudflare handed out the same exit IP. Reset again in a moment.",
      }
    }
    return { ok: true, previousIP, exitIP }
  }

  const rotate = async (signal: AbortSignal): Promise<RotateResult> => {
    const remaining = ROTATE_COOLDOWN_MS - (Date.now() - lastRotateAt)
    if (remaining > 0) await wait(remaining)

    // With the client stopped there is no proxy and no daemon: report that instead of burning a minute in timeouts.
    const alive = await run(["--accept-tos", "status"], 15_000)
    if (!alive.ok) {
      const message =
        alive.code === "ENOENT"
          ? "warp-cli was not found. Install Cloudflare One Client, then reset the limit again."
          : "Cloudflare One Client is not running. Start it, then reset the limit again."
      log.write("error", "warp rotate failed", { message, detail: lastLine(alive) })
      return { ok: false, message }
    }

    const configured = await settings()
    const port = configured.proxyPort ?? DEFAULT_PROXY_PORT
    const before = await trace(signal, configured).catch(() => undefined)
    const previousIP = before?.ip

    /**
     * A rotation replaced every connection the server held through the proxy, so it is restarted even when the env
     * already matches. A routing failure is the rotation's failure: the exit changed, but chats still leave directly.
     */
    const route = async (result: RotateResult): Promise<RotateResult> => {
      if (!result.ok || signal.aborted) return result

      const routing = await ensureRouting({ proxyPort: port, force: true, signal })
      if (routing.ok) return result

      log.write("error", "lolox routing failed after rotate", { message: routing.message })
      return {
        ...result,
        ok: false,
        message: routing.message ?? "The app's server could not be routed through the new exit.",
      }
    }

    const first = await attempt(signal, port, previousIP)
    if (first.ok || signal.aborted) {
      lastRotateAt = Date.now()
      return route(first)
    }

    // A retry takes a new registration too: reconnecting alone keeps the same exit IP.
    await wait(ROTATE_COOLDOWN_MS)
    const second = await attempt(signal, port, first.exitIP ?? previousIP)
    lastRotateAt = Date.now()
    return route(second)
  }

  return { settings, trace, status, rotate, ensureRouting, reconcile }
}
