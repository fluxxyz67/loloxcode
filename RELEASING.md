# Releasing loloXcode

How this repository turns into the Windows installer attached to a GitHub release. Run everything from the repository root unless a step says otherwise.

## Versioning

Two numbers are in play, on purpose:

| Number                | Comes from                                             | Example                        |
| --------------------- | ------------------------------------------------------ | ------------------------------ |
| Release tag           | This fork's own count of public releases                | `v1.0.0`                       |
| App version           | Upstream base in `package.json`, plus the build stamp   | `2.2.7` / `2.2.7-loloxcode-202611120043` |

The app version tracks the opencode release this fork is built on, so the About screen always says which upstream base you are running. The tag counts fork releases. Release notes must state both.

`packages/desktop/package.json` holds the app version electron-builder bakes into the executable. The CLI stamp comes from `OPENCODE_VERSION`:

```powershell
$env:OPENCODE_VERSION = "2.2.7-loloxcode-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmm'))"
```

Leave `OPENCODE_VERSION` unset and the CLI build falls back to `0.0.0-<channel>-<timestamp>`; set it so the service reports the same base the app ships with.

## Channels

`OPENCODE_CHANNEL` selects the identity the build writes into the app:

| Channel | Product name    | App id                     | Install directory                          |
| ------- | --------------- | -------------------------- | ------------------------------------------ |
| `prod`  | loloXcode       | `app.loloxcode.desktop`    | `%LOCALAPPDATA%\Programs\app.loloxcode.desktop` |
| `beta`  | loloXcode Beta  | `app.loloxcode.desktop.beta` | `%LOCALAPPDATA%\Programs\app.loloxcode.desktop.beta` |
| `dev`   | loloXcode Dev   | `app.loloxcode.desktop.dev`  | `%LOCALAPPDATA%\Programs\app.loloxcode.desktop.dev` |

All three install side by side. Public releases use `prod`.

## Preflight

```powershell
bun install
bun run typecheck
bun test packages/gui-plugins          # limit rotation and auto continue
bun test packages/core                 # lolox-kit prompt plumbing
git status --porcelain                 # must be clean before you build
```

The installer is unsigned. Windows shows SmartScreen on first run; that is expected until a code-signing certificate is in place.

## Build the installer

The CLI is bundled into the desktop app, so build it first. Then pack the app twice: once as an unpacked directory, once as the NSIS installer that wraps it. The second pass deletes `dist/desktop`, so the unpacked app has to be parked outside it.

```powershell
# 1. CLI: fork code goes into the bundled service binary
#    Build it with the same channel as the desktop app: the CLI registers
#    service-<channel>.json and the desktop reads that exact file.
$env:OPENCODE_CHANNEL = "prod"
bun run --cwd packages/cli build

# 2. Desktop app, prod channel
cd packages\desktop
$env:OPENCODE_CHANNEL = "prod"
bun run build

# 3. Unpacked app
bun run pack
New-Item -ItemType Directory -Force D:\loloxcode\.pack | Out-Null
Copy-Item dist\win-unpacked D:\loloxcode\.pack\win-unpacked -Recurse -Force

# 4. Installer around the parked app
$env:OPENCODE_DESKTOP_APP = "D:\loloxcode\.pack\win-unpacked"
bun run pack

# output
# D:\loloxcode\dist\desktop\loloxcode-desktop-win-x64.exe
```

`packages/desktop/script/pack.ts` writes every artifact to `dist/desktop` at the repository root. That directory is gitignored; never commit a build.

Verify before publishing:

```powershell
Get-Item D:\loloxcode\dist\desktop\loloxcode-desktop-win-x64.exe | Select-Object Length, LastWriteTime
Get-FileHash D:\loloxcode\dist\desktop\loloxcode-desktop-win-x64.exe -Algorithm SHA256
```

Install it once on a clean profile and confirm: the window title says `loloXcode`, the app id under `%LOCALAPPDATA%\Programs` is `app.loloxcode.desktop`, and the service file `%USERPROFILE%\.local\state\opencode\service-prod.json` appears.

## Publish

```powershell
git tag -a v1.0.0 -m "loloXcode 1.0.0"
git push origin main
git push origin v1.0.0
```

Then attach `loloxcode-desktop-win-x64.exe` to the release, with the SHA256 in the notes. Keep the release body short:

- what base it is built on (`2.2.7`)
- what changed in this release
- the SHA256 of the installer
- a line saying the build is unsigned

## Housekeeping

Do not commit:

- `dist/` — every build artifact, including the installer
- `.pack/` — the parked unpacked app used by the second pack pass
- `packages/desktop/resources/opencode-cli*` — the 254 MB bundled CLI
- `next features/` — design sources; only exported assets belong in `.github/assets`
- `graphify-out/`, `.bun-cache/` — tooling caches

The root `bun run pack` is a different command: it packs the npm workspace into `dist/npm` and `dist/archives`. It is not used for desktop releases, and this fork publishes no npm packages.

## Windows checkouts without symlink privilege

The repository tracks 29 symlinks. A Windows checkout with `core.symlinks=false` (Developer Mode off) writes them as plain text files, so `packages/app/src/custom-elements.d.ts` holds a path instead of a declaration and `bun run typecheck` fails on it. The pre-push hook then rejects every push, whatever you changed.

Fix the checkout by enabling Developer Mode and cloning again, or run `bun run lint` plus a typecheck in a checkout that has real symlinks and push with `git push --no-verify`.

