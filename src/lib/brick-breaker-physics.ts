export type Rect = { x: number; y: number; width: number; height: number };
export type Brick = Rect & { id: number; alive: boolean };
export type Ball = { id: number; x: number; y: number; vx: number; vy: number; radius: number; fire?: boolean };
export type Power = "multiball" | "wide" | "slow" | "fire";
export type Drop = { id: number; kind: Power; x: number; y: number; vy: number };
export type Phase = "ready" | "serving" | "playing" | "paused" | "won" | "lost";
export type GameEvent = { kind: "brick" | "wall" | "paddle" | "life" | "power" | "win" | "explosion"; x: number; y: number; id?: number; power?: Power; radius?: number };
export const SERVE_DELAY = 2;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Circle/AABB contact, including a circle whose center has entered the box. */
export function contact(ball: Ball, rect: Rect): { nx: number; ny: number; depth: number } | null {
  const dx = ball.x - clamp(ball.x, rect.x, rect.x + rect.width);
  const dy = ball.y - clamp(ball.y, rect.y, rect.y + rect.height);
  const distance = Math.hypot(dx, dy);
  if (distance >= ball.radius) return null;
  if (distance > 0.0001) return { nx: dx / distance, ny: dy / distance, depth: ball.radius - distance };
  const sides = [
    { distance: ball.x - rect.x, nx: -1, ny: 0 },
    { distance: rect.x + rect.width - ball.x, nx: 1, ny: 0 },
    { distance: ball.y - rect.y, nx: 0, ny: -1 },
    { distance: rect.y + rect.height - ball.y, nx: 0, ny: 1 },
  ];
  const nearest = sides.reduce((a, b) => a.distance < b.distance ? a : b);
  return { nx: nearest.nx, ny: nearest.ny, depth: ball.radius + nearest.distance };
}

/** The game world is independent of the DOM, audio, and frame rate. */
export class BrickBreakerPhysics {
  bricks: Brick[];
  balls: Ball[] = [];
  drops: Drop[] = [];
  paddle: Rect;
  phase: Phase = "ready";
  score = 0;
  lives = 3;
  combo = 0;
  wideFor = 0;
  slowFor = 0;
  serveFor = 0;
  direction = 0;
  readonly baseWidth: number;
  readonly speed: number;
  readonly width: number;
  readonly height: number;
  readonly top = 88;
  readonly left: number;
  readonly right: number;
  readonly blastRadius: number;
  private nextId = 1;
  private target: number;
  private accumulator = 0;
  private previousPhase: "ready" | "serving" | "playing" = "ready";
  private broken = 0;

  constructor(width: number, height: number, bricks: (Rect & { id: number })[], bounds = { left: 12, right: width - 12 }) {
    this.width = width;
    this.height = height;
    this.left = bounds.left;
    this.right = bounds.right;
    const fieldWidth = this.right - this.left;
    this.bricks = bricks.map(brick => ({ ...brick, alive: true }));
    this.baseWidth = Math.min(112, fieldWidth * 0.28);
    this.speed = clamp(fieldWidth * 0.45, 310, 465);
    this.blastRadius = clamp(fieldWidth * 0.18, 72, 120);
    this.target = (this.left + this.right) / 2;
    this.paddle = { x: this.target - this.baseWidth / 2, y: height - 88, width: this.baseWidth, height: 10 };
    this.serve();
  }

  get remaining() { return this.bricks.filter(brick => brick.alive).length; }

  pointTo(x: number) {
    this.target = clamp(x, this.left + this.paddle.width / 2, this.right - this.paddle.width / 2);
    if (this.phase === "ready") {
      this.paddle.x = this.target - this.paddle.width / 2;
      this.attachBall();
    }
  }

  launch() {
    if ((this.phase !== "ready" && this.phase !== "serving") || !this.bricks.length) return;
    this.phase = "playing";
    this.serveFor = 0;
    const ball = this.balls[0];
    ball.vx = this.speed * 0.18;
    ball.vy = -Math.sqrt(this.speed ** 2 - ball.vx ** 2);
  }

  setPaused(paused: boolean) {
    if (paused && (this.phase === "playing" || this.phase === "ready" || this.phase === "serving")) {
      this.previousPhase = this.phase;
      this.phase = "paused";
    } else if (!paused && this.phase === "paused") this.phase = this.previousPhase;
    this.accumulator = 0;
    this.direction = 0;
  }

  restart() {
    this.bricks.forEach(brick => { brick.alive = true; });
    this.score = 0;
    this.lives = 3;
    this.broken = 0;
    this.combo = 0;
    this.drops = [];
    this.wideFor = this.slowFor = this.serveFor = this.accumulator = 0;
    this.paddle.width = this.baseWidth;
    this.target = (this.left + this.right) / 2;
    this.paddle.x = this.target - this.baseWidth / 2;
    this.serve();
  }

  private serve(automatic = false) {
    this.phase = automatic ? "serving" : "ready";
    this.serveFor = automatic ? SERVE_DELAY : 0;
    this.balls = [{ id: this.nextId++, x: 0, y: 0, vx: 0, vy: 0, radius: 5 }];
    this.attachBall();
  }

  private attachBall() {
    if (!this.balls[0]) return;
    this.balls[0].x = this.paddle.x + this.paddle.width / 2;
    this.balls[0].y = this.paddle.y - 9;
  }

  applyPower(kind: Power) {
    if (kind === "multiball") {
      const source = this.balls[0];
      if (!source || this.phase !== "playing") return;
      const angle = Math.atan2(-Math.abs(source.vy), source.vx);
      for (const spread of [-0.48, 0.48]) {
        if (this.balls.length >= 7) break;
        this.balls.push({ ...source, fire: false, id: this.nextId++, vx: Math.cos(angle + spread) * this.speed, vy: Math.sin(angle + spread) * this.speed });
      }
    } else if (kind === "wide") {
      this.wideFor = 14;
      const center = this.paddle.x + this.paddle.width / 2;
      this.paddle.width = Math.min(this.baseWidth * 1.65, this.right - this.left);
      this.paddle.x = clamp(center - this.paddle.width / 2, this.left, this.right - this.paddle.width);
    } else if (kind === "slow") this.slowFor = 10;
    else if (this.phase === "playing" && this.balls[0] && !this.balls.some(ball => ball.fire)) this.balls[0].fire = true;
  }

  /** Fixed 240 Hz steps prevent a fast ball tunneling through a line of text. */
  update(elapsed: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase !== "playing" && this.phase !== "serving") return events;
    this.accumulator += clamp(elapsed, 0, 0.1);
    const dt = 1 / 240;
    while (this.accumulator >= dt && (this.phase === "playing" || this.phase === "serving")) {
      this.accumulator -= dt;
      this.tick(dt, events);
    }
    return events;
  }

  private movePaddle(dt: number) {
    if (this.direction) this.target = this.paddle.x + this.paddle.width / 2 + this.direction * 720 * dt;
    const oldX = this.paddle.x;
    const desired = this.target - this.paddle.width / 2;
    this.paddle.x = clamp(oldX + clamp(desired - oldX, -900 * dt, 900 * dt), this.left, this.right - this.paddle.width);
    return (this.paddle.x - oldX) / dt;
  }

  private destroyBrick(brick: Brick, events: GameEvent[]) {
    if (!brick.alive) return;
    brick.alive = false;
    this.combo++;
    this.score += 10 * Math.min(this.combo, 5);
    this.broken++;
    const x = brick.x + brick.width / 2, y = brick.y + brick.height / 2;
    events.push({ kind: "brick", id: brick.id, x, y });
    if (this.broken === 3 || this.broken % 7 === 0) {
      const cycle: Power[] = ["fire", "wide", "slow", "multiball"];
      const kind = this.broken === 3 ? "multiball" : cycle[(Math.floor(this.broken / 7) - 1) % cycle.length];
      this.drops.push({ id: this.nextId++, kind, x, y, vy: 60 });
    }
  }

  private tick(dt: number, events: GameEvent[]) {
    const spin = this.movePaddle(dt);
    if (this.phase === "serving") {
      this.attachBall();
      this.serveFor = Math.max(0, this.serveFor - dt);
      if (!this.serveFor) this.launch();
      return;
    }
    this.wideFor = Math.max(0, this.wideFor - dt);
    this.slowFor = Math.max(0, this.slowFor - dt);
    if (!this.wideFor && this.paddle.width !== this.baseWidth) {
      this.paddle.x += (this.paddle.width - this.baseWidth) / 2;
      this.paddle.width = this.baseWidth;
    }
    for (const ball of this.balls) {
      const scale = this.slowFor > 0 ? 0.68 : 1;
      ball.x += ball.vx * dt * scale;
      ball.y += ball.vy * dt * scale;
      if (ball.x - ball.radius < this.left || ball.x + ball.radius > this.right) {
        ball.x = clamp(ball.x, this.left + ball.radius, this.right - ball.radius);
        ball.vx *= -1;
        events.push({ kind: "wall", x: ball.x, y: ball.y });
      }
      if (ball.y - ball.radius < this.top) {
        ball.y = this.top + ball.radius;
        ball.vy = Math.abs(ball.vy);
        events.push({ kind: "wall", x: ball.x, y: ball.y });
      }
      if (ball.vy > 0 && contact(ball, this.paddle)) {
        const offset = clamp((ball.x - this.paddle.x - this.paddle.width / 2) / (this.paddle.width / 2), -1, 1);
        ball.vx = clamp(Math.sin(offset * 1.02) * this.speed + spin * 0.12, -this.speed * 0.88, this.speed * 0.88);
        ball.vy = -Math.sqrt(this.speed ** 2 - ball.vx ** 2);
        ball.y = this.paddle.y - ball.radius - 0.1;
        this.combo = 0;
        events.push({ kind: "paddle", x: ball.x, y: ball.y });
      }
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const hit = contact(ball, brick);
        if (!hit) continue;
        ball.x += hit.nx * (hit.depth + 0.1);
        ball.y += hit.ny * (hit.depth + 0.1);
        const dot = ball.vx * hit.nx + ball.vy * hit.ny;
        if (dot < 0) { ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny; }
        // Keep even a corner ricochet from becoming a horizontal stalemate.
        if (Math.abs(ball.vy) < this.speed * 0.22) {
          ball.vy = (ball.vy < 0 ? -1 : 1) * this.speed * 0.22;
          ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(this.speed ** 2 - ball.vy ** 2);
        }
        if (ball.fire) {
          // One charge on one ball. Walls and the paddle never consume it.
          ball.fire = false;
          const x = clamp(ball.x, brick.x, brick.x + brick.width);
          const y = clamp(ball.y, brick.y, brick.y + brick.height);
          events.push({ kind: "explosion", x, y, radius: this.blastRadius });
          for (const neighbor of this.bricks) {
            const dx = x - clamp(x, neighbor.x, neighbor.x + neighbor.width);
            const dy = y - clamp(y, neighbor.y, neighbor.y + neighbor.height);
            if (Math.hypot(dx, dy) <= this.blastRadius) this.destroyBrick(neighbor, events);
          }
        } else {
          this.destroyBrick(brick, events);
        }
        if (!this.remaining) {
          this.phase = "won";
          events.push({ kind: "win", x: ball.x, y: ball.y });
        }
        break;
      }
    }
    for (const drop of this.drops) {
      drop.vy += 22 * dt;
      drop.y += drop.vy * dt;
      if (drop.y + 12 >= this.paddle.y && drop.y - 12 <= this.paddle.y + this.paddle.height
        && drop.x + 12 >= this.paddle.x && drop.x - 12 <= this.paddle.x + this.paddle.width) {
        this.applyPower(drop.kind);
        events.push({ kind: "power", power: drop.kind, x: drop.x, y: drop.y });
        drop.y = this.height + 100;
      }
    }
    this.drops = this.drops.filter(drop => drop.y < this.height);
    this.balls = this.balls.filter(ball => ball.y - ball.radius < this.height - 35);
    if (!this.balls.length && this.phase === "playing") {
      this.lives--;
      this.combo = 0;
      this.drops = [];
      this.wideFor = this.slowFor = 0;
      const center = this.paddle.x + this.paddle.width / 2;
      this.paddle.width = this.baseWidth;
      this.paddle.x = clamp(center - this.baseWidth / 2, this.left, this.right - this.baseWidth);
      events.push({ kind: "life", x: this.paddle.x + this.paddle.width / 2, y: this.paddle.y });
      if (this.lives > 0) this.serve(true);
      else this.phase = "lost";
    }
  }
}
