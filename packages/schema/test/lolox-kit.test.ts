import { describe, expect, test } from "bun:test"
import { serviceFilename } from "../src/lolox-kit.js"

// The desktop reads the file the bundled CLI writes. Both sides derive the name from the channel, so a drift here
// leaves startup polling a file nobody updates until the 120 s timeout replaces the app with the error page.
describe("serviceFilename", () => {
  test.each([
    ["latest", "service.json"],
    ["dev", "service.json"],
    ["beta", "service.json"],
    ["next", "service.json"],
    ["local", "service-local.json"],
    ["prod", "service-prod.json"],
    ["loloxcode", "service-loloxcode.json"],
    ["feature/wip", "service-feature-wip.json"],
  ])("channel %s registers as %s", (channel, expected) => {
    expect(serviceFilename(channel)).toBe(expected)
  })
})
