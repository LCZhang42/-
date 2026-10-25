export class Player {
  constructor(config, movementConfig) {
    this.id = config.id;
    this.name = config.name;
    this.color = config.color;
    this.glow = config.glow;
    this.controls = config.controls;
    this.spawn = { ...config.start };
    this.movement = movementConfig;
    this.radius = movementConfig.playerRadius;
    this.reset();
  }

  reset() {
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.previousX = this.x;
    this.previousY = this.y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.facingX = this.id === "P1" ? 1 : -1;
    this.facingY = 0;
    this.dashDirectionX = this.facingX;
    this.dashDirectionY = 0;
    this.dashTimeRemaining = 0;
    this.dashCooldownRemaining = 0;
    this.lockImmunityRemaining = 0;
    this.dashCount = 0;
  }

  beginStep() {
    this.previousX = this.x;
    this.previousY = this.y;
  }

  update(deltaTime, input) {
    this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - deltaTime);
    this.lockImmunityRemaining = Math.max(0, this.lockImmunityRemaining - deltaTime);

    const direction = normalize(input.x, input.y);
    if (direction.length > 0) {
      this.facingX = direction.x;
      this.facingY = direction.y;
    }

    if (input.dashPressed) {
      this.tryStartDash(direction);
    }

    if (this.dashTimeRemaining > 0) {
      this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - deltaTime);
      this.velocityX = this.dashDirectionX * this.movement.dashSpeed;
      this.velocityY = this.dashDirectionY * this.movement.dashSpeed;
    } else {
      const moveSpeed = input.moveSpeed ?? this.movement.moveSpeed;
      this.velocityX = direction.x * moveSpeed;
      this.velocityY = direction.y * moveSpeed;
    }

    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
  }

  tryStartDash(direction) {
    if (this.dashCooldownRemaining > 0 || this.dashTimeRemaining > 0) return false;

    const dashDirection = direction.length > 0
      ? direction
      : { x: this.facingX, y: this.facingY, length: 1 };

    this.dashDirectionX = dashDirection.x;
    this.dashDirectionY = dashDirection.y;
    this.dashTimeRemaining = this.movement.dashDuration;
    this.dashCooldownRemaining = this.movement.dashCooldown;
    this.lockImmunityRemaining = this.movement.dashLockImmunity;
    this.dashCount += 1;
    return true;
  }

  get isDashing() {
    return this.dashTimeRemaining > 0;
  }

  get isLockImmune() {
    return this.lockImmunityRemaining > 0;
  }

  get dashReadiness() {
    return 1 - this.dashCooldownRemaining / this.movement.dashCooldown;
  }

  getInterpolatedPosition(interpolation) {
    return {
      x: this.previousX + (this.x - this.previousX) * interpolation,
      y: this.previousY + (this.y - this.previousY) * interpolation,
    };
  }
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
}
