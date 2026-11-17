const { spawnSync } = require("node:child_process");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, [
  "--yes",
  "firebase-tools@13.35.1",
  "emulators:exec",
  "--project",
  "demo-thirdwheel",
  "--only",
  "auth,firestore,functions",
  "npm run test:emulator --prefix functions",
], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
