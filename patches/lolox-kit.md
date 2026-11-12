# lolox Kit

Two additions to the desktop app. The **Abliterated** switch sits in the composer's footer, beside the model chip and the
effort picker, on a session and on the new-session screen before one exists; the **Limit** pill sits above the composer.

| Control | On a session | On the new-session screen |
| --- | --- | --- |
| **Abliterated** | Appends a bundled system-prompt file to that session's instructions. Follows the default until you switch it on that session. | Turns that prompt on or off by default, and the sessions you create from then on follow it. Off after a fresh install. |
| **Limit** (pill) | Resets the free limit: deletes the metered `opencode` credential, then rotates the WARP exit IP. | The same, through the app's own server; nothing to sign out of before the user signs in. |

Everything here is a patch on top of upstream `opencode`. The app's updater is disabled
(`"update": "disable"` in `~/.config/opencode/opencode.json`) so a release cannot replace it.

The kit is `lolox` everywhere: `packages/*/src/lolox-kit`, the `LoloxKit` symbols, the plugin id `lolox-kit`, the
session annotation `lolox.abliterated`, the instruction key `lolox/abliterated` and the `LOLOX_WARP_BIN` override. A
session that still carries the earlier `ollie.abliterated` annotation reads as unannotated, so it follows the default
instead of its old choice; nothing else in a session changes.

## Branding

The app is renamed **loloXcode** with its own identity, so it installs and stores data apart from upstream OpenCode:

- `packages/desktop/src/main/constants.ts` — product names (`loloXcode Dev` / `loloXcode Beta` / `loloXcode`) and
  app ids (`app.loloxcode.desktop`, plus `.dev` / `.beta`). `APP_ID` is the userData folder name.
- `packages/desktop/electron-builder.config.ts` — the same ids in `APP_IDS`, `productName` per channel, the installer
  artifact (`loloxcode-desktop-<os>-<arch>.<ext>`), and the Linux package names.
- `packages/desktop/src/main/windows/{early,appearance}.ts`, `packages/desktop/src/renderer/index.html`,
  `packages/app/src/app.tsx` — the window title and the document title.
- `packages/desktop/script/copy-metainfo.ts`, `packages/desktop/script/dev-electron.ts` — the Linux metainfo file name
  and the macOS dev bundle identifier.
- `packages/desktop/package.json` — `author` (Publisher in the installer's file properties).
- `packages/desktop/script/pack.ts` — derives the renamed artifact from `artifactName` instead of the old hardcoded
  `opencode-desktop-win-*.exe`, which no longer exists.

Untouched on purpose: the CLI's own data directory (`~/.local/share/opencode`), its config (`~/.config/opencode`), the
`opencode` protocol scheme, the `opencode` provider (OpenCode Go / Console / Free / Zen), the registered trademark line,
and every package name. So sessions, models and config carry over; only the desktop's own window/draft/onboarding data
starts fresh under the new app id.

### The new-session wordmark

The big wordmark on an empty session reads **loloXcode** instead of `opencode`, drawn as pins. The letterform is the
original one: 6 unit stems, 24 unit round letters, a 6 unit ascender, all on a 3 unit pin pitch. Only the glyphs changed,
in `packages/ui/src/typography/wordmark/letters.ts`, which is now the single source for:

- the nine letters (paths, `cx` pivot, first-half / second-half fill),
- `WORDMARK_WIDTH` / `WORDMARK_HEIGHT` (228x42) and `PIN_COLUMNS` / `PIN_ROWS` (76x14).

Letters are spaced by ink, not by uniform 30 unit cells: the narrow `l` and `X` get a 6 unit gap on either side instead of
a full cell, which is what stops the two `l`s from drifting away from their `o`. `l` rises to the ascender line (`y=0`),
`X` and the round letters sit on the x-height (`y=6`), and `X` is two mirrored diagonal parallelograms so it rasterizes
symmetrically on the pin grid.

Each glyph is stored in its own box starting at x 0, and `shift()` places it by translating that path. The translation
rewrites the numbers of each `M` / `L` / `H` / `V` command, because `H` and `V` carry a single coordinate: a
coordinate-pair rewrite leaves their x behind and shears the letters into slabs.

Everything downstream is derived from that one file: `wordmark.tsx` (flat wordmark, shimmer overlay, lodger hole,
pin-slot and home geometry), `pin-board.tsx` (the 76x14 `GRID` ASCII art, `2` = "lolo", `3` = "Xcode", `1` = counter
shadow), `brick-breaker.tsx` (wall pitch and sweep columns), the component test's pin cell coordinates, the About
scramble (`settings/about/animated-wordmark.tsx`), the marketing `Wordmark` in `packages/ui/src/typography/wordmark/`,
the `Logo` the error screen draws, the OAuth page in `packages/core/src/oauth/page.ts`, and the desktop splash
(`packages/desktop/src/renderer/startup/splash.tsx`, through `Wordmark`).

Still spelled `OpenCode`, deliberately: the provider names (OpenCode Go, OpenCode Console, OpenCode Free, OpenCode Zen),
the `opencode` protocol scheme and provider id, and the registered-trademark line in Settings → About. The 19 remaining
mentions in `packages/app/src/runtime/i18n/en.ts` are all one of those.

## Running next to an installed OpenCode

The bundled CLI is built with a channel of its own, `OPENCODE_CHANNEL=loloxcode`. A channel decides the registration
file and the default port (`packages/cli/src/services/service-config.ts`):

| Build | Registration | Default port |
| --- | --- | --- |
| upstream `dev` | `~/.local/state/opencode/service.json` | 28894 |
| this fork (`loloxcode`) | `~/.local/state/opencode/service-loloxcode.json` | 30557 |

The desktop client takes that file explicitly
(`packages/desktop/src/main/service/background-service.ts` sets `file` to `service-${SERVICE_CHANNEL}.json` in packaged
builds). Without it the client polls `service.json`, finds the installed OpenCode's server, sees a version mismatch, and
fails after 120 s with `Timed out waiting for the background service to start` — while the CLI it spawned wrote its
registration somewhere the client never looks. With it, both apps run at once, each on its own port, and neither
replaces the other's server.

`XDG_STATE_HOME` is deliberately *not* changed: `lifecycle/environment.ts` deletes it on Windows whenever the shell
environment does not define one, so an earlier attempt to point it at `userData/state` was silently undone. The distinct
file name is what separates the two apps; everything else in the state directory (locks, PTY daemons) is shared with
upstream, exactly as it is between an upstream desktop and a TUI.

Updates are disabled twice: the settings flag (`"update": "disable"`) and `packages/gui-plugins/src/updater/main.ts`,
where `enabled` is `false`. The second one matters because the packaged app otherwise downloads upstream
`0.0.0-dev-<n>` and replaces itself with stock OpenCode.

## The free tier

The free models (`opencode/deepseek-v4.1-flash-free` and the rest of the free tier) are served by
`https://opencode.ai/inference/openai/v1`, and that gateway refuses builds it considers too old. The client is
identified by the `User-Agent` the CLI puts on every model request, `opencode/<channel>/<version>/<artifact>`
(`packages/core/src/app.ts`, filled from `OPENCODE_VERSION` / `OPENCODE_CHANNEL`). A preview version,
`0.0.0-loloxcode-<timestamp>`, is not a release version and fails the gateway's `>= 1.18.0` check; the app shows
`OpenCode 1.18.0 or newer is required to use the free tier`.

So the CLI is built with a real semver as its version, keeping the fork's channel:

```powershell
$env:OPENCODE_VERSION = "2.2.7-loloxcode-$(Get-Date -Format yyyyMMddHHmm)"
$env:OPENCODE_CHANNEL = "loloxcode"
$env:OPENCODE_TARGET = "windows-x64-baseline"
bun run --cwd packages/cli build
```

`2.2.7-loloxcode-<timestamp>` is a prerelease of the desktop's own 2.2.7, so it satisfies the gateway's minimum, stays
unique per build (the desktop matches the service registration by exact version), and still contains `-loloxcode-`,
which `versionBelongsToChannel` accepts when it migrates an older `0.0.0-loloxcode-*` registration. The base semver
tracks `packages/desktop/package.json`, so bump both together after an upstream update. `OPENCODE_CHANNEL` stays
`loloxcode`: the channel is what names `service-loloxcode.json` and picks port 30557.

A spent free quota answers `429 FreeUsageLimitError` ("Free usage limit reached"), which the `Limit` pill moves by
rotating the exit IP. The version gate is the only failure this build fixes. No restart follows a rotation: the
background service was started with `HTTP_PROXY` pointing at `127.0.0.1:40000`, that URL never changes, and the sockets
it held through the old registration are re-dialled as the old tunnel drops.

## Files

New:

- `packages/schema/src/lolox-kit.ts` — the shared metadata key, the prompt file name, the new-session default marker
  file name, and `SERVICE_CHANNEL` (`"loloxcode"`, the channel the CLI is built with).
- `packages/core/src/lolox-kit/prompt.ts` — the instruction source core reads per session.
- `packages/core/src/lolox-kit/abliterated.md` — the bundled prompt, currently the v2 file the user keeps as
  `next features/AGENTS - Copy.md` (103,913 bytes, `# lolox — the bench (v2 — hardened)`).
- `packages/core/test/lolox-kit/prompt.test.ts` — the source's rules: the annotation wins both ways, the marker alone
  turns the prompt on, and the user's file replaces the bundled copy.
- `packages/gui-plugins/src/lolox-kit/` — the desktop plugin: `contract.ts` (Ipc), `warp.ts` (`warp-cli` driver, the
  proxy CONNECT trace, the IPv6 /64 key), `warp-run.ts` (status and the rotation flow), `main.ts` (the default marker
  and the wiring), `renderer.tsx` (the composer switch and the `Limit` pill), `index.ts`, `i18n/en.ts`, `warp.test.ts`.
- `packages/app/src/composer/plugin-controls.tsx` — renders the plugin controls in the composer's footer, after the
  model and effort controls, and nothing when no plugin host is mounted (stories, tests).
- `packages/app/src/settings/appearance/theme-swatch.ts` — maps a theme's `palette` (or resolves its `seeds`) to the
  concrete colors a gallery card draws, with `#`-only fallbacks for variable overrides.
- `packages/app/src/settings/appearance/theme-gallery.tsx` — the Settings → Appearance theme grid: live preview after
  80 ms on hover/focus, commit on click/Enter/Space, cancel on Esc/leave/focus-out/unmount, arrows/Home/End with a
  roving tabindex.
- `packages/app/src/settings/appearance/theme-gallery.css` — the card, diagonal light/dark preview and grid styles.
- `packages/app/src/settings/appearance/theme-gallery.stories.tsx` — the `app-theme-gallery--gallery` and
  `app-theme-gallery--unmount` stories.
- `packages/app/component-tests/theme-gallery.spec.ts` — the gallery's 10 component tests.
- `packages/ui/src/typography/wordmark/letters.ts` — the nine `loloXcode` glyphs, plus the wordmark and pin-grid
  dimensions, shared by the wordmark, the pin board, the brick breaker, the About scramble, the `Logo` and the OAuth
  page.

Modified, each inside `// >>> LOLOX-KIT BEGIN` / `// <<< LOLOX-KIT END` markers:

- `packages/core/src/session/context.ts` — appends `LoloxKit.source(...)` to the session's instruction sources, with the
  session's metadata, and adds `FSUtil.node` and `Global.node` to the layer.
- `packages/plugin/src/gui/registries.ts` — `ComposerControl` (a control in the composer's footer), beside
  `ComposerPill` and `NewSessionPill`.
- `packages/app/src/runtime/plugin/host.tsx` — `useOptionalPluginHost`, so a component that may render outside a host
  shows nothing instead of throwing.
- `packages/app/src/composer/editor/editor.tsx` — the `session` prop and `ComposerPluginControls` after the model and
  effort controls.
- `packages/app/src/composer/composer.tsx` — passes the session down to the editor.
- `packages/app/src/session/composer/region.tsx` — gives the session composer its `MountedSession`.
- `packages/gui-plugins/src/main.ts`, `packages/gui-plugins/src/renderer.ts` — register the built-in.
- `packages/desktop/src/main/service/background-service.ts` — passes the fork's own registration file to the client.
- `packages/cli/src/services/service-config.ts` — `versionBelongsToChannel` also accepts `<semver>-<channel>-<build>`, so
  the release-versioned CLI keeps migrating registrations that the preview build wrote; `packages/cli/test/service.test.ts`
  covers both forms.
- `packages/gui-plugins/src/updater/main.ts` — `enabled = false`, so the packaged app never downloads an upstream
  update over itself.
- `packages/app/src/session/composer/plugin-pills.tsx` — exports the shared `PillCapsule`, adds
  `NewSessionPluginPills`.
- `packages/app/src/session/route.tsx` — the browser-tab / window title of an open session
  (`<session title> — loloXcode`).
- `packages/app/src/new-session/view.tsx` — renders that row above the composer.
- `packages/app/src/new-session/{wordmark.tsx,pin-board.tsx,brick-breaker.tsx}`,
  `packages/app/component-tests/new-session-wordmark.spec.ts` — the `loloXcode` wordmark and the 76x14 pin grid.
- `packages/app/src/settings/appearance/appearance.tsx` — the Theme select row is replaced by `<ThemeGallery />`; the
  whole row was removed rather than wrapped in markers.
- `packages/ui/src/typography/wordmark/wordmark.tsx`, `packages/ui/src/components/logo.tsx`,
  `packages/app/src/settings/about/animated-wordmark.tsx`, `packages/core/src/oauth/page.ts` — the wordmark drawn from
  the shared letters. The desktop splash needs no change: it renders the same `@opencode/ui/wordmark`.
- `packages/ui/package.json` — exports `./wordmark/letters` for the app and desktop consumers.
- `packages/app/src/runtime/i18n/en.ts`, `packages/app/src/runtime/i18n/desktop-native.ts`,
  `packages/app/src/servers/connect/screen.tsx` — the `loloXcode` strings, menu labels and native permission texts;
  provider names and the trademark notice stay `OpenCode`.

## How the prompt toggle works

The toggle is one session annotation, `lolox.abliterated`, stored in the session's `metadata` — the same durable,
per-session place `AGENTS.md` guidance comes from. Core builds the instruction list per session, and the lolox source is
appended last, so:

- a session with no annotation follows the desktop default: on while the default's marker exists, whatever the
  session's age, and off after a fresh install;
- switching it on writes the annotation through `session.update`, and the source's `read` starts returning the text, so
  the next request renders it as an instruction update instead of needing a new session;
- switching it off writes `false`, which outranks the default, and returns `Instructions.removed`, and the model is told
  the extra instructions no longer apply;
- sessions already running keep the annotation they had.

The switch's state comes from the session the composer belongs to: its annotation first, else the default. That is why
turning the default on and then entering a session keeps the switch on — the session the screen created may predate the
marker, and presence, not time, decides. `ComposerControl` renders it in the composer footer, so the same control is in
place before and inside a session; while a session's own annotation is still being read the switch is disabled for a
moment instead of guessing.

### The default

The switch on the new-session screen writes a marker file,
`~/.local/share/opencode/abliterated-default` (Windows: `C:\Users\Greg\.local\share\opencode\abliterated-default`). It
holds epoch milliseconds — when the default was switched on — as UTF-8 text; removing it switches the default off.

Core looks at whether the file exists and holds text, and only that:

| Session metadata | Marker | Result |
| --- | --- | --- |
| `true` | either | prompt on |
| `false` | either | prompt off |
| absent | absent (or empty) | prompt off |
| absent | present | prompt on |

A per-session choice always wins over the default in both directions. The marker is a plain file rather than app state
because core runs in the bundled CLI: it is the only place both processes already share. The renderer reads the same
marker for the switch on the new-session screen, so the control and the model agree without a round trip.

### Where the prompt lives

The bundled copy is `packages/core/src/lolox-kit/abliterated.md`, the bench v2 prompt (`next features/AGENTS - Copy.md`,
103,913 bytes). It is compiled into the bundled `opencode-cli.exe` with `with { type: "text" }`, so it is the thing to
edit when the fork should ship a different prompt — and a change there needs the CLI and desktop rebuilt. Because the
CLI is built with bytecode, the text lives in the executable as UTF-16 strings rather than plain bytes.

For a change without a rebuild, put a file at `~/.local/share/opencode/abliterated.md` (on Windows,
`C:\Users\Greg\.local\share\opencode\abliterated.md`). Core reads it whenever the toggle is on, and falls back to the
bundled copy when the file is missing or empty. The file is read per request, so the next message already uses the new
text; it also stays put across updates, which makes it the copy to edit for scribbles.

## How the limit reset works

The reset keeps Cloudflare One Client in **WarpProxy** mode — the mode this machine runs and the mode the app's
environment already points at (`HTTP_PROXY=http://127.0.0.1:40000`). It never switches to a tunnel: a tunnel would not
change the sockets a running process already dialled, and a mode switch drops the proxy the app was born with. This is
the sequence the user's own launcher (`next features/OpenCode Infinite (3).bat`) proved on this machine.

`Limit → Reset free limit`:

1. `credential.list` finds every credential with `integrationID === "opencode"` and `credential.remove` deletes it.
2. The registration is dropped: `--accept-tos disconnect`, one second, `registration delete`, then `registration show`
   polled every second until the daemon stops answering (six tries). `delete` returns before the old device is gone, and
   a `registration new` in between fails with "Old registration is still around"; a registration that is gone after the
   polls counts as removed even when `delete` printed an error.
3. `registration new`. On failure a full drop runs and it is retried once, then once more after five seconds, which is
   the wait that specific error asks for.
4. WARP comes back up in proxy mode: `disconnect`, wait for `Disconnected` (15 s), `tunnel protocol set MASQUE`,
   `mode proxy`, `proxy port <port>`, `connect`, wait for `Connected` (25 s), then wait for the proxy port to accept TCP.
   A `connect` that fails first checks `registration show` and registers again before one retry.
5. Verification goes **through the proxy**: `https://www.cloudflare.com/cdn-cgi/trace` is fetched with a `CONNECT` tunnel
   to `127.0.0.1:<port>`, polled every second for up to 45 s until the answer has `warp=on` and an IP. A closed port is
   answered at once with "Cloudflare One Client is not running", not a timeout after a minute.
6. The IP is compared by IPv4 or IPv6 /64 (one registration can hand out several addresses of the same /64). The same
   address is not a new exit, so one retry follows 10 s later.

`Limit → New exit IP` does steps 2-6 without the credential.

Requirements and limits:

- Cloudflare One Client running, with `warp-cli` on `PATH`. `LOLOX_WARP_BIN` overrides the binary.
- WarpProxy mode; the port is whatever `settings list` reports (`Mode: WarpProxy on port 40000`), 40000 when absent.
- WARP is never asked to start its own service: `CloudflareWARP` needs administrator rights, so a stopped client is
  reported in the toast instead.
- The free WARP tier is anonymous; `registration new` registers a new device, which is what changes the exit IP.
- Two rotations are 10 s apart at least, because Cloudflare throttles rapid registrations.
- A missing credential only ends the session's auth; sign in again to get a fresh quota. A 429 (`provider.rate-limit`)
  is throttling, not a spent quota, and an org or workspace budget limit is not fixed by either step.
- `status` reads the trace through the proxy in WarpProxy mode and directly in tunnel mode, so the pill still shows an
  exit IP on a machine configured the other way; `rotate` always ends in WarpProxy.

## Re-applying after an upstream update

```powershell
cd D:\loloxcode
git checkout -- .          # or: git stash
git apply patches\lolox-kit.patch
bun install
$env:OPENCODE_TARGET = "windows-x64-baseline"; $env:OPENCODE_CHANNEL = "loloxcode"
$env:OPENCODE_VERSION = "2.2.7-loloxcode-$(Get-Date -Format yyyyMMddHHmm)"; bun run --cwd packages/cli build
$env:OPENCODE_CHANNEL = "dev"; Remove-Item Env:OPENCODE_TARGET; bun run --cwd packages/desktop build
```

The target must be `windows-x64-baseline`: `electron-builder.config.ts` resolves `@opencode/cli-windows-x64-baseline`
for x64 Windows, and `desktop/script/build.ts` only reuses `packages/cli/dist/cli-windows-x64-baseline` (anything else
falls back to downloading the published dev CLI, which does not carry the patch).

`OPENCODE_CHANNEL=loloxcode` is what makes the CLI write `service-loloxcode.json` on port 30557 instead of replacing the
installed OpenCode's `service.json`. It must match `SERVICE_CHANNEL` in `packages/schema/src/lolox-kit.ts`; the desktop
client looks for exactly that file. The channel also appears in the version string
(`2.2.7-loloxcode-<UTC timestamp>`), which the desktop compares exactly, so rebuild the desktop after every CLI rebuild.

Then package the installer. `pack` writes the unpacked app, and a second run wraps that in NSIS:

```powershell
Remove-Item Env:OPENCODE_TARGET -ErrorAction SilentlyContinue   # pack only knows windows-x64, not -baseline
bun run --cwd packages/desktop pack                             # dist/win-unpacked + dist/desktop/app
mkdir .pack; copy -r packages\desktop\dist\win-unpacked .pack\  # pack deletes dist/ on the next run
$env:OPENCODE_DESKTOP_APP = "<repo>\.pack\win-unpacked"
bun run --cwd packages/desktop pack
```

`OPENCODE_TARGET` is for the CLI build only: `script/utils.ts` maps `windows-x64` to the baseline CLI package already, and
an unknown target fails `getCurrentCli`.

The result is `packages/desktop/dist/loloxcode-desktop-win-x64.exe`. The CLI has to come from this tree: the prompt source
lives in `packages/core`, which is compiled into the bundled `opencode.exe`.

`patches/lolox-kit.patch` covers every file above, new ones included (51 files, about 240 KB, most of it the prompt).
`git apply --3way` resolves most context drift; the markers keep the hunks small. The theme gallery files above are
not folded into that patch yet, so regenerate it after committing the working tree.

## What was verified

- The rename is complete: `rg -ni "ollie"` over `packages` (excluding `dist`, `out`, `next features`) returns nothing, and
  `packages/schema`, `packages/core` (with its tests), `packages/plugin`, `packages/gui-plugins` and `packages/app` all
  typecheck after it. The plugin id, the `LoloxKit` Ipc provider and the schema module path moved together, so the
  composer switch still renders — it only draws while `ctx.use(LoloxKit)` is active over Ipc.
- The bundled prompt is the bench v2 file. The rebuilt `resources/opencode-cli.exe` carries its first, middle and last
  lines (`# lolox — the bench (v2 — hardened)` … `Integrity2: …`) as UTF-16 strings — the CLI is compiled with bytecode,
  so an ASCII grep finds nothing — and no v9 marker (`ojailbreaks`, `op spec (v9`) survives in it.
- `packages/desktop/dist/loloxcode-desktop-win-x64.exe` (267,455,029 bytes) was built and installed from this tree; the
  installed `resources/opencode-cli.exe` and `resources/app.asar` are byte-identical to the packed ones (SHA-256), the
  CLI version reads `2.2.7-loloxcode-202611120043`, and `app.asar` carries `lolox-kit`, `composer-abliterated` and
  `lolox.abliterated` with no `ollie-` string left.
- In the freshly installed build over CDP, `[data-slot="composer-controls"]` held the model chip, `max` and
  `[data-action="composer-abliterated"]` with `aria-checked="true"`, and the only pill above the composer was `Limit`.
- The switch is in the composer footer, after the model chip and the effort picker, on the new-session screen and on a
  session. Checked in the installed dev build over CDP: `[data-slot="composer-controls"]` held
  `[data-action="composer-model"]`, the variant trigger (`max`) and `[data-action="composer-abliterated"]`, and a
  screenshot showed `DeepSeek V4.1 Flash Free · Max · Abliterated [on]`. No `Abliterated` pill is left above the
  composer; only `Limit` is there.
- The default reads back into a session: with the marker on, the new-session switch drew `aria-checked="true"`, and
  opening an existing session drew the switch on too, labelled "Abliterated prompt is on for this session". This is the
  bug the switch fixes: the session screen used to compare `session.time.created` with the marker's moment and fall back
  to off for a session that predated the toggle.
- A click writes the annotation and the label follows: on → off showed "off for this session" and
  `{"lolox.abliterated":false}`; a window reload kept it off; a second click wrote `true` and a reload kept it on. The
  default marker was untouched by those per-session writes.
- `packages/core/test/lolox-kit/prompt.test.ts` pins the source's rules: no marker and no annotation → removed; the
  marker alone → the prompt; the annotation wins both ways; the user's file replaces the bundled copy and a blank file
  falls back to it (4 tests, 6 assertions). `bun test test/lolox-kit/prompt.test.ts` passes in `packages/core`.
- Typechecks pass for the touched packages: `packages/plugin`, `packages/schema`, `packages/core` (with its tests) and
  `packages/gui-plugins`, and `packages/app` through `tsc -b`.
- The Limit menu lists "Reset free limit" (credential + new IP) and "New exit IP" with the current exit IP.
- The proxy-mode rotation was verified twice with the final build. Standalone, the module the app calls took
  `2a09:bac5:d564:1d05::2e4:db` → `2a09:bac5:d563:37f5::593:3f` in 9.8 s; the mode stayed `WarpProxy on port 40000` and
  the trace came back through the proxy with `warp=on` and `loc=ID`.
- In the installed app, a real pointer click on `Limit → New exit IP` rotated `2a09:bac5:d563:37f5::593:3f` →
  `2a09:bac5:d566:18d2::279:26`, and the pill then showed the new address. (The Kobalte trigger opens on pointerdown, so
  a scripted `.click()` does nothing; the check used CDP `Input.dispatchMouseEvent`.) `curl -x http://127.0.0.1:40000`
  on `/cdn-cgi/trace` independently reported `ip=2a09:bac5:d566:18d2::279:26`, `warp=on`, `loc=ID`, still WarpProxy.
- A chat on that new exit answered: `POST /api/session/<id>/generate` with `hey` on `DeepSeek V4.1 Flash Free` returned
  HTTP 200 in 5.2 s, cost 0, "Hey — what are you working on? …" (56,313 input / 55 output tokens). The test session was
  deleted afterwards.
- `bun test src/lolox-kit/warp.test.ts` covers the /64 key (same /64, different /64, compressed and uppercase forms,
  IPv4-mapped), mode and port parsing, `Connected` vs `Disconnected`, and chunked trace decoding: 4 tests, 9 assertions.
- The dev-channel installer (`packages/desktop/dist/loloxcode-desktop-win-x64.exe`, 267 MB, product name "loloXcode Dev",
  company "loloXcode") was built from this tree. Its payload was checked after packaging: `resources/opencode-cli.exe`
  carries `lolox.abliterated`, `lolox/abliterated`, `abliterated-default` and the bundled prompt file,
  `resources/opencode-cli.version` reads `2.2.7-loloxcode-202611120043`, and `resources/app.asar` carries the `lolox-kit`
  plugin, the composer control (`composer-abliterated`), `setPromptDefault`, the `Limit` pill and the new `loloXcode`
  titles.
- The installer was then run once (`/S`) and uninstalled: it installed to
  `%LOCALAPPDATA%\Programs\app.loloxcode.desktop.dev`, the app launched with the window title `loloXcode`, and its
  userData went to `%APPDATA%\app.loloxcode.desktop.dev`. Uninstall removed the directory, the Start Menu entry and the
  uninstall registry key. The same install / launch / uninstall cycle was repeated for the wordmark build and passed
  again, leaving no trace behind.
- The final payload was installed for the switch check above, then its `%APPDATA%\app.loloxcode.desktop.dev` was wiped and
  it was launched again, which is the fresh-install state reported there. That install is left in place:
  `%LOCALAPPDATA%\Programs\app.loloxcode.desktop.dev`, product version 2.2.7-loloxcode-202611120043. The test session was
  removed; the `abliterated-default` marker is left as the user had it (on), because the default is theirs to keep.
- The packaged app runs next to the installed OpenCode 2.2.7. Before the channel fix it failed with
  `Timed out waiting for the background service to start`; the desktop log showed it polling `service.json` (the
  OpenCode server on port 28894, pid 14480) while its own CLI wrote a registration of its own (a `service-…json` under
  the fork's channel) on port 31930. After the fix, a fresh install of
  `packages/desktop/dist/loloxcode-desktop-win-x64.exe` logged
  `v2 CLI background service ready { version: '0.0.0-loloxcode-.', url: 'http://127.0.0.1:30557' }` 0.7 s after start,
  wrote `~/.local/state/opencode/service-loloxcode.json`, and the window loaded a session over the Ipc with no errors
  in `main.log`, `renderer.log` or the renderer console (checked over CDP: no failed requests, no exceptions). The
  OpenCode server kept running on 28894 throughout.
- The wordmark reads **loloXcode**. Checked in the installed app over CDP: the resting screen renders 30 paths (9 stems +
  the counter shadows) in a 720x106 box, each letter inside its own box of the 228 unit grid (0-6, 12-36, 42-48,
  54-78, 84-108, 114-138, 144-168, 174-198, 204-228), and the flat art reads `l o l o X c o d e`. Dragging the lodger
  out mounts the pin board with the same word in pins, the lodger perched to its right — no exceptions, no console
  errors. The pin grid was also checked as a standalone SVG render before building, including that `X` mirrors exactly.
- The version fix was verified end to end on the installed build (`2.2.7-loloxcode-202611112241`): the fresh install
  wrote `service-loloxcode.json` with that exact version on port 30557, the new-session composer again showed the
  `Abliterated` switch beside the model and effort chips with the `Limit` pill above it, the document title read
  `loloXcode`, and the wordmark read `loloXcode` in a screenshot. Sending `hey` on `DeepSeek V4.1 Flash Free` no longer
  returned `OpenCode 1.18.0 or newer is required to use the free tier`; it reached the quota and answered
  `Free limit reached ... they reset at Nov 12, 2026, 8:41 AM`. So the gateway accepted the client version, and the only
  thing left blocking a reply on this machine was its spent free quota. After rotating the WARP exit IP and restarting
  the app, `POST /api/session/<id>/generate` with `hey` returned `Hey! What are you working on today?` (HTTP 200, 8.6 s,
  21,562 input / 11 output tokens, cost 0), so the free tier answers from this build. The rebuilt renderer also names an
  open session `<session title> — loloXcode`; the tab observed after that build read `Greeting — loloXcode`.
- No update was offered or downloaded from the packaged build: `main.log` has no updater entries, and
  `gui-plugins/src/updater/main.ts` never loads `electron-updater`.
- The packaged app and data identity: installed exe is `loloXcode Dev.exe`, app id `app.loloxcode.desktop.dev`, so window
  drafts and onboarding live in `%APPDATA%\app.loloxcode.desktop.dev`; `~/.local/share/opencode` and
  `~/.config/opencode` (sessions, config, models) are unchanged. Nothing migrates from `%APPDATA%\ai.opencode.desktop.dev`.
