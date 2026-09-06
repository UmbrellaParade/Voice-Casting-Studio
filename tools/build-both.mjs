import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGasBundle } from "./bundle-gas.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "artifacts/paired-build");
const wp = join(output, "wordpress/voice-casting-studio");
const gas = join(root, "dist");
const filesIn = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]);
const sources = [
  ...filesIn(join(root, "src")), ...filesIn(join(root, "docs/google-apps-script")),
  join(root, "tools/bundle-gas.mjs"),
  join(root, "index.html"), join(root, "vite.config.js"), join(root, "package.json"), join(root, "package-lock.json")
].sort();
const fingerprint = () => {
  const hash = createHash("sha256");
  for (const path of sources) hash.update(relative(root, path).replaceAll("\\", "/")).update(readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
  return hash.digest("hex");
};
const before = fingerprint();
const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`Build step failed: ${args.join(" ")}`);
};
run(["--test"]);
run(["node_modules/vite/bin/vite.js", "build", "--mode", "gas"]);
mkdirSync(wp, { recursive: true });
run(["node_modules/vite/bin/vite.js", "build", "--mode", "wordpress"], { VCS_BUILD_OUTPUT: join(wp, "assets") });
for (const entry of readdirSync(join(root, "wordpress-theme/voice-casting-studio"), { withFileTypes: true })) {
  if (entry.name === "assets") continue;
  cpSync(join(root, "wordpress-theme/voice-casting-studio", entry.name), join(wp, entry.name), { recursive: true });
}
mkdirSync(join(output, "gas-backend"), { recursive: true });
writeGasBundle(join(output, "gas-backend/Code.gs"));
cpSync(join(root, "docs/google-apps-script/appsscript.json"), join(output, "gas-backend/appsscript.json"));
if (before !== fingerprint()) throw new Error("Source changed during the paired build. Re-run after edits finish.");
for (const path of [join(gas, "index.html"), join(wp, "assets/app.js"), join(wp, "assets/app.css")]) {
  if (!existsSync(path) || !readFileSync(path).length) throw new Error(`Missing build output: ${path}`);
}
const version = readFileSync(join(wp, "style.css"), "utf8").match(/^Version:\s*(.+)$/m)?.[1].trim() || "development";
const manifest = { version, sourceSha256: before, gasProtocol: 2, gasOwnerProtocol: 3, sharedEntry: "src/main.jsx", builtAt: new Date().toISOString(),
  gasFrontend: "dist", wordpress: "artifacts/paired-build/wordpress/voice-casting-studio", gasBackend: "artifacts/paired-build/gas-backend/Code.gs" };
const json = JSON.stringify(manifest, null, 2) + "\n";
writeFileSync(join(output, "build-info.json"), json);
writeFileSync(join(gas, "build-info.json"), json);
writeFileSync(join(wp, "assets/build-info.json"), json);
console.log(`Paired build verified: ${version} / ${before}`);
