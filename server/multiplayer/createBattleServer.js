import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { BattleRoom, getBattleRoomDiagnostics } from "./BattleRoom.js";

export function createBattleServer({
  greet = false,
  forceBullTokens = process.env.SHOUSHU_TEST_FORCE_BULL === "1",
} = {}) {
  const server = new Server({
    greet,
    transport: new WebSocketTransport(),
    express: (app) => {
      app.get("/healthz", (_request, response) => {
        response.json({ ok: true, rooms: getBattleRoomDiagnostics().activeRoomIds.length });
      });
    },
  });
  server.define("battle", BattleRoom, { forceBullTokens });
  return server;
}
