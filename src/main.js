import { checkCompatibility, formatCompatibility } from "./core/Compatibility.js";

const requiredElements = {
  canvas: document.querySelector("#game-canvas"),
  startOverlay: document.querySelector("#start-overlay"),
  startAi: document.querySelector("#start-ai"),
  startLocal: document.querySelector("#start-local"),
  startTutorial: document.querySelector("#start-tutorial"),
  startSettings: document.querySelector("#start-settings"),
  startFullscreen: document.querySelector("#start-fullscreen"),
  characterSelectOverlay: document.querySelector("#character-select-overlay"),
  characterSelectMode: document.querySelector("#character-select-mode"),
  characterSelectTitle: document.querySelector("#character-select-title"),
  characterSelectStep: document.querySelector("#character-select-step"),
  characterRoster: document.querySelector("#character-roster"),
  characterSelectImage: document.querySelector("#character-select-image"),
  characterSelectPose: document.querySelector("#character-select-pose"),
  characterSelectName: document.querySelector("#character-select-name"),
  characterSelectTagline: document.querySelector("#character-select-tagline"),
  characterSelectBio: document.querySelector("#character-select-bio"),
  characterExpressionPreview: document.querySelector("#character-expression-preview"),
  characterMirrorNote: document.querySelector("#character-mirror-note"),
  characterSelectBack: document.querySelector("#character-select-back"),
  characterSelectConfirm: document.querySelector("#character-select-confirm"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  gameVersion: document.querySelector("#game-version"),
  status: document.querySelector("#game-status"),
  pauseOverlay: document.querySelector("#pause-overlay"),
  outcomeOverlay: document.querySelector("#outcome-overlay"),
  outcomeTitle: document.querySelector("#outcome-title"),
  outcomeDetail: document.querySelector("#outcome-detail"),
  debugPanel: document.querySelector("#debug-panel"),
  debugValues: document.querySelector("#debug-values"),
  dashMeters: document.querySelectorAll("[data-dash-player]"),
  lockHud: document.querySelector("#lock-hud"),
  timer: document.querySelector("#round-timer"),
  lifeMeters: document.querySelectorAll("[data-life-player]"),
  roleLabels: document.querySelectorAll("[data-role-player]"),
  bullIndicators: document.querySelectorAll("[data-bull-player]"),
  tutorialOverlay: document.querySelector("#tutorial-overlay"),
  tutorialStep: document.querySelector("#tutorial-step"),
  tutorialTitle: document.querySelector("#tutorial-title"),
  tutorialVisual: document.querySelector("#tutorial-visual"),
  tutorialText: document.querySelector("#tutorial-text"),
  tutorialNext: document.querySelector("#tutorial-next"),
  tutorialSkip: document.querySelector("#tutorial-skip"),
  settingsOverlay: document.querySelector("#settings-overlay"),
  settingsClose: document.querySelector("#settings-close"),
  settingsTutorial: document.querySelector("#settings-tutorial"),
  difficultySelect: document.querySelector("#difficulty-select"),
  masterVolume: document.querySelector("#master-volume"),
  effectsVolume: document.querySelector("#effects-volume"),
  voiceVolume: document.querySelector("#voice-volume"),
  voiceEnabled: document.querySelector("#voice-enabled"),
  subtitlesEnabled: document.querySelector("#subtitles-enabled"),
  lowEffectsEnabled: document.querySelector("#low-effects-enabled"),
  flashesEnabled: document.querySelector("#flashes-enabled"),
  aiDifficultySelect: document.querySelector("#ai-difficulty-select"),
  p2AiBadge: document.querySelector("#p2-ai-badge"),
  pauseResume: document.querySelector("#pause-resume"),
  pauseRestart: document.querySelector("#pause-restart"),
  pauseSettings: document.querySelector("#pause-settings"),
  pauseFullscreen: document.querySelector("#pause-fullscreen"),
  pauseMenu: document.querySelector("#pause-menu"),
};

const boot = {
  overlay: document.querySelector("#boot-overlay"),
  title: document.querySelector("#boot-title"),
  detail: document.querySelector("#boot-detail"),
  progress: document.querySelector("#boot-progress"),
  reload: document.querySelector("#boot-reload"),
};

const missingElements = Object.entries(requiredElements)
  .filter(([, element]) => !element || ("length" in element && element.length === 0))
  .map(([name]) => name);

function showBootError(error) {
  boot.overlay.hidden = false;
  boot.overlay.classList.add("has-error");
  boot.title.textContent = "游戏没有成功启动";
  boot.detail.textContent = error instanceof Error ? error.message : String(error);
  boot.progress.style.width = "100%";
  boot.reload.hidden = false;
}

async function startApplication() {
  try {
    if (missingElements.length > 0) {
      throw new Error(`页面文件不完整：缺少 ${missingElements.join(", ")}`);
    }

    boot.progress.style.width = "38%";
    const report = checkCompatibility(globalThis);
    requiredElements.compatibilityNote.textContent = formatCompatibility(report);
    requiredElements.compatibilityNote.classList.toggle("has-warning", report.warnings.length > 0);
    if (!report.supported) throw new Error(report.errors.join("；"));

    boot.detail.textContent = "正在加载对战系统";
    boot.progress.style.width = "72%";
    const { Game } = await import("./core/Game.js");
    const game = new Game(requiredElements);
    game.start();
    globalThis.__SHOUSHU_GAME__ = game;

    boot.progress.style.width = "100%";
    boot.detail.textContent = "准备完成";
    requestAnimationFrame(() => {
      boot.overlay.hidden = true;
    });
  } catch (error) {
    console.error(error);
    showBootError(error);
  }
}

boot.reload.addEventListener("click", () => location.reload());
startApplication();
