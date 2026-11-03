// The last step of "npm run exe": the packaged app goes into the main folder,
// next to Kraken VTT.bat. If the old copy is open, say so instead of keeping it.
import { copyFileSync } from "node:fs";

try {
  copyFileSync("release/Kraken VTT.exe", "Kraken VTT.exe");
  console.log("Kraken VTT.exe is in the main folder.");
} catch (error) {
  console.error(error.code === "EBUSY" || error.code === "EPERM"
    ? "Kraken VTT.exe is open, so the new build stays in release\. Close the app and run: node scripts/copy-exe.mjs"
    : `Could not copy Kraken VTT.exe: ${error.message}`);
  process.exit(1);
}
