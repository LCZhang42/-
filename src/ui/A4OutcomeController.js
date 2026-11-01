import { OutcomePoseRenderer } from "../rendering/OutcomePoseRenderer.js";
import { getLatestDollSnapshot } from "../rendering/DollAnimation.js";

const canvas = document.querySelector("#outcome-canvas");
const overlay = document.querySelector("#outcome-overlay");

function numericLife(player) {
  for (const key of ["lifespan", "life", "years", "score", "health"]) {
    if (Number.isFinite(player?.[key])) return player[key];
  }
  return 0;
}

function resolveWinnerIndex(game) {
  const text = overlay?.textContent ?? "";
  const p1 = /(?:P1|玩家\s*1).*?(?:胜|赢)|(?:胜|赢).*?(?:P1|玩家\s*1)/i.test(text);
  const p2 = /(?:P2|玩家\s*2|AI).*?(?:胜|赢)|(?:胜|赢).*?(?:P2|玩家\s*2|AI)/i.test(text);
  if (p1 !== p2) return p1 ? 0 : 1;

  const [left, right] = game.players.map(numericLife);
  if (left === right) return null;
  return left > right ? 0 : 1;
}

function overlayIsVisible() {
  if (!overlay || overlay.hidden || overlay.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(overlay);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function drawOutcome() {
  const game = window.__SHOUSHU_GAME__ ?? getLatestDollSnapshot();
  if (!canvas || !overlayIsVisible() || !game?.players?.length) return;

  const renderer = new OutcomePoseRenderer(canvas);
  renderer.draw({
    players: game.players,
    winnerIndex: resolveWinnerIndex(game),
    characterIds: game.characterIds ?? [],
    customPoses: game.customPoses ?? [],
    poseIndexes: game.poseIndexes ?? [],
  });
}

if (canvas && overlay) {
  const observer = new MutationObserver(() => requestAnimationFrame(drawOutcome));
  observer.observe(overlay, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
  window.addEventListener("shoushu:round-outcome", drawOutcome);
}
