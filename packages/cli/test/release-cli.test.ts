import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assetName, binaryName, packageTarget, writeChecksums } from "../script/release-cli"

async function fakeDist(target: string, os: "linux" | "windows") {
  const dist = await mkdtemp(join(tmpdir(), "release-cli-dist-"))
  const dir = join(dist, `cli-${target}`, "bin")
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, os === "windows" ? "opencode.exe" : "opencode"), "fake")
  return dist
}

describe("release-cli", () => {
  test("names assets and binaries per platform", () => {
    expect(assetName("linux-x64")).toBe("loloxcode-linux-x64.tar.gz")
    expect(assetName("linux-x64-musl")).toBe("loloxcode-linux-x64-musl.tar.gz")
    expect(assetName("windows-x64")).toBe("loloxcode-windows-x64.zip")
    expect(binaryName("windows")).toBe("loloxcode.exe")
    expect(binaryName("linux")).toBe("loloxcode")
  })

  test("packs the binary at the archive root with the executable bit", async () => {
    const dist = await fakeDist("linux-x64", "linux")
    const out = await mkdtemp(join(tmpdir(), "release-cli-out-"))
    const archive = await packageTarget({ dist, out, target: { target: "linux-x64", os: "linux" } })

    expect(archive).toBe(join(out, "loloxcode-linux-x64.tar.gz"))
    const listing = await Bun.$`tar -tvzf ${archive}`.text()
    expect(listing.trim().split("\n")).toHaveLength(1)
    expect(listing).toContain("loloxcode")
    // Windows has no POSIX permission bits, so the tar it writes records its own default mode.
    if (process.platform !== "win32") expect(listing.startsWith("-rwx")).toBe(true)
  })

  test("writes sha256sum-compatible checksums", async () => {
    const out = await mkdtemp(join(tmpdir(), "release-cli-sums-"))
    const a = join(out, "one.tar.gz")
    const b = join(out, "two.zip")
    await writeFile(a, "one")
    await writeFile(b, "two")

    const file = await writeChecksums(out, [a, b])
    const lines = (await readFile(file, "utf8")).trim().split("\n")

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^[0-9a-f]{64} {2}one\.tar\.gz$/)
    expect(lines[1]).toMatch(/^[0-9a-f]{64} {2}two\.zip$/)
  })
})
