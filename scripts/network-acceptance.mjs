import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (Number.parseInt(process.versions.node, 10) < 22 && !process.env.SHOUSHU_NETWORK_RELAUNCHED) {
  const modernNode = [
    process.env.NODE22_BIN,
    join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
  ].filter(Boolean).find(existsSync);
  if (!modernNode) throw new Error("N3 验收需要 Node 22+；可用 NODE22_BIN 指定新版 Node");
  const child = spawnSync(modernNode, [fileURLToPath(import.meta.url)], {
    cwd: process.cwd(),
    env: { ...process.env, SHOUSHU_NETWORK_RELAUNCHED: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const multiplayerPort = 2568;
const staticPort = 4176;
const endpoint = "ws://127.0.0.1:" + multiplayerPort;
const healthUrl = "http://127.0.0.1:" + multiplayerPort + "/healthz";
const pageUrl = "http://127.0.0.1:" + staticPort + "/network-test.html";
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

if (!browser) throw new Error("未找到 Edge/Chrome；可用 BROWSER_BIN 指定 Chromium 浏览器");
if (!playwrightPath) throw new Error("未找到 Playwright；可用 PLAYWRIGHT_PATH 指定 playwright 包目录");

const server = spawn(process.execPath, ["scripts/multiplayer-server.mjs", String(multiplayerPort)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    MULTIPLAYER_PORT: String(multiplayerPort),
    COLYSEUS_LATENCY: "100",
    SHOUSHU_TEST_FORCE_BULL: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const staticServer = spawn(process.execPath, ["scripts/serve.mjs", ".", String(staticPort)], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(staticPort) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForHttp(healthUrl);
  await waitForHttp(pageUrl);
  await runSdkAcceptance();
  await runCombatAcceptance();
  await runBrowserAcceptance();
  console.log("N3 网络验收通过：40/40（完整战斗、100ms RTT、事件去重）");
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  server.kill();
  staticServer.kill();
}

async function runSdkAcceptance() {
  const { Client } = await import("@colyseus/sdk");
  const first = await new Client(endpoint).create("battle");
  first.onMessage("gameEvent", () => {});
  const second = await new Client(endpoint).joinById(first.roomId);
  second.onMessage("gameEvent", () => {});
  await waitFor(() => first.state.players?.size === 2 && second.state.players?.size === 2);

  assert.equal(first.roomId, second.roomId);
  assert.equal(first.state.players.get(first.sessionId).playerNumber, 1);
  assert.equal(second.state.players.get(second.sessionId).playerNumber, 2);

  const firstInput = first.input({ mode: "reliable" });
  assert.equal(firstInput.tickRate, 60);
  assert.equal(firstInput.stepSeconds, 1 / 60);
  await waitFor(() => first.state.combatState === "NEUTRAL", 5000);

  const initialX = first.state.players.get(first.sessionId).x;
  const firstTargetSeq = sendFrames(firstInput, 30, 1, 0);
  await waitFor(() => second.state.players.get(first.sessionId)?.lastInputSeq >= firstTargetSeq, 8000);
  const afterNormalMove = second.state.players.get(first.sessionId).x;
  assert.ok(afterNormalMove > initialX + 115 && afterNormalMove < initialX + 125);
  await waitFor(() => firstInput.lastProcessed >= firstTargetSeq);
  assert.equal(firstInput.pendingCount, firstInput.sentCount - firstInput.lastProcessed);

  firstInput.data.speed = 99999;
  const cheatStartX = second.state.players.get(first.sessionId).x;
  const cheatTargetSeq = sendFrames(firstInput, 30, -127, 0);
  await waitFor(() => second.state.players.get(first.sessionId)?.lastInputSeq >= cheatTargetSeq, 8000);
  const cheatDistance = cheatStartX - second.state.players.get(first.sessionId).x;
  assert.ok(cheatDistance > 115 && cheatDistance < 125, "服务器必须忽略客户端速度并把方向轴限制为 1");

  const beforePositionForgery = second.state.players.get(first.sessionId).x;
  firstInput.data.x = 1100;
  const forgeryTargetSeq = sendFrames(firstInput, 1, 0, 0);
  await waitFor(() => second.state.players.get(first.sessionId)?.lastInputSeq >= forgeryTargetSeq);
  assert.ok(Math.abs(second.state.players.get(first.sessionId).x - beforePositionForgery) < 0.01);

  const boundaryTargetSeq = sendFrames(firstInput, 120, -1, 0);
  await waitFor(() => second.state.players.get(first.sessionId)?.lastInputSeq >= boundaryTargetSeq, 10000);
  assert.ok(second.state.players.get(first.sessionId).x >= 116);
  assert.ok(second.state.players.get(first.sessionId).x <= 116.01);

  await waitFor(() => {
    const firstView = first.state.players.get(first.sessionId);
    const secondView = second.state.players.get(first.sessionId);
    return firstView && secondView
      && Math.abs(firstView.x - secondView.x) < 0.001
      && Math.abs(firstView.y - secondView.y) < 0.001;
  });
  assert.ok(first.state.serverTick > 0);

  await first.leave(true);
  await waitFor(() => second.state.players.size === 1);
  assert.equal(second.state.players.has(first.sessionId), false);
  await second.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);

  const cleanRoom = await new Client(endpoint).create("battle");
  await waitFor(() => cleanRoom.state?.players?.size === 1);
  assert.equal(cleanRoom.state.players.get(cleanRoom.sessionId).playerNumber, 1);
  assert.equal(cleanRoom.state.players.get(cleanRoom.sessionId).lastInputSeq, 0);
  await cleanRoom.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);
}

async function runCombatAcceptance() {
  const { Client } = await import("@colyseus/sdk");
  const first = await new Client(endpoint).create("battle");
  const firstEvents = [];
  first.onMessage("gameEvent", (event) => firstEvents.push(event));
  const second = await new Client(endpoint).joinById(first.roomId);
  const secondEvents = [];
  second.onMessage("gameEvent", (event) => secondEvents.push(event));
  await waitFor(() => (
    first.state.matchStarted
    && second.state.matchStarted
    && first.state.players?.size === 2
    && second.state.players?.size === 2
  ));

  const firstInput = first.input({ mode: "reliable" });
  const secondInput = second.input({ mode: "reliable" });
  const clientByNumber = new Map([
    [first.state.players.get(first.sessionId).playerNumber, { room: first, input: firstInput }],
    [second.state.players.get(second.sessionId).playerNumber, { room: second, input: secondInput }],
  ]);

  await waitFor(() => first.state.combatState === "NEUTRAL", 5000);
  assert.equal(first.state.forceBullTokens, true);

  const dashClient = clientByNumber.get(1);
  const dashSeq = sendFrames(dashClient.input, 1, 0, -1, { dashPressed: true });
  await waitFor(() => (
    first.state.players.get(dashClient.room.sessionId)?.lastInputSeq >= dashSeq
    && first.state.players.get(dashClient.room.sessionId)?.dashCooldownRemaining > 1
  ));

  const p1 = clientByNumber.get(1);
  const p2 = clientByNumber.get(2);
  const p1MoveSeq = sendFrames(p1.input, 30, 1, -1);
  const p2MoveSeq = sendFrames(p2.input, 30, -1, -1);
  await waitFor(() => (
    first.state.players.get(p1.room.sessionId)?.lastInputSeq >= p1MoveSeq
    && first.state.players.get(p2.room.sessionId)?.lastInputSeq >= p2MoveSeq
  ), 8000);
  assert.equal(first.state.lineOfSightClear, true);
  assert.ok(first.state.lockProgress === 0);

  const originalAttacker = first.state.attackerNumber;
  const originalDefender = first.state.defenderNumber;
  const attacker = clientByNumber.get(originalAttacker);
  const defender = clientByNumber.get(originalDefender);
  const defenderPlayer = () => first.state.players.get(defender.room.sessionId);

  const earlyHoldSeq = sendFrames(attacker.input, 30, 0, 0, { shouDown: true });
  await waitFor(() => first.state.lockProgress > 0);
  defender.input.data.perfect = true;
  const forgedSeq = sendFrames(defender.input, 1, 0, 0, { shouPressed: true });
  await waitFor(() => defenderPlayer()?.lastInputSeq >= forgedSeq);
  await waitFor(() => firstEvents.some((event) => event.type === "outcome" && event.outcome?.type === "early"));
  assert.equal(defenderPlayer().life, 54);
  assert.equal(first.state.attackerNumber, originalAttacker);
  assert.equal(first.state.roleRevision, 0);

  await waitFor(() => (
    first.state.combatState === "NEUTRAL"
    && first.state.players.get(attacker.room.sessionId)?.lastInputSeq >= earlyHoldSeq
  ), 5000);
  sendFrames(attacker.input, 70, 0, 0, { shouDown: true });
  sendFrames(attacker.input, 1, 0, 0);
  await waitFor(() => firstEvents.some((event) => event.type === "callout" && event.kind === "shou"), 8000);
  await waitFor(() => first.state.combatState === "REACTION_WINDOW", 5000);
  sendFrames(defender.input, 1, 0, 0, { shouPressed: true, perfect: true });
  await waitFor(() => first.state.roleRevision === 1, 6000);
  assert.equal(first.state.attackerNumber, originalDefender);
  assert.ok(first.state.players.get(attacker.room.sessionId).life < 60);

  await waitFor(() => first.state.combatState === "NEUTRAL" && first.state.safeTimeRemaining <= 0, 5000);
  const bullAttackerNumber = first.state.attackerNumber;
  const bullDefenderNumber = first.state.defenderNumber;
  const bullAttacker = clientByNumber.get(bullAttackerNumber);
  const bullDefender = clientByNumber.get(bullDefenderNumber);
  const bullAttackerLife = first.state.players.get(bullAttacker.room.sessionId).life;
  sendFrames(bullAttacker.input, 1, 0, 0, { niuPressed: true });
  await waitFor(() => first.state.attackKind === "bull" && first.state.combatState === "REACTION_WINDOW", 5000);
  sendFrames(bullDefender.input, 1, 0, 0, { niuPressed: true });
  await waitFor(() => first.state.roleRevision === 2, 6000);
  assert.equal(first.state.attackerNumber, bullDefenderNumber);
  assert.equal(first.state.players.get(bullAttacker.room.sessionId).life, bullAttackerLife - 5);

  await waitFor(() => (
    second.state.roleRevision === first.state.roleRevision
    && second.state.attackerNumber === first.state.attackerNumber
    && Math.abs(second.state.lockProgress - first.state.lockProgress) < 0.0001
  ));
  assert.deepEqual(
    [...first.state.players.values()].sort(byPlayerNumber).map((player) => player.life),
    [...second.state.players.values()].sort(byPlayerNumber).map((player) => player.life),
  );

  const firstRoleSwaps = firstEvents.filter((event) => event.type === "roleSwap");
  const secondRoleSwaps = secondEvents.filter((event) => event.type === "roleSwap");
  assert.equal(firstRoleSwaps.length, 2);
  assert.equal(secondRoleSwaps.length, 2);
  assert.equal(new Set(firstEvents.map((event) => event.id)).size, firstEvents.length);
  assert.equal(new Set(secondEvents.map((event) => event.id)).size, secondEvents.length);
  assert.ok(firstEvents.some((event) => event.type === "callout" && event.kind === "shou"));
  assert.ok(firstEvents.some((event) => event.type === "callout" && event.kind === "bull"));

  await first.leave(true);
  await second.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);
}

async function runBrowserAcceptance() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(playwrightPath);
  const browserHandle = await chromium.launch({ executablePath: browser, headless: true });
  const browserErrors = [];
  try {
    const context = await browserHandle.newContext({ viewport: { width: 1280, height: 900 } });
    const firstPage = await context.newPage();
    const secondPage = await context.newPage();
    for (const page of [firstPage, secondPage]) {
      page.on("pageerror", (error) => browserErrors.push(error.message));
      await page.goto(pageUrl, { waitUntil: "load" });
      await page.locator("#server-url").fill(endpoint);
      await page.locator("#connect").click();
      await page.waitForFunction(() => document.body.dataset.connection === "connected");
    }

    await firstPage.waitForFunction(() => document.body.dataset.playerCount === "2");
    await secondPage.waitForFunction(() => document.body.dataset.playerCount === "2");
    await firstPage.waitForFunction(() => document.body.dataset.combatState === "NEUTRAL");
    await secondPage.waitForFunction(() => document.body.dataset.combatState === "NEUTRAL");
    assert.equal(
      await firstPage.locator("body").getAttribute("data-room-id"),
      await secondPage.locator("body").getAttribute("data-room-id"),
    );
    assert.deepEqual(
      [await firstPage.locator("body").getAttribute("data-player-number"), await secondPage.locator("body").getAttribute("data-player-number")].sort(),
      ["1", "2"],
    );

    const movingPage = (await firstPage.locator("body").getAttribute("data-player-number")) === "1" ? firstPage : secondPage;
    const observingPage = movingPage === firstPage ? secondPage : firstPage;
    const before = await movingPage.evaluate(() => {
      return window.__networkTest.getPlayerSnapshot().find((player) => player.playerNumber === 1);
    });

    await movingPage.keyboard.down("KeyD");
    await new Promise((resolve) => setTimeout(resolve, 70));
    const predicted = await movingPage.evaluate(() => {
      return window.__networkTest.getPlayerSnapshot().find((player) => player.playerNumber === 1);
    });
    assert.ok(predicted.x > before.x, "100ms RTT 下本地预测应立即响应");
    assert.ok(predicted.x >= predicted.rawX, "预测位置不应落后于尚未确认的服务器位置");

    await new Promise((resolve) => setTimeout(resolve, 280));
    await movingPage.keyboard.up("KeyD");
    await observingPage.waitForFunction(
      (startX) => window.__networkTest.getPlayerSnapshot().find((player) => player.playerNumber === 1)?.x > startX,
      before.x,
    );
    await movingPage.waitForFunction(() => Number(document.body.dataset.ackedInput) > 0);
    await movingPage.waitForFunction(() => Number(document.body.dataset.pendingInput) < 12);
    assert.ok(Number(await movingPage.locator("body").getAttribute("data-server-tick")) > 0);

    await movingPage.evaluate(() => {
      window.__networkTest.setNetworkConditions({ latency: 120, jitter: 25, loss: 100 });
    });
    assert.match(await movingPage.locator("#status").innerText(), /120.*25.*100/);
    await movingPage.keyboard.down("KeyA");
    await movingPage.waitForFunction(() => Number(document.body.dataset.droppedPackets) > 0);
    await movingPage.keyboard.up("KeyA");
    await movingPage.evaluate(() => {
      window.__networkTest.setNetworkConditions({ latency: 0, jitter: 0, loss: 0 });
    });

    await movingPage.close();
    await observingPage.waitForFunction(() => document.body.dataset.playerCount === "1");
    assert.equal(await observingPage.locator("body").getAttribute("data-connection"), "connected");
    await observingPage.close();
    await context.close();
    await waitFor(async () => (await getHealth()).rooms === 0);
    assert.deepEqual(browserErrors, []);
  } finally {
    await browserHandle.close();
  }
}

function sendFrames(input, count, moveX, moveY, actions = {}) {
  for (let index = 0; index < count; index += 1) {
    input.data.clientSeq = input.sentCount + 1;
    input.data.moveX = moveX;
    input.data.moveY = moveY;
    input.data.dashPressed = Boolean(actions.dashPressed && index === 0);
    input.data.shouDown = Boolean(actions.shouDown);
    input.data.shouPressed = Boolean(actions.shouPressed && index === 0);
    input.data.niuPressed = Boolean(actions.niuPressed && index === 0);
    if (actions.perfect) input.data.perfect = true;
    input.send();
  }
  return input.sentCount;
}

function byPlayerNumber(first, second) {
  return first.playerNumber - second.playerNumber;
}

async function getHealth() {
  const response = await fetch(healthUrl);
  assert.equal(response.ok, true);
  return response.json();
}

async function waitForHttp(url) {
  await waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, 10000);
}

async function waitFor(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError ?? new Error("等待 N3 验收条件超时");
}
