import { describe, expect } from "bun:test"
import { Effect } from "effect"
import type { FSUtil } from "@opencode/util/fs-util"
import type { Schema } from "effect"
import { Instructions } from "@opencode/core/instructions/index"
import { LoloxKit } from "@opencode/core/lolox-kit/prompt"
import { it } from "../lib/effect"

/** A file system that answers only the two files the source reads, by their name. */
const files = (contents: Record<string, string | undefined>) =>
  ({
    readFileStringSafe: (file: string) =>
      Effect.succeed(
        file.endsWith(LoloxKit.FILENAME)
          ? contents.prompt
          : file.endsWith(LoloxKit.DEFAULT_FILENAME)
            ? contents.marker
            : undefined,
      ),
  }) as unknown as FSUtil.Interface

const read = (input: {
  files: Record<string, string | undefined>
  metadata?: Readonly<Record<string, Schema.Json>>
}) =>
  Instructions.read(LoloxKit.source({ fs: files(input.files), data: "/data", metadata: input.metadata })).pipe(
    Effect.map((result) => result[0]?.value),
  )

describe("LoloxKit.source", () => {
  it.effect("leaves the prompt out without a marker or an annotation", () =>
    Effect.gen(function* () {
      expect(yield* read({ files: {} })).toBe(Instructions.removed)
    }),
  )

  it.effect("appends the prompt when the marker is present, whatever the session's age", () =>
    Effect.gen(function* () {
      expect(yield* read({ files: { marker: "1762900000000" } })).toBeString()
    }),
  )

  it.effect("lets a session's own annotation win over the marker, in both directions", () =>
    Effect.gen(function* () {
      expect(yield* read({ files: { marker: "1762900000000" }, metadata: { [LoloxKit.METADATA_KEY]: false } })).toBe(
        Instructions.removed,
      )
      expect(yield* read({ files: {}, metadata: { [LoloxKit.METADATA_KEY]: true } })).toBeString()
    }),
  )

  it.effect("prefers the user's file over the bundled copy", () =>
    Effect.gen(function* () {
      expect(yield* read({ files: { marker: "1", prompt: "Be terse." } })).toBe("Be terse.")
      expect(yield* read({ files: { marker: "1", prompt: "   " } })).toBeString()
    }),
  )
})
