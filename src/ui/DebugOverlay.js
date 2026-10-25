export class DebugOverlay {
  constructor({ panel, values, refreshRate = 8 }) {
    this.panel = panel;
    this.values = values;
    this.refreshInterval = 1 / refreshRate;
    this.timeSinceRefresh = Number.POSITIVE_INFINITY;
    this.visible = false;
    this.panel.hidden = true;
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  setVisible(value) {
    this.visible = Boolean(value);
    this.panel.hidden = !this.visible;
  }

  update(deltaTime, data) {
    this.timeSinceRefresh += deltaTime;
    if (!this.visible || this.timeSinceRefresh < this.refreshInterval) return;
    this.timeSinceRefresh = 0;

    const rows = [
      ["STATE", data.state],
      ["MODE", data.mode],
      ["FPS", data.fps.toFixed(1)],
      ["FRAME", `${data.frameTimeMs.toFixed(2)} ms`],
      ["FIXED STEP", `${(data.fixedTimeStep * 1000).toFixed(2)} ms`],
      ["UPDATES", String(data.updatesThisFrame)],
      ["DROPPED", String(data.droppedUpdateFrames)],
      ["LOGICAL", `${data.logicalWidth} × ${data.logicalHeight}`],
      ["DISPLAY", `${data.displayWidth} × ${data.displayHeight}`],
      ["DPR", data.devicePixelRatio.toFixed(2)],
      ["P1 AXIS", `${data.p1Axis.x}, ${data.p1Axis.y}`],
      ["P2 AXIS", `${data.p2Axis.x}, ${data.p2Axis.y}`],
      ["P1 POS", data.p1Position],
      ["P2 POS", data.p2Position],
      ["P1 DASH", data.p1Dash > 0 ? `${data.p1Dash.toFixed(2)} s` : "READY"],
      ["P2 DASH", data.p2Dash > 0 ? `${data.p2Dash.toFixed(2)} s` : "READY"],
      ["SIGHT", data.lineOfSight],
      ["ROUND", `${data.roundTime.toFixed(1)} s`],
      ["LIFE", `${data.life[0]} / ${data.life[1]}`],
      ["ATTACKER", data.attacker],
      ["CALLOUT", data.attackKind.toUpperCase()],
      ["BULL", `${Math.round(data.bullCharge[0])}/${Math.round(data.bullCharge[1])}`],
      ["TOKENS", `${data.bullTokens[0] ? "P1" : "—"} / ${data.bullTokens[1] ? "P2" : "—"}`],
      ["FORCE BULL", data.forceBull ? "ON" : "off"],
      ["VISUALS", data.lowEffects ? "LOW" : "FULL"],
      ["FX POOL", String(data.effectCount)],
      ["DIFFICULTY", data.difficulty],
      ["RESPONSE", `${Math.round(data.responseRate * 100)}%`],
      ["LOCKS", `${data.lockAttempts[0]} / ${data.lockAttempts[1]}`],
      ["ATTACK TIME", `${data.attackerSeconds[0].toFixed(1)} / ${data.attackerSeconds[1].toFixed(1)} s`],
      ["LOCK", `${data.lockStatus} · ${(data.lockProgress * 100).toFixed(0)}%`],
      ["DISTANCE", `${data.lockDistance.toFixed(1)} px`],
      ["ANGLE", `${(data.lockAngle * 180 / Math.PI).toFixed(1)}°`],
      ["CHECKS", formatChecks(data.lockConditions)],
      ["L / R SHIFT", `${data.leftShift ? "ON" : "off"} / ${data.rightShift ? "ON" : "off"}`],
      ["ACTIVE", data.activeKeys.join(" + ") || "—"],
      ["LAST EVENT", data.lastEvent],
      ["EVENTS", String(data.eventCount)],
    ];

    this.values.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value;
        description.title = value;
        return [term, description];
      }),
    );
  }
}

function formatChecks(conditions) {
  return [
    conditions.inRange ? "R✓" : "R×",
    conditions.inCone ? "A✓" : "A×",
    conditions.lineOfSight ? "L✓" : "L×",
    conditions.targetVulnerable ? "V✓" : "V×",
  ].join(" ");
}
