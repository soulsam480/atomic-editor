import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { readOnlyFacet } from "./read-only";
import { treeGrowthEffect, treeProgressPlugin } from "./tree-progress";

// Mermaid blocks.
//
// A fenced code block whose info string starts with `mermaid` is replaced
// wholesale by a rendered diagram. The fence stays the source of truth:
// putting the cursor inside it drops the decoration so the inline preview
// reveals the code, and the Source button is the mouse path back into it.
// Pele is loaded on demand, so editors that never render a diagram never
// download the renderer.

export interface MermaidFence {
  from: number;
  to: number;
  code: string;
}

export interface MermaidBlocksConfig {
  /**
   * Width cap for the rendered SVG, in pixels. Unset means Pele sizes the
   * diagram to its content.
   */
  maxWidth?: number;
}

// One pass over the whole parsed tree. The StateField only rebuilds on
// doc / selection / parser changes, so a partly parsed tree would leave
// fences past the parse window as raw code forever. 200ms bounds the
// worst case; subsequent calls short-circuit once the tree reaches the end.
export function mermaidFences(state: EditorState): MermaidFence[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const fences: MermaidFence[] = [];

  tree.iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return;
      // Tables replace their own source. A fence inside one would render
      // twice, and its block-replace range would overlap the table's.
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === "Table") return false;
      }

      const info = node.node.getChild("CodeInfo");
      if (!info) return false;
      const infoText = state.doc.sliceString(info.from, info.to).trim();
      if (!/^mermaid(?:\s|$)/i.test(infoText)) return false;

      const code: string[] = [];
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name === "CodeText") code.push(state.doc.sliceString(child.from, child.to));
      }

      fences.push({
        from: state.doc.lineAt(node.from).from,
        to: state.doc.lineAt(node.to).to,
        code: code.join("\n"),
      });
      return false;
    },
  });

  return fences;
}

// Mounted handles live on the DOM, not the widget: CM6 calls `toDOM` again
// when a widget re-enters the viewport, while `eq` can keep one widget
// instance across several DOM lifetimes.
interface MountCleanup {
  (): void;
}
const cleanups = new WeakMap<HTMLElement, MountCleanup>();

class MermaidWidget extends WidgetType {
  override get estimatedHeight(): number {
    return 220;
  }

  constructor(
    readonly code: string,
    readonly maxWidth: number | undefined,
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.code === this.code;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-atomic-mermaid";

    const sourceButton = document.createElement("button");
    sourceButton.type = "button";
    sourceButton.className = "cm-atomic-mermaid-source";
    sourceButton.textContent = "Source";
    sourceButton.title = "Show the mermaid source";
    sourceButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      let pos: number;
      try {
        pos = view.posAtDOM(wrap);
      } catch {
        return;
      }
      view.focus();
      view.dispatch({ selection: { anchor: pos + 1 }, scrollIntoView: true });
    });
    wrap.appendChild(sourceButton);

    const diagram = document.createElement("div");
    diagram.className = "cm-atomic-mermaid-diagram";
    // Without this the browser places a DOM caret inside the widget on
    // mousedown and selectionchange then reveals the source.
    diagram.addEventListener("mousedown", (event) => event.preventDefault());
    wrap.appendChild(diagram);

    // Keeps the box honest while the dynamic import resolves, and is the
    // failure surface if Pele rejects the source. Removed on success.
    const placeholder = document.createElement("pre");
    placeholder.className = "cm-atomic-mermaid-placeholder";
    placeholder.textContent = this.code;
    diagram.appendChild(placeholder);

    let destroyed = false;
    let frame = 0;
    let observer: MutationObserver | null = null;
    let handle: { destroy(): void } | null = null;

    const start = () => {
      // toDOM runs before CM6 attaches the node. Measuring or mounting a
      // detached node yields a zero-width SVG that never renders, so wait
      // for a real layout box.
      if (destroyed || handle) return;
      if (!wrap.isConnected || wrap.clientWidth === 0) return;
      observer?.disconnect();
      observer = null;

      void import("pele")
        .then(({ mount }) => {
          if (destroyed) return;
          handle = mount(diagram, this.code, {
            zoom: "auto",
            onRender: () => view.requestMeasure(),
            ...(this.maxWidth ? { maxWidth: this.maxWidth } : {}),
          });
          placeholder.remove();
        })
        .catch((error: unknown) => {
          if (destroyed) return;
          const message = error instanceof Error ? error.message : String(error);
          placeholder.textContent = `${this.code}\n\n${message}`;
          placeholder.classList.add("cm-atomic-mermaid-error");
        });
    };

    // The observer catches attachment; the rAF catches the case where the
    // widget was already attached before we started watching.
    observer = new MutationObserver(start);
    observer.observe(view.dom, { childList: true, subtree: true });
    frame = requestAnimationFrame(start);

    cleanups.set(wrap, () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      handle?.destroy();
    });
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    cleanups.get(dom)?.();
    cleanups.delete(dom);
  }

  // Zoom and pan live inside the SVG. Including `selectionchange` matters:
  // the browser's default mousedown action still places a DOM caret inside
  // a contenteditable=false widget, and CM6 would otherwise read that as a
  // user selection and reveal the fence.
  ignoreEvent(): boolean {
    return true;
  }
}

export function buildMermaidBlocks(
  state: EditorState,
  options: { includeSelection?: boolean; maxWidth?: number } = {},
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const readOnly = state.facet(readOnlyFacet);
  const includeSelection = options.includeSelection ?? true;

  for (const fence of mermaidFences(state)) {
    // Reading mode has no caret to reveal source, and the Source button is
    // hidden there, so a stale selection must not keep a fence unrendered.
    if (!readOnly && includeSelection) {
      let active = false;
      for (const range of state.selection.ranges) {
        if (range.from <= fence.to && range.to >= fence.from) {
          active = true;
          break;
        }
      }
      if (active) continue;
    }

    ranges.push(
      Decoration.replace({
        widget: new MermaidWidget(fence.code, options.maxWidth),
        block: true,
      }).range(fence.from, fence.to),
    );
  }

  return Decoration.set(ranges, true);
}

function mermaidField(config: MermaidBlocksConfig) {
  return StateField.define<DecorationSet>({
    // On mount the default selection sits at 0 touching any fence at the
    // top of the doc. Nothing has been selected by the reader yet.
    create: (state) => buildMermaidBlocks(state, { ...config, includeSelection: false }),
    update(deco, tr) {
      for (const effect of tr.effects) {
        if (effect.is(treeGrowthEffect)) return buildMermaidBlocks(tr.state, config);
      }
      if (tr.startState.facet(readOnlyFacet) !== tr.state.facet(readOnlyFacet)) {
        return buildMermaidBlocks(tr.state, config);
      }
      if (!tr.docChanged && tr.selection === undefined) return deco;
      return buildMermaidBlocks(tr.state, config);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

export function mermaidBlocks(config: MermaidBlocksConfig = {}): Extension {
  return [mermaidField(config), treeProgressPlugin];
}
