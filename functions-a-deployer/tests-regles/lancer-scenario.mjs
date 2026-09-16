#!/usr/bin/env node
/* Lance UN scenario sur son propre emulateur, sur un port libre.
   node lancer-scenario.mjs scenarios/chasse-bout-en-bout.mjs [port]
*/
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const scenario = process.argv[2];
if (!scenario) { console.error("usage : node lancer-scenario.mjs <scenario.mjs> [port]"); process.exit(2); }

function portLibre(depart) {
  return new Promise((ok, non) => {
    const s = createServer();
    s.once("error", () => ok(portLibre(depart + 1)));
    s.once("listening", () => { const p = s.address().port; s.close(() => ok(p)); });
    s.listen(depart, "127.0.0.1");
  });
}
const port = Number(process.argv[3]) || (await portLibre(8400 + Math.floor(process.hrtime()[1] % 600)));
const base = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mago-banc-"));
fs.copyFileSync(path.join(base, "..", "firestore.rules"), path.join(tmp, "firestore.rules"));
/* Firestore n'est pas le seul port : l'emulateur ouvre aussi un websocket, un
   « hub » et un journal, tous sur des ports FIXES par defaut (9150, 4400,
   4500). Deux scenarios lances en meme temps se battaient dessus, et le
   deuxieme mourait sur « unexpected error » — on aurait cru a un bug de
   l'application alors que c'etait une collision de ports. Chacun prend donc
   sa propre serie. */
fs.writeFileSync(path.join(tmp, "firebase.json"), JSON.stringify({
  firestore: { rules: "firestore.rules", port: port, websocketPort: port + 10000 },
  emulators: {
    firestore: { port: port, websocketPort: port + 10000 },
    hub: { port: port + 20000 },
    logging: { port: port + 30000 },
    ui: { enabled: false },
  },
}, null, 2));

const projet = "mago-" + path.basename(scenario, ".mjs").slice(0, 28).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
const enfant = spawn("npx", ["firebase", "emulators:exec", "--only", "firestore",
  "--project", projet, "--config", path.join(tmp, "firebase.json"),
  "node " + path.resolve(base, scenario)], {
  cwd: base,
  stdio: "inherit",
  env: Object.assign({}, process.env, { MAGO_PORT: String(port), MAGO_RULES: path.join(tmp, "firestore.rules") }),
});
enfant.on("exit", (code) => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(code == null ? 1 : code);
});
