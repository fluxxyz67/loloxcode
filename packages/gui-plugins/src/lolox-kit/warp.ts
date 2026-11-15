import { execFile } from "node:child_process"
import net from "node:net"
import tls from "node:tls"

/** The WARP CLI; `LOLOX_WARP_BIN` points at an install that is not on PATH. */
const BIN = process.env.LOLOX_WARP_BIN?.trim() || "warp-cli"

/** The local port WarpProxy listens on unless `settings list` names another one. */
export const DEFAULT_PROXY_PORT = 40_000

export interface Run {
  readonly ok: boolean
  readonly stdout: string
  readonly stderr: string
  /** `ENOENT` when the binary is missing, `ETIMEDOUT` when the call was killed, `EXIT` for a non-zero exit. */
  readonly code?: string
}

type Failure = NodeJS.ErrnoException & { readonly killed?: boolean }

const failureCode = (failure: Failure | null) => {
  if (failure === null) return undefined
  if (failure.killed === true) return "ETIMEDOUT"
  return typeof failure.code === "string" ? failure.code : "EXIT"
}

/** Runs one executable once. A timeout or a non-zero exit is reported, never thrown. */
export const exec = (binary: string, args: string[], timeoutMs = 30_000): Promise<Run> =>
  new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const failure = error as Failure | null
        const code = failureCode(failure)
        const result: Run = { ok: error === null, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }
        resolve(code === undefined ? result : { ...result, code })
      },
    )
  })

/** Runs `warp-cli` once. A timeout or a non-zero exit is reported, never thrown. */
export const run = (args: string[], timeoutMs = 30_000): Promise<Run> => exec(BIN, args, timeoutMs)

export type State = "connected" | "disconnected" | "unknown"

/**
 * `warp-cli status` prints `Status update: Connected` with a `Network:` line, or `Status update: Disconnected` with
 * a `Reason:`. "Connected" is a substring of "Disconnected", so the match keeps the colon.
 */
export const parseStatus = (text: string): { state: State; network?: string } => {
  const network = /Network:\s*(.+)/i.exec(text)?.[1]?.trim()
  const state: State = /Status update:\s*Connected/i.test(text)
    ? "connected"
    : /Status update:\s*Disconnected/i.test(text)
      ? "disconnected"
      : "unknown"
  return network === undefined ? { state } : { state, network }
}

/** `settings list` reports the mode as `Mode: WarpProxy on port 40000`, or just `Mode: Warp`. */
export const parseMode = (text: string) => /Mode:\s*(.+)/i.exec(text)?.[1]?.trim()

export const parsePort = (text: string) => {
  const port = /on port (\d+)/i.exec(text)?.[1]
  return port === undefined ? undefined : Number(port)
}

/** WarpProxy is the mode this machine runs: the app reaches WARP through `127.0.0.1:<port>`, not a tunnel. */
export const isProxyMode = (mode: string | undefined) => mode !== undefined && /^warpproxy\b/i.test(mode.trim())

/** `cdn-cgi/trace` answers one `key=value` per line. */
export const parseTrace = (text: string) => {
  const entries: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=")
    if (index <= 0) continue
    entries[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return entries
}

/**
 * One registration can hand out several addresses of the same IPv6 /64, so a new exit is only new when its /64
 * changed. IPv4 compares whole. `undefined` when there is nothing to compare.
 */
export const ipKey = (ip: string | undefined) => {
  if (ip === undefined) return undefined
  if (!ip.includes(":")) return ip
  // An embedded IPv4 (`::ffff:1.2.3.4`) is not hex, and comparing it as a /64 would hide the address.
  if (ip.includes(".")) return ip

  const [head, tail] = ip.split("::")
  const left = head === undefined || head === "" ? [] : head.split(":")
  const right = tail === undefined || tail === "" ? [] : tail.split(":")
  const groups = [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right].slice(0, 4)
  const numbers = groups.map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN))
  return numbers.some((number) => Number.isNaN(number)) ? ip : numbers.join(":")
}

/** Whether anything accepts a TCP connection on the port, so a closed proxy is told apart from a slow handshake. */
export const portOpen = (port: number, timeoutMs = 1_200): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port })
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(open)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
  })

/** The body of a raw HTTP/1.1 response, decoded when it arrives chunked. */
export const parseHttpBody = (response: string) => {
  const split = response.indexOf("\r\n\r\n")
  if (split < 0) return undefined
  const head = response.slice(0, split).toLowerCase()
  const body = response.slice(split + 4)
  if (!head.includes("transfer-encoding: chunked")) return body

  let text = ""
  let index = 0
  while (index < body.length) {
    const end = body.indexOf("\r\n", index)
    if (end < 0) break
    const size = Number.parseInt(body.slice(index, end).trim(), 16)
    if (!Number.isFinite(size) || size <= 0) break
    text += body.slice(end + 2, end + 2 + size)
    index = end + 2 + size + 2
  }
  return text
}

/**
 * Reads `cdn-cgi/trace` through the local WarpProxy port with a CONNECT tunnel, which is how the app reaches WARP.
 * `undefined` when the proxy, the CONNECT, or the TLS handshake never answers.
 */
export const traceViaProxy = (port: number, timeoutMs = 8_000, signal?: AbortSignal): Promise<string | undefined> =>
  new Promise((resolve) => {
    const host = "www.cloudflare.com"
    let settled = false
    let proxy: net.Socket | undefined
    let secure: tls.TLSSocket | undefined

    const finish = (body?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      secure?.destroy()
      proxy?.destroy()
      resolve(body)
    }
    const abort = () => finish()

    const timer = setTimeout(() => finish(), timeoutMs)
    signal?.addEventListener("abort", abort)

    proxy = net.connect({ host: "127.0.0.1", port })
    proxy.once("error", () => finish())
    proxy.once("connect", () => {
      proxy?.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`)
    })

    let head = ""
    const onHead = (chunk: Buffer) => {
      head += chunk.toString("latin1")
      if (!head.includes("\r\n\r\n")) return
      proxy?.off("data", onHead)
      if (!/^HTTP\/1\.[01] 200\b/.test(head)) return finish()

      const socket = tls.connect({ socket: proxy, servername: host }, () => {
        socket.write(
          `GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${host}\r\nAccept: */*\r\nUser-Agent: curl/8\r\nConnection: close\r\n\r\n`,
        )
      })
      secure = socket
      let body = ""
      socket.on("data", (data: Buffer) => {
        body += data.toString("utf8")
      })
      socket.once("error", () => finish())
      socket.once("close", () => finish(parseHttpBody(body)))
    }
    proxy.on("data", onHead)
    if (signal?.aborted) finish()
  })
