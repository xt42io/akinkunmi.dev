import type { GameSnapshot } from "./brick-breaker";
import type { GameEvent } from "./brick-breaker-physics";

export type CaptureOptions = { transport: "sendBeacon"; send_instantly: true };
export type GameplayCapture = (event: string, properties: Record<string, unknown>, options?: CaptureOptions) => void;

/** One session per opening, one round per first launch; frame updates never emit events. */
export class BrickBreakerAnalytics {
  private capture: GameplayCapture;
  private context: { game_session_id: string; pathname: string };
  private now: () => number;
  private openedAt: number;
  private round = 0;
  private roundActive = false;
  private roundStartedAt = 0;
  private roundEndedAt?: number;
  private activeSince?: number;
  private activeMs = 0;
  private latest?: GameSnapshot;
  private maxCombo = 0;
  private powers = 0;
  private explosions = 0;
  private closed = false;

  constructor(capture: GameplayCapture, context: { game_session_id: string; pathname: string }, now = () => performance.now()) {
    this.capture = capture;
    this.context = context;
    this.now = now;
    this.openedAt = now();
  }

  private emit(name: string, properties: Record<string, unknown> = {}, unloading = false) {
    try {
      this.capture(`brick_breaker_${name}`, { ...this.context, ...this.summary(), ...properties },
        unloading ? { transport: "sendBeacon", send_instantly: true } : undefined);
    } catch { /* Analytics must never interrupt the game. */ }
  }

  private summary(state = this.latest) {
    const seconds = (ms: number) => Math.round(ms / 10) / 100;
    return {
      round_number: this.round,
      round_id: this.round ? `${this.context.game_session_id}:${this.round}` : null,
      phase: state?.phase ?? "loading",
      score: state?.score ?? 0,
      lives_remaining: state?.lives ?? 3,
      bricks_total: state?.total ?? 0,
      bricks_cleared: state ? state.total - state.remaining : 0,
      balls: state?.balls ?? 0,
      max_combo: this.maxCombo,
      power_ups_collected: this.powers,
      explosions: this.explosions,
      duration_seconds: this.round ? seconds((this.roundEndedAt ?? this.now()) - this.roundStartedAt) : 0,
      active_seconds: seconds(this.activeMs + (this.activeSince === undefined ? 0 : this.now() - this.activeSince)),
    };
  }

  opened(trigger: "keyboard" | "double_tap") { this.emit("opened", { trigger }); }
  failed() { this.emit("load_failed"); }

  state(state: GameSnapshot) {
    if (this.closed) return;
    const previous = this.latest?.phase;
    if (state.phase !== "playing" && this.activeSince !== undefined) {
      this.activeMs += this.now() - this.activeSince;
      this.activeSince = undefined;
    }
    this.latest = { ...state };
    if (state.phase === "playing" && !this.roundActive) {
      this.round++;
      this.roundActive = true;
      this.roundStartedAt = this.now();
      this.roundEndedAt = undefined;
      this.activeMs = 0;
      this.maxCombo = this.powers = this.explosions = 0;
      this.activeSince = this.now();
      this.emit("started");
    } else if (state.phase === "playing" && this.activeSince === undefined) this.activeSince = this.now();
    this.maxCombo = Math.max(this.maxCombo, state.combo);
    if (this.roundActive && previous !== state.phase) {
      if (state.phase === "paused") this.emit("paused", { previous_phase: previous });
      else if (previous === "paused") this.emit("resumed", { resumed_phase: state.phase });
    }
    if (state.phase === "won" || state.phase === "lost") this.finish(state.phase);
  }

  events(events: GameEvent[], state: GameSnapshot) {
    if (this.closed || !this.roundActive) return;
    this.maxCombo = Math.max(this.maxCombo, state.combo);
    for (const event of events) {
      if (event.kind === "power") {
        this.powers++;
        this.emit("power_up_collected", { ...this.summary(state), power_up: event.power });
      } else if (event.kind === "explosion") {
        this.explosions++;
        this.emit("fireball_exploded", { ...this.summary(state), bricks_destroyed: event.destroyed, blast_radius: event.radius });
      } else if (event.kind === "life") this.emit("life_lost", this.summary(state));
    }
  }

  reset(reason: "restart" | "resize") {
    if (this.closed) return;
    if (reason === "restart") this.emit("restarted");
    this.finish(reason === "restart" ? "restarted" : "resized");
  }

  sound(enabled: boolean) { if (!this.closed) this.emit("sound_toggled", { enabled }); }

  private finish(outcome: "won" | "lost" | "restarted" | "resized" | "abandoned", unloading = false) {
    if (!this.roundActive) return;
    if (this.activeSince !== undefined) {
      this.activeMs += this.now() - this.activeSince;
      this.activeSince = undefined;
    }
    this.roundActive = false;
    this.roundEndedAt = this.now();
    this.emit("round_ended", { outcome }, unloading);
  }

  close(method: "button" | "escape" | "navigation") {
    if (this.closed) return;
    this.closed = true;
    const unloading = method === "navigation";
    this.finish("abandoned", unloading);
    this.emit("closed", { close_method: method, session_duration_seconds: Math.round((this.now() - this.openedAt) / 10) / 100 }, unloading);
  }
}
