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
  customCharacterOpen: document.querySelector("#custom-character-open"),
  customCharacterExport: document.querySelector("#custom-character-export"),
  customCharacterDelete: document.querySelector("#custom-character-delete"),
  customCharacterShare: document.querySelector("#custom-character-share"),
  customCharacterReceive: document.querySelector("#custom-character-receive"),
  customCharacterOverlay: document.querySelector("#custom-character-overlay"),
  customCharacterClose: document.querySelector("#custom-character-close"),
  customCharacterCanvas: document.querySelector("#custom-character-canvas"),
  customCharacterStatus: document.querySelector("#custom-character-status"),
  customCharacterFile: document.querySelector("#custom-character-file"),
  customCharacterPackage: document.querySelector("#custom-character-package"),
  customCharacterZoom: document.querySelector("#custom-character-zoom"),
  customCharacterRotation: document.querySelector("#custom-character-rotation"),
  customCharacterOffsetX: document.querySelector("#custom-character-offset-x"),
  customCharacterOffsetY: document.querySelector("#custom-character-offset-y"),
  customCharacterMode: document.querySelectorAll("[name='custom-character-mode']"),
  customJointGuide: document.querySelector("#custom-joint-guide"),
  customJointName: document.querySelector("#custom-joint-name"),
  customJointList: document.querySelector("#custom-joint-list"),
  customJointUndo: document.querySelector("#custom-joint-undo"),
  customJointReset: document.querySelector("#custom-joint-reset"),
  customCharacterName: document.querySelector("#custom-character-name"),
  customCharacterSave: document.querySelector("#custom-character-save"),
  characterShareOverlay: document.querySelector("#character-share-overlay"),
  characterShareClose: document.querySelector("#character-share-close"),
  characterShareStatus: document.querySelector("#character-share-status"),
  characterSharePanel: document.querySelector("#character-share-panel"),
  characterReceivePanel: document.querySelector("#character-receive-panel"),
  characterShareRights: document.querySelector("#share-rights"),
  characterShareMinorSafety: document.querySelector("#share-minor-safety"),
  characterSharePrivacy: document.querySelector("#share-privacy"),
  characterShareUpload: document.querySelector("#character-share-upload"),
  characterShareResult: document.querySelector("#character-share-result"),
  characterShareResultState: document.querySelector("#character-share-result-state"),
  characterShareCode: document.querySelector("#character-share-code"),
  characterShareCopy: document.querySelector("#character-share-copy"),
  characterShareDelete: document.querySelector("#character-share-delete"),
  characterReceiveCode: document.querySelector("#character-receive-code"),
  characterShareLookup: document.querySelector("#character-share-lookup"),
  characterSharePreview: document.querySelector("#character-share-preview"),
  characterSharePreviewImage: document.querySelector("#character-share-preview-image"),
  characterSharePreviewName: document.querySelector("#character-share-preview-name"),
  characterSharePreviewMode: document.querySelector("#character-share-preview-mode"),
  characterShareImport: document.querySelector("#character-share-import"),
  characterShareReportReason: document.querySelector("#character-share-report-reason"),
  characterShareReport: document.querySelector("#character-share-report"),
  characterShareEndpoint: document.querySelector("#character-share-endpoint"),
  characterShareSaveEndpoint: document.querySelector("#character-share-save-endpoint"),
  poseEditorOverlay: document.querySelector("#pose-editor-overlay"),
  poseEditorCanvas: document.querySelector("#pose-editor-canvas"),
  poseEditorTitle: document.querySelector("#pose-editor-title"),
  poseEditorSubtitle: document.querySelector("#pose-editor-subtitle"),
  poseCurrentName: document.querySelector("#pose-current-name"),
  poseEditorStatus: document.querySelector("#pose-editor-status"),
  poseJoints: document.querySelector("#pose-joints"),
  posePresets: document.querySelector("#pose-presets"),
  poseSlots: document.querySelector("#pose-slots"),
  poseMirror: document.querySelector("#pose-mirror"),
  poseReset: document.querySelector("#pose-reset"),
  poseRandom: document.querySelector("#pose-random"),
  poseSave: document.querySelector("#pose-save"),
  poseDelete: document.querySelector("#pose-delete"),
  poseSkip: document.querySelector("#pose-skip"),
  poseUse: document.querySelector("#pose-use"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  gameVersion: document.querySelector("#game-version"),
  status: document.querySelector("#game-status"),
  pauseOverlay: document.querySelector("#pause-overlay"),
  outcomeOverlay: document.querySelector("#outcome-overlay"),
  outcomeTitle: document.querySelector("#outcome-title"),
  outcomeDetail: document.querySelector("#outcome-detail"),
  outcomeCanvas: document.querySelector("#outcome-canvas"),
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
