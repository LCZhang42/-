import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  BattleRoom,
  getBattleRoomDiagnostics,
  getPrivateRoomStatus,
} from "./BattleRoom.js";

export function createBattleServer({
  greet = false,
  forceBullTokens = process.env.SHOUSHU_TEST_FORCE_BULL === "1",
  allowTestControls = process.env.SHOUSHU_TEST_CONTROLS === "1",
  reconnectionGraceSeconds = Number(process.env.SHOUSHU_TEST_RECONNECT_SECONDS) || undefined,
} = {}) {
  const server = new Server({
    greet,
    transport: new WebSocketTransport(),
    express: (app) => {
      app.get("/healthz", (_request, response) => {
        response.json({ ok: true, rooms: getBattleRoomDiagnostics().activeRoomIds.length });
      });
      app.get("/rooms/:code", (request, response) => {
        response.set("Access-Control-Allow-Origin", "*");
        response.set("Cache-Control", "no-store");
        const status = getPrivateRoomStatus(request.params.code);
        if (!status) {
          response.status(404).json({ error: "ROOM_NOT_FOUND" });
          return;
        }
        response.json(status);
      });
    },
  });
  server.define("battle", BattleRoom, {
    forceBullTokens,
    allowTestControls,
    reconnectionGraceSeconds,
  });
  return server;
}
