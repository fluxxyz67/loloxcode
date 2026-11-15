import { expect, test } from "bun:test"
import { ipKey, isProxyMode, parseHttpBody, parseMode, parsePort, parseStatus, parseTrace } from "./warp"

test("an exit only counts as new when its IPv4 or its IPv6 /64 changed", () => {
  expect(
    [
      ipKey("203.0.113.7"),
      ipKey("2a09:bac5:d565:37f5::593:4b"),
      ipKey("2a09:bac5:d565:37f5:1:2:3:4"),
      ipKey("2A09:BAC5:d565:37f5::1"),
      ipKey("2a09:bac5:d566:37f5::1"),
      ipKey("2001:db8::1"),
      ipKey("::1"),
      ipKey("::ffff:203.0.113.7"),
      ipKey(undefined),
    ].map((key) => key ?? "none"),
  ).toEqual([
    "203.0.113.7",
    "10761:47813:54629:14325",
    "10761:47813:54629:14325",
    "10761:47813:54629:14325",
    "10761:47813:54630:14325",
    "8193:3512:0:0",
    "0:0:0:0",
    // Not hex groups: the address is compared as written rather than guessed at.
    "::ffff:203.0.113.7",
    "none",
  ])
})

test("proxy mode is the only mode the app's HTTP_PROXY can reach", () => {
  expect(["WarpProxy on port 40000", "Warp", undefined, "WarpProxy"].map((mode) => isProxyMode(mode))).toEqual([
    true,
    false,
    false,
    true,
  ])
  expect(parseMode("(user set)\tMode: WarpProxy on port 40000")).toBe("WarpProxy on port 40000")
  expect(parsePort("(user set)\tMode: WarpProxy on port 40000")).toBe(40_000)
  expect(parsePort("(default)\tMode: Warp")).toBeUndefined()
})

test("status reads Connected before Disconnected and survives a missing daemon", () => {
  expect(
    ["Status update: Connected\nNetwork: healthy", "Status update: Disconnected\nReason: n/a", "Unable to connect"].map(
      (text) => parseStatus(text).state,
    ),
  ).toEqual(["connected", "disconnected", "unknown"])
})

test("a trace is read through chunked framing as well as a plain body", () => {
  expect(parseHttpBody("HTTP/1.1 200 OK\r\n\r\nip=1.2.3.4\r\nwarp=on\r\n")).toBe("ip=1.2.3.4\r\nwarp=on\r\n")
  expect(
    parseHttpBody("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nb\r\nip=1.2.3.4\n\r\n8\r\nwarp=on\n\r\n0\r\n\r\n"),
  ).toBe("ip=1.2.3.4\nwarp=on\n")
  expect(parseTrace("ip=1.2.3.4\nwarp=on\nloc=ID\n")).toEqual({ ip: "1.2.3.4", warp: "on", loc: "ID" })
})
