<p align="center">
  <a href="https://github.com/fluxxyz67/loloxcode/releases/latest">
    <picture>
      <source srcset=".github/assets/loloxcode-lockup-paper.svg" media="(prefers-color-scheme: dark)">
      <source srcset=".github/assets/loloxcode-lockup-ink.svg" media="(prefers-color-scheme: light)">
      <img src=".github/assets/loloxcode-lockup-ink.svg" alt="loloXcode" width="360">
    </picture>
  </a>
</p>

<p align="center">A focused build of the open source AI coding agent.</p>

<p align="center">
  <a href="https://github.com/fluxxyz67/loloxcode/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/fluxxyz67/loloxcode?style=flat-square&label=release"></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/github/license/fluxxyz67/loloxcode?style=flat-square"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-windows%20x64-173A72?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.id.md">Bahasa Indonesia</a>
</p>

> [!NOTE]
> loloXcode is an independent fork of [opencode](https://github.com/anomalyco/opencode). It is not affiliated with, endorsed by, or supported by the opencode team. Upstream work is MIT licensed and keeps its copyright; see [Credits and license](#credits-and-license).

## Install

Windows 10/11, x64. Download the installer from the [latest release](https://github.com/fluxxyz67/loloxcode/releases/latest):

| File                             | Size    | Notes                          |
| -------------------------------- | ------- | ------------------------------ |
| `loloxcode-desktop-win-x64.exe`  | ~252 MB | Per-user install, no admin     |

The installer is not code signed, so Windows SmartScreen shows "Windows protected your PC" on first run: **More info → Run anyway**.

Installed app: **loloXcode**, in `%LOCALAPPDATA%\Programs\app.loloxcode.desktop`. Settings, sessions, and the local service live in the same places opencode uses (`%USERPROFILE%\.config\opencode`, `%USERPROFILE%\.local\share\opencode`, `%USERPROFILE%\.local\state\opencode`), so an existing opencode setup carries over.

## What this build changes

The agent, providers, tools, config format, and CLI are upstream opencode. This fork changes the shell around them:

| Area              | Change                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Identity          | loloXcode wordmark, icons, and app ids: `app.loloxcode.desktop`, `app.loloxcode.desktop.dev`, `app.loloxcode.desktop.beta` |
| Channels          | Dev, Beta, and Prod install side by side, each with its own app id, product name, and local service (`loloxcode` channel)  |
| Free limit        | A **Limit** control in the composer rotates the Cloudflare WARP exit IP and retries, instead of ending the turn             |
| Auto continue     | Optional. After a rotation the session sends `continue` by itself and keeps retrying with no attempt cap, top-level sessions only |
| Desktop updater   | Disabled on purpose: this build never replaces itself with a stock opencode release                                        |
| Theme gallery     | Appearance settings preview themes as a grid of swatches before you commit to one                                          |

Kept from upstream on purpose: package names, the `opencode` CLI command, provider ids, model ids, config keys, and the `opencode` service channel used by the CLI. Only the desktop app runs on the `loloxcode` channel.

## Free tier and the Limit control

Free-tier limits are counted per exit IP. If you already run Cloudflare One Client (WARP) in proxy mode, loloXcode can point the local service at it, rotate the WARP registration, and verify the new exit IP against `cloudflare.com/cdn-cgi/trace`.

Setup, once:

1. Install Cloudflare One Client and connect it with a local proxy on `127.0.0.1:40000`.
2. Open the **Limit** menu in the composer and press **New exit IP**. The service restarts behind the proxy and the toast reports the new IP.
3. To let it recover unattended, turn **Auto continue** on. On `provider.free-limit` or `provider.go-limit` the desktop rotates, waits for the service to reconnect, and sends `continue`.

The rotation never claims to sign you out unless a credential was actually removed; **Reset free limit** is the separate action that drops the stored credential and the IP together.

## Abliterated prompt

The composer has an **Abliterated** toggle that appends a persona/style prompt to a session's instructions, off by default. Drop your own `abliterated.md` in the opencode data directory to replace the bundled text; the toggle then uses your file.

## Build from source

Bun **1.4.4** or newer, per `packageManager` in `package.json`.

```bash
bun install
bun run dev:desktop        # desktop app, hot reload
bun run dev                # CLI and TUI
bun run typecheck          # turbo typecheck across the workspace
```

To produce the Windows installer, follow [RELEASING.md](./RELEASING.md). Packaging is a two-pass `electron-builder` run: the app is packed once unsigned, then packed again with `OPENCODE_DESKTOP_APP` pointed at that output to wrap it in the NSIS installer.

## Where the fork work lives

| Path                                          | What it holds                                                        |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `packages/gui-plugins/src/lolox-kit/`         | Desktop plugin: limit pill, rotation, auto continue, WARP runner      |
| `packages/core/src/lolox-kit/`                | Session instruction source for the abliterated prompt                 |
| `packages/schema/src/lolox-kit.ts`            | Shared keys and the `loloxcode` service channel                       |
| `packages/app/src/new-session/`               | Pin-grid wordmark, brick breaker, new session view                    |
| `packages/ui/src/typography/wordmark/`        | Wordmark letter geometry                                              |
| `packages/desktop/icons/`                     | App icons for dev, beta, and prod                                     |

## Credits and license

MIT, see [LICENSE](./LICENSE). Upstream copyright (`Copyright (c) 2025 opencode`) is preserved, and every upstream commit is still in this repository's history.

- Upstream project: [anomalyco/opencode](https://github.com/anomalyco/opencode)
- Upstream docs: [opencode.ai/docs](https://opencode.ai/docs)
- Logo geometry and exports: rebuilt for this fork from a single drawn grid

## Trademark

`opencode` and the opencode marks belong to the upstream project. This fork keeps them where compatibility depends on them — package names, provider ids, the CLI command, and documentation references — and uses `loloXcode` for everything a user sees. If you build on opencode, say clearly in your README that your project is not built by the opencode team and is not affiliated with it.
