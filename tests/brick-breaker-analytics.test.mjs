import assert from "node:assert/strict";
import { test } from "node:test";
import { BrickBreakerAnalytics } from "../src/lib/brick-breaker-analytics.ts";
import { BrickBreakerPhysics } from "../src/lib/brick-breaker-physics.ts";

const snapshot = (phase = "playing", changes = {}) => ({
  phase, score: 0, lives: 3, remaining: 10, total: 10, balls: 1, combo: 0,
  wideFor: 0, slowFor: 0, fireBalls: 0, serveFor: 0, ...changes,
});

function session() {
  let time = 0;
  const captured = [];
  const analytics = new BrickBreakerAnalytics((event, properties, options) => {
    captured.push({ event, properties, options });
  }, { game_session_id: "game-1", pathname: "/projects" }, () => time);
  return {
    analytics, captured,
    advance(ms) { time += ms; },
    events(name) { return captured.filter(item => item.event === `brick_breaker_${name}`); },
  };
}

test("opening the intro does not count as playing; closing is recorded only once", () => {
  const s = session();
  s.analytics.opened("double_tap"); s.analytics.state(snapshot("ready"));
  s.advance(2500); s.analytics.close("escape"); s.analytics.close("button");
  assert.deepEqual(s.captured.map(item => item.event), ["brick_breaker_opened", "brick_breaker_closed"]);
  assert.equal(s.events("opened")[0].properties.trigger, "double_tap");
  assert.equal(s.events("opened")[0].properties.pathname, "/projects");
  assert.equal(s.events("closed")[0].properties.session_duration_seconds, 2.5);
  assert.equal(s.events("closed")[0].properties.round_id, null);
  assert.equal(s.events("closed")[0].properties.close_method, "escape");
});

test("one round survives pauses and auto-serves; active time excludes both waits", () => {
  const s = session();
  s.analytics.state(snapshot("ready"));
  s.advance(1000); s.analytics.state(snapshot());
  for (let i = 0; i < 30; i++) s.analytics.state(snapshot());
  s.advance(2000); s.analytics.state(snapshot("paused"));
  s.advance(4000); s.analytics.state(snapshot());
  s.advance(1000); s.analytics.state(snapshot("serving", { lives: 2, serveFor: 2 }));
  s.advance(2000); s.analytics.state(snapshot("playing", { lives: 2 }));
  s.advance(1000); s.analytics.state(snapshot("won", { score: 300, remaining: 0, combo: 8, lives: 2 }));
  s.advance(5000); s.analytics.state(snapshot("won", { score: 300, remaining: 0, combo: 8, lives: 2 }));
  s.analytics.close("button");
  assert.equal(s.events("started").length, 1);
  assert.equal(s.events("paused").length, 1);
  assert.equal(s.events("resumed").length, 1);
  assert.equal(s.events("round_ended").length, 1);
  const result = s.events("round_ended")[0].properties;
  assert.equal(result.outcome, "won");
  assert.equal(result.duration_seconds, 10);
  assert.equal(result.active_seconds, 4);
  assert.equal(result.bricks_cleared, 10);
  assert.equal(result.max_combo, 8);
  assert.equal(result.round_id, "game-1:1");
  assert.equal(s.events("closed")[0].properties.duration_seconds, 10);
});

test("pausing a serve resumes the same round without counting the countdown as play time", () => {
  const s = session();
  s.analytics.state(snapshot()); s.advance(1000);
  s.analytics.state(snapshot("serving")); s.advance(1000);
  s.analytics.state(snapshot("paused")); s.advance(3000);
  s.analytics.state(snapshot("serving")); s.advance(1000);
  s.analytics.state(snapshot()); s.advance(500); s.analytics.close("button");
  assert.equal(s.events("paused")[0].properties.previous_phase, "serving");
  assert.equal(s.events("resumed")[0].properties.resumed_phase, "serving");
  assert.equal(s.events("started").length, 1);
  assert.equal(s.events("round_ended")[0].properties.active_seconds, 1.5);
  assert.equal(s.events("round_ended")[0].properties.outcome, "abandoned");
});

test("power-ups, explosions, and lost lives carry progress without emitting ordinary hits", () => {
  const s = session(); s.analytics.state(snapshot());
  const progress = snapshot("serving", { score: 60, lives: 2, remaining: 7, combo: 3 });
  s.analytics.events([
    { kind: "wall", x: 0, y: 0 }, { kind: "paddle", x: 0, y: 0 },
    { kind: "power", power: "fire", x: 0, y: 0 },
    { kind: "explosion", x: 0, y: 0, radius: 120, destroyed: 3 },
    { kind: "brick", id: 1, x: 0, y: 0 }, { kind: "life", x: 0, y: 0 },
  ], progress);
  s.analytics.state(progress); s.analytics.close("button");
  assert.deepEqual(s.captured.map(item => item.event), [
    "brick_breaker_started", "brick_breaker_power_up_collected", "brick_breaker_fireball_exploded",
    "brick_breaker_life_lost", "brick_breaker_round_ended", "brick_breaker_closed",
  ]);
  assert.equal(s.events("power_up_collected")[0].properties.power_up, "fire");
  const blast = s.events("fireball_exploded")[0].properties;
  assert.equal(blast.bricks_destroyed, 3); assert.equal(blast.blast_radius, 120);
  assert.equal(blast.bricks_cleared, 3); assert.equal(blast.max_combo, 3);
  assert.equal(s.events("life_lost")[0].properties.lives_remaining, 2);
  const result = s.events("round_ended")[0].properties;
  assert.equal(result.power_ups_collected, 1); assert.equal(result.explosions, 1);
});

test("restarts and viewport resets finish their round and reset aggregates for the next launch", () => {
  const s = session(); s.analytics.state(snapshot());
  s.analytics.events([{ kind: "power", power: "multiball", x: 0, y: 0 }], snapshot());
  s.analytics.state(snapshot("playing", { score: 120, combo: 4 }));
  s.advance(1000); s.analytics.reset("restart"); s.analytics.state(snapshot("ready"));
  s.advance(1000); s.analytics.state(snapshot());
  s.advance(2000); s.analytics.reset("resize"); s.analytics.state(snapshot("ready"));
  s.analytics.state(snapshot()); s.analytics.state(snapshot("lost", { lives: 0 }));
  s.analytics.close("button");
  assert.equal(s.events("restarted").length, 1);
  assert.deepEqual(s.events("started").map(item => item.properties.round_number), [1, 2, 3]);
  assert.deepEqual(s.events("round_ended").map(item => item.properties.outcome), ["restarted", "resized", "lost"]);
  assert.equal(s.events("round_ended")[0].properties.power_ups_collected, 1);
  assert.equal(s.events("round_ended")[1].properties.power_ups_collected, 0);
  assert.equal(s.events("round_ended")[1].properties.max_combo, 0);
  assert.equal(s.events("round_ended")[1].properties.score, 0);
  assert.equal(s.events("round_ended")[1].properties.active_seconds, 2);
});

test("navigation flushes an abandoned round and session through an immediate beacon, once", () => {
  const s = session(); s.analytics.opened("keyboard"); s.analytics.state(snapshot());
  s.advance(1700); s.analytics.close("navigation"); s.analytics.close("navigation");
  s.analytics.state(snapshot()); s.analytics.sound(false);
  assert.equal(s.events("started").length, 1); assert.equal(s.events("round_ended").length, 1);
  assert.equal(s.events("closed").length, 1); assert.equal(s.events("sound_toggled").length, 0);
  for (const event of [s.events("round_ended")[0], s.events("closed")[0]]) {
    assert.deepEqual(event.options, { transport: "sendBeacon", send_instantly: true });
    assert.equal(event.properties.active_seconds, 1.7);
  }
  assert.equal(s.events("closed")[0].properties.close_method, "navigation");
});

test("sound changes and load failures are captured and unavailable analytics cannot break gameplay", () => {
  const s = session(); s.analytics.opened("keyboard");
  s.analytics.sound(false); s.analytics.sound(true); s.analytics.failed(); s.analytics.close("button");
  assert.deepEqual(s.events("sound_toggled").map(item => item.properties.enabled), [false, true]);
  assert.equal(s.events("load_failed").length, 1); assert.equal(s.events("round_ended").length, 0);
  const blocked = new BrickBreakerAnalytics(() => { throw new Error("blocked"); },
    { game_session_id: "blocked", pathname: "/" }, () => 0);
  assert.doesNotThrow(() => {
    blocked.opened("keyboard"); blocked.state(snapshot()); blocked.sound(false);
    blocked.events([{ kind: "power", power: "slow", x: 0, y: 0 }], snapshot());
    blocked.reset("restart"); blocked.failed(); blocked.close("navigation");
  });
});

test("a real fireball win reports the blast before the final round summary", () => {
  const s = session();
  const game = new BrickBreakerPhysics(800, 600, [
    { id: 1, x: 240, y: 200, width: 60, height: 14 },
    { id: 2, x: 310, y: 200, width: 100, height: 14 },
    { id: 3, x: 240, y: 150, width: 45, height: 14 },
  ]);
  const current = () => snapshot(game.phase, {
    score: game.score, lives: game.lives, remaining: game.remaining, total: game.bricks.length,
    balls: game.balls.length, combo: game.combo,
  });
  game.launch(); s.analytics.state(current());
  game.drops.push({ id: 1, kind: "fire", x: game.paddle.x + 30, y: game.paddle.y - 12, vy: 100 });
  let events = game.update(1 / 60); s.analytics.events(events, current()); s.analytics.state(current());
  Object.assign(game.balls[0], { x: 270, y: 221, vx: 0, vy: -game.speed });
  events = game.update(1 / 60); s.analytics.events(events, current()); s.analytics.state(current());
  assert.equal(s.events("fireball_exploded")[0].properties.bricks_destroyed, 3);
  const end = s.captured.at(-1);
  assert.equal(end.event, "brick_breaker_round_ended");
  assert.equal(end.properties.outcome, "won"); assert.equal(end.properties.score, 60);
  assert.equal(end.properties.power_ups_collected, 1); assert.equal(end.properties.explosions, 1);
  assert.equal(end.properties.bricks_cleared, 3);
});
