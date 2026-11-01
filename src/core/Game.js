import {
  ARENA_CONFIG,
  AI_DIFFICULTY_CONFIG,
  COMBAT_CONFIG,
  DIFFICULTY_CONFIG,
  GAME_CONFIG,
  LOCK_CONFIG,
  MOVEMENT_CONFIG,
  PLAYER_CONFIGS,
  PREVENT_DEFAULT_KEYS,
  SYSTEM_KEYS,
} from "../config.js";
import { AIController } from "../ai/AIController.js";
import { LockAudio } from "../audio/LockAudio.js";
import { VoiceAnnouncer } from "../audio/VoiceAnnouncer.js";
import { CharacterAssetLoader } from "../characters/CharacterAssetLoader.js";
import {
  getAvailableCharacters,
  getCharacter,
  getCharacterIndex,
  isCustomCharacter,
} from "../characters/CharacterCatalog.js";
import {
  CharacterSelectionSession,
  readCharacterSelections,
  writeCharacterSelections,
} from "../characters/CharacterSelection.js";
import { COMBAT_STATES } from "../game/CombatSystem.js";
import { MatchStats } from "../game/MatchStats.js";
import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { DebugOverlay } from "../ui/DebugOverlay.js";
import { CharacterShareDialog } from "../ui/CharacterShareDialog.js";
import { CustomCharacterImport } from "../ui/CustomCharacterImport.js";
import { PoseEditor } from "../ui/PoseEditor.js";
import { SimulationCore } from "../../shared/SimulationCore.js";
import { GameLoop } from "./GameLoop.js";
import { InputManager } from "./InputManager.js";
import { StateMachine } from "./StateMachine.js";

const GAME_STATES = Object.freeze({
  running: "RUNNING",
  paused: "PAUSED",
});

export class Game {
  constructor({
    canvas,
    startOverlay,
    startAi,
    startLocal,
    startTutorial,
    startSettings,
    startFullscreen,
    characterSelectOverlay,
    characterSelectMode,
    characterSelectTitle,
    characterSelectStep,
    characterRoster,
    characterSelectImage,
    characterSelectPose,
    characterSelectName,
    characterSelectTagline,
    characterSelectBio,
    characterExpressionPreview,
    characterMirrorNote,
    characterSelectBack,
    characterSelectConfirm,
    customCharacterOpen,
    customCharacterExport,
    customCharacterDelete,
    customCharacterShare,
    customCharacterReceive,
    customCharacterOverlay,
    customCharacterClose,
    customCharacterCanvas,
    customCharacterStatus,
    customCharacterFile,
    customCharacterPackage,
    customCharacterZoom,
    customCharacterRotation,
    customCharacterOffsetX,
    customCharacterOffsetY,
    customCharacterMode,
    customJointGuide,
    customJointName,
    customJointList,
    customJointUndo,
    customJointReset,
    customCharacterName,
    customCharacterSave,
    characterShareOverlay,
    characterShareClose,
    characterShareStatus,
    characterSharePanel,
    characterReceivePanel,
    characterShareRights,
    characterShareMinorSafety,
    characterSharePrivacy,
    characterShareUpload,
    characterShareResult,
    characterShareResultState,
    characterShareCode,
    characterShareCopy,
    characterShareDelete,
    characterReceiveCode,
    characterShareLookup,
    characterSharePreview,
    characterSharePreviewImage,
    characterSharePreviewName,
    characterSharePreviewMode,
    characterShareImport,
    characterShareReportReason,
    characterShareReport,
    characterShareEndpoint,
    characterShareSaveEndpoint,
    poseEditorOverlay,
    poseEditorCanvas,
    poseEditorTitle,
    poseEditorSubtitle,
    poseCurrentName,
    poseEditorStatus,
    poseJoints,
    posePresets,
    poseSlots,
    poseMirror,
    poseReset,
    poseRandom,
    poseSave,
    poseDelete,
    poseSkip,
    poseUse,
    compatibilityNote,
    gameVersion,
    status,
    pauseOverlay,
    outcomeOverlay,
    outcomeTitle,
    outcomeDetail,
    debugPanel,
    debugValues,
    dashMeters,
    lockHud,
    timer,
    lifeMeters,
    roleLabels,
    bullIndicators,
    tutorialOverlay,
    tutorialStep,
    tutorialTitle,
    tutorialVisual,
    tutorialText,
    tutorialNext,
    tutorialSkip,
    settingsOverlay,
    settingsClose,
    settingsTutorial,
    difficultySelect,
    masterVolume,
    effectsVolume,
    voiceVolume,
    voiceEnabled,
    subtitlesEnabled,
    lowEffectsEnabled,
    flashesEnabled,
    aiDifficultySelect,
    p2AiBadge,
    pauseResume,
    pauseRestart,
    pauseSettings,
    pauseFullscreen,
    pauseMenu,
  }) {
    this.canvas = canvas;
    this.startMenu = {
      overlay: startOverlay,
      ai: startAi,
      local: startLocal,
      tutorial: startTutorial,
      settings: startSettings,
      fullscreen: startFullscreen,
      compatibility: compatibilityNote,
      version: gameVersion,
    };
    this.pauseActions = {
      resume: pauseResume,
      restart: pauseRestart,
      settings: pauseSettings,
      fullscreen: pauseFullscreen,
      menu: pauseMenu,
    };
    this.characterSelect = {
      overlay: characterSelectOverlay,
      mode: characterSelectMode,
      title: characterSelectTitle,
      step: characterSelectStep,
      roster: characterRoster,
      image: characterSelectImage,
      pose: characterSelectPose,
      name: characterSelectName,
      tagline: characterSelectTagline,
      bio: characterSelectBio,
      expressions: characterExpressionPreview,
      mirrorNote: characterMirrorNote,
      back: characterSelectBack,
      confirm: characterSelectConfirm,
      customOpen: customCharacterOpen,
      customExport: customCharacterExport,
      customDelete: customCharacterDelete,
      customShare: customCharacterShare,
      customReceive: customCharacterReceive,
    };
    this.customCharacterImport = new CustomCharacterImport({
      overlay: customCharacterOverlay,
      close: customCharacterClose,
      canvas: customCharacterCanvas,
      status: customCharacterStatus,
      file: customCharacterFile,
      importPackage: customCharacterPackage,
      zoom: customCharacterZoom,
      rotation: customCharacterRotation,
      offsetX: customCharacterOffsetX,
      offsetY: customCharacterOffsetY,
      mode: customCharacterMode,
      jointGuide: customJointGuide,
      jointName: customJointName,
      jointList: customJointList,
      undoJoint: customJointUndo,
      resetJoints: customJointReset,
      name: customCharacterName,
      save: customCharacterSave,
    }, {
      onCatalogChanged: (change) => this.handleCustomCatalogChanged(change),
      onSaved: (character) => this.selectImportedCharacter(character),
    });
    this.customCharacterImport.init();
    this.characterShareDialog = new CharacterShareDialog({
      overlay: characterShareOverlay,
      close: characterShareClose,
      status: characterShareStatus,
      sharePanel: characterSharePanel,
      receivePanel: characterReceivePanel,
      rights: characterShareRights,
      minorSafety: characterShareMinorSafety,
      privacy: characterSharePrivacy,
      upload: characterShareUpload,
      result: characterShareResult,
      resultState: characterShareResultState,
      code: characterShareCode,
      copy: characterShareCopy,
      deleteShare: characterShareDelete,
      receiveCode: characterReceiveCode,
      lookup: characterShareLookup,
      preview: characterSharePreview,
      previewImage: characterSharePreviewImage,
      previewName: characterSharePreviewName,
      previewMode: characterSharePreviewMode,
      import: characterShareImport,
      reportReason: characterShareReportReason,
      report: characterShareReport,
      endpoint: characterShareEndpoint,
      saveEndpoint: characterShareSaveEndpoint,
    }, {
      customCharacters: this.customCharacterImport,
      getSelectedId: () => this.characterSelectionSession?.activeId ?? null,
      onImported: (character) => this.selectImportedCharacter(character),
    });
    this.characterSelectionSession = null;
    this.characterSelectionPreferences = readCharacterSelections(globalThis.localStorage);
    this.pendingMatch = null;
    this.poseEditQueue = [];
    this.activePosePlayerIndex = null;
    this.status = status;
    this.pauseOverlay = pauseOverlay;
    this.elapsedRealTime = 0;
    this.lastFrameDelta = 0;
    this.resizeObserver = null;
    this.statusResetAt = 0;
    this.lineOfSightClear = false;
    this.lowEffects = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.flashesEnabled = true;
    this.subtitlesEnabled = true;
    this.difficulty = "standard";
    this.aiDifficulty = "balanced";
    this.gameMode = "ai";
    this.characterArtMode = "doll";
    this.characterIds = ["strolling-grandpa", "dance-auntie"];
    this.poseIndexes = [0, 1];
    this.customPoses = [null, null];
    this.characterAssets = new CharacterAssetLoader();
    this.characterAssets.preload(this.characterIds);
    this.p2AiBadge = p2AiBadge;
    this.modalActive = null;
    this.modalWasPaused = false;
    this.menuOpen = true;
    this.returnToMenuAfterModal = false;
    this.lockHud = lockHud;
    this.timer = timer;
    this.outcomeOverlay = outcomeOverlay;
    this.outcomeTitle = outcomeTitle;
    this.outcomeDetail = outcomeDetail;
    this.tutorial = {
      overlay: tutorialOverlay,
      step: tutorialStep,
      title: tutorialTitle,
      visual: tutorialVisual,
      text: tutorialText,
      next: tutorialNext,
      skip: tutorialSkip,
      index: 0,
    };
    this.settings = {
      overlay: settingsOverlay,
      close: settingsClose,
      tutorial: settingsTutorial,
      difficulty: difficultySelect,
      aiDifficulty: aiDifficultySelect,
      masterVolume,
      effectsVolume,
      voiceVolume,
      voiceEnabled,
      subtitlesEnabled,
      lowEffects: lowEffectsEnabled,
      flashes: flashesEnabled,
    };
    this.poseEditor = new PoseEditor({
      overlay: poseEditorOverlay,
      canvas: poseEditorCanvas,
      title: poseEditorTitle,
      subtitle: poseEditorSubtitle,
      poseName: poseCurrentName,
      status: poseEditorStatus,
      joints: poseJoints,
      presets: posePresets,
      slots: poseSlots,
      mirror: poseMirror,
      reset: poseReset,
      random: poseRandom,
      save: poseSave,
      remove: poseDelete,
      skip: poseSkip,
      use: poseUse,
    }, {
      onComplete: (result) => this.finishPoseEditing(result),
    });

    this.stateMachine = new StateMachine(GAME_STATES.running, {
      [GAME_STATES.running]: [GAME_STATES.paused],
      [GAME_STATES.paused]: [GAME_STATES.running],
    });

    this.input = new InputManager({
      target: window,
      preventDefaultKeys: PREVENT_DEFAULT_KEYS,
    });

    this.renderer = new CanvasRenderer(canvas, {
      width: GAME_CONFIG.logicalWidth,
      height: GAME_CONFIG.logicalHeight,
    });

    this.debug = new DebugOverlay({
      panel: debugPanel,
      values: debugValues,
      refreshRate: GAME_CONFIG.debugRefreshRate,
    });

    this.simulation = new SimulationCore({
      arenaConfig: ARENA_CONFIG,
      combatConfig: COMBAT_CONFIG,
      lockConfig: LOCK_CONFIG,
      movementConfig: MOVEMENT_CONFIG,
      playerConfigs: PLAYER_CONFIGS,
      seed: createLocalSeed(),
    });
    this.arena = this.simulation.arena;
    this.players = this.simulation.players;
    this.lockSystem = this.simulation.lock;
    this.combat = this.simulation.combat;
    this.lockAudio = new LockAudio();
    this.voiceAnnouncer = new VoiceAnnouncer();
    this.stats = new MatchStats();
    this.aiController = new AIController({ playerIndex: 1, difficulty: this.aiDifficulty });
    this.lastCommands = [this.emptyCommand(), this.emptyCommand()];
    this.dashMeters = new Map(
      [...dashMeters].map((element) => [element.dataset.dashPlayer, element]),
    );
    this.lifeMeters = new Map(
      [...lifeMeters].map((element) => [element.dataset.lifePlayer, element]),
    );
    this.roleLabels = new Map(
      [...roleLabels].map((element) => [element.dataset.rolePlayer, element]),
    );
    this.bullIndicators = new Map(
      [...bullIndicators].map((element) => [element.dataset.bullPlayer, element]),
    );
    this.lineOfSightClear = this.simulation.lineOfSightClear;
    this.bindOverlayControls();
    this.applyDifficulty(this.difficulty, false);
    this.syncSettingsControls();

    this.loop = new GameLoop({
      fixedTimeStep: GAME_CONFIG.fixedTimeStep,
      maxFrameDelta: GAME_CONFIG.maxFrameDelta,
      maxUpdatesPerFrame: GAME_CONFIG.maxUpdatesPerFrame,
      onFrame: (deltaTime) => this.handleFrame(deltaTime),
      onUpdate: (deltaTime) => this.update(deltaTime),
      onRender: (interpolation) => this.render(interpolation),
    });

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
  }

  start() {
    this.status.textContent = GAME_CONFIG.stageLabel;
    this.startMenu.version.textContent = `v${GAME_CONFIG.version}`;
    this.renderer.resizeDisplayMetrics();
    this.bindResizeObserver();
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.loop.start();
    this.togglePause(true);
    this.showMainMenu();
  }

  handleFrame(deltaTime) {
    this.lastFrameDelta = deltaTime;
    this.elapsedRealTime += deltaTime;

    if (this.input.wasPressed(SYSTEM_KEYS.fullscreen)) {
      this.toggleFullscreen();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.toggleCharacterArt)) {
      this.characterArtMode = this.characterArtMode === "doll" ? "legacy" : "doll";
      this.status.textContent = this.characterArtMode === "doll"
        ? "A0 新美术：老鼠干大爷"
        : "A0 对照：旧几何小人";
      this.statusResetAt = performance.now() + 1600;
    }

    if (this.input.wasPressed(SYSTEM_KEYS.cyclePose)) {
      this.poseIndexes[0] = (this.poseIndexes[0] + 1) % 3;
      this.customPoses[0] = null;
      const poseNames = ["门口放空", "小区监察", "铁丝发癫"];
      this.status.textContent = `${getCharacter(this.characterIds[0]).name} Pose：${poseNames[this.poseIndexes[0]]}`;
      this.statusResetAt = performance.now() + 1600;
    }

    if (this.input.wasPressed(SYSTEM_KEYS.cycleP1Character)) this.cycleCharacter(0);
    if (this.input.wasPressed(SYSTEM_KEYS.cycleP2Character)) this.cycleCharacter(1);

    if (this.menuOpen) {
      if (this.input.wasPressed(SYSTEM_KEYS.settings)) this.openMenuSettings();
      if (this.input.wasPressed(SYSTEM_KEYS.tutorial)) this.openMenuTutorial();
      this.updateKeyHighlights();
      return;
    }

    if (this.input.wasPressed(SYSTEM_KEYS.settings)) {
      this.modalActive === "settings" ? this.closeModal() : this.openSettings();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.tutorial)) {
      this.modalActive === "tutorial" ? this.closeTutorial() : this.openTutorial();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.pause)) {
      if (this.modalActive) this.closeModal();
      else this.togglePause();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.toggleDebug)) {
      this.debug.toggle();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.restart)) {
      this.resetRound();
    }

    if (this.input.wasPressed(SYSTEM_KEYS.forceBull)) {
      this.handleSimulationEvents(
        this.simulation.setForceBullTokens(!this.combat.forceBullTokens),
      );
    }

    if (this.input.wasPressed(SYSTEM_KEYS.toggleLowEffects)) {
      this.lowEffects = !this.lowEffects;
      this.settings.lowEffects.checked = this.lowEffects;
      this.status.textContent = this.lowEffects
        ? "低配特效：开启"
        : "完整特效：开启";
      this.statusResetAt = performance.now() + 1100;
    }

    if (this.players.some((player) =>
      this.input.wasPressed(player.controls.shou) ||
      this.input.wasPressed(player.controls.niu)
    )) {
      this.lockAudio.unlock();
    }

    if (this.statusResetAt > 0 && performance.now() >= this.statusResetAt) {
      this.statusResetAt = 0;
      this.status.textContent = GAME_CONFIG.stageLabel;
    }

    this.updateKeyHighlights();
    this.updateDashMeters();
    this.updateLockHud();
    this.updateMatchHud();
  }

  update(deltaTime) {
    this.stats.update(
      deltaTime,
      this.combat.attackerIndex,
      this.combat.state !== COMBAT_STATES.roundStart &&
        this.combat.state !== COMBAT_STATES.roundOver,
    );
    const commands = this.players.map((player) => this.getHumanCommand(player));
    if (this.gameMode === "ai") {
      commands[1] = this.aiController.update(deltaTime, {
        self: this.players[1],
        opponent: this.players[0],
        combat: this.combat,
        lock: this.lockSystem,
        lineOfSight: this.lineOfSightClear,
      });
    }
    this.lastCommands = commands;
    const result = this.simulation.step(deltaTime, commands);
    this.lineOfSightClear = this.simulation.lineOfSightClear;
    this.lockAudio.update(
      this.lockSystem.progress,
      this.lockSystem.isFocusing && !this.lockSystem.isReady,
    );
    this.handleSimulationEvents(result.events);
  }

  getHumanCommand(player) {
    return {
      ...this.input.getAxis(player.controls),
      dashPressed: this.input.wasPressed(player.controls.dash),
      shouDown: this.input.isDown(player.controls.shou),
      shouPressed: this.input.wasPressed(player.controls.shou),
      niuPressed: this.input.wasPressed(player.controls.niu),
    };
  }

  emptyCommand() {
    return {
      x: 0,
      y: 0,
      dashPressed: false,
      shouDown: false,
      shouPressed: false,
      niuPressed: false,
    };
  }

  render(interpolation) {
    const renderedPlayers = this.players.map((player, index) => ({
        ...player,
        ...player.getInterpolatedPosition(interpolation),
        isDashing: player.isDashing,
        isLockImmune: player.isLockImmune,
        role: index === this.combat.attackerIndex ? "attacker" : "defender",
      }));
    this.renderer.render({
      players: renderedPlayers,
      attacker: renderedPlayers[this.combat.attackerIndex],
      defender: renderedPlayers[this.combat.defenderIndex],
      arena: this.arena,
      lineOfSightClear: this.lineOfSightClear,
      lock: {
        aimAngle: this.lockSystem.aimAngle,
        angleError: this.lockSystem.angleError,
        conditions: this.lockSystem.conditions,
        distance: this.lockSystem.distance,
        isFocusing: this.lockSystem.isFocusing,
        isReady: this.lockSystem.isReady,
        isRecovering: this.lockSystem.isRecovering,
        isValid: this.lockSystem.isValid,
        lastResult: this.lockSystem.lastResult,
        progress: this.lockSystem.progress,
        recoveryRemaining: this.lockSystem.recoveryRemaining,
        resultFlashRemaining: this.lockSystem.resultFlashRemaining,
        config: LOCK_CONFIG,
      },
      combat: {
        state: this.combat.state,
        reactionProgress: this.combat.reactionProgress,
        outcome: this.combat.outcome,
        outcomeDisplayRemaining: this.combat.outcomeDisplayRemaining,
        hitStopRemaining: this.combat.hitStopRemaining,
        attackerIndex: this.combat.attackerIndex,
        defenderIndex: this.combat.defenderIndex,
        attackKind: this.combat.attackKind,
        bullTokens: [...this.combat.bullTokens],
      },
      debugVisible: this.debug.visible,
      lowEffects: this.lowEffects,
      flashesEnabled: this.flashesEnabled,
      subtitlesEnabled: this.subtitlesEnabled,
      characterArtMode: this.characterArtMode,
      characterIds: [...this.characterIds],
      poseIndexes: [...this.poseIndexes],
      customPoses: this.customPoses.map((pose) => pose ? { ...pose } : null),
      grandpaPoseIndex: this.poseIndexes[0],
      time: this.loop.elapsed,
    });
    this.updateDebug(this.lastFrameDelta);
    this.input.endFrame();
  }

  cycleCharacter(playerIndex) {
    const currentIndex = getCharacterIndex(this.characterIds[playerIndex]);
    const available = getAvailableCharacters();
    const next = available[(currentIndex + 1) % available.length];
    this.characterIds[playerIndex] = next.id;
    this.poseIndexes[playerIndex] = next.visual.outfit === "floral" ? 2 : playerIndex;
    this.customPoses[playerIndex] = null;
    this.characterAssets.load(next.id);
    this.status.textContent = `P${playerIndex + 1} 换人：${next.name}`;
    this.statusResetAt = performance.now() + 1600;
  }

  togglePause(force) {
    const shouldPause = typeof force === "boolean" ? force : !this.loop.paused;
    if (shouldPause === this.loop.paused) return;

    this.loop.setPaused(shouldPause);
    this.stateMachine.transition(
      shouldPause ? GAME_STATES.paused : GAME_STATES.running,
    );
    this.pauseOverlay.hidden = !shouldPause;
    this.status.textContent = shouldPause ? "已暂停 · Esc 继续" : GAME_CONFIG.stageLabel;
  }

  bindOverlayControls() {
    this.startMenu.ai.addEventListener("click", () => this.openCharacterSelect("ai"));
    this.startMenu.local.addEventListener("click", () => this.openCharacterSelect("local"));
    this.startMenu.tutorial.addEventListener("click", () => this.openMenuTutorial());
    this.startMenu.settings.addEventListener("click", () => this.openMenuSettings());
    this.startMenu.fullscreen.addEventListener("click", () => this.toggleFullscreen());
    this.characterSelect.back.addEventListener("click", () => this.showMainMenu());
    this.characterSelect.confirm.addEventListener("click", () => this.confirmCharacterSelection());
    this.characterSelect.customOpen.addEventListener("click", () => this.customCharacterImport.open());
    this.characterSelect.customExport.addEventListener("click", () => this.exportSelectedCustomCharacter());
    this.characterSelect.customDelete.addEventListener("click", () => this.deleteSelectedCustomCharacter());
    this.characterSelect.customShare.addEventListener("click", () => this.characterShareDialog.open("share"));
    this.characterSelect.customReceive.addEventListener("click", () => this.characterShareDialog.open("receive"));
    this.pauseActions.resume.addEventListener("click", () => this.togglePause(false));
    this.pauseActions.restart.addEventListener("click", () => this.resetRound());
    this.pauseActions.settings.addEventListener("click", () => this.openSettings());
    this.pauseActions.fullscreen.addEventListener("click", () => this.toggleFullscreen());
    this.pauseActions.menu.addEventListener("click", () => this.showMainMenu());
    this.tutorial.next.addEventListener("click", () => this.advanceTutorial());
    this.tutorial.skip.addEventListener("click", () => this.closeTutorial());
    this.settings.close.addEventListener("click", () => this.closeModal());
    this.settings.tutorial.addEventListener("click", () => {
      const shouldReturnToMenu = this.returnToMenuAfterModal;
      this.settings.overlay.hidden = true;
      this.modalActive = null;
      this.returnToMenuAfterModal = shouldReturnToMenu;
      if (shouldReturnToMenu) this.startMenu.overlay.hidden = true;
      this.openTutorial(true);
    });
    for (const control of [
      this.settings.difficulty,
      this.settings.aiDifficulty,
      this.settings.masterVolume,
      this.settings.effectsVolume,
      this.settings.voiceVolume,
      this.settings.voiceEnabled,
      this.settings.subtitlesEnabled,
      this.settings.lowEffects,
      this.settings.flashes,
    ]) {
      control.addEventListener("input", () => this.applySettings());
      control.addEventListener("change", () => this.applySettings());
    }
  }

  openCharacterSelect(mode = "ai") {
    const normalizedMode = mode === "local" ? "local" : "ai";
    this.setGameMode(normalizedMode);
    this.characterSelectionSession = new CharacterSelectionSession({
      mode: normalizedMode,
      catalogIds: getAvailableCharacters().map((character) => character.id),
      savedIds: this.characterSelectionPreferences[normalizedMode],
    });
    this.menuOpen = true;
    this.pendingMatch = null;
    this.poseEditQueue = [];
    this.poseEditor.close();
    this.customCharacterImport.close();
    this.characterShareDialog.close();
    this.startMenu.overlay.hidden = true;
    this.characterSelect.overlay.hidden = false;
    this.pauseOverlay.hidden = true;
    this.renderCharacterSelection();
  }

  renderCharacterSelection() {
    const session = this.characterSelectionSession;
    if (!session) return;
    const playerNumber = session.playerIndex + 1;
    const selected = getCharacter(session.activeId);
    const isAi = session.mode === "ai";

    this.characterSelect.mode.textContent = isAi ? "单人 vs AI" : "本地双人 · 顺次选角";
    this.characterSelect.title.textContent = `P${playerNumber} 选一具老鼠干`;
    this.characterSelect.step.textContent = isAi
      ? "1 / 1 · AI 会从剩余角色中抽选"
      : `${playerNumber} / 2 · ${playerNumber === 1 ? "确认后把键盘交给 P2" : "P2 确认后立即开局"}`;
    this.characterSelect.confirm.textContent = session.mode === "local" && session.playerIndex === 0
      ? "P1 确认 · 交给 P2"
      : `确认 ${selected.name} 并开局`;
    this.characterSelect.image.src = selected.conceptPath;
    this.characterSelect.image.alt = `${selected.name}完整立绘`;
    this.characterSelect.name.textContent = selected.name;
    this.characterSelect.tagline.textContent = selected.tagline;
    this.characterSelect.bio.textContent = selected.bio;
    this.characterSelect.pose.textContent = `默认 Pose · ${selected.poses[0].name}`;
    this.characterSelect.mirrorNote.textContent = session.mode === "local"
      ? "允许同角色对战：P1 红橙描边、P2 青蓝描边，编号与攻守符号始终保留。"
      : "角色只改变外观；AI 将从其余四人中挑选，双方数值完全相同。";
    this.characterSelect.overlay.style.setProperty("--selected-color", selected.palette.shirt);

    const availableCharacters = getAvailableCharacters();
    this.characterSelect.roster.replaceChildren(...availableCharacters.map((character) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-option";
      button.dataset.characterId = character.id;
      button.classList.toggle("is-custom", isCustomCharacter(character.id));
      button.setAttribute("aria-pressed", String(character.id === selected.id));
      button.style.setProperty("--character-color", character.palette.shirt);
      const image = document.createElement("img");
      image.src = character.conceptPath;
      image.alt = "";
      image.loading = "lazy";
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = character.name;
      const pose = document.createElement("small");
      pose.textContent = character.poses[0].name;
      copy.append(name, pose);
      button.append(image, copy);
      button.addEventListener("click", () => {
        if (!this.characterSelectionSession?.select(character.id)) return;
        this.characterAssets.load(character.id);
        this.renderCharacterSelection();
      });
      return button;
    }));

    const selectedIsCustom = isCustomCharacter(selected.id);
    this.characterSelect.customExport.hidden = !selectedIsCustom;
    this.characterSelect.customDelete.hidden = !selectedIsCustom;
    this.characterSelect.customShare.hidden = !selectedIsCustom;

    const expressionData = [
      ["–_–", "麻木"],
      ["⊙口⊙", "震惊"],
      ["╬皿╬", "五官错位"],
    ];
    this.characterSelect.expressions.replaceChildren(...expressionData.map(([face, label]) => {
      const chip = document.createElement("span");
      chip.className = "expression-chip";
      const glyph = document.createElement("b");
      glyph.textContent = face;
      const caption = document.createElement("small");
      caption.textContent = label;
      chip.append(glyph, caption);
      return chip;
    }));
    this.characterAssets.load(selected.id);
  }

  handleCustomCatalogChanged({ deletedId = null, failedIds = [] } = {}) {
    const invalidIds = new Set([deletedId, ...failedIds].filter(Boolean));
    if (invalidIds.size > 0) {
      this.characterSelectionPreferences.ai = this.characterSelectionPreferences.ai.filter((id) => !invalidIds.has(id));
      this.characterSelectionPreferences.local = this.characterSelectionPreferences.local.filter((id) => !invalidIds.has(id));
      this.characterIds = this.characterIds.map((id) => invalidIds.has(id) ? "strolling-grandpa" : id);
      for (const id of invalidIds) this.poseEditor.deleteCharacterData(id);
      writeCharacterSelections(globalThis.localStorage, this.characterSelectionPreferences);
    }
    if (this.characterSelectionSession) {
      const previousSession = this.characterSelectionSession;
      const nextSession = new CharacterSelectionSession({
        mode: previousSession.mode,
        catalogIds: getAvailableCharacters().map((character) => character.id),
        savedIds: previousSession.selections,
      });
      nextSession.playerIndex = previousSession.playerIndex;
      this.characterSelectionSession = nextSession;
      this.renderCharacterSelection();
    }
  }

  selectImportedCharacter(character) {
    if (!this.characterSelectionSession || !character) return;
    this.characterSelectionSession.select(character.id);
    this.characterAssets.load(character.id);
    this.renderCharacterSelection();
    this.status.textContent = `${character.name} 已保存到此浏览器`;
    this.statusResetAt = performance.now() + 1600;
  }

  async exportSelectedCustomCharacter() {
    const id = this.characterSelectionSession?.activeId;
    if (!id || !isCustomCharacter(id)) return;
    try {
      await this.customCharacterImport.export(id);
      this.status.textContent = "角色包已导出";
    } catch (error) {
      this.status.textContent = error.message;
    }
    this.statusResetAt = performance.now() + 1600;
  }

  async deleteSelectedCustomCharacter() {
    const id = this.characterSelectionSession?.activeId;
    if (!id || !isCustomCharacter(id)) return;
    try {
      await this.customCharacterImport.delete(id);
    } catch (error) {
      this.status.textContent = error.message;
      this.statusResetAt = performance.now() + 1600;
    }
  }

  confirmCharacterSelection() {
    const session = this.characterSelectionSession;
    if (!session) return;
    const result = session.confirm();
    if (!result.complete) {
      this.renderCharacterSelection();
      return;
    }
    this.characterIds = result.selections;
    this.poseIndexes = [0, 0];
    this.customPoses = [null, null];
    this.characterAssets.preload(this.characterIds);
    this.characterSelectionPreferences[session.mode] = [...result.selections];
    writeCharacterSelections(globalThis.localStorage, this.characterSelectionPreferences);
    this.characterSelect.overlay.hidden = true;
    this.characterSelectionSession = null;
    this.beginPoseEditing(session.mode);
  }

  beginPoseEditing(mode) {
    this.pendingMatch = { mode };
    this.poseEditQueue = mode === "local" ? [0, 1] : [0];
    this.openNextPoseEditor();
  }

  openNextPoseEditor() {
    if (this.poseEditQueue.length === 0) {
      const mode = this.pendingMatch?.mode ?? "ai";
      this.pendingMatch = null;
      this.activePosePlayerIndex = null;
      this.beginMatch(mode);
      return;
    }
    this.activePosePlayerIndex = this.poseEditQueue.shift();
    this.poseEditor.open({
      characterId: this.characterIds[this.activePosePlayerIndex],
      playerIndex: this.activePosePlayerIndex,
    });
    this.status.textContent = `P${this.activePosePlayerIndex + 1} 正在摆 Pose`;
  }

  finishPoseEditing({ pose }) {
    if (this.activePosePlayerIndex === null) return;
    const playerIndex = this.activePosePlayerIndex;
    this.customPoses[playerIndex] = pose ? { ...pose } : null;
    const characterId = this.characterIds[playerIndex];
    if (pose && isCustomCharacter(characterId)) {
      this.customCharacterImport.savePose(characterId, pose).catch(() => {
        this.status.textContent = "Pose 已用于本局，但未能写入自定义角色仓库";
        this.statusResetAt = performance.now() + 1600;
      });
    }
    this.openNextPoseEditor();
  }

  beginMatch(mode = "ai") {
    this.setGameMode(mode);
    this.menuOpen = false;
    this.startMenu.overlay.hidden = true;
    this.resetRound();
    this.status.textContent = mode === "ai"
      ? `单人模式 · AI ${AI_DIFFICULTY_CONFIG[this.aiDifficulty].label}`
      : "本地双人模式";
    this.statusResetAt = performance.now() + 1400;
    if (!this.hasSeenTutorial()) this.openTutorial(true);
  }

  setGameMode(mode) {
    this.gameMode = mode === "local" ? "local" : "ai";
    const isAi = this.gameMode === "ai";
    this.p2AiBadge.hidden = !isAi;
    this.p2AiBadge.closest(".player-hud")?.classList.toggle("is-ai", isAi);
    this.aiController.reset();
  }

  showMainMenu() {
    this.menuOpen = true;
    this.returnToMenuAfterModal = false;
    this.modalActive = null;
    this.tutorial.overlay.hidden = true;
    this.settings.overlay.hidden = true;
    this.outcomeOverlay.hidden = true;
    this.characterSelect.overlay.hidden = true;
    this.characterSelectionSession = null;
    this.poseEditor.close();
    this.customCharacterImport.close();
    this.characterShareDialog.close();
    this.pendingMatch = null;
    this.poseEditQueue = [];
    this.activePosePlayerIndex = null;
    this.startMenu.overlay.hidden = false;
    this.togglePause(true);
    this.pauseOverlay.hidden = true;
    this.status.textContent = GAME_CONFIG.stageLabel;
  }

  openMenuTutorial() {
    this.startMenu.overlay.hidden = true;
    this.returnToMenuAfterModal = true;
    this.openTutorial(true);
  }

  openMenuSettings() {
    this.startMenu.overlay.hidden = true;
    this.returnToMenuAfterModal = true;
    this.openSettings();
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        const stage = document.querySelector("#game-stage");
        if (!stage?.requestFullscreen) {
          this.showFullscreenIssue("当前浏览器不支持网页全屏，可使用浏览器自带全屏");
          return;
        }
        await stage.requestFullscreen();
      } else {
        this.showFullscreenIssue("当前浏览器不支持网页全屏，可使用浏览器自带全屏");
      }
    } catch {
      this.showFullscreenIssue("全屏被浏览器拦截，可使用浏览器自带全屏");
    }
  }

  showFullscreenIssue(message) {
    this.status.textContent = message;
    this.statusResetAt = performance.now() + 1800;
    if (this.menuOpen) {
      this.startMenu.compatibility.textContent = message;
      this.startMenu.compatibility.classList.add("has-warning");
    }
  }

  handleFullscreenChange() {
    const isFullscreen = Boolean(document.fullscreenElement);
    this.startMenu.fullscreen.textContent = isFullscreen ? "退出全屏" : "进入全屏";
    this.pauseActions.fullscreen.textContent = isFullscreen ? "退出全屏" : "切换全屏";
    this.renderer.resizeDisplayMetrics();
  }

  openTutorial(restart = false) {
    if (restart || this.modalActive !== "tutorial") this.tutorial.index = 0;
    this.openModal("tutorial");
    this.renderTutorialStep();
  }

  advanceTutorial() {
    const steps = this.getTutorialSteps();
    if (this.tutorial.index >= steps.length - 1) {
      this.closeTutorial();
      return;
    }
    this.tutorial.index += 1;
    this.renderTutorialStep();
  }

  renderTutorialStep() {
    const steps = this.getTutorialSteps();
    const step = steps[this.tutorial.index];
    this.tutorial.step.textContent = `教学 ${this.tutorial.index + 1} / ${steps.length}`;
    this.tutorial.title.textContent = step.title;
    this.tutorial.visual.textContent = step.visual;
    this.tutorial.text.textContent = step.text;
    this.tutorial.next.textContent = this.tutorial.index === steps.length - 1
      ? "开始对战"
      : "下一步";
  }

  getTutorialSteps() {
    return this.gameMode === "ai" ? AI_TUTORIAL_STEPS : TUTORIAL_STEPS;
  }

  closeTutorial() {
    this.markTutorialSeen();
    this.closeModal();
  }

  openSettings() {
    this.syncSettingsControls();
    this.openModal("settings");
  }

  openModal(kind) {
    if (!this.modalActive) this.modalWasPaused = this.loop.paused;
    this.modalActive = kind;
    this.tutorial.overlay.hidden = kind !== "tutorial";
    this.settings.overlay.hidden = kind !== "settings";
    if (!this.loop.paused) this.togglePause(true);
    this.pauseOverlay.hidden = true;
  }

  closeModal() {
    if (!this.modalActive) return;
    this.tutorial.overlay.hidden = true;
    this.settings.overlay.hidden = true;
    this.modalActive = null;
    if (this.returnToMenuAfterModal) {
      this.returnToMenuAfterModal = false;
      this.startMenu.overlay.hidden = false;
      this.pauseOverlay.hidden = true;
      return;
    }
    if (!this.modalWasPaused) this.togglePause(false);
    else this.pauseOverlay.hidden = false;
  }

  syncSettingsControls() {
    this.settings.difficulty.value = this.difficulty;
    this.settings.aiDifficulty.value = this.aiDifficulty;
    this.settings.lowEffects.checked = this.lowEffects;
    this.settings.flashes.checked = this.flashesEnabled;
    this.settings.subtitlesEnabled.checked = this.subtitlesEnabled;
    this.settings.voiceEnabled.checked = this.voiceAnnouncer.enabled;
  }

  applySettings() {
    this.applyDifficulty(this.settings.difficulty.value);
    this.applyAiDifficulty(this.settings.aiDifficulty.value);
    this.lowEffects = this.settings.lowEffects.checked;
    this.flashesEnabled = this.settings.flashes.checked;
    this.subtitlesEnabled = this.settings.subtitlesEnabled.checked;
    this.lockHud.classList.toggle("subtitles-off", !this.subtitlesEnabled);
    this.lockAudio.setVolumes({
      master: this.settings.masterVolume.value,
      effects: this.settings.effectsVolume.value,
    });
    this.voiceAnnouncer.setEnabled(this.settings.voiceEnabled.checked);
    this.voiceAnnouncer.setVolume(
      Number(this.settings.masterVolume.value) * Number(this.settings.voiceVolume.value),
    );
  }

  applyDifficulty(key, announce = true) {
    const profile = DIFFICULTY_CONFIG[key] ?? DIFFICULTY_CONFIG.standard;
    this.difficulty = DIFFICULTY_CONFIG[key] ? key : "standard";
    this.simulation.setReactionTiming(profile.reactionWindow, profile.perfectWindow);
    if (this.settings?.difficulty) this.settings.difficulty.value = this.difficulty;
    if (announce) {
      this.status.textContent = `反应难度：${profile.label} · ${profile.reactionWindow.toFixed(2)} 秒`;
      this.statusResetAt = performance.now() + 1200;
    }
  }

  applyAiDifficulty(key, announce = true) {
    this.aiDifficulty = AI_DIFFICULTY_CONFIG[key] ? key : "balanced";
    this.aiController.setDifficulty(this.aiDifficulty);
    this.settings.aiDifficulty.value = this.aiDifficulty;
    if (announce && this.gameMode === "ai") {
      this.status.textContent = `AI 难度：${AI_DIFFICULTY_CONFIG[this.aiDifficulty].label}`;
      this.statusResetAt = performance.now() + 1200;
    }
  }

  hasSeenTutorial() {
    try {
      return localStorage.getItem(`shoushu-tutorial-seen-${this.gameMode}`) === "1";
    } catch {
      return false;
    }
  }

  markTutorialSeen() {
    try {
      localStorage.setItem(`shoushu-tutorial-seen-${this.gameMode}`, "1");
    } catch {
      // Storage may be disabled; the tutorial remains manually available with T.
    }
  }

  resetRound() {
    const profile = DIFFICULTY_CONFIG[this.difficulty];
    this.simulation.reset({
      seed: createLocalSeed(),
      reactionTiming: profile,
    });
    this.stats.reset();
    this.aiController.reset();
    this.lastCommands = [this.emptyCommand(), this.emptyCommand()];
    this.lockAudio.update(0, false);
    this.lineOfSightClear = this.simulation.lineOfSightClear;
    this.togglePause(false);
    this.outcomeOverlay.hidden = true;
    this.status.textContent = "新一局 · 攻守已重新抽签";
    this.statusResetAt = performance.now() + 900;
  }

  handleLockAttempt(event) {
    this.stats.recordLock(event.attackerIndex);
    if (event.result === "complete") return;
    this.lockAudio.pulse(false);
    this.status.textContent = `喊早了 · 硬直 ${LOCK_CONFIG.earlyReleaseRecovery.toFixed(2)} 秒`;
    this.statusResetAt = performance.now() + 900;
  }

  handleSimulationEvents(events) {
    for (const event of events) {
      if (event.type === "lockAttempt") {
        this.handleLockAttempt(event);
      } else if (event.type === "callout") {
        this.lockAudio.combatCue(event.kind === "bull" ? "bullCallout" : "callout");
        this.voiceAnnouncer.speak(event.kind === "bull" ? "牛来" : "寿来");
      } else if (event.type === "reactionOpened") {
        this.lockAudio.combatCue(
          this.combat.attackKind === "bull" ? "bullWindow" : "window",
        );
      } else if (event.type === "outcome") {
        this.lockAudio.combatCue(event.outcome.type);
        const responseSucceeded = ["reflect", "perfect", "bullReflect"].includes(
          event.outcome.type,
        );
        const defenderIndex = responseSucceeded
          ? event.outcome.sourceIndex
          : event.outcome.targetIndex;
        this.stats.recordOutcome(event.outcome, defenderIndex);
        if (responseSucceeded) {
          this.voiceAnnouncer.speak(
            event.outcome.type === "bullReflect" ? "妈妈" : "寿回",
          );
        }
        this.status.textContent = outcomeStatus(event.outcome);
        this.statusResetAt = performance.now() + 1100;
      } else if (event.type === "cancelLock") {
        this.lockAudio.update(0, false);
      } else if (event.type === "roleSwap") {
        this.status.textContent = `${this.players[this.combat.attackerIndex].name} 转为攻方`;
        this.statusResetAt = performance.now() + 900;
      } else if (event.type === "bullToken") {
        this.status.textContent = `${this.players[event.playerIndex].name} 获得一枚牛符`;
        this.statusResetAt = performance.now() + 1100;
      } else if (event.type === "forceBull") {
        this.status.textContent = event.enabled
          ? "测试模式：双方无限牛符"
          : "测试模式：强制牛符已关闭";
        this.statusResetAt = performance.now() + 1100;
      } else if (event.type === "roundOver") {
        this.showRoundOutcome(event.winnerIndex);
      }
    }
  }

  handleCombatEvents() {
    this.handleSimulationEvents(this.simulation.flushCombatEvents());
  }

  showRoundOutcome(winnerIndex) {
    this.outcomeOverlay.hidden = false;
    this.outcomeTitle.textContent = winnerIndex === null
      ? "平局"
      : `${this.players[winnerIndex].name}${this.isAiPlayer(winnerIndex) ? " AI" : ""} 胜`;
    this.outcomeDetail.textContent = [
      `${this.combat.life[0]} 年 · ${this.combat.life[1]} 年`,
      `回应 ${this.stats.totalSuccessfulResponses}/${this.stats.totalResponses}`,
      `锁定 ${this.stats.lockAttempts[0] + this.stats.lockAttempts[1]} 次`,
    ].join("　");
  }

  updateLineOfSight() {
    this.lineOfSightClear = this.simulation.updateLineOfSight();
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.togglePause(true);
      this.input.handleBlur();
    }
  }

  bindResizeObserver() {
    if (globalThis.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.renderer.resizeDisplayMetrics();
      });
      this.resizeObserver.observe(this.canvas);
      return;
    }

    window.addEventListener("resize", () => this.renderer.resizeDisplayMetrics());
  }

  updateKeyHighlights() {
    for (const key of document.querySelectorAll("[data-key-code]")) {
      key.classList.toggle("is-active", this.input.isDown(key.dataset.keyCode));
    }
  }

  updateDashMeters() {
    for (const player of this.players) {
      const meter = this.dashMeters.get(player.id);
      if (!meter) continue;

      const readiness = Math.max(0, Math.min(1, player.dashReadiness));
      meter.style.setProperty("--dash-progress", readiness.toFixed(3));
      meter.classList.toggle("is-ready", readiness >= 0.999);
      meter.classList.toggle("is-dashing", player.isDashing);

      const label = meter.querySelector("span");
      if (player.isDashing) {
        label.textContent = "冲刺中";
      } else if (player.dashCooldownRemaining > 0) {
        label.textContent = `冷却 ${player.dashCooldownRemaining.toFixed(1)}s`;
      } else {
        label.textContent = "冲刺就绪";
      }
    }
  }

  updateLockHud() {
    const lock = this.lockSystem;
    const combat = this.combat;
    const attacker = this.players[combat.attackerIndex];
    const defender = this.players[combat.defenderIndex];
    const attackerIsAi = this.isAiPlayer(combat.attackerIndex);
    const defenderIsAi = this.isAiPlayer(combat.defenderIndex);
    this.lockHud.style.setProperty("--lock-progress", lock.progress.toFixed(3));
    this.lockHud.classList.toggle("is-valid", lock.isValid);
    this.lockHud.classList.toggle("is-ready", lock.isReady);
    this.lockHud.classList.toggle("is-recovering", lock.isRecovering);
    this.lockHud.classList.toggle(
      "is-blocked",
      lock.isFocusing && !lock.conditions.lineOfSight,
    );

    const label = this.lockHud.querySelector("strong");
    const detail = this.lockHud.querySelector("span");
    this.lockHud.classList.toggle("is-reacting", combat.state === COMBAT_STATES.reaction);
    this.lockHud.classList.toggle("is-callout", combat.state === COMBAT_STATES.callout);
    this.lockHud.classList.toggle("is-bull", combat.attackKind === "bull" && (
      combat.state === COMBAT_STATES.callout ||
      combat.state === COMBAT_STATES.reaction ||
      combat.state === COMBAT_STATES.reflect ||
      combat.state === COMBAT_STATES.recovery
    ));

    if (combat.state === COMBAT_STATES.roundStart) {
      label.textContent = `${attacker.name} 先攻`;
      detail.textContent = "准备——";
    } else if (combat.state === COMBAT_STATES.callout) {
      label.textContent = combat.attackKind === "bull" ? "牛来！" : "寿来！";
      detail.textContent = combat.attackKind === "bull"
        ? "低沉牛铃前摇 · 守方先别抢答"
        : "尖锐寿音前摇 · 守方先别抢答";
    } else if (combat.state === COMBAT_STATES.reaction) {
      label.textContent = "回应！";
      const responseCode = combat.attackKind === "bull"
        ? defender.controls.niu
        : defender.controls.shou;
      detail.textContent = defenderIsAi
        ? `${defender.name} AI 正在判断“${combat.attackKind === "bull" ? "牛来" : "寿来"}”`
        : `${defender.name} 按 ${controlLabel(responseCode)} 喊“${combat.attackKind === "bull" ? "妈妈" : "寿回"}”`;
      this.lockHud.style.setProperty(
        "--lock-progress",
        (1 - combat.reactionProgress).toFixed(3),
      );
    } else if (combat.state === COMBAT_STATES.reflect) {
      label.textContent = combat.outcome?.type === "bullReflect"
        ? "妈妈！"
        : combat.outcome?.type === "perfect"
          ? "完美寿回！"
          : "寿回！";
      detail.textContent = combat.outcome?.type === "bullReflect"
        ? "神牛反撞 · 即将交换攻守"
        : "反弹 · 即将交换攻守";
    } else if (combat.state === COMBAT_STATES.recovery) {
      label.textContent = outcomeTitle(combat.outcome?.type);
      detail.textContent = "伤害恢复中";
    } else if (combat.state === COMBAT_STATES.roundOver) {
      label.textContent = "本局结束";
      detail.textContent = "按 R 再来一局";
    } else if (combat.safeTimeRemaining > 0) {
      label.textContent = `${attacker.name} 转为攻方`;
      detail.textContent = `安全时间 ${combat.safeTimeRemaining.toFixed(2)}s`;
    } else if (lock.isRecovering) {
      label.textContent = "喊早了";
      detail.textContent = `硬直 ${lock.recoveryRemaining.toFixed(2)}s`;
    } else if (lock.isReady) {
      label.textContent = "锁定完成";
      detail.textContent = attackerIsAi
        ? "AI 已锁定 · 即将喊出寿来"
        : `松开 ${controlLabel(attacker.controls.shou)} · 喊出寿来`;
    } else if (lock.isFocusing) {
      if (!lock.conditions.lineOfSight) {
        label.textContent = "视线受阻";
        detail.textContent = "电线杆挡住了 · 攻方或守方绕开即可";
      } else if (!lock.conditions.inRange) {
        label.textContent = "距离太远";
        detail.textContent = "攻方靠近后才能积累锁定";
      } else if (!lock.conditions.inCone) {
        label.textContent = "正在转向";
        detail.textContent = "保持按住 · 追踪锥会自动转向目标";
      } else if (!lock.conditions.targetVulnerable) {
        label.textContent = "冲刺闪避";
        detail.textContent = "守方暂时免疫锁定";
      } else {
        label.textContent = "正在借寿";
        detail.textContent = attackerIsAi
          ? `AI 聚焦 ${Math.round(lock.progress * 100)}%`
          : `${Math.round(lock.progress * 100)}% · 满后松开${controlLabel(attacker.controls.shou)}`;
      }
    } else {
      label.textContent = `${attacker.name} · 攻方`;
      const bullHint = combat.canUseBull && !attackerIsAi
        ? ` · ${controlLabel(attacker.controls.niu)} 可释放牛来`
        : "";
      detail.textContent = attackerIsAi
        ? `AI 正在寻找 ${defender.name} 的破绽${combat.canUseBull ? " · 牛符就绪" : ""}`
        : `按住 ${controlLabel(attacker.controls.shou)} 聚焦 ${defender.name}${bullHint}`;
    }
  }

  isAiPlayer(index) {
    return this.gameMode === "ai" && index === 1;
  }

  updateMatchHud() {
    this.timer.textContent = String(Math.ceil(this.combat.roundRemaining));
    this.timer.classList.toggle("is-urgent", this.combat.roundRemaining <= 10);

    for (const [index, player] of this.players.entries()) {
      const meter = this.lifeMeters.get(player.id);
      if (meter) {
        const life = this.combat.life[index];
        meter.style.setProperty(
          "--life-progress",
          (life / COMBAT_CONFIG.initialLife).toFixed(3),
        );
        meter.querySelector("strong").textContent = `${life} 年`;
      }

      const role = this.roleLabels.get(player.id);
      if (role) {
        const isAttacker = index === this.combat.attackerIndex;
        role.textContent = `${isAttacker ? "▲" : "○"} ${player.id} · ${isAttacker ? "攻" : "守"}`;
        role.classList.toggle("is-attacker", isAttacker);
      }

      const bull = this.bullIndicators.get(player.id);
      if (bull) {
        const hasToken = this.combat.forceBullTokens || this.combat.bullTokens[index];
        const threshold = this.combat.bullThresholds[index];
        const progress = hasToken ? 1 : this.combat.bullCharge[index] / threshold;
        bull.style.setProperty("--bull-progress", Math.min(1, progress).toFixed(3));
        bull.classList.toggle("has-token", hasToken);
        bull.classList.toggle("is-forced", this.combat.forceBullTokens);
        bull.querySelector("span").textContent = hasToken
          ? this.combat.forceBullTokens ? "∞ 测试牛符" : "牛符就绪"
          : `牛气 ${Math.round(progress * 100)}%`;
      }
    }
  }

  updateDebug(deltaTime) {
    const [p1, p2] = PLAYER_CONFIGS;
    this.debug.update(deltaTime, {
      state: `${this.stateMachine.state} / ${this.combat.state}`,
      fps: this.loop.stats.fps,
      frameTimeMs: this.loop.stats.frameTimeMs,
      fixedTimeStep: this.loop.fixedTimeStep,
      updatesThisFrame: this.loop.stats.updatesThisFrame,
      droppedUpdateFrames: this.loop.stats.droppedUpdateFrames,
      logicalWidth: GAME_CONFIG.logicalWidth,
      logicalHeight: GAME_CONFIG.logicalHeight,
      displayWidth: this.renderer.displaySize.width,
      displayHeight: this.renderer.displaySize.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      p1Axis: this.lastCommands[0] ?? this.input.getAxis(p1.controls),
      p2Axis: this.lastCommands[1] ?? this.input.getAxis(p2.controls),
      leftShift: this.input.isDown("ShiftLeft"),
      rightShift: this.input.isDown("ShiftRight"),
      p1Position: `${this.players[0].x.toFixed(1)}, ${this.players[0].y.toFixed(1)}`,
      p2Position: `${this.players[1].x.toFixed(1)}, ${this.players[1].y.toFixed(1)}`,
      p1Dash: this.players[0].dashCooldownRemaining,
      p2Dash: this.players[1].dashCooldownRemaining,
      lineOfSight: this.lineOfSightClear ? "CLEAR" : "BLOCKED",
      lockStatus: this.lockSystem.status,
      lockProgress: this.lockSystem.progress,
      lockDistance: this.lockSystem.distance,
      lockAngle: this.lockSystem.angleError,
      lockConditions: this.lockSystem.conditions,
      roundTime: this.combat.roundRemaining,
      life: this.combat.life,
      attacker: this.players[this.combat.attackerIndex].id,
      attackKind: this.combat.attackKind,
      bullCharge: this.combat.bullCharge,
      bullTokens: this.combat.bullTokens,
      forceBull: this.combat.forceBullTokens,
      lowEffects: this.lowEffects,
      effectCount: this.renderer.effectCount,
      difficulty: DIFFICULTY_CONFIG[this.difficulty].label,
      mode: this.gameMode === "ai" ? `VS AI (${AI_DIFFICULTY_CONFIG[this.aiDifficulty].label})` : "LOCAL DUEL",
      responseRate: this.stats.responseRate,
      lockAttempts: this.stats.lockAttempts,
      attackerSeconds: this.stats.attackerSeconds,
      activeKeys: this.input.getActiveKeys(),
      lastEvent: this.input.lastEvent,
      eventCount: this.input.eventCount,
    });
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.lockAudio.destroy();
    this.voiceAnnouncer.destroy();
    this.resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
  }
}

const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    title: "先认清自己",
    visual: "P1：W A S D　　P2：↑ ← ↓ →\n▲ 是攻方　　○ 是守方",
    text: "两人共用一块键盘。先看名字旁的图形：三角形代表攻方，圆形代表守方。",
  }),
  Object.freeze({
    title: "攻方锁定",
    visual: "P1 按住 F　／　P2 按住 K\n蓄满 100% 后松开 → 寿来！",
    text: "必须在距离内、瞄准锥内并且没有障碍物。看到“视线受阻”时，绕开中间的电线杆。",
  }),
  Object.freeze({
    title: "守方寿回",
    visual: "寿来！　→　等待回应窗口　→　守方轻按自己的寿键",
    text: "P1 的寿键是 F，P2 的寿键是 K。不要在前摇阶段抢答；成功寿回后立即交换攻守。",
  }),
  Object.freeze({
    title: "牛来要喊妈妈",
    visual: "攻方：G / L 发动牛来\n守方：G / L 回应妈妈",
    text: "牛气满后得到牛符。看到绿色“牛来”，守方按自己的牛键；错按寿键会牛头眩晕。",
  }),
  Object.freeze({
    title: "开始回战",
    visual: "走位躲锁定　·　听口令再回答\n成功回应 → 反撞 → 你成为攻方",
    text: "默认是标准难度。随时按 O 打开辅助设置，按 T 重看教学，按 V 快速切换低配特效。",
  }),
]);

const AI_TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    title: "你控制朱寿",
    visual: "移动：W A S D　　冲刺：左 Shift\n寿：F　　牛：G",
    text: "青寿由 AI 自动控制。名字旁的三角形是攻方，圆形是守方；每次成功回应后双方交换身份。",
  }),
  Object.freeze({
    title: "轮到你进攻",
    visual: "按住 F 追踪 AI\n蓄满 100% 后松开 → 寿来！",
    text: "保持距离、角度和视线。AI 会变向、冲刺或绕到电线杆后面，聚焦时你的移动速度会降低。",
  }),
  Object.freeze({
    title: "轮到你防守",
    visual: "AI：寿来 → 按 F 寿回\nAI：牛来 → 按 G 妈妈",
    text: "等口令真正喊出后再按键。太早、按错或超时都会掉寿命；成功回应会反撞 AI 并让你转为攻方。",
  }),
  Object.freeze({
    title: "挑战 AI",
    visual: "WASD 躲锁　·　左 Shift 冲刺\nF 寿　·　G 牛",
    text: "在设置里可选择新手、普通或高手 AI。AI 不读取你的按键，也会迟疑和犯错。",
  }),
]);

function controlLabel(code) {
  const labels = { KeyF: "F", KeyG: "G", KeyK: "K", KeyL: "L" };
  return labels[code] ?? code;
}

function outcomeTitle(type) {
  return {
    early: "抢答失败！",
    wrong: "答非所问！",
    family: "认亲失败！",
    bullStun: "牛头眩晕！",
    bullTimeout: "牛撞到了！",
    bullReflect: "妈妈！",
    timeout: "没接住！",
    reflect: "寿回！",
    perfect: "完美寿回！",
  }[type] ?? "恢复中";
}

function outcomeStatus(outcome) {
  const { type, damage } = outcome;
  return {
    early: `抢答失败 · 守方损失 ${damage} 年`,
    wrong: `答非所问 · 守方损失 ${damage} 年`,
    family: "错喊妈妈 · 认亲硬直并损失 6 年",
    bullStun: "对牛喊寿回 · 牛头眩晕并损失 5 年",
    bullTimeout: "没喊妈妈 · 守方损失 5 年",
    bullReflect: "妈妈回应成功 · 攻方损失 5 年",
    timeout: `借寿成功 · 守方损失 ${damage} 年`,
    reflect: `寿回成功 · 攻方损失 ${damage} 年`,
    perfect: `完美寿回 · 攻方损失 ${damage} 年`,
  }[type] ?? GAME_CONFIG.stageLabel;
}

function createLocalSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return (Date.now() ^ Math.floor(globalThis.performance?.now?.() ?? 0)) >>> 0;
}
