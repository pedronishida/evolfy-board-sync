import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const readJson = (path) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8"));

const codexMarketplace = readJson(".agents/plugins/marketplace.json");
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const codexManifest = readJson(
  "plugins/evolfy-board-sync/.codex-plugin/plugin.json",
);
const claudeManifest = readJson(
  "plugins/evolfy-board-sync/.claude-plugin/plugin.json",
);
const mcp = readJson("plugins/evolfy-board-sync/.mcp.json");

assert.equal(codexMarketplace.name, "evolfy");
assert.equal(claudeMarketplace.name, "evolfy");
assert.equal(codexManifest.name, "evolfy-board-sync");
assert.equal(claudeManifest.name, "evolfy-board-sync");
assert.equal(codexManifest.version, claudeManifest.version);
assert.ok(Array.isArray(codexManifest.interface.defaultPrompt));
assert.equal(
  claudeMarketplace.plugins[0].source,
  "./plugins/evolfy-board-sync",
);
assert.equal(mcp.mcpServers["evolfy-board-sync"].command, "node");
assert.ok(
  mcp.mcpServers["evolfy-board-sync"].args[1].includes("CLAUDE_PLUGIN_ROOT"),
);

const executable = join(
  new URL(".", root).pathname,
  "plugins/evolfy-board-sync/bin/evolfy-board-sync",
);
assert.ok(
  (statSync(executable).mode & 0o111) !== 0,
  "launcher must be executable",
);

function packageFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === ".git" || entry.name === "node_modules"
        ? []
        : packageFiles(path);
    }
    return path.endsWith("scripts/check-package.mjs") ? [] : [path];
  });
}

const packageText = packageFiles(fileURLToPath(root))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
assert.ok(
  !/SUPABASE_|RESEND_|CLOUDFLARE_API_TOKEN|DATABASE_URL/.test(packageText),
);
assert.ok(!/gh[pousr]_[A-Za-z0-9]/.test(packageText));

process.stdout.write("Package structure is valid.\n");
