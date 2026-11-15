import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "loloXcode Dev",
  beta: "loloXcode Beta",
  prod: "loloXcode",
}

const appIDs: Record<string, string> = {
  dev: "app.loloxcode.desktop.dev",
  beta: "app.loloxcode.desktop.beta",
  prod: "app.loloxcode.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "loloXcode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "app.loloxcode.desktop.dev"
