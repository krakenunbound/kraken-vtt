// The last step of "npm run exe": the installer goes into the main folder,
// next to Kraken VTT.bat. Running it installs (or updates) Kraken VTT in
// Program Files, with its firewall rule, so hosting never brings up
// Windows Firewall's question.
import { copyFileSync } from "node:fs";

try {
  // Built as Kraken-VTT-Setup.exe (no spaces: the updater finds it on GitHub by that name).
  copyFileSync("release/Kraken-VTT-Setup.exe", "Kraken VTT Setup.exe");
  console.log("Kraken VTT Setup.exe is in the main folder.");
} catch (error) {
  console.error(error.code === "EBUSY" || error.code === "EPERM"
    ? "Kraken VTT Setup.exe is in use, so the new one stays in release\\. Close it and run: node scripts/copy-exe.mjs"
    : `Could not copy Kraken VTT Setup.exe: ${error.message}`);
  process.exit(1);
}
