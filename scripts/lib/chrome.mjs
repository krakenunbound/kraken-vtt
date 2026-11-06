// The Chrome the tests use as a player's browser: KRAKEN_CHROME, or where
// Chrome installs itself on this system.
import { existsSync } from "node:fs";

const candidates = {
  win32: [String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
}[process.platform] ?? [];

export const CHROME = process.env.KRAKEN_CHROME || candidates.find((file) => existsSync(file)) || candidates[0];
