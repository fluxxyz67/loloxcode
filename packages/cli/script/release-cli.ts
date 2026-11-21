#!/usr/bin/env bun

import { $ } from "bun"
import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

// Packs the built CLI into the archives the release workflow uploads. Each archive holds one binary
// at its root, already executable, so the install scripts can extract it straight into place.

export type ReleaseTarget = {
  target: string
  os: "linux" | "darwin" | "windows"
}

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
  { target: "linux-x64", os: "linux" },
  { target: "linux-arm64", os: "linux" },
  { target: "linux-x64-musl", os: "linux" },
  { target: "darwin-arm64", os: "darwin" },
  { target: "darwin-x64", os: "darwin" },
  { target: "windows-x64", os: "windows" },
]

export function assetName(target: string): string {
  return `loloxcode-${target}.${target.startsWith("windows-") ? "zip" : "tar.gz"}`
}

export function binaryName(os: ReleaseTarget["os"]): string {
  return os === "windows" ? "loloxcode.exe" : "loloxcode"
}

export async function packageTarget(input: {
  dist: string
  out: string
  target: ReleaseTarget
}): Promise<string> {
  const source = path.join(
    input.dist,
    `cli-${input.target.target}`,
    "bin",
    input.target.os === "windows" ? "opencode.exe" : "opencode",
  )
  if (!(await Bun.file(source).exists())) throw new Error(`missing built binary: ${source}`)

  await mkdir(input.out, { recursive: true })
  const staging = await mkdtemp(path.join(tmpdir(), "release-cli-"))
  const name = binaryName(input.target.os)
  const archive = path.join(input.out, assetName(input.target.target))

  try {
    const staged = path.join(staging, name)
    await copyFile(source, staged)
    await chmod(staged, 0o755)
    await rm(archive, { force: true })

    if (input.target.os === "windows") {
      if (Bun.which("zip")) await $`zip -j -q ${archive} ${staged}`
      // bsdtar ships with Windows and writes a real zip when the name ends in .zip.
      else if (process.platform === "win32") await $`tar -a -cf ${archive} -C ${staging} ${name}`
      else throw new Error("zip is required to pack the Windows archive")
    } else await $`tar -czf ${archive} -C ${staging} ${name}`

    return archive
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function writeChecksums(out: string, files: string[]): Promise<string> {
  const lines: string[] = []
  for (const file of [...files].sort((a, b) => path.basename(a).localeCompare(path.basename(b)))) {
    const hash = createHash("sha256").update(await readFile(file)).digest("hex")
    lines.push(`${hash}  ${path.basename(file)}`)
  }

  const target = path.join(out, "SHA256SUMS")
  await writeFile(target, lines.join("\n") + "\n")
  return target
}

if (import.meta.main) {
  const dir = path.resolve(import.meta.dirname, "..")
  const dist = path.join(dir, "dist")
  const out = path.join(dist, "release")

  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  const assets: string[] = []
  for (const target of RELEASE_TARGETS) {
    const asset = await packageTarget({ dist, out, target })
    console.log(asset)
    assets.push(asset)
  }
  console.log(await writeChecksums(out, assets))
}
