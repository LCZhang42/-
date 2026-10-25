export class VisualEffectsPool {
  constructor({ capacity = 120, random = Math.random } = {}) {
    this.random = random;
    this.lowEffects = false;
    this.cursor = 0;
    this.particles = Array.from({ length: capacity }, () => ({
      active: false,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      gravity: 0,
      rotation: 0,
      spin: 0,
      size: 0,
      life: 0,
      maxLife: 0,
      color: "#ffffff",
      kind: "ink",
    }));
  }

  setLowEffects(value) {
    const nextValue = Boolean(value);
    if (nextValue && !this.lowEffects) this.clear();
    this.lowEffects = nextValue;
  }

  spawnImpact({ x, y, color, direction = 1, intensity = 1 }) {
    const count = this.lowEffects ? 0 : Math.round(22 * intensity);
    for (let index = 0; index < count; index += 1) {
      const particle = this.nextParticle();
      const angle = -Math.PI * 0.86 + this.random() * Math.PI * 1.72;
      const speed = (90 + this.random() * 250) * intensity;
      const forward = (70 + this.random() * 170) * direction;
      const life = 0.28 + this.random() * 0.45;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.velocityX = Math.cos(angle) * speed + forward;
      particle.velocityY = Math.sin(angle) * speed - 35;
      particle.gravity = 360 + this.random() * 220;
      particle.rotation = this.random() * Math.PI * 2;
      particle.spin = (this.random() - 0.5) * 12;
      particle.size = 4 + this.random() * 13 * intensity;
      particle.life = life;
      particle.maxLife = life;
      particle.color = color;
      particle.kind = index % 4 === 0 ? "slash" : "ink";
    }
  }

  nextParticle() {
    for (let offset = 0; offset < this.particles.length; offset += 1) {
      const index = (this.cursor + offset) % this.particles.length;
      if (!this.particles[index].active) {
        this.cursor = (index + 1) % this.particles.length;
        return this.particles[index];
      }
    }

    const particle = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    return particle;
  }

  update(deltaTime) {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.life = Math.max(0, particle.life - deltaTime);
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.velocityY += particle.gravity * deltaTime;
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.rotation += particle.spin * deltaTime;
    }
  }

  draw(context) {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      const progress = particle.life / particle.maxLife;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.globalAlpha = Math.min(1, progress * 1.8);
      context.fillStyle = particle.color;
      context.strokeStyle = particle.color;
      if (particle.kind === "slash") {
        context.lineWidth = Math.max(2, particle.size * progress * 0.34);
        context.beginPath();
        context.moveTo(-particle.size * 1.8, 0);
        context.lineTo(particle.size * 1.8, 0);
        context.stroke();
      } else {
        const size = particle.size * (0.35 + progress * 0.65);
        context.beginPath();
        context.ellipse(0, 0, size, size * 0.58, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  clear() {
    for (const particle of this.particles) particle.active = false;
  }

  get activeCount() {
    return this.particles.reduce((total, particle) => total + Number(particle.active), 0);
  }
}
