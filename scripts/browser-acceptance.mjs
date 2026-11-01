import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";

if (Number.parseInt(process.versions.node, 10) < 20 && !process.env.SHOUSHU_BROWSER_RELAUNCHED) {
  const modernNode = [
    process.env.NODE20_BIN,
    join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
  ].filter(Boolean).find(existsSync);
  if (!modernNode) throw new Error("浏览器验收需要 Node 20+；可用 NODE20_BIN 指定新版 Node");
  const child = spawnSync(modernNode, [fileURLToPath(import.meta.url)], {
    cwd: process.cwd(),
    env: { ...process.env, SHOUSHU_BROWSER_RELAUNCHED: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const mockShareOrigin = "http://127.0.0.1:4175";
const browserCandidates = [
  process.env.BROWSER_BIN,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const browser = browserCandidates.find(existsSync);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_PATH,
  join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright"),
].filter(Boolean);
const playwrightPath = playwrightCandidates.find(existsSync);

if (!browser) {
  throw new Error("未找到 Edge/Chrome；可用 BROWSER_BIN 指定 Chromium 浏览器路径");
}
if (!playwrightPath) {
  throw new Error("未找到 Playwright；可用 PLAYWRIGHT_PATH 指定已安装的 playwright 包目录");
}

const require = createRequire(import.meta.url);
const { chromium } = require(playwrightPath);

const server = spawn(process.execPath, ["scripts/serve.mjs", ".", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let sharedPackage = null;
const mockShareServer = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Delete-Token");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const send = (status, value) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
  };
  if (request.method === "POST" && request.url === "/api/shares") {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      sharedPackage = JSON.parse(body).package;
      send(201, { code: "accept123", status: "active", deleteToken: "accept-delete" });
    } catch (error) {
      send(500, { error: String(error.message ?? error) });
    }
    return;
  }
  if (request.method === "GET" && request.url === "/api/shares/accept123" && sharedPackage) {
    send(200, { code: "accept123", status: "active", package: sharedPackage });
    return;
  }
  if (request.method === "DELETE" && request.url === "/api/shares/accept123") {
    sharedPackage = null;
    send(200, { deleted: true });
    return;
  }
  send(404, { error: "mock share not found" });
});
await new Promise((resolve, reject) => {
  mockShareServer.once("error", reject);
  mockShareServer.listen(4175, "127.0.0.1", resolve);
});

try {
  await waitForServer(`${origin}/tests/browser-acceptance.html`);
  const browserHandle = await chromium.launch({ executablePath: browser, headless: true });
  try {
    const context = await browserHandle.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/tests/browser-acceptance.html`, { waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.status !== "pending", null, { timeout: 60000 });
    const status = await page.locator("body").getAttribute("data-status");
    const result = await page.locator("#result").innerText();
    if (status !== "passed") throw new Error(`浏览器验收失败\n${result}`);
    console.log(result);
    await context.close();
  } finally {
    await browserHandle.close();
  }
} finally {
  server.kill();
  await new Promise((resolve) => mockShareServer.close(resolve));
}

async function waitForServer(url) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`本地验收服务器未能启动：${url}`);
}
