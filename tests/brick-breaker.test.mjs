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
  const triggers = [];
  const timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor(editable = false) { this.editable = editable; }
    matches(selector) { return selector === ".site-shell" ? this.shell : this.editable; }
    closest(selector) {
      if (selector === "[data-breaker-trigger]") return this.trigger ? this : null;
      if (selector === "[data-breaker-margin]") return this.margin ? this : null;
      return this.interactive || this.editable ? this : null;
    }
  }
  const body = new Element();
  const document = {
    body, documentElement: Object.assign(new Element(), { clientWidth: 800 }), hidden: false,
    querySelector: selector => selector === "main"
      ? { getBoundingClientRect: () => ({ left: 200, right: 600 }) } : otherDialog,
  };
  const advance = ms => {
    const until = now + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = until;
  };
  runInNewContext(script, {
    HTMLElement: Element, Element,
    document,
    window: {
      setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    performance: { now: () => now },
    customElements: { get() {}, define(_name, element) { RegisteredElement = element; } },
  });
  const element = new RegisteredElement();
  element.dialog = { open: false };
  element.openGame = async trigger => { triggers.push(trigger); };
  const pointer = extra => ({ button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true, target: body,
    clientX: 100, clientY: 200, cancelable: true, preventDefault() {}, ...extra });
  return {
    element, Element, document, triggers, get opens() { return triggers.length; },
    advance,
    otherDialog() { otherDialog = true; },
    key(key, extra = {}) { element.onKeyDown({ key, composedPath: () => [], ...extra }); },
    down(extra) { element.onSecretDown(pointer(extra)); },
    move(extra) { element.onSecretMove(pointer(extra)); },
    up(extra) { element.onSecretUp(pointer(extra)); },
    tap(extra) { this.down(extra); advance(40); this.up(extra); advance(80); },
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
  assert.deepEqual(client.triggers, ["double_tap"]);
});

test("22 taps in either empty margin unlock the game, and 21 do not", () => {
  const client = shortcut();
  for (let i = 0; i < 21; i++) client.tap({ clientX: i % 2 ? 700 : 100 });
  assert.equal(client.opens, 0);
  client.tap(); assert.deepEqual(client.triggers, ["side_taps"]);
  client.advance(22_000); assert.equal(client.opens, 1); // Released tap timers cannot fire later.
});

test("the empty-margin tap sequence resets after an idle gap, a content tap, or a drag", () => {
  for (const interrupt of [
    client => client.advance(3001),
    client => client.tap({ clientX: 400 }),
    client => { client.down(); client.move({ clientY: 230 }); client.up(); },
    client => client.element.resetSecretGestures(), // Scroll / pointercancel / resize.
    client => client.element.clearKeys(), // Window blur / hidden tab.
  ]) {
    const client = shortcut();
    for (let i = 0; i < 21; i++) client.tap();
    interrupt(client); client.tap(); assert.equal(client.opens, 0);
    for (let i = 0; i < 21; i++) client.tap();
    assert.deepEqual(client.triggers, ["side_taps"]);
  }
});

test("blank sides and existing secret targets unlock only after a full 22-second hold", () => {
  for (const useName of [false, true]) {
    const client = shortcut();
    const target = new client.Element(); target.trigger = true;
    client.down(useName ? { target, clientX: 400 } : {});
    client.advance(21_999); assert.equal(client.opens, 0);
    client.advance(1); assert.deepEqual(client.triggers, ["long_press"]);
    client.advance(44_000); client.up(); assert.equal(client.opens, 1);
  }
});

test("release, movement, cancellation, multitouch, and blur cancel pending holds", () => {
  for (const interrupt of [
    client => client.up(),
    client => client.move({ clientX: 120 }),
    client => { client.move({ clientX: 400 }); client.move(); },
    client => client.element.resetSecretGestures(),
    client => client.down({ pointerId: 2, isPrimary: false }),
    client => client.element.clearKeys(),
  ]) {
    const client = shortcut(); client.down(); client.advance(10_000); interrupt(client);
    client.advance(22_000); assert.equal(client.opens, 0);
  }
  const wrongPointer = shortcut(); wrongPointer.down(); wrongPointer.up({ pointerId: 2 });
  wrongPointer.advance(22_000); assert.equal(wrongPointer.opens, 1);
});

test("content, controls, secondary pointers, and open dialogs cannot unlock by hold or repeated tap", () => {
  for (const blocked of [
    () => ({ clientX: 400 }),
    () => ({ button: 2 }),
    () => ({ isPrimary: false }),
    () => ({ defaultPrevented: true }),
    client => { const target = new client.Element(); target.interactive = true; return { target }; },
    client => { const target = new client.Element(true); return { target }; },
    client => { const target = new client.Element(); return { target }; },
    client => { client.otherDialog(); return {}; },
  ]) {
    const client = shortcut(); const event = blocked(client);
    for (let i = 0; i < 22; i++) client.tap(event);
    client.down(event); client.advance(22_000); assert.equal(client.opens, 0);
  }
  const hidden = shortcut(); hidden.down(); hidden.document.hidden = true;
  hidden.advance(22_000); assert.equal(hidden.opens, 0);
  const modal = shortcut(); modal.down(); modal.otherDialog(); modal.advance(22_000); assert.equal(modal.opens, 0);
});

test("long releases do not count as taps; moving within tolerance still allows a hold", () => {
  const client = shortcut();
  for (let i = 0; i < 21; i++) client.tap();
  client.down(); client.advance(1000); client.up(); client.tap(); assert.equal(client.opens, 0);
  const steady = shortcut(); steady.down(); steady.move({ clientX: 106, clientY: 203 });
  steady.advance(22_000); assert.deepEqual(steady.triggers, ["long_press"]);
});

test("mobile margin targets count 22 touches with fresh pointer IDs and prevent native callouts", () => {
  const client = shortcut();
  const margin = new client.Element(); margin.margin = true;
  let prevented = 0;
  for (let pointerId = 1; pointerId <= 22; pointerId++) {
    const event = { target: margin, pointerType: "touch", pointerId, clientX: 12,
      preventDefault() { prevented++; } };
    client.down(event); client.advance(40);
    client.up({ ...event, clientX: 27 }); client.advance(80);
    assert.equal(client.opens, pointerId === 22 ? 1 : 0);
  }
  assert.equal(prevented, 22);
  assert.deepEqual(client.triggers, ["side_taps"]);
});

test("a mobile hold tolerates finger drift across the content boundary under implicit capture", () => {
  const client = shortcut();
  const event = { pointerType: "touch", clientX: 190 };
  client.down(event); client.advance(10_000);
  client.move({ ...event, clientX: 209 }); // Still captured to body, now inside main's rectangle.
  client.advance(11_999); assert.equal(client.opens, 0);
  client.advance(1); assert.deepEqual(client.triggers, ["long_press"]);
  client.up({ ...event, clientX: 209 }); assert.equal(client.opens, 1);
});

test("mobile name holds tolerate drift, while larger gestures and native scrolling cancel holds", () => {
  const client = shortcut();
  const target = new client.Element(); target.trigger = true;
  const event = { target, pointerType: "touch", clientX: 400 };
  client.down(event); client.move({ ...event, clientX: 419 });
  client.advance(22_000); assert.deepEqual(client.triggers, ["long_press"]);
  for (const interrupt of [
    s => s.move({ pointerType: "touch", clientX: 125 }),
    s => s.element.resetSecretGestures(), // Native scroll -> pointercancel / scroll.
  ]) {
    const cancelled = shortcut(); cancelled.down({ pointerType: "touch" });
    cancelled.advance(1000); interrupt(cancelled); cancelled.advance(22_000);
    assert.equal(cancelled.opens, 0);
  }
});

test("margin hit targets fit the actual content bounds and leave the main content unobstructed", () => {
  const client = shortcut();
  const margins = { left: { style: {} }, right: { style: {} } };
  client.element.querySelector = selector => selector.includes("'left'") ? margins.left : margins.right;
  client.element.updateMargins();
  assert.equal(margins.left.style.width, "200px"); assert.equal(margins.right.style.width, "200px");
  client.document.documentElement.clientWidth = 390;
  client.document.querySelector = selector => selector === "main"
    ? { getBoundingClientRect: () => ({ left: 24, right: 366 }) } : false;
  client.element.onResize();
  assert.equal(margins.left.style.width, "24px"); assert.equal(margins.right.style.width, "24px");
});

test("mobile browser height changes preserve gestures; a width change cancels them", () => {
  for (const hold of [false, true]) {
    const client = shortcut();
    client.element.querySelector = () => ({ style: {} }); client.element.updateMargins();
    if (hold) { client.down({ pointerType: "touch" }); client.advance(11_000); }
    else for (let i = 0; i < 21; i++) client.tap({ pointerType: "touch" });
    client.element.onResize(); // Browser toolbar changes height, with the same horizontal geometry.
    if (hold) client.advance(11_000); else client.tap({ pointerType: "touch" });
    assert.deepEqual(client.triggers, [hold ? "long_press" : "side_taps"]);
  }
  const rotated = shortcut();
  rotated.element.querySelector = () => ({ style: {} }); rotated.element.updateMargins();
  rotated.down({ pointerType: "touch" }); rotated.advance(11_000);
  rotated.document.documentElement.clientWidth = 900; rotated.element.onResize();
  rotated.advance(11_000); assert.equal(rotated.opens, 0);
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
  assert.equal(events.find(event => event.kind === "explosion").destroyed, 3);
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
