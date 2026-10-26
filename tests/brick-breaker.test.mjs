import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { BrickBreakerPhysics, contact, SERVE_DELAY } from "../src/lib/brick-breaker-physics.ts";

const component = await readFile(new URL("../src/components/BrickBreaker.astro", import.meta.url), "utf8");
const script = ts.transpileModule(component.split("<script>")[1].split("</script>")[0]
  .replace(/^\s*import [^\n]+;\n/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function shortcut() {
  let RegisteredElement;
  let now = 100;
  let otherDialog = false;
  let opens = 0;
  class Element {
    constructor(editable = false) { this.editable = editable; }
    matches() { return this.editable; }
    closest() { return this.trigger ? this : null; }
  }
  runInNewContext(script, {
    HTMLElement: Element, Element,
    document: { querySelector: () => otherDialog },
    performance: { now: () => now },
    customElements: { get() {}, define(_name, element) { RegisteredElement = element; } },
  });
  const element = new RegisteredElement();
  element.dialog = { open: false };
  element.openGame = async () => { opens++; };
  return {
    element, Element, get opens() { return opens; },
    advance(ms) { now += ms; },
    otherDialog() { otherDialog = true; },
    key(key, extra = {}) { element.onKeyDown({ key, composedPath: () => [], ...extra }); },
  };
}

test("the game opens for two intentional consecutive 2 presses", () => {
  const client = shortcut();
  client.key("2"); assert.equal(client.opens, 0);
  client.advance(300); client.key("2"); assert.equal(client.opens, 1);
  for (const keys of [["2", "x", "2"], ["2", "ArrowLeft", "2"]]) {
    const another = shortcut(); keys.forEach(key => another.key(key)); assert.equal(another.opens, 0);
  }
  const slow = shortcut(); slow.key("2"); slow.advance(1201); slow.key("2"); assert.equal(slow.opens, 0);
});

test("fields, composition, repeated keys, modifiers, and other open dialogs cannot trigger the game", () => {
  for (const extra of [{ editing: true }, { isComposing: true }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { defaultPrevented: true }]) {
    const client = shortcut();
    if (extra.editing) extra.composedPath = () => [new client.Element(true)];
    client.key("2"); client.key("2", extra); assert.equal(client.opens, 0);
  }
  const editable = shortcut();
  const parent = new editable.Element(); parent.isContentEditable = true;
  editable.key("2", { composedPath: () => [parent] }); editable.key("2", { composedPath: () => [parent] });
  assert.equal(editable.opens, 0);
  const modal = shortcut(); modal.otherDialog(); modal.key("2"); modal.key("2"); assert.equal(modal.opens, 0);
});

test("the mobile double-tap shortcut ignores scrolling gestures", () => {
  const client = shortcut();
  const target = new client.Element(); target.trigger = true;
  const event = { button: 0, target, clientX: 100, clientY: 200 };
  client.element.onSecretDown(event); client.element.onSecretUp({ ...event, clientY: 240 });
  client.advance(100); client.element.onSecretDown(event); client.element.onSecretUp(event); assert.equal(client.opens, 0);
  client.advance(150); client.element.onSecretDown(event); client.element.onSecretUp(event); assert.equal(client.opens, 1);
});

const bricks = [
  { id: 1, x: 240, y: 200, width: 60, height: 14 },
  { id: 2, x: 340, y: 200, width: 60, height: 14 },
  { id: 3, x: 440, y: 200, width: 60, height: 14 },
  { id: 4, x: 540, y: 200, width: 60, height: 14 },
];
const world = () => new BrickBreakerPhysics(800, 600, bricks);
const still = game => { game.launch(); Object.assign(game.balls[0], { x: 100, y: 350, vx: 0, vy: 0 }); };

test("circle collision resolves corners and centers inside a brick", () => {
  const rect = { x: 100, y: 100, width: 40, height: 20 };
  const ball = { id: 1, x: 98, y: 98, vx: 1, vy: 1, radius: 5 };
  const corner = contact(ball, rect);
  assert(corner.nx < 0 && corner.ny < 0);
  assert(Math.abs(Math.hypot(corner.nx, corner.ny) - 1) < 0.0001);
  const inside = contact({ ...ball, x: 120, y: 110 }, rect);
  assert(inside.depth >= ball.radius);
  assert.equal(contact({ ...ball, x: 50 }, rect), null);
});

test("fast balls hit thin text, reflect upward/downward correctly, and only score once", () => {
  const game = world(); game.launch();
  Object.assign(game.balls[0], { x: 270, y: 240, vx: 0, vy: -1600 });
  const events = game.update(1 / 30);
  assert.equal(events.filter(e => e.kind === "brick").length, 1);
  assert.equal(game.bricks[0].alive, false);
  assert(game.balls[0].vy > 0);
  assert.equal(game.score, 10);
  game.update(1 / 60); assert.equal(game.score, 10);
});

test("paddle hit position and paddle movement change the bounce without changing speed", () => {
  const hit = (offset, spin = false) => {
    const game = world(); game.launch();
    if (spin) game.pointTo(game.paddle.x + game.paddle.width / 2 + 100);
    Object.assign(game.balls[0], { x: game.paddle.x + game.paddle.width / 2 + offset, y: game.paddle.y - 6, vx: 0, vy: game.speed });
    game.update(1 / 120); return game;
  };
  const center = hit(0), edge = hit(38), moving = hit(0, true);
  assert(center.balls[0].vy < 0 && Math.abs(center.balls[0].vx) < 1);
  assert(edge.balls[0].vx > center.balls[0].vx);
  assert(moving.balls[0].vx > 0);
  assert(Math.abs(Math.hypot(edge.balls[0].vx, edge.balls[0].vy) - edge.speed) < 0.001);
});

test("multiball is capped and a life is lost only when the last ball falls", () => {
  const game = world(); still(game); game.applyPower("multiball");
  assert.equal(game.balls.length, 3);
  for (const ball of game.balls) Object.assign(ball, { vx: 0, vy: 0 });
  game.balls[0].y = 700; game.update(1 / 60);
  assert.equal(game.balls.length, 2); assert.equal(game.lives, 3);
  for (const ball of game.balls) ball.y = 700;
  game.update(1 / 60);
  assert.equal(game.lives, 2); assert.equal(game.phase, "serving");
  game.launch();
  for (let i = 0; i < 10; i++) game.applyPower("multiball");
  assert.equal(game.balls.length, 7);
});

test("catching a falling power-up applies it once; timed effects expire and pause with the game", () => {
  const game = world(); still(game);
  game.drops.push({ id: 99, kind: "wide", x: game.paddle.x + 40, y: game.paddle.y - 12, vy: 100 });
  assert.equal(game.update(1 / 60).filter(e => e.kind === "power").length, 1);
  assert(game.paddle.width > game.baseWidth); assert.equal(game.drops.length, 0);
  game.applyPower("slow");
  game.setPaused(true);
  const remaining = [game.wideFor, game.slowFor];
  game.update(1); assert.deepEqual([game.wideFor, game.slowFor], remaining);
  game.setPaused(false);
  for (let i = 0; i < 150; i++) game.update(0.1);
  assert.equal(game.wideFor, 0); assert.equal(game.slowFor, 0); assert.equal(game.paddle.width, game.baseWidth);
});

test("the third destroyed word guarantees a multiball drop, and consecutive hits build a combo", () => {
  const game = world(); game.launch();
  for (const brick of game.bricks.slice(0, 3)) {
    Object.assign(game.balls[0], { x: brick.x + 25, y: brick.y + brick.height + 6, vx: 0, vy: -game.speed });
    game.update(1 / 60);
  }
  assert.equal(game.remaining, 1); assert.equal(game.score, 60);
  assert.equal(game.drops[0].kind, "multiball");
});

test("three misses end the round; restarting restores every brick and removes effects", () => {
  const game = world();
  for (let i = 0; i < 3; i++) {
    game.launch(); game.balls.forEach(ball => { ball.y = 700; }); game.update(1 / 60);
  }
  assert.equal(game.lives, 0); assert.equal(game.phase, "lost");
  game.bricks[0].alive = false; game.applyPower("wide"); game.restart();
  assert.equal(game.remaining, 4); assert.equal(game.lives, 3); assert.equal(game.score, 0);
  assert.equal(game.phase, "ready"); assert.equal(game.paddle.width, game.baseWidth);
});

test("clearing the last brick wins and stops further physics", () => {
  const game = new BrickBreakerPhysics(800, 600, [bricks[0]]); game.launch();
  Object.assign(game.balls[0], { x: 270, y: 221, vx: 0, vy: -game.speed });
  assert(game.update(1 / 60).some(e => e.kind === "win"));
  assert.equal(game.phase, "won"); assert.equal(game.lives, 3);
  const position = { ...game.balls[0] }; game.update(1);
  assert.deepEqual(game.balls[0], position);
});

test("different render rates run the same fixed-step simulation", () => {
  const simulate = fps => {
    const game = world(); game.launch();
    for (let i = 0; i < fps; i++) game.update(1 / fps);
    return game;
  };
  const a = simulate(30), b = simulate(144);
  assert.equal(a.score, b.score); assert.equal(a.lives, b.lives);
  assert(Math.abs(a.balls[0].x - b.balls[0].x) < 3);
  assert(Math.abs(a.balls[0].y - b.balls[0].y) < 3);
});

test("one fireball blasts nearby brick edges, scores each once, and becomes normal on impact", () => {
  const game = new BrickBreakerPhysics(800, 600, [
    { id: 1, x: 240, y: 200, width: 60, height: 14 },
    { id: 2, x: 310, y: 200, width: 190, height: 14 }, // Near edge, distant center.
    { id: 3, x: 240, y: 150, width: 45, height: 14 },
    { id: 4, x: 600, y: 200, width: 40, height: 14 },
  ]);
  game.launch(); game.applyPower("fire");
  Object.assign(game.balls[0], { x: 270, y: 221, vx: 0, vy: -game.speed });
  const events = game.update(1 / 60);
  assert.equal(events.filter(event => event.kind === "explosion").length, 1);
  assert.deepEqual(events.filter(event => event.kind === "brick").map(event => event.id).sort(), [1, 2, 3]);
  assert.equal(game.score, 60); assert.equal(game.remaining, 1);
  assert.equal(game.balls[0].fire, false);
  Object.assign(game.balls[0], { x: 620, y: 221, vx: 0, vy: -game.speed });
  const next = game.update(1 / 60);
  assert.equal(next.filter(event => event.kind === "explosion").length, 0);
  assert.equal(next.filter(event => event.kind === "brick").length, 1);
  assert.equal(game.score, 100); assert.equal(game.phase, "won");
});

test("fire survives wall and paddle bounces but multiball never copies its single charge", () => {
  const game = world(); game.launch(); game.applyPower("fire");
  Object.assign(game.balls[0], { x: game.left + 6, y: 350, vx: -game.speed, vy: 0 });
  assert(game.update(1 / 60).some(event => event.kind === "wall"));
  assert.equal(game.balls[0].fire, true);
  Object.assign(game.balls[0], { x: game.paddle.x + 30, y: game.paddle.y - 6, vx: 0, vy: game.speed });
  assert(game.update(1 / 60).some(event => event.kind === "paddle"));
  assert.equal(game.balls[0].fire, true);
  game.applyPower("multiball"); game.applyPower("fire");
  assert.equal(game.balls.length, 3);
  assert.equal(game.balls.filter(ball => ball.fire).length, 1);
  game.balls.forEach(ball => { ball.y = 700; }); game.update(1 / 60);
  assert.equal(game.phase, "serving");
  assert.equal(game.balls.filter(ball => ball.fire).length, 0);
});

test("fire tiles spawn early and are armed by a normal paddle catch", () => {
  const field = Array.from({ length: 8 }, (_, id) => ({ id, x: 50 + id * 80, y: 200, width: 40, height: 14 }));
  const game = new BrickBreakerPhysics(800, 600, field); game.launch();
  for (const brick of game.bricks.slice(0, 7)) {
    Object.assign(game.balls[0], { x: brick.x + 20, y: 221, vx: 0, vy: -game.speed });
    game.update(1 / 60);
  }
  const drop = game.drops.find(drop => drop.kind === "fire");
  assert(drop);
  Object.assign(drop, { x: game.paddle.x + 30, y: game.paddle.y - 12, vy: 100 });
  const events = game.update(1 / 60);
  assert.equal(events.filter(event => event.kind === "power" && event.power === "fire").length, 1);
  assert.equal(game.balls[0].fire, true);
});

test("a missed life serves automatically while the paddle remains controllable", () => {
  const game = world(); game.launch();
  game.balls[0].y = 700; game.update(1 / 60);
  assert.equal(game.phase, "serving"); assert.equal(game.lives, 2);
  assert(game.serveFor > 1.9 && game.serveFor <= SERVE_DELAY);
  const before = game.paddle.x;
  game.direction = -1; game.update(0.1);
  assert(game.paddle.x < before);
  assert.equal(game.balls[0].x, game.paddle.x + game.paddle.width / 2);
  game.setPaused(true);
  const countdown = game.serveFor;
  game.update(0.1); assert.equal(game.serveFor, countdown);
  game.setPaused(false); assert.equal(game.phase, "serving");
  for (let i = 0; i < 20; i++) game.update(0.1);
  assert.equal(game.phase, "playing"); assert.equal(game.serveFor, 0);
  assert(game.balls[0].vy < 0);
});

test("an early launch skips the countdown without costing another life", () => {
  const game = world(); game.launch(); game.balls[0].y = 700; game.update(1 / 60);
  game.launch();
  assert.equal(game.phase, "playing"); assert.equal(game.serveFor, 0); assert.equal(game.lives, 2);
});

test("the content column contains serving, paddle motion, ricochets, and wide power-ups", () => {
  const game = new BrickBreakerPhysics(1280, 720, bricks, { left: 300, right: 960 });
  assert.equal(game.paddle.x + game.paddle.width / 2, 630);
  game.pointTo(-1000); assert.equal(game.paddle.x, 300);
  game.pointTo(2000); assert.equal(game.paddle.x + game.paddle.width, 960);
  game.launch(); game.applyPower("wide");
  game.direction = 1;
  Object.assign(game.balls[0], { x: 959, y: 400, vx: game.speed, vy: 0 });
  game.update(0.1);
  assert(game.balls[0].x + game.balls[0].radius <= 960);
  assert(game.balls[0].vx < 0);
  assert(game.paddle.x >= 300 && game.paddle.x + game.paddle.width <= 960);
  game.balls[0].y = 800; game.update(1 / 60);
  game.pointTo(-1000); for (let i = 0; i < 5; i++) game.update(0.1);
  assert(game.paddle.x >= 300);
  assert(game.balls[0].x >= 300 && game.balls[0].x <= 960);
});
