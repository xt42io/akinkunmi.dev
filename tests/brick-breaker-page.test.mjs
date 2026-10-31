import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/brick-breaker.ts", import.meta.url), "utf8");
const script = ts.transpileModule(source.replace(/^import [^\n]+;\n/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Minimal DOM fixture: exercise the production collector, mutations, and restoration.
function page() {
  class Style {
    values = new Map();
    setProperty(name, value, priority = "") { this.values.set(name, { value, priority }); }
    getPropertyValue(name) { return this.values.get(name)?.value ?? ""; }
    getPropertyPriority(name) { return this.values.get(name)?.priority ?? ""; }
    removeProperty(name) { this.values.delete(name); }
  }
  class Node {
    parentElement = null;
    get isConnected() { return this === root || Boolean(this.parentElement?.isConnected); }
    replaceWith(other) {
      const parent = this.parentElement;
      parent.childNodes.splice(parent.childNodes.indexOf(this), 1, other);
      other.parentElement = parent; this.parentElement = null;
    }
  }
  class Text extends Node {
    constructor(data) { super(); this.data = data; }
    get textContent() { return this.data; }
  }
  class Element extends Node {
    childNodes = [];
    style = new Style();
    dataset = {};
    attributes = new Set();
    rect = { left: 100, top: 200, width: 30, height: 20 };
    constructor(tag) { super(); this.tag = tag; }
    get children() { return this.childNodes.filter(node => node instanceof Element); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) {
      for (const node of this.childNodes) node.parentElement = null;
      this.childNodes = []; if (value) this.append(new Text(value));
    }
    append(...nodes) { for (const node of nodes) { this.childNodes.push(node); node.parentElement = this; } }
    matches(selector) {
      return selector.split(",").some(part => {
        const token = part.trim();
        return token.startsWith("[") ? this.attributes.has(token.slice(1, -1)) : this.tag === token;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    querySelectorAll(selector) {
      const descendants = [];
      const walk = element => { for (const child of element.children) { if (child.matches(selector)) descendants.push(child); walk(child); } };
      walk(this); return descendants;
    }
    getBoundingClientRect() {
      if (this.closest("[hidden]")) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
      return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height };
    }
  }
  const root = new Element("main");
  const document = {
    querySelector: () => root,
    createElement: tag => new Element(tag),
    createTextNode: value => new Text(value),
    createTreeWalker(element) {
      const texts = [];
      const walk = node => { if (node instanceof Text) texts.push(node); else node.childNodes.forEach(walk); };
      walk(element); let index = 0;
      return { nextNode: () => texts[index++] ?? null };
    },
  };
  const PageBricks = runInNewContext(`${script}\nPageBricks;`, {
    exports: {}, document, NodeFilter: { SHOW_TEXT: 4 },
    getComputedStyle: element => ({
      color: "rgb(44, 44, 41)", opacity: element.style.getPropertyValue("opacity") || "1",
      visibility: element.style.getPropertyValue("visibility") || element.parentElement?.style.getPropertyValue("visibility") || "visible",
    }),
  });
  return {
    root, Text,
    element(tag, text = "", { parent = root, rect, attributes = [] } = {}) {
      const element = new Element(tag); if (text) element.textContent = text;
      if (rect) Object.assign(element.rect, rect);
      for (const attribute of attributes) element.attributes.add(attribute);
      parent.append(element); return element;
    },
    board: () => new PageBricks(80, 720, 800),
  };
}

test("Now Playing buttons and social SVG arrows become single breakable pieces", () => {
  const p = page();
  const button = p.element("button", "Evil Place · Sam Barber");
  const music = p.element("svg", "", { parent: button, attributes: ["aria-hidden='true'"] });
  const social = p.element("a", "GitHub");
  const arrow = p.element("svg", "", { parent: social, attributes: ["aria-hidden='true'"] });
  const board = p.board();
  const captured = [...board.pieces.values()].map(piece => piece.element);
  assert(captured.includes(button)); assert(captured.includes(arrow));
  assert(!captured.includes(music)); // Included in the parent control, never counted twice.
  for (const element of [button, arrow]) {
    const [id] = [...board.pieces].find(([, piece]) => piece.element === element);
    board.break(id); assert.equal(element.style.getPropertyValue("visibility"), "hidden");
  }
  board.destroy();
  assert.equal(button.style.getPropertyValue("visibility"), "");
  assert.equal(arrow.style.getPropertyValue("visibility"), "");
});

test("a Now Playing metadata update cannot resurrect its destroyed control", () => {
  const p = page(); const button = p.element("button", "Original song");
  const board = p.board(); const [id] = [...board.pieces].find(([, piece]) => piece.element === button);
  board.break(id); button.textContent = "Next song · New artist";
  assert.equal(button.style.getPropertyValue("visibility"), "hidden");
  board.destroy();
  assert.equal(button.textContent, "Next song · New artist");
  assert.equal(button.style.getPropertyValue("visibility"), "");
});

test("visible decorative text, SVGs, images, and canvases are included", () => {
  const p = page();
  p.element("span", "→", { attributes: ["aria-hidden='true'"] });
  const svg = p.element("svg");
  p.element("svg", "", { parent: svg }); // Nested SVG has only one outer piece.
  const image = p.element("img"); const canvas = p.element("canvas");
  const board = p.board(); const captured = [...board.pieces.values()].map(piece => piece.element);
  assert.equal(board.bricks.length, 4);
  assert(captured.includes(svg)); assert(captured.includes(image)); assert(captured.includes(canvas));
  assert(captured.some(element => element.textContent === "→"));
  board.destroy();
});

test("hidden elements, dialogs, editable text, and explicitly ignored content stay out of the board", () => {
  const p = page();
  for (const [tag, attributes] of [["div", ["hidden"]], ["dialog", []], ["div", ["data-breaker-ignore"]], ["div", ["contenteditable"]]]) {
    const parent = p.element(tag, "", { attributes });
    p.element("button", "Excluded button", { parent });
    p.element("svg", "", { parent }); p.element("p", "Excluded words", { parent });
  }
  p.element("p", "Editable", { attributes: ["contenteditable"] });
  const invisible = p.element("svg"); invisible.style.setProperty("visibility", "hidden");
  const transparent = p.element("img"); transparent.style.setProperty("opacity", "0");
  p.element("button", "Above field", { rect: { top: 20 } });
  p.element("svg", "", { rect: { left: 5 } });
  p.element("img", "", { rect: { top: 750 } });
  const board = p.board(); assert.equal(board.bricks.length, 0); board.destroy();
});

test("a tall page still captures icons and controls after the first 180 words", () => {
  const p = page(); const paragraph = p.element("p", Array(200).fill("word").join(" "));
  const button = p.element("button", "Now playing"); const svg = p.element("svg");
  const board = p.board();
  assert.equal(board.bricks.length, 202);
  assert([...board.pieces.values()].some(piece => piece.element === button));
  assert([...board.pieces.values()].some(piece => piece.element === svg));
  board.destroy(); assert.equal(paragraph.textContent.split(" ").length, 200);
});

test("partially visible elements become clipped bricks inside the playfield", () => {
  const p = page();
  p.element("svg", "", { rect: { left: 70, top: 95 } });
  p.element("button", "Near the paddle lane", { rect: { top: 652, width: 100, height: 20 } });
  const board = p.board(); assert.equal(board.bricks.length, 2);
  for (const brick of board.bricks) {
    assert(brick.x >= 80 && brick.x + brick.width <= 720);
    assert(brick.y >= 100 && brick.y + brick.height <= 665);
  }
  assert.equal(board.bricks[0].y, 100); assert.equal(board.bricks[1].y + board.bricks[1].height, 665);
  board.destroy();
});

test("restart and exit restore exact text nodes, inline visibility, and priority", () => {
  const p = page(); const link = p.element("a", "Original linked text"); const text = link.childNodes[0];
  const icon = p.element("svg"); icon.style.setProperty("visibility", "visible", "important");
  const board = p.board();
  for (const id of board.pieces.keys()) board.break(id);
  board.restore(); assert.equal(icon.style.getPropertyValue("visibility"), "visible");
  assert.equal(icon.style.getPropertyPriority("visibility"), "important");
  board.destroy(); assert.equal(link.childNodes[0], text);
  assert.equal(link.textContent, "Original linked text");
  assert.equal(p.root.children[0], link);
});
