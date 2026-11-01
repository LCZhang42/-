import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (Number.parseInt(process.versions.node, 10) < 22 && !process.env.SHOUSHU_SERVER_RELAUNCHED) {
  const modernNode = [
    process.env.NODE22_BIN,
    join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
  ].filter(Boolean).find(existsSync);
  if (!modernNode) throw new Error("联机服务器需要 Node 22+；可用 NODE22_BIN 指定新版 Node");
  const child = spawnSync(modernNode, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, SHOUSHU_SERVER_RELAUNCHED: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const { createBattleServer } = await import("../server/multiplayer/createBattleServer.js");
const port = Number.parseInt(process.argv[2] ?? process.env.MULTIPLAYER_PORT ?? "2567", 10);
const host = process.env.MULTIPLAYER_HOST ?? "127.0.0.1";
const gameServer = createBattleServer({ greet: true });
await gameServer.listen(port, host);
console.log("寿数回战 N3 服务器：ws://" + host + ":" + port);
