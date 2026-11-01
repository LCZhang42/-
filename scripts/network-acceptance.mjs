import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NETWORK_PROTOCOL_VERSION,
  ROOM_PHASES,
  isValidRoomCode,
} from "../shared/PrivateRoom.js";

if (Number.parseInt(process.versions.node, 10) < 22 && !process.env.SHOUSHU_NETWORK_RELAUNCHED) {
  const modernNode = [
    process.env.NODE22_BIN,
    join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
  ].filter(Boolean).find(existsSync);
  if (!modernNode) throw new Error("N4 验收需要 Node 22+；可用 NODE22_BIN 指定新版 Node");
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
const serverConfigs = [
  { port: multiplayerPort, latency: 100 },
  { port: multiplayerPort + 1, latency: 50 },
  { port: multiplayerPort + 2, latency: 200 },
  { port: multiplayerPort + 3, latency: 400 },
];
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

const servers = serverConfigs.map((config) => ({
  ...config,
  endpoint: "ws://127.0.0.1:" + config.port,
  healthUrl: "http://127.0.0.1:" + config.port + "/healthz",
  process: spawn(process.execPath, ["scripts/multiplayer-server.mjs", String(config.port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MULTIPLAYER_PORT: String(config.port),
      COLYSEUS_LATENCY: String(config.latency),
      SHOUSHU_TEST_FORCE_BULL: "1",
      SHOUSHU_TEST_CONTROLS: "1",
      SHOUSHU_TEST_RECONNECT_SECONDS: "4",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }),
  output: "",
}));
const staticServer = spawn(process.execPath, ["scripts/serve.mjs", ".", String(staticPort)], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(staticPort) },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const server of servers) {
  server.process.stdout.on("data", (chunk) => { server.output += chunk; });
  server.process.stderr.on("data", (chunk) => { server.output += chunk; });
}

try {
  await Promise.all(servers.map((server) => waitForHttp(server.healthUrl)));
  await waitForHttp(pageUrl);
  await runSdkAcceptance();
  await runReconnectAcceptance();
  await runCombatAcceptance();
  for (const latency of [50, 100, 200]) {
    const server = servers.find((candidate) => candidate.latency === latency);
    await runTimingAcceptance(server, false);
  }
  await runTimingAcceptance(servers.find((server) => server.latency === 400), true);
  await runBrowserAcceptance();
  console.log("N6 网络验收通过：91/91（刷新恢复、自动重连、超时结算与 N5/N4 回归）");
} catch (error) {
  for (const server of servers) {
    if (server.output.trim()) console.error(server.output.trim());
  }
  throw error;
} finally {
  for (const server of servers) server.process.kill();
  staticServer.kill();
}

async function runSdkAcceptance() {
  const { Client } = await import("@colyseus/sdk");
  const first = await new Client(endpoint).create("battle", { protocolVersion: NETWORK_PROTOCOL_VERSION });
  first.onMessage("gameEvent", () => {});
  first.onMessage("roomStatus", () => {});
  assert.equal(isValidRoomCode(first.roomId), true);
  await assert.rejects(
    new Client(endpoint).joinById(first.roomId, { protocolVersion: "OLD" }),
    /VERSION_MISMATCH/,
  );
  const second = await new Client(endpoint).joinById(first.roomId, { protocolVersion: NETWORK_PROTOCOL_VERSION });
  second.onMessage("gameEvent", () => {});
  second.onMessage("roomStatus", () => {});
  await waitFor(() => first.state.players?.size === 2 && second.state.players?.size === 2);

  assert.equal(first.roomId, second.roomId);
  assert.equal(first.state.players.get(first.sessionId).playerNumber, 1);
  assert.equal(second.state.players.get(second.sessionId).playerNumber, 2);

  const firstInput = first.input({ mode: "reliable" });
  assert.equal(firstInput.tickRate, 60);
  assert.equal(firstInput.stepSeconds, 1 / 60);
  assert.equal(first.state.roomPhase, ROOM_PHASES.waiting);
  first.send("ready", true);
  second.send("ready", true);
  await waitFor(() => first.state.roomPhase === ROOM_PHASES.countdown, 3000);
  assert.ok(first.state.matchStartAtMs > first.clock.serverNow());
  await waitFor(() => first.state.combatState === "NEUTRAL", 6500);

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

  const cleanRoom = await new Client(endpoint).create("battle", { protocolVersion: NETWORK_PROTOCOL_VERSION });
  cleanRoom.onMessage("roomStatus", () => {});
  await waitFor(() => cleanRoom.state?.players?.size === 1);
  assert.equal(cleanRoom.state.players.get(cleanRoom.sessionId).playerNumber, 1);
  assert.equal(cleanRoom.state.players.get(cleanRoom.sessionId).lastInputSeq, 0);
  await cleanRoom.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);
}

async function runReconnectAcceptance() {
  const { Client } = await import("@colyseus/sdk");

  const first = await new Client(endpoint).create("battle", { protocolVersion: NETWORK_PROTOCOL_VERSION });
  const second = await new Client(endpoint).joinById(first.roomId, {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
  });
  first.onMessage("roomStatus", () => {});
  second.onMessage("roomStatus", () => {});
  first.onMessage("gameEvent", () => {});
  second.onMessage("gameEvent", () => {});
  await waitFor(() => first.state.players?.size === 2 && second.state.players?.size === 2);
  first.send("ready", true);
  second.send("ready", true);
  await waitFor(() => second.state.combatState === "NEUTRAL", 6500);

  const originalSessionId = first.sessionId;
  const originalPlayerNumber = first.state.players.get(first.sessionId).playerNumber;
  const reconnectionToken = first.reconnectionToken;
  first.reconnection.enabled = false;
  await first.leave(false);
  await waitFor(() => (
    second.state.roomPhase === ROOM_PHASES.paused
    && second.state.players.get(originalSessionId)?.connected === false
  ));
  const pausedRoundRemaining = second.state.roundRemaining;
  const pausedLife = [...second.state.players.values()]
    .sort(byPlayerNumber)
    .map((player) => player.life);
  const pausedAttacker = second.state.attackerNumber;
  assert.equal(second.state.pausedFromPhase, ROOM_PHASES.playing);
  assert.equal(second.state.disconnectedPlayerNumber, originalPlayerNumber);
  assert.ok(second.state.reconnectDeadlineAtMs > second.clock.serverNow());
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(Math.abs(second.state.roundRemaining - pausedRoundRemaining) < 0.02);

  const resumed = await new Client(endpoint).reconnect(reconnectionToken);
  resumed.onMessage("roomStatus", () => {});
  resumed.onMessage("gameEvent", () => {});
  await waitFor(() => resumed.state.roomPhase === ROOM_PHASES.playing);
  assert.equal(resumed.sessionId, originalSessionId);
  assert.equal(resumed.state.players.get(resumed.sessionId).playerNumber, originalPlayerNumber);
  assert.deepEqual(
    [...resumed.state.players.values()].sort(byPlayerNumber).map((player) => player.life),
    pausedLife,
  );
  assert.equal(resumed.state.attackerNumber, pausedAttacker);
  assert.ok(Math.abs(resumed.state.roundRemaining - second.state.roundRemaining) < 0.08);
  assert.equal(resumed.state.players.get(resumed.sessionId).connected, true);
  assert.equal(resumed.state.players.get(resumed.sessionId).lastInputSeq, 0);
  await resumed.leave(true);
  await second.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);

  const timeoutFirst = await new Client(endpoint).create("battle", {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
  });
  const timeoutSecond = await new Client(endpoint).joinById(timeoutFirst.roomId, {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
  });
  timeoutFirst.onMessage("roomStatus", () => {});
  timeoutSecond.onMessage("roomStatus", () => {});
  timeoutFirst.onMessage("gameEvent", () => {});
  timeoutSecond.onMessage("gameEvent", () => {});
  await waitFor(() => timeoutSecond.state.players?.size === 2);
  timeoutFirst.send("ready", true);
  timeoutSecond.send("ready", true);
  await waitFor(() => timeoutSecond.state.combatState === "NEUTRAL", 6500);
  const remainingNumber = timeoutSecond.state.players.get(timeoutSecond.sessionId).playerNumber;
  timeoutFirst.reconnection.enabled = false;
  await timeoutFirst.leave(false);
  await waitFor(() => timeoutSecond.state.roomPhase === ROOM_PHASES.paused);
  await waitFor(() => timeoutSecond.state.roomPhase === ROOM_PHASES.results, 7000);
  assert.equal(timeoutSecond.state.players.size, 1);
  assert.equal(timeoutSecond.state.winnerNumber, remainingNumber);
  assert.equal(timeoutSecond.state.matchStarted, false);
  assert.equal(timeoutSecond.state.disconnectedPlayerNumber, 0);
  await timeoutSecond.leave(true);
  await waitFor(async () => (await getHealth()).rooms === 0);
}

async function runCombatAcceptance() {
  const { Client } = await import("@colyseus/sdk");
  const first = await new Client(endpoint).create("battle", { protocolVersion: NETWORK_PROTOCOL_VERSION });
  const firstEvents = [];
  first.onMessage("gameEvent", (event) => firstEvents.push(event));
  first.onMessage("roomStatus", () => {});
  const second = await new Client(endpoint).joinById(first.roomId, { protocolVersion: NETWORK_PROTOCOL_VERSION });
  const secondEvents = [];
  second.onMessage("gameEvent", (event) => secondEvents.push(event));
  second.onMessage("roomStatus", () => {});
  await waitFor(() => (
    first.state.players?.size === 2
    && second.state.players?.size === 2
  ));

  const firstInput = first.input({ mode: "reliable" });
  const secondInput = second.input({ mode: "reliable" });
  const clientByNumber = new Map([
    [first.state.players.get(first.sessionId).playerNumber, { room: first, input: firstInput }],
    [second.state.players.get(second.sessionId).playerNumber, { room: second, input: secondInput }],
  ]);

  first.send("ready", true);
  second.send("ready", true);
  await waitFor(() => first.state.combatState === "NEUTRAL", 6500);
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

async function runTimingAcceptance(server, expectDegraded) {
  const { Client } = await import("@colyseus/sdk");
  const first = await new Client(server.endpoint).create("battle", { protocolVersion: NETWORK_PROTOCOL_VERSION });
  const firstEvents = [];
  first.onMessage("gameEvent", (event) => firstEvents.push({
    ...event,
    observedServerMs: first.clock.serverNow(),
  }));
  first.onMessage("roomStatus", () => {});
  const second = await new Client(server.endpoint).joinById(first.roomId, { protocolVersion: NETWORK_PROTOCOL_VERSION });
  const secondEvents = [];
  second.onMessage("gameEvent", (event) => secondEvents.push({
    ...event,
    observedServerMs: second.clock.serverNow(),
  }));
  second.onMessage("roomStatus", () => {});
  await waitFor(() => (
    first.state.players?.size === 2
    && second.state.players?.size === 2
  ));

  const firstInput = first.input({ mode: "reliable" });
  const secondInput = second.input({ mode: "reliable" });
  const clients = new Map([
    [first.state.players.get(first.sessionId).playerNumber, { room: first, input: firstInput, events: firstEvents }],
    [second.state.players.get(second.sessionId).playerNumber, { room: second, input: secondInput, events: secondEvents }],
  ]);

  const [firstWarmup, secondWarmup] = await Promise.all([
    sendPacedFrames(firstInput, 18, 0, 0),
    sendPacedFrames(secondInput, 18, 0, 0),
  ]);
  await waitFor(() => (
    firstInput.lastProcessed >= firstWarmup
    && secondInput.lastProcessed >= secondWarmup
    && first.clock.smoothedRtt() > 0
    && second.clock.smoothedRtt() > 0
  ), 10000);
  assert.ok(first.clock.smoothedRtt() >= server.latency * 0.45);
  assert.ok(first.clock.smoothedRtt() <= server.latency * 2.5 + 40);
  assert.ok(Number.isFinite(first.clock.serverNow() - first.clock.now()));
  first.send("ready", true);
  second.send("ready", true);
  await waitFor(() => first.state.combatState === "NEUTRAL", 7000);

  const p1 = clients.get(1);
  const p2 = clients.get(2);
  const p1MoveSeq = sendFrames(p1.input, 30, 1, -1);
  const p2MoveSeq = sendFrames(p2.input, 30, -1, -1);
  await waitFor(() => (
    first.state.players.get(p1.room.sessionId)?.lastInputSeq >= p1MoveSeq
    && first.state.players.get(p2.room.sessionId)?.lastInputSeq >= p2MoveSeq
  ), 10000);
  assert.equal(first.state.lineOfSightClear, true);

  const attacker = clients.get(first.state.attackerNumber);
  const defender = clients.get(first.state.defenderNumber);
  sendFrames(attacker.input, 70, 0, 0, { shouDown: true });
  sendFrames(attacker.input, 1, 0, 0);
  await waitFor(() => (
    firstEvents.some((event) => event.type === "callout" && event.kind === "shou")
    && secondEvents.some((event) => event.type === "callout" && event.kind === "shou")
  ), 10000);
  const firstCallout = firstEvents.find((event) => event.type === "callout" && event.kind === "shou");
  const secondCallout = secondEvents.find((event) => event.type === "callout" && event.kind === "shou");
  assert.equal(firstCallout.playAtServerMs, secondCallout.playAtServerMs);
  assert.ok(firstCallout.playAtServerMs > firstCallout.serverTimeMs);
  assert.ok(firstCallout.reactionOpensAtServerMs > firstCallout.playAtServerMs);
  assert.ok(Number.isFinite(firstCallout.observedServerMs));
  assert.ok(Number.isFinite(secondCallout.observedServerMs));

  await waitFor(() => defender.events.some((event) => event.type === "reactionOpened"), 6000);
  const reaction = defender.events.find((event) => event.type === "reactionOpened");
  assert.equal(
    reaction.reactionGraceDeadlineAtServerMs - reaction.reactionDeadlineAtServerMs,
    180,
  );
  const targetResponseTime = reaction.reactionOpenedAtServerMs + 210;
  await waitFor(() => defender.room.clock.serverNow() >= targetResponseTime, 3000);
  if (expectDegraded) {
    defender.input.data.reactionTimeMs = -999999;
    defender.input.data.clientTimestamp = 999999999;
  }
  const responseSeq = sendFrames(defender.input, 1, 0, 0, { shouPressed: true });
  await waitFor(() => firstEvents.some((event) => event.type === "outcome"), 8000);
  await waitFor(() => (
    first.state.players.get(defender.room.sessionId)?.lastInputSeq >= responseSeq
  ), 5000);
  const outcome = firstEvents.find((event) => event.type === "outcome").outcome;
  const defenderState = first.state.players.get(defender.room.sessionId);
  if (expectDegraded) {
    assert.equal(outcome.type, "reflect");
    assert.equal(defenderState.timingDegraded, true);
    assert.ok(defenderState.reactionCompensationMs > 110);
    assert.ok(defenderState.reactionCompensationMs <= 180);
  } else {
    assert.equal(outcome.type, "perfect");
    assert.equal(defenderState.timingDegraded, false);
    assert.ok(defenderState.reactionCompensationMs <= 110);
  }
  assert.equal(first.state.maxReactionCompensationMs, 180);

  await first.leave(true);
  await second.leave(true);
  await waitFor(async () => (await getHealth(server.healthUrl)).rooms === 0);
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
    }

    await secondPage.locator("#room-code-input").fill("ZZZZ");
    await secondPage.locator("#join-room").click();
    await secondPage.waitForFunction(() => document.querySelector("#lobby-error")?.dataset.error === "roomNotFound");

    await firstPage.locator("#connect").click();
    await firstPage.waitForFunction(() => document.body.dataset.connection === "connected");
    const privateRoomCode = await firstPage.locator("body").getAttribute("data-room-id");
    assert.match(privateRoomCode, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    await firstPage.locator("#copy-room-code").click();
    await firstPage.waitForFunction(() => document.querySelector("#copy-room-code")?.textContent.includes("已复制"));

    const refreshPage = await context.newPage();
    refreshPage.on("pageerror", (error) => browserErrors.push(error.message));
    await refreshPage.goto(pageUrl + "?room=" + privateRoomCode, { waitUntil: "load" });
    assert.equal(await refreshPage.locator("#room-code-input").inputValue(), privateRoomCode);
    assert.equal(await refreshPage.locator("body").getAttribute("data-connection"), "idle");
    assert.equal((await getRoomStatus(privateRoomCode)).playerCount, 1);
    await refreshPage.close();

    await secondPage.locator("#room-code-input").fill(privateRoomCode);
    await secondPage.locator("#join-room").click();
    await secondPage.waitForFunction(() => document.body.dataset.connection === "connected");

    await firstPage.waitForFunction(() => document.body.dataset.playerCount === "2");
    await secondPage.waitForFunction(() => document.body.dataset.playerCount === "2");
    const fullPage = await context.newPage();
    fullPage.on("pageerror", (error) => browserErrors.push(error.message));
    await fullPage.goto(pageUrl, { waitUntil: "load" });
    await fullPage.locator("#server-url").fill(endpoint);
    await fullPage.locator("#room-code-input").fill(privateRoomCode);
    await fullPage.locator("#join-room").click();
    await fullPage.waitForFunction(() => document.querySelector("#lobby-error")?.dataset.error === "roomFull");
    await fullPage.close();

    await firstPage.locator("#ready").click();
    await firstPage.waitForFunction(() => document.body.dataset.ownReady === "true");
    await secondPage.locator("#ready").click();
    await firstPage.waitForFunction(() => document.body.dataset.roomPhase === "COUNTDOWN");
    await secondPage.waitForFunction(() => document.body.dataset.roomPhase === "COUNTDOWN");
    assert.match(await firstPage.locator("#countdown").innerText(), /^[123]$/);
    assert.equal((await getRoomStatus(privateRoomCode)).roomPhase, ROOM_PHASES.countdown);
    await firstPage.waitForFunction(() => document.body.dataset.combatState === "NEUTRAL");
    await secondPage.waitForFunction(() => document.body.dataset.combatState === "NEUTRAL");

    const startedPage = await context.newPage();
    startedPage.on("pageerror", (error) => browserErrors.push(error.message));
    await startedPage.goto(pageUrl, { waitUntil: "load" });
    await startedPage.locator("#server-url").fill(endpoint);
    await startedPage.locator("#room-code-input").fill(privateRoomCode);
    await startedPage.locator("#join-room").click();
    await startedPage.waitForFunction(() => document.querySelector("#lobby-error")?.dataset.error === "matchStarted");
    await startedPage.close();
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
    await movingPage.evaluate(() => window.__networkTest.forceDrop());
    await movingPage.waitForFunction(() => document.body.dataset.connection === "reconnecting");
    await observingPage.waitForFunction(() => document.body.dataset.roomPhase === "PAUSED");
    assert.match(await observingPage.locator("#reconnect-notice").innerText(), /掉线.*暂停.*重连/);
    await movingPage.waitForFunction(() => document.body.dataset.connection === "connected", null, {
      timeout: 6000,
    });
    await observingPage.waitForFunction(() => document.body.dataset.roomPhase === "PLAYING");

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
    await movingPage.waitForFunction(() => Number(document.body.dataset.pendingInput) < 24);
    assert.ok(Number(await movingPage.locator("body").getAttribute("data-server-tick")) > 0);

    await firstPage.waitForFunction(() => document.body.dataset.networkQuality !== "syncing");
    await secondPage.waitForFunction(() => document.body.dataset.networkQuality !== "syncing");
    assert.match(await firstPage.locator("#rtt").innerText(), /^(良好|一般|较差)$/);
    assert.ok(Number.isFinite(Number(await firstPage.locator("body").getAttribute("data-clock-offset-ms"))));

    const refreshIdentity = await movingPage.evaluate(() => ({
      sessionId: window.__networkTest.room.sessionId,
      playerNumber: Number(document.body.dataset.playerNumber),
    }));
    await movingPage.reload({ waitUntil: "load" });
    await movingPage.waitForFunction(() => document.body.dataset.connection === "connected", null, {
      timeout: 7000,
    });
    await movingPage.waitForFunction(() => document.body.dataset.roomPhase === "PLAYING");
    const restoredIdentity = await movingPage.evaluate(() => ({
      sessionId: window.__networkTest.room.sessionId,
      playerNumber: Number(document.body.dataset.playerNumber),
    }));
    assert.deepEqual(restoredIdentity, refreshIdentity);
    const [restoredCombat, observerCombat] = await Promise.all([
      movingPage.evaluate(() => window.__networkTest.getCombatSnapshot()),
      observingPage.evaluate(() => window.__networkTest.getCombatSnapshot()),
    ]);
    assert.deepEqual(restoredCombat.life, observerCombat.life);
    assert.equal(restoredCombat.attackerNumber, observerCombat.attackerNumber);
    assert.ok(Math.abs(restoredCombat.roundRemaining - observerCombat.roundRemaining) < 0.12);
    assert.ok(Number(await movingPage.locator("body").getAttribute("data-pending-input")) < 24);

    const firstNumber = await firstPage.locator("body").getAttribute("data-player-number");
    const p1Page = firstNumber === "1" ? firstPage : secondPage;
    const p2Page = firstNumber === "2" ? firstPage : secondPage;
    await p1Page.keyboard.down("KeyW");
    await p1Page.keyboard.down("KeyD");
    await p2Page.keyboard.down("ArrowUp");
    await p2Page.keyboard.down("ArrowLeft");
    await firstPage.waitForFunction(
      () => window.__networkTest.getCombatSnapshot()?.lineOfSightClear === true,
      null,
      { timeout: 5000 },
    );
    await p1Page.keyboard.up("KeyW");
    await p1Page.keyboard.up("KeyD");
    await p2Page.keyboard.up("ArrowUp");
    await p2Page.keyboard.up("ArrowLeft");
    const attackerNumber = Number(await firstPage.locator("body").getAttribute("data-attacker-number"));
    const attackerPage = attackerNumber === 1 ? p1Page : p2Page;
    const attackKey = attackerNumber === 1 ? "KeyF" : "KeyK";
    await attackerPage.keyboard.down(attackKey);
    await new Promise((resolve) => setTimeout(resolve, 950));
    await attackerPage.keyboard.up(attackKey);
    await firstPage.waitForFunction(() => window.__networkTest.getCalloutPlayback().length > 0);
    await secondPage.waitForFunction(() => window.__networkTest.getCalloutPlayback().length > 0);
    const firstPlayback = await firstPage.evaluate(() => window.__networkTest.getCalloutPlayback().at(-1));
    const secondPlayback = await secondPage.evaluate(() => window.__networkTest.getCalloutPlayback().at(-1));
    assert.equal(firstPlayback.targetServerMs, secondPlayback.targetServerMs);
    assert.ok(Math.abs(firstPlayback.displayedAtServerMs - secondPlayback.displayedAtServerMs) < 60);
    assert.ok(Math.abs(firstPlayback.errorMs) < 80);
    assert.ok(Math.abs(secondPlayback.errorMs) < 80);

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

    const previousEpoch = await firstPage.evaluate(() => window.__networkTest.getCombatSnapshot().matchEpoch);
    await firstPage.evaluate(() => window.__networkTest.room.send("testEndMatch"));
    await firstPage.waitForFunction(() => document.body.dataset.roomPhase === "RESULTS");
    await secondPage.waitForFunction(() => document.body.dataset.roomPhase === "RESULTS");
    await firstPage.locator("#rematch").click();
    await firstPage.waitForFunction(() => document.querySelector("#rematch")?.disabled === true);
    await secondPage.locator("#rematch").click();
    await firstPage.waitForFunction(() => document.body.dataset.roomPhase === "COUNTDOWN");
    await firstPage.waitForFunction(
      (epoch) => window.__networkTest.getCombatSnapshot().matchEpoch > epoch,
      previousEpoch,
    );
    await firstPage.waitForFunction(() => document.body.dataset.combatState === "NEUTRAL");

    await movingPage.locator("#leave").click();
    await movingPage.waitForFunction(() => document.body.dataset.connection === "left");
    assert.equal(await movingPage.locator("#lobby-panel").isVisible(), true);
    await movingPage.close();
    await observingPage.waitForFunction(() => document.body.dataset.playerCount === "1");
    assert.equal(await observingPage.locator("body").getAttribute("data-connection"), "connected");
    await observingPage.locator("#leave").click();
    await observingPage.waitForFunction(() => document.body.dataset.connection === "left");
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

async function sendPacedFrames(input, count, moveX, moveY, actions = {}) {
  for (let index = 0; index < count; index += 1) {
    sendFrames(input, 1, moveX, moveY, {
      dashPressed: Boolean(actions.dashPressed && index === 0),
      shouDown: actions.shouDown,
      shouPressed: Boolean(actions.shouPressed && index === 0),
      niuPressed: Boolean(actions.niuPressed && index === 0),
    });
    await new Promise((resolve) => setTimeout(resolve, 17));
  }
  return input.sentCount;
}

function byPlayerNumber(first, second) {
  return first.playerNumber - second.playerNumber;
}

async function getHealth(url = healthUrl) {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return response.json();
}

async function getRoomStatus(code) {
  const response = await fetch("http://127.0.0.1:" + multiplayerPort + "/rooms/" + code);
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
  throw lastError ?? new Error("等待 N6 验收条件超时");
}
