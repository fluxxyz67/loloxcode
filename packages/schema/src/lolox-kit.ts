/**
 * The session annotation that turns the appended lolox instructions on for one session. Core reads it when it builds
 * the session's instruction sources; the desktop's composer pill writes it through `session.update`.
 */
export const ABLITERATED_KEY = "lolox.abliterated"

/**
 * The file, next to the app's global data, that replaces the bundled instructions when it holds text.
 */
export const ABLITERATED_FILENAME = "abliterated.md"

/**
 * The file, next to the app's global data, whose presence turns the appended instructions on for every session that
 * has no annotation of its own. Core reads whether it exists and is not empty; the desktop writes the moment it was
 * switched on, in epoch milliseconds, as UTF-8 text, but only its presence matters. Removed while that default is off.
 * An explicit annotation still wins.
 */
export const ABLITERATED_DEFAULT_FILENAME = "abliterated-default"

/**
 * The registration file a CLI built for `channel` writes under the state directory, mirroring
 * `ServiceConfig.filename` in `packages/cli`. The desktop must read the file the bundled CLI writes, so both sides
 * derive it from the same channel: a mismatch leaves the desktop polling a file nobody updates and startup times out.
 */
export function serviceFilename(channel: string) {
  if (channel === "latest" || channel === "dev" || channel === "beta" || channel === "next") return "service.json"
  return `service-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

