export function checkCompatibility(environment) {
  const documentRef = environment.document;
  const canvas = documentRef?.createElement?.("canvas");
  const errors = [];
  const warnings = [];

  if (!canvas?.getContext?.("2d")) {
    errors.push("当前浏览器不支持 HTML5 Canvas 2D");
  }
  if (!environment.requestAnimationFrame) {
    errors.push("当前浏览器不支持流畅动画计时");
  }
  if (!environment.AudioContext && !environment.webkitAudioContext) {
    warnings.push("合成音效不可用");
  }
  if (!environment.speechSynthesis) {
    warnings.push("中文语音不可用");
  }
  if (!documentRef?.fullscreenEnabled) {
    warnings.push("全屏不可用");
  }

  return {
    supported: errors.length === 0,
    errors,
    warnings,
  };
}

export function formatCompatibility(report) {
  if (!report.supported) return `无法运行：${report.errors.join("；")}`;
  if (report.warnings.length > 0) {
    return `可以运行 · ${report.warnings.join("、")}，不影响核心玩法`;
  }
  return "浏览器检查通过 · 建议使用最新版 Chrome、Edge 或 Firefox";
}
