import { createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionMetadata } from "@opencode/client/promise"
import {
  ComposerControl,
  ComposerPill,
  NewSessionPill,
  createKeyed,
  type ComposerControlProps,
  type ComposerPillView,
  type MountedSession,
  type Plugin,
  type ServerRef,
  type SessionRef,
} from "@opencode/plugin/gui"
import { ABLITERATED_KEY } from "@opencode/schema/lolox-kit"
import { Tooltip } from "@opencode/ui/tooltip"
import { showToast } from "@opencode/ui/toast"
import { LoloxKit } from "./contract"
import type definition from "./index"

/** The credential the free tier is metered by; removing it is what a reset costs. */
const INTEGRATION = "opencode"

/** Kept as `const` so the literals stay narrow enough for `ComposerPillTone` and `IconName`. */
const TONE = { success: "success", warning: "warning" } as const
const ROTATE_ICON = "outline-rotate-clockwise" as const

/** The refusals that mean the free allowance ran out, not a provider or a network failing. */
const LIMIT_ERRORS = new Set(["provider.free-limit", "provider.go-limit"])
/** How many rotations auto continue spends on one session before it gives up, and over what window. */
const AUTO_MAX = 5
const AUTO_WINDOW_MS = 30 * 60_000

/** A failure, as a toast's description. */
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

/** The key one server's session keeps in the recovery maps, since ids are only unique within a server. */
const sessionKey = (server: string, id: string) => `${server}\n${id}`

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface LimitFailure {
  readonly id: string
  readonly created: number
  readonly data: { readonly sessionID: string; readonly error: { readonly type: string } }
}

interface RotateOutcome {
  readonly ok: boolean
  readonly exitIP?: string
  readonly message?: string
  /** True when a metered credential was removed, false when that failed, undefined when there was none to remove. */
  readonly removed?: boolean
}

/**
 * Two controls above and inside the composer. The switch in the composer's footer appends the bundled abliterated
 * prompt to one session's instructions, which core reads from the session's metadata; on the new-session screen it sets
 * the default that sessions without their own annotation follow. The pill resets the free limit: it removes the metered
 * credential and rotates the WARP exit IP, which only the main process can do.
 */
const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return

  const kit = ctx.use(LoloxKit)
  // One entry per session key: whether the appended prompt reaches that session. A missing entry is "not read yet".
  const [enabled, setEnabled] = createStore<Record<string, boolean | undefined>>({})
  // Bumped on every write, so a read that started before it cannot undo it.
  const writes = new Map<string, number>()
  const [rotating, setRotating] = createSignal(false)
  const [exitIP, setExitIP] = createSignal<string>()
  // When the appended prompt was made the default, epoch milliseconds; undefined while it is off.
  const [defaultSince, setDefaultSince] = createSignal<number>()
  const [settingDefault, setSettingDefault] = createSignal(false)

  // Auto continue: a free-limit failure rotates the exit and sends `continue` by itself.
  const autoContinue = ctx.stores.autoContinue
  const [autoRunning, setAutoRunning] = createSignal(false)
  // Failures recorded before this window attached are history, not something to resume.
  const startedAt = Date.now()
  const seen = new Set<string>()
  const attempts = new Map<string, { count: number; first: number }>()
  const queue: { key: string; server: ServerRef; sessionID: string }[] = []
  const queued = new Set<string>()
  let draining = false

  const autoOn = () => autoContinue.value.on

  const client = (serverID: string | undefined) => (serverID === undefined ? undefined : ctx.servers.get(serverID)?.client)

  /** The app's own server, which the new-session screen talks to before any session exists. */
  const builtinServer = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((server) => server?.builtin)

  /** Every open session on a connected server, by key. */
  const openSessions = () => {
    const open = new Map<string, SessionRef>()
    for (const ref of ctx.sessions.list()) open.set(ref.key, ref)
    const current = ctx.sessions.current()
    if (current) open.set(current.key, current)
    return [...open.values()].filter((ref) => !ref.pending && ref.server.connected)
  }

  /**
   * Whether the prompt reaches a session: its own annotation first, else the desktop's default. The default is the
   * marker's presence, so the switch means the same thing before and inside a session.
   */
  const reaches = (metadata: SessionMetadata | undefined) => {
    const own = metadata?.[ABLITERATED_KEY]
    if (own === true || own === false) return own
    return defaultSince() !== undefined
  }

  const read = async (ref: SessionRef, signal?: AbortSignal) => {
    const session = client(ref.server.id)
    if (!session) return

    const stamp = writes.get(ref.key) ?? 0
    try {
      const info = await session.session.get({ sessionID: ref.id }, { signal })
      if ((writes.get(ref.key) ?? 0) !== stamp) return
      setEnabled(ref.key, reaches(info.metadata))
    } catch {
      // A session that vanished, or a server that is reconnecting: the next attach reads it again.
    }
  }

  const setPrompt = async (ref: MountedSession, next: boolean) => {
    const session = client(ref.server.id)
    if (!session) return

    const stamp = (writes.get(ref.key) ?? 0) + 1
    const previous = enabled[ref.key]
    writes.set(ref.key, stamp)
    setEnabled(ref.key, next)
    try {
      // `session.update` replaces the whole object, so start from the session's own copy. Writing the annotation even
      // when it matches the default is what makes this session's choice outrank the default from then on.
      const info = await session.session.get({ sessionID: ref.id })
      const metadata: SessionMetadata = { ...(info.metadata ?? {}) }
      metadata[ABLITERATED_KEY] = next
      if ((writes.get(ref.key) ?? 0) !== stamp) return
      await session.session.update({ sessionID: ref.id, metadata })
    } catch (cause) {
      if ((writes.get(ref.key) ?? 0) === stamp) setEnabled(ref.key, previous)
      showToast({ variant: "error", title: ctx.t("prompt.failed"), description: message(cause) })
    }
  }

  /** Turns the default on, or off, then refreshes every open session that follows it. */
  const setDefault = async (next: boolean) => {
    if (settingDefault()) return

    const live = kit()
    if (live.status !== "active") return

    setSettingDefault(true)
    try {
      const result = await live.value.setPromptDefault({ since: next ? Date.now() : undefined })
      setDefaultSince(result.since)
      for (const ref of openSessions()) void read(ref)
    } catch (cause) {
      showToast({ variant: "error", title: ctx.t("prompt.defaultFailed"), description: message(cause) })
    } finally {
      setSettingDefault(false)
    }
  }

  const togglePrompt = (session: MountedSession | undefined, next: boolean) => {
    if (session) return void setPrompt(session, next)
    void setDefault(next)
  }

  /**
   * One rotation, serialized: a manual reset and an automatic recovery never overlap, and a caller that arrives while
   * another rotation runs waits for it. Removal of the metered credential only happens for a manual reset.
   */
  let rotations: Promise<void> = Promise.resolve()
  const rotateCore = (serverID: string | undefined, wipe: boolean): Promise<RotateOutcome | undefined> => {
    const run = async (): Promise<RotateOutcome | undefined> => {
      const session = client(serverID)
      const live = kit()
      if (!session || live.status !== "active") return undefined

      setRotating(true)
      let removed: boolean | undefined
      try {
        if (wipe) {
          const credentials = await session.credential.list()
          const metered = credentials.filter((entry) => entry.integrationID === INTEGRATION)
          if (metered.length > 0) removed = true
          for (const entry of metered) {
            try {
              await session.credential.remove({ credentialID: entry.id })
            } catch {
              removed = false
            }
          }
        }

        const current = kit()
        if (current.status !== "active") return undefined
        const result = await current.value.rotate()
        if (result.ok) setExitIP(result.exitIP)
        return { ok: result.ok, exitIP: result.exitIP, message: result.message, removed }
      } catch (cause) {
        return { ok: false, message: message(cause), removed }
      } finally {
        setRotating(false)
      }
    }

    const task = rotations.then(run, run)
    rotations = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }

  const rotate = async (serverID: string | undefined, wipe: boolean) => {
    if (rotating()) return

    const result = await rotateCore(serverID, wipe)
    if (result === undefined) return
    if (!result.ok) {
      showToast({ variant: "error", title: ctx.t("limit.failed"), description: result.message })
      return
    }

    const ip = result.exitIP
    const detail = ip === undefined ? undefined : ctx.t("limit.rotateDoneDetail", { ip })
    // "Sign in again" only when a credential was actually there to remove; free usage without one is IP-bound alone.
    const done =
      wipe && result.removed !== undefined
        ? ctx.t(ip === undefined ? "limit.resetDoneNoIP" : "limit.resetDoneDetail", ip === undefined ? undefined : { ip })
        : detail
    showToast({
      variant: "success",
      title: ctx.t(wipe ? "limit.resetDone" : "limit.rotateDone"),
      description: [result.removed === false ? ctx.t("limit.credentialKept") : undefined, done].filter(Boolean).join(" ") || undefined,
    })
  }

  /**
   * Auto continue: a top-level session whose turn hit the free allowance gets a new exit IP, then `continue`. A second
   * failure is the same path again, until the cap keeps one session from rotating forever. Subagents are skipped; the
   * parent's own failure event is the one worth resuming.
   */
  const recover = async (server: ServerRef, sessionID: string) => {
    if (!autoOn()) return

    const info = await server.client.session.get({ sessionID }).catch(() => undefined)
    if (!info || info.parentID) return

    const key = sessionKey(server.id, sessionID)
    const now = Date.now()
    const previous = attempts.get(key)
    const current =
      previous !== undefined && now - previous.first <= AUTO_WINDOW_MS
        ? { count: previous.count + 1, first: previous.first }
        : { count: 1, first: now }
    attempts.set(key, current)

    if (current.count > AUTO_MAX) {
      showToast({
        variant: "error",
        title: ctx.t("limit.autoCap"),
        description: ctx.t("limit.autoCapDetail", { count: AUTO_MAX }),
      })
      return
    }

    setAutoRunning(true)
    try {
      const result = await rotateCore(server.id, false)
      if (result === undefined) return
      if (!result.ok) {
        showToast({ variant: "error", title: ctx.t("limit.autoRotateFailed"), description: result.message })
        return
      }

      const ip = result.exitIP
      showToast({
        variant: "success",
        title: ctx.t(current.count > 1 ? "limit.autoStill" : "limit.autoStart"),
        description:
          current.count > 1
            ? ctx.t("limit.autoStillDetail", { count: current.count, max: AUTO_MAX })
            : ip === undefined
              ? undefined
              : ctx.t("limit.autoStartDetail", { ip }),
      })

      try {
        // The rotation restarted the server, so the stream is still reconnecting; a prompt sent into that gap fails.
        const deadline = Date.now() + 20_000
        while (!server.connected && Date.now() < deadline) await wait(250)
        await server.client.session.prompt({ sessionID, text: "continue" })
      } catch (cause) {
        showToast({ variant: "error", title: ctx.t("limit.autoContinueFailed"), description: message(cause) })
      }
    } finally {
      setAutoRunning(false)
    }
  }

  /** One recovery at a time; a failure that arrives while another runs waits its turn. */
  const enqueue = (server: ServerRef, sessionID: string) => {
    const key = sessionKey(server.id, sessionID)
    if (queued.has(key)) return
    queued.add(key)
    queue.push({ key, server, sessionID })
    void drain()
  }

  const drain = async () => {
    if (draining) return
    draining = true
    try {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        queued.delete(item.key)
        await recover(item.server, item.sessionID)
      }
    } finally {
      draining = false
    }
  }

  const onFailure = (server: ServerRef, event: LimitFailure) => {
    if (!autoOn()) return
    if (!LIMIT_ERRORS.has(event.data.error.type)) return
    // A durable event replays after a reconnect; only recent failures from this window's lifetime are new.
    if (event.created < startedAt || Date.now() - event.created > 5 * 60_000) return

    const key = sessionKey(server.id, event.id)
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 500) seen.clear()
    enqueue(server, event.data.sessionID)
  }

  /** The free-limit pill, for a session's composer or for the new-session screen. */
  const limitView = (serverID: () => string | undefined): ComposerPillView | undefined => {
    if (kit().status !== "active") return
    if (rotating() || autoRunning())
      return {
        label: ctx.t(autoRunning() ? "limit.autoBusy" : "limit.busy"),
        icon: ROTATE_ICON,
        tone: TONE.warning,
        title: ctx.t("limit.title"),
      }

    const ip = exitIP()
    const auto = autoOn()
    return {
      label: ctx.t("limit.label"),
      icon: ROTATE_ICON,
      title: ctx.t("limit.title"),
      rows: [
        {
          id: "auto",
          label: ctx.t("limit.auto"),
          detail: ctx.t(auto ? "limit.autoOn" : "limit.autoOff"),
          icon: auto ? ("check" as const) : ("circle-x" as const),
          tone: auto ? TONE.success : undefined,
          run: () => {
            autoContinue.set({ on: !auto })
            if (auto) {
              attempts.clear()
              queue.length = 0
              queued.clear()
            }
          },
        },
        {
          id: "reset",
          label: ctx.t("limit.reset"),
          detail: ctx.t("limit.resetDetail"),
          icon: "circle-x" as const,
          tone: TONE.warning,
          run: () => void rotate(serverID(), true),
        },
        {
          id: "rotate",
          label: ctx.t("limit.rotate"),
          detail: ip,
          icon: "refresh" as const,
          run: () => void rotate(serverID(), false),
        },
      ],
    }
  }

  // The exit IP the pill offers, and the default that core applies, read once each time main's side (re)starts.
  createKeyed(kit, (value) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    void value
      .status({ signal: controller.signal })
      .then((status) => setExitIP(status.exit?.ip))
      .catch(() => undefined)
    void value
      .promptDefault()
      .then((result) => setDefaultSince(result.since))
      .catch(() => undefined)
  })

  // Reads the toggle of every open session: on attach, when another tab opens, and when a server reconnects.
  createKeyed(
    openSessions,
    (refs) => {
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      for (const ref of refs) void read(ref, controller.signal)
    },
    { equals: (previous, next) => previous.length === next.length && previous.every((ref, i) => ref.key === next[i]?.key) },
  )

  /**
   * Auto continue follows every connected server. A success clears the session's streak, so a later limit starts the
   * cap over; a reconnecting server resubscribes here and replays what it stored while the stream was down.
   */
  createKeyed(
    () =>
      ctx.servers
        .list()
        .map((id) => ctx.servers.get(id))
        .filter((server): server is ServerRef => server !== undefined && server.connected),
    (servers) => {
      const offs = servers.map((server) => {
        const failed = server.data.on("session.execution.failed", (event) => onFailure(server, event))
        const succeeded = server.data.on("session.execution.succeeded", (event) =>
          attempts.delete(sessionKey(server.id, event.data.sessionID)),
        )
        return () => {
          failed()
          succeeded()
        }
      })
      onCleanup(() => offs.forEach((off) => off()))
    },
    { equals: (previous, next) => previous.length === next.length && previous.every((server, i) => server.id === next[i]?.id) },
  )

  ctx.add(ComposerControl, {
    id: "abliterated",
    order: 10,
    // Without a session the switch is the default; with one it is that session's own choice.
    show: () => kit().status === "active",
    render: (input: ComposerControlProps) => {
      const on = () => {
        const session = input.session
        if (!session) return defaultSince() !== undefined
        return enabled[session.key]
      }
      const title = () =>
        input.session
          ? ctx.t(on() === true ? "prompt.on" : "prompt.off")
          : ctx.t(on() === true ? "prompt.defaultOn" : "prompt.defaultOff")

      return (
        <Tooltip placement="top" value={title()}>
          <PromptSwitch
            label={ctx.t("prompt.label")}
            title={title()}
            checked={on() ?? defaultSince() !== undefined}
            busy={on() === undefined}
            onToggle={(next) => togglePrompt(input.session, next)}
          />
        </Tooltip>
      )
    },
  })

  ctx.add(ComposerPill, {
    id: "limit",
    order: 20,
    show: (input) => limitView(() => input.session.server.id),
  })

  ctx.add(NewSessionPill, {
    id: "limit",
    order: 20,
    show: () => limitView(() => builtinServer()?.id),
  })
}

/**
 * The composer's on/off switch for the appended prompt: a ghost row control, sized like the model and effort chips,
 * with the app's compact switch track at its end.
 */
function PromptSwitch(props: {
  label: string
  title: string
  checked: boolean
  /** The session's own choice is still being read. */
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      data-action="composer-abliterated"
      aria-checked={props.checked}
      aria-label={props.title}
      aria-busy={props.busy || undefined}
      disabled={props.busy}
      class="flex h-7 shrink-0 items-center gap-1.5 rounded-sm ps-1.5 pe-1.5 text-[13px] font-[440] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none disabled:opacity-50"
      onClick={() => props.onToggle(!props.checked)}
    >
      <span dir="auto" class="truncate">
        {props.label}
      </span>
      <span
        aria-hidden="true"
        class="relative flex h-4 w-6 shrink-0 items-center rounded-[4px] transition-colors"
        classList={{
          "bg-v2-background-bg-accent": props.checked,
          "bg-v2-background-bg-layer-04": !props.checked,
        }}
      >
        <span
          class="absolute size-3 rounded-[2px] shadow-[var(--v2-elevation-elements)] transition-transform"
          classList={{
            "translate-x-[10px] bg-[var(--v2-grey-300)]": props.checked,
            "translate-x-[2px] bg-[var(--v2-grey-200)]": !props.checked,
          }}
        />
      </span>
    </button>
  )
}

export default setup
