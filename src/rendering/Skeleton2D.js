export function pointFrom(origin, length, angle) {
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

export function resolveDollSkeleton(pose, animation = {}) {
  const lean = pose.lean + (animation.lean ?? 0);
  const hips = { x: 0, y: -8 };
  const chest = { x: Math.sin(lean) * 55, y: -63 };
  const neck = { x: chest.x + Math.sin(lean) * 20, y: -87 };
  const head = { x: neck.x + (animation.headX ?? 0), y: -116 + (animation.headY ?? 0) };
  const shoulderSpread = 18;
  const leftShoulder = { x: chest.x - shoulderSpread, y: chest.y - 4 };
  const rightShoulder = { x: chest.x + shoulderSpread, y: chest.y - 4 };
  const leftHip = { x: -9, y: -7 };
  const rightHip = { x: 9, y: -7 };
  const stride = animation.stride ?? 0;
  const armSwing = animation.armSwing ?? 0;
  const reach = animation.reach ?? 0;

  const leftElbow = pointFrom(leftShoulder, 49, pose.leftUpperArm + armSwing);
  const rightElbow = pointFrom(rightShoulder, 49 + reach * 0.25, pose.rightUpperArm - armSwing);
  const leftWrist = pointFrom(leftElbow, 48, pose.leftForearm + armSwing * 0.65);
  const rightWrist = pointFrom(rightElbow, 48 + reach, pose.rightForearm - armSwing * 0.65);
  const leftKnee = pointFrom(leftHip, 52, pose.leftThigh + stride * 0.08);
  const rightKnee = pointFrom(rightHip, 52, pose.rightThigh - stride * 0.08);
  const leftAnkle = pointFrom(leftKnee, 50, pose.leftShin - stride * 0.11);
  const rightAnkle = pointFrom(rightKnee, 50, pose.rightShin + stride * 0.11);

  return {
    hips,
    chest,
    neck,
    head,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  };
}
