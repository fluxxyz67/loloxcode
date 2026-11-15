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
 * The CLI channel this build is compiled with (`OPENCODE_CHANNEL`). A channel of its own keeps loloXcode's background
 * service registration and default port apart from a separately installed OpenCode, which would otherwise replace the
 * other app's server on every start. Must match the channel passed when building `packages/cli`.
 */
export const SERVICE_CHANNEL = "loloxcode"

