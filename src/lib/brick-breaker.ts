import { BrickBreakerPhysics, SERVE_DELAY, type Brick, type GameEvent, type Phase, type Power } from "./brick-breaker-physics";

export type GameSnapshot = {
  phase: Phase; score: number; lives: number; remaining: number; total: number;
  balls: number; combo: number; wideFor: number; slowFor: number; fireBalls: number; serveFor: number;
};
type Options = {
  onState: (state: GameSnapshot) => void;
  onAnnounce: (message: string) => void;
  onBounds: (bounds: {left: number; width: number}) => void;
  onGameEvents?: (events: GameEvent[], state: GameSnapshot) => void;
  onReset?: (reason: "restart" | "resize") => void;
};
type Piece = { element: HTMLElement | SVGElement; visibility: string; priority: string; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string };
type Blast = { x: number; y: number; radius: number; life: number };

/** Wrap live text without replacing any links, controls, or their listeners. */
class PageBricks {
  pieces = new Map<number, Piece>();
  bricks: Brick[] = [];
  private originals: { wrapper: HTMLSpanElement; text: Text }[] = [];

  constructor(left: number, right: number, height: number) {
    const root = document.querySelector(".site-shell");
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || parent.closest("script, style, svg, button, input, textarea, select, dialog, [contenteditable], [aria-hidden='true'], [data-breaker-ignore]")) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.bottom < 95 || rect.top > height - 140 || !rect.width || !rect.height) continue;
      if (getComputedStyle(parent).visibility === "hidden") continue;
      texts.push(node as Text);
    }
    let id = 0;
    const add = (element: HTMLElement | SVGElement) => {
      const rect = element.getBoundingClientRect();
      if (this.bricks.length >= 180 || rect.width < 3 || rect.height < 5 || rect.left < left + 2
        || rect.right > right - 2 || rect.top < 100 || rect.bottom > height - 140) return;
      const key = id++;
      this.pieces.set(key, {
        element, visibility: element.style.getPropertyValue("visibility"),
        priority: element.style.getPropertyPriority("visibility"), color: getComputedStyle(element).color,
      });
      this.bricks.push({ id: key, x: rect.left - 2, y: rect.top - 1, width: rect.width + 4, height: rect.height + 2, alive: true });
    };
    for (const text of texts) {
      const wrapper = document.createElement("span");
      wrapper.dataset.breakerText = "";
      for (const word of text.data.match(/\s+|\S+/gu) ?? []) {
        if (!word.trim()) wrapper.append(document.createTextNode(word));
        else {
          const piece = document.createElement("span");
          piece.textContent = word;
          wrapper.append(piece);
        }
      }
      text.replaceWith(wrapper);
      this.originals.push({ wrapper, text });
      for (const piece of wrapper.children) add(piece as HTMLElement);
    }
    for (const image of root.querySelectorAll<HTMLElement | SVGElement>("main img:not([hidden]), .creator-link__logo, .project-link__arrow")) add(image);
  }

  break(id: number) { this.pieces.get(id)?.element.style.setProperty("visibility", "hidden"); }
  restore() {
    for (const piece of this.pieces.values()) {
      if (piece.visibility) piece.element.style.setProperty("visibility", piece.visibility, piece.priority);
      else piece.element.style.removeProperty("visibility");
    }
  }
  destroy() {
    this.restore();
    // A live widget may have already replaced its own text. Never overwrite it.
    for (const { wrapper, text } of this.originals) if (wrapper.isConnected) wrapper.replaceWith(text);
    this.originals = [];
  }
}

class GameAudio {
  muted = false;
  private context?: AudioContext;
  private voices = 0;

  unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* The game still works in browsers without Web Audio. */ }
  }

  tone(frequency: number, duration = 0.08, delay = 0, end = frequency) {
    const context = this.context;
    if (this.muted || !context || context.state !== "running" || this.voices >= 10) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const time = context.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, end), time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.voices++;
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices--; };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }

  event(event: GameEvent) {
    if (event.kind === "explosion") {
      this.tone(150, 0.28, 0, 42);
      const context = this.context;
      if (!this.muted && context?.state === "running") {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        noise.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 800;
        gain.gain.setValueAtTime(0.06, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
        noise.connect(filter); filter.connect(gain); gain.connect(context.destination);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
        noise.start();
      }
    }
    if (event.kind === "brick") this.tone(520 + ((event.id ?? 0) % 6) * 95, 0.09, 0, 360);
    if (event.kind === "wall") this.tone(180, 0.035);
    if (event.kind === "paddle") this.tone(320, 0.07, 0, 540);
    if (event.kind === "life") this.tone(280, 0.3, 0, 85);
    if (event.kind === "power" || event.kind === "win") {
      [440, 554, 659, 880].forEach((note, i) => this.tone(note, 0.2, i * 0.07));
    }
  }

  suspend() { void this.context?.suspend().catch(() => {}); }
  destroy() { void this.context?.close().catch(() => {}); this.context = undefined; }
}

export class BrickBreakerScene {
  private context: CanvasRenderingContext2D;
  private board!: PageBricks;
  private physics!: BrickBreakerPhysics;
  private audio = new GameAudio();
  private frame = 0;
  private previous = 0;
  private width = 0;
  private height = 0;
  private particles: Particle[] = [];
  private blasts: Blast[] = [];
  private trails = new Map<number, { x: number; y: number }[]>();
  private observer: ResizeObserver;
  private abort = new AbortController();
  private lastSnapshot = "";
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private canvas: HTMLCanvasElement;
  private options: Options;

  constructor(canvas: HTMLCanvasElement, options: Options) {
    this.canvas = canvas;
    this.options = options;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    this.context = context;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    const signal = this.abort.signal;
    canvas.addEventListener("pointermove", this.pointer, { signal });
    canvas.addEventListener("pointerdown", event => {
      canvas.setPointerCapture(event.pointerId);
      this.pointer(event);
      if (this.physics.phase === "ready" || this.physics.phase === "serving") this.start();
    }, { signal });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      if (this.physics.phase === "playing" || this.physics.phase === "serving") this.pause();
      else { this.stop(); this.audio.suspend(); }
    }, { signal });
    window.addEventListener("blur", () => {
      this.physics.direction = 0;
      if (this.physics.phase === "playing" || this.physics.phase === "serving") this.pause();
      else this.audio.suspend();
    }, { signal });
  }

  get muted() { return this.audio.muted; }

  start() {
    this.audio.unlock();
    if (this.physics.phase === "lost" || this.physics.phase === "won") this.restart();
    const resuming = this.physics.phase === "paused";
    if (resuming) this.physics.setPaused(false);
    if (!resuming && (this.physics.phase === "ready" || this.physics.phase === "serving")) this.physics.launch();
    this.canvas.focus({ preventScroll: true });
    this.previous = 0;
    this.notify();
    this.schedule();
  }

  pause() {
    if (this.physics.phase !== "playing" && this.physics.phase !== "serving") return;
    this.physics.setPaused(true);
    this.audio.suspend();
    this.stop();
    this.notify();
    this.paint();
  }

  togglePause() { if (this.physics.phase === "paused") this.start(); else this.pause(); }
  toggleSound() { this.audio.muted = !this.audio.muted; if (!this.audio.muted) this.audio.unlock(); else this.audio.suspend(); }

  setDirection(direction: number) {
    this.physics.direction = direction;
    if (this.physics.phase === "ready") {
      this.physics.pointTo(this.physics.paddle.x + this.physics.paddle.width / 2 + direction * 24);
      this.paint();
    }
  }

  restart() {
    this.options.onReset?.("restart");
    this.stop();
    this.board.restore();
    this.physics.restart();
    this.particles = [];
    this.blasts = [];
    this.trails.clear();
    this.notify();
    this.paint();
  }

  destroy() {
    this.stop();
    this.observer.disconnect();
    this.abort.abort();
    this.board.destroy();
    this.audio.destroy();
    this.context.clearRect(0, 0, this.width, this.height);
  }

  private pointer = (event: PointerEvent) => {
    if (event.pointerType === "touch" && !this.canvas.hasPointerCapture(event.pointerId)) return;
    const x = event.clientX - this.canvas.getBoundingClientRect().left;
    this.physics.pointTo(x);
    if (this.physics.phase === "ready") this.paint();
  };

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height || (width === this.width && height === this.height)) return;
    const hadBoard = Boolean(this.board);
    if (hadBoard) this.options.onReset?.("resize");
    this.stop();
    this.board?.destroy();
    this.width = width;
    this.height = height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const content = document.querySelector("main")?.getBoundingClientRect();
    const left = Math.max(12, (content?.left ?? 24) - 12);
    const right = Math.min(width - 12, (content?.right ?? width - 24) + 12);
    this.options.onBounds({ left, width: right - left });
    this.board = new PageBricks(left, right, height);
    this.physics = new BrickBreakerPhysics(width, height, this.board.bricks, { left, right });
    this.particles = [];
    this.blasts = [];
    this.trails.clear();
    this.notify();
    this.paint();
    if (hadBoard) this.options.onAnnounce("The viewport changed. A fresh page is ready to play.");
  }

  private snapshot(): GameSnapshot {
    const p = this.physics;
    return {
      phase: p.phase, score: p.score, lives: p.lives, remaining: p.remaining, total: p.bricks.length,
      balls: p.balls.length, combo: p.combo, wideFor: Math.ceil(p.wideFor), slowFor: Math.ceil(p.slowFor),
      fireBalls: p.balls.filter(ball => ball.fire).length, serveFor: Math.ceil(p.serveFor),
    };
  }

  private notify() {
    const state = this.snapshot();
    const snapshot = JSON.stringify(state);
    if (snapshot !== this.lastSnapshot) { this.lastSnapshot = snapshot; this.options.onState(state); }
  }

  private stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.previous = 0; }
  private schedule() { if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(this.animate); }
  private animate = (now: number) => {
    this.frame = 0;
    const dt = this.previous ? Math.min((now - this.previous) / 1000, 0.05) : 0;
    this.previous = now;
    const events = this.physics.update(dt);
    for (const event of events) {
      if (event.kind === "brick" && event.id !== undefined) {
        this.board.break(event.id);
        this.burst(event.x, event.y, this.board.pieces.get(event.id)?.color ?? "#555");
      }
      if (event.kind === "power") {
        this.burst(event.x, event.y, event.power === "fire" ? "#d77938" : "#5876c8");
        const messages: Record<Power, string> = { multiball: "Multiball! Two extra balls.", wide: "Wide paddle, for 14 seconds.", slow: "Slow motion, for 10 seconds.", fire: "Fireball armed. One hit, one blast." };
        this.options.onAnnounce(messages[event.power!]);
      }
      if (event.kind === "explosion") {
        if (!this.reducedMotion.matches) this.blasts.push({ x: event.x, y: event.y, radius: event.radius!, life: 0.55 });
        for (let i = 0; i < 3; i++) this.burst(event.x, event.y, i === 0 ? "#df7132" : "#c7924d");
      }
      if (event.kind === "life") this.options.onAnnounce(this.physics.lives ? `${this.physics.lives} lives left. Serving again in two seconds. Space or tap to serve now.` : "Game over.");
      if (event.kind === "win") this.options.onAnnounce("Every piece cleared. You broke the internet!");
      this.audio.event(event);
    }
    if (events.length) this.options.onGameEvents?.(events, this.snapshot());
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.vy += 280 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
    for (const blast of this.blasts) blast.life -= dt;
    this.blasts = this.blasts.filter(blast => blast.life > 0);
    this.notify();
    this.paint();
    if (this.physics.phase === "playing" || this.physics.phase === "serving" || ((this.particles.length || this.blasts.length) && this.physics.phase !== "paused")) this.schedule();
  };

  private burst(x: number, y: number, color: string) {
    if (this.reducedMotion.matches) return;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 100;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life: 0.5 + Math.random() * 0.2, size: 1.5 + Math.random() * 2, color });
    }
    if (this.particles.length > 200) this.particles.splice(0, this.particles.length - 200);
  }

  private paint() {
    const c = this.context;
    const p = this.physics;
    const fieldWidth = p.right - p.left;
    c.clearRect(0, 0, this.width, this.height);
    // Quiet, solid lanes keep the controls and paddle clear of page content.
    const top = c.createLinearGradient(0, 0, 0, 100);
    top.addColorStop(0, "#fdfcfa"); top.addColorStop(0.78, "#fdfcfa"); top.addColorStop(1, "#fdfcfa00");
    c.fillStyle = top; c.fillRect(p.left, 0, fieldWidth, 100);
    const floor = c.createLinearGradient(0, this.height - 135, 0, this.height - 100);
    floor.addColorStop(0, "#fdfcfa00"); floor.addColorStop(1, "#fdfcfa");
    c.fillStyle = floor; c.fillRect(p.left, this.height - 135, fieldWidth, 135);
    c.strokeStyle = "#2c2c2910"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(p.left, 88); c.lineTo(p.left, this.height - 45); c.moveTo(p.right, 88); c.lineTo(p.right, this.height - 45); c.stroke();
    c.save();
    c.beginPath(); c.rect(p.left, p.top, fieldWidth, this.height - p.top - 35); c.clip();
    for (const brick of p.bricks) {
      if (!brick.alive) continue;
      c.strokeStyle = "#2c2c2924";
      c.beginPath(); c.roundRect(brick.x, brick.y, brick.width, brick.height, 3); c.stroke();
    }
    for (const particle of this.particles) {
      c.globalAlpha = Math.min(1, particle.life * 2);
      c.fillStyle = particle.color;
      c.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    c.globalAlpha = 1;
    for (const blast of this.blasts) {
      const progress = 1 - blast.life / 0.55;
      const radius = Math.max(1, blast.radius * (1 - (1 - progress) ** 3));
      const glow = c.createRadialGradient(blast.x, blast.y, 0, blast.x, blast.y, radius);
      glow.addColorStop(0, `rgba(243,161,67,${blast.life * 0.32})`);
      glow.addColorStop(1, "rgba(226,115,49,0)");
      c.fillStyle = glow; c.beginPath(); c.arc(blast.x, blast.y, radius, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(207,111,50,${blast.life * 0.9})`; c.lineWidth = 1.5;
      c.beginPath(); c.arc(blast.x, blast.y, radius, 0, Math.PI * 2); c.stroke();
    }
    for (const drop of p.drops) {
      const colors: Record<Power, string> = { multiball: "#5876c8", wide: "#9471ad", slow: "#a47a36", fire: "#d77938" };
      c.fillStyle = "#fdfcfa"; c.strokeStyle = colors[drop.kind]; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(drop.x - 13, drop.y - 13, 26, 26, 7); c.fill(); c.stroke();
      c.fillStyle = colors[drop.kind]; c.font = "700 11px ui-monospace, monospace"; c.textAlign = "center";
      c.fillText({ multiball: "M", wide: "W", slow: "S", fire: "F" }[drop.kind], drop.x, drop.y + 4);
    }
    c.fillStyle = p.wideFor ? "#6c60a1" : "#383835";
    c.beginPath(); c.roundRect(p.paddle.x, p.paddle.y, p.paddle.width, p.paddle.height, 5); c.fill();
    c.fillStyle = "#ffffff70"; c.fillRect(p.paddle.x + 7, p.paddle.y + 2, p.paddle.width - 14, 1);
    const living = new Set(p.balls.map(ball => ball.id));
    for (const id of this.trails.keys()) if (!living.has(id)) this.trails.delete(id);
    for (const ball of p.balls) {
      let trail = this.trails.get(ball.id);
      if (!trail) { trail = []; this.trails.set(ball.id, trail); }
      if (p.phase === "playing" && !this.reducedMotion.matches) {
        trail.push({ x: ball.x, y: ball.y }); if (trail.length > 10) trail.shift();
        trail.forEach((point, i) => {
          c.fillStyle = ball.fire ? `rgba(223,114,47,${i / trail!.length * 0.35})` : `rgba(75,105,179,${i / trail!.length * 0.18})`;
          c.beginPath(); c.arc(point.x, point.y, ball.radius * i / trail!.length, 0, Math.PI * 2); c.fill();
        });
      }
      if (ball.fire) {
        const glow = c.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, 16);
        glow.addColorStop(0, "#f6aa5399"); glow.addColorStop(1, "#ed813000");
        c.fillStyle = glow; c.beginPath(); c.arc(ball.x, ball.y, 16, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = ball.fire ? "#e78835" : "#4b69b3";
      c.beginPath(); c.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ffffffb0"; c.beginPath(); c.arc(ball.x - 1, ball.y - 1.5, 1.5, 0, Math.PI * 2); c.fill();
    }
    if (p.phase === "ready" || p.phase === "serving") {
      const center = p.paddle.x + p.paddle.width / 2;
      c.fillStyle = "#8a8981"; c.textAlign = "center"; c.font = "10px ui-monospace, monospace";
      c.fillText(p.phase === "serving" ? `BACK IN ${Math.ceil(p.serveFor)} · SPACE / TAP TO SERVE` : "SPACE / TAP TO LAUNCH", (p.left + p.right) / 2, p.paddle.y - 34);
      if (p.phase === "serving") {
        c.strokeStyle = "#7285b2"; c.lineWidth = 1.5;
        c.beginPath(); c.arc(center, p.paddle.y - 9, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.serveFor / SERVE_DELAY)); c.stroke();
      }
    }
    c.restore();
  }
}
