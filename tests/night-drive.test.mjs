import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { NightDriveScene } from "../src/lib/night-drive.ts";

const component = await readFile(new URL("../src/components/NightDrive.astro", import.meta.url), "utf8");
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
    window: { matchMedia: () => ({ matches: false }) },
    document: { querySelector: () => otherDialog },
    performance: { now: () => now },
    customElements: { get() {}, define(_name, element) { RegisteredElement = element; } },
  });
  const element = new RegisteredElement();
  element.dialog = { open: false };
  element.openDrive = async () => { opens++; };
  return {
    element, Element, get opens() { return opens; },
    advance(ms) { now += ms; },
    otherDialog() { otherDialog = true; },
    key(key, extra = {}) { element.onKeyDown({ key, composedPath: () => [], ...extra }); },
  };
}

test("the hidden drive opens only for two intentional, consecutive 2 presses", () => {
  const client = shortcut();
  client.key("2");
  assert.equal(client.opens, 0);
  client.advance(300);
  client.key("2");
  assert.equal(client.opens, 1);
  for (const keys of [["2", "x", "2"], ["2", "ArrowLeft", "2"]]) {
    const another = shortcut();
    keys.forEach(key => another.key(key));
    assert.equal(another.opens, 0);
  }
  const slow = shortcut();
  slow.key("2"); slow.advance(1201); slow.key("2");
  assert.equal(slow.opens, 0);
});

test("typing in fields, composition, repeated keys, modifiers and open dialogs do not trigger it", () => {
  for (const extra of [
    { editing: true },
    { isComposing: true }, { repeat: true }, { ctrlKey: true }, { metaKey: true },
    { altKey: true }, { defaultPrevented: true },
  ]) {
    const client = shortcut();
    // Elements must belong to the same DOM realm as the component.
    if (extra.editing) extra.composedPath = () => [new client.Element(true)];
    client.key("2"); client.key("2", extra);
    assert.equal(client.opens, 0);
  }
  const editable = shortcut();
  const parent = new editable.Element();
  parent.isContentEditable = true;
  editable.key("2", { composedPath: () => [new editable.Element(), parent] });
  editable.key("2", { composedPath: () => [new editable.Element(), parent] });
  assert.equal(editable.opens, 0);
  const modal = shortcut();
  modal.otherDialog(); modal.key("2"); modal.key("2");
  assert.equal(modal.opens, 0);
});

test("the hidden phrase accepts a double tap but ignores a scroll gesture", () => {
  const client = shortcut();
  const target = new client.Element();
  target.trigger = true;
  const event = { button: 0, target, clientX: 100, clientY: 200 };
  client.element.onSecretPointerDown(event);
  client.element.onSecretPointerUp({ ...event, clientY: 240 });
  client.advance(100);
  client.element.onSecretPointerDown(event);
  client.element.onSecretPointerUp(event);
  assert.equal(client.opens, 0);
  client.advance(150);
  client.element.onSecretPointerDown(event);
  client.element.onSecretPointerUp(event);
  assert.equal(client.opens, 1);
});

function world(t) {
  const frames = new Map();
  const events = new Map();
  let nextFrame = 0;
  let resize;
  let disconnected = false;
  const positions = [];
  const context = new Proxy({}, { get(_target, key) {
    if (String(key).startsWith("create")) return () => ({ addColorStop() {} });
    if (key === "translate") return (x, y) => positions.push({ x, y });
    return () => {};
  }, set() { return true; } });
  const canvas = { clientWidth: 1280, clientHeight: 720, getContext: () => context };
  const document = { hidden: false,
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name, listener) => { if (events.get(name) === listener) events.delete(name); },
  };
  for (const [name, value] of Object.entries({
    window: { devicePixelRatio: 3 }, document,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const scene = new NightDriveScene(canvas, { onDistance() {} });
  return { scene, canvas, positions, frames, events, get disconnected() { return disconnected; },
    frame(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); },
    visibility(hidden) { document.hidden = hidden; events.get("visibilitychange")(); },
    resize,
  };
}

test("animation is opt-in, pauses without a frame loop, and releases resources on exit", t => {
  const client = world(t);
  assert.equal(client.frames.size, 0);
  assert.equal(client.canvas.width, 2560); // Retina drawing is capped at 2×.
  client.scene.setPaused(false);
  assert.equal(client.frames.size, 1);
  client.frame(100);
  client.frame(150);
  assert.equal(client.frames.size, 1);
  client.scene.setPaused(true);
  assert.equal(client.frames.size, 0);
  client.scene.setPaused(false);
  client.scene.destroy();
  assert.equal(client.frames.size, 0);
  assert.equal(client.events.size, 0);
  assert.equal(client.disconnected, true);
});

test("hidden tabs stop animating and resume only if scenery is playing", t => {
  const client = world(t);
  client.scene.setPaused(false);
  client.visibility(true);
  assert.equal(client.frames.size, 0);
  client.visibility(false);
  assert.equal(client.frames.size, 1);
  client.scene.setPaused(true);
  client.visibility(true); client.visibility(false);
  assert.equal(client.frames.size, 0);
  client.scene.destroy();
});

test("steering works in a still scene and stays within the road", t => {
  const client = world(t);
  const original = client.positions.at(-1).x;
  client.scene.nudge(-1);
  assert.ok(client.positions.at(-1).x < original);
  client.scene.pointTo(1);
  const rightEdge = client.positions.at(-1).x;
  client.scene.pointTo(100);
  assert.equal(client.positions.at(-1).x, rightEdge);
  client.scene.pointTo(-1);
  assert.ok(client.positions.at(-1).x < original);
  assert.equal(client.frames.size, 0);
  client.scene.destroy();
});
