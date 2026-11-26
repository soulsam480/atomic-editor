import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import type { Decoration, DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  buildMermaidBlocks,
  type MermaidFence,
  mermaidBlocks,
  mermaidFences,
} from "../mermaid-blocks";
import { readOnlyFacet } from "../read-only";

function stateOf(doc: string, anchor = 0, extensions: Extension[] = []): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown(), ...extensions],
  });
}

function decorations(
  deco: DecorationSet,
  doc: string,
): { from: number; to: number; deco: Decoration }[] {
  const found: { from: number; to: number; deco: Decoration }[] = [];
  deco.between(0, doc.length, (from, to, value) => {
    found.push({ from, to, deco: value });
  });
  return found;
}

const FLOW = "```mermaid\nflowchart TD\n  A --> B\n```";

describe("mermaidFences", () => {
  it("reads the info string and body from a closed fence", () => {
    expect(mermaidFences(stateOf(`intro\n\n${FLOW}`))).toEqual<MermaidFence[]>([
      { from: 7, to: 7 + FLOW.length, code: "flowchart TD\n  A --> B" },
    ]);
  });

  it("accepts a case-insensitive info string with arguments", () => {
    const doc = "~~~Mermaid theme=dark\nsequenceDiagram\n  A->>B: hi\n~~~";
    expect(mermaidFences(stateOf(doc))[0]?.code).toBe("sequenceDiagram\n  A->>B: hi");
  });

  it("handles an unclosed fence", () => {
    const doc = "```mermaid\nflowchart LR\n  X --> Y";
    expect(mermaidFences(stateOf(doc))[0]).toMatchObject({ code: "flowchart LR\n  X --> Y" });
  });

  it("ignores other fence languages", () => {
    expect(mermaidFences(stateOf("```js\nconst a = 1;\n```"))).toEqual([]);
  });

  it("ignores a fence-looking line inside a table", () => {
    const doc = "| A | B |\n|---|---|\n| ```mermaid | x |";
    expect(mermaidFences(stateOf(doc))).toEqual([]);
  });
});

describe("buildMermaidBlocks", () => {
  it("emits one whole-fence block decoration outside the selection", () => {
    const doc = `intro\n\n${FLOW}\n\nafter`;
    const found = decorations(buildMermaidBlocks(stateOf(doc, 0)), doc);
    expect(found).toHaveLength(1);
    expect(found[0]?.deco.spec.block).toBe(true);
    expect(doc.slice(found[0]!.from, found[0]!.to)).toBe(FLOW);
  });

  it("emits none when the selection intersects the fence", () => {
    const doc = `intro\n\n${FLOW}\n\nafter`;
    const state = stateOf(doc, 9 + "flowchart".length);
    expect(decorations(buildMermaidBlocks(state), doc)).toHaveLength(0);
  });

  it("emits none for a fence inside a table", () => {
    const doc = "| A | B |\n|---|---|\n| ```mermaid | x |";
    expect(decorations(buildMermaidBlocks(stateOf(doc)), doc)).toHaveLength(0);
  });

  it("keeps the decoration after an edit elsewhere", () => {
    const doc = `${FLOW}\n\nbody`;
    const next = stateOf(doc, doc.length).update({
      changes: { from: doc.length, insert: " more" },
    }).state;
    const found = decorations(buildMermaidBlocks(next), next.doc.toString());
    expect(found).toHaveLength(1);
    expect(next.sliceDoc(found[0]!.from, found[0]!.to)).toBe(FLOW);
  });

  it("renders an open fence without throwing", () => {
    const doc = "before\n\n```mermaid\nflowchart TD\n  A --> B";
    expect(decorations(buildMermaidBlocks(stateOf(doc)), doc)).toHaveLength(1);
  });

  it("ignores the selection in read-only mode", () => {
    const doc = `${FLOW}\n\nbody`;
    const state = stateOf(doc, 12, [readOnlyFacet.of(true)]);
    const found = decorations(buildMermaidBlocks(state), doc);
    expect(found).toHaveLength(1);
  });
});

describe("mermaidBlocks", () => {
  it("is an opt-in extension", () => {
    const state = stateOf(FLOW, 0, [mermaidBlocks()]);
    expect(state.facet(readOnlyFacet)).toBe(false);
    expect(mermaidFences(state)).toHaveLength(1);
  });
});
