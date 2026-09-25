import { describe, expect, it, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { EditorView } from "@codemirror/view";
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "../AtomicCodeMirrorEditor";

type EditorProps = InstanceType<typeof AtomicCodeMirrorEditor>["$props"];

type Mounted = {
  host: HTMLElement;
  wrapper: ReturnType<typeof mount>;
  handle: AtomicCodeMirrorEditorHandle;
};

const mounted: Mounted[] = [];

function mountEditor(props: EditorProps): Mounted {
  const host = document.createElement("div");
  host.style.width = "600px";
  host.style.height = "400px";
  document.body.appendChild(host);
  const wrapper = mount(AtomicCodeMirrorEditor, { props, attachTo: host });
  const handle = wrapper.vm as unknown as AtomicCodeMirrorEditorHandle;
  const entry = { host, wrapper, handle };
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
  vi.restoreAllMocks();
});

describe("AtomicCodeMirrorEditor", () => {
  it("mounts and exposes the initial markdown via the imperative handle", () => {
    const { handle } = mountEditor({ markdownSource: "# Hello\n\nWorld." });
    expect(handle.getMarkdown()).toBe("# Hello\n\nWorld.");
  });

  it("renders `.cm-content` with the raw markdown visible in the DOM", () => {
    const { host } = mountEditor({ markdownSource: "**bold** and *em*" });
    const content = host.querySelector(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("bold");
    expect(content?.textContent).toContain("em");
  });

  it("applies the owning list item indent to physical continuation lines", () => {
    const markdown = [
      "- [ ] Move `a/b.ts` to `a/c/b.ts` (no",
      "type changes).",
      "  - [ ] Extract the cli socket (hello/msg/ack",
      "    frames).",
    ].join("\n");
    const { host } = mountEditor({ markdownSource: markdown });
    const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
    const lineWith = (text: string) => lines.find((line) => line.textContent?.includes(text));

    expect(lineWith("Move")?.style.paddingLeft).toBe("2em");
    expect(lineWith("type changes")?.style.paddingLeft).toBe("2em");
    expect(lineWith("type changes")?.style.textIndent).toBe("0em");
    expect(lineWith("Extract")?.style.paddingLeft).toBe("2.6em");
    expect(lineWith("frames")?.style.paddingLeft).toBe("2.6em");
    expect(lineWith("frames")?.style.textIndent).toBe("0em");
  });

  it("derives list depth from syntax ancestry and hides structural indentation", () => {
    const markdown = [
      "   - top-level with three leading spaces",
      "     continuation",
      "     1. ordered child",
      "        ordered continuation",
    ].join("\n");
    const { host, handle } = mountEditor({ markdownSource: markdown });
    const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
    const lineWith = (text: string) => lines.find((line) => line.textContent?.includes(text));

    expect(lineWith("top-level")?.style.paddingLeft).toBe("2em");
    expect(lineWith("continuation")?.textContent).not.toMatch(/^\s/);
    expect(lineWith("top-level")?.textContent).not.toMatch(/^\s/);
    expect(lineWith("ordered child")?.style.paddingLeft).toBe("2.6em");
    expect(lineWith("ordered continuation")?.style.paddingLeft).toBe("2.6em");
    expect(lineWith("ordered child")?.textContent).not.toMatch(/^\s/);
    expect(lineWith("ordered continuation")?.textContent).not.toMatch(/^\s/);
    expect(handle.getMarkdown()).toBe(markdown);
  });

  it("keeps bare URLs visible on inactive lines", () => {
    const { host } = mountEditor({ markdownSource: "- https://example.com" });
    const content = host.querySelector(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("https://example.com");
  });

  it.each([
    ["same-text markdown link", "[https://example.com](https://example.com)"],
    ["angle autolink", "<https://example.com>"],
    ["escaped URL slashes", String.raw`https:\/\/example.com`],
  ])("renders %s as clean visible URL text", (_name, markdown) => {
    const { host } = mountEditor({ markdownSource: markdown });
    expect(host.querySelector(".cm-content")?.textContent).toBe("https://example.com");
  });

  it.each([
    ["https://example.com", "https://example.com"],
    ["[https://label.example](https://destination.example)", "https://destination.example"],
  ])("opens the correct URL for %s", (markdown, expectedUrl) => {
    const onLinkClick = vi.fn();
    const { host } = mountEditor({ markdownSource: markdown, onLinkClick });
    const link = host.querySelector<HTMLElement>(".cm-atomic-link");
    expect(link).not.toBeNull();

    vi.spyOn(link!, "getClientRects").mockReturnValue([
      { left: 0, right: 100, top: 0, bottom: 20 } as DOMRect,
    ] as unknown as DOMRectList);
    const computedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ fontSize: "16px" } as CSSStyleDeclaration);
    try {
      link?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 95,
          clientY: 10,
        }),
      );
    } finally {
      computedStyle.mockRestore();
    }

    expect(onLinkClick).toHaveBeenCalledWith(expectedUrl);
  });

  it("renders highlight syntax with the expected preview class", () => {
    const { host } = mountEditor({
      markdownSource: "This has ==highlighted text== in it.",
    });
    const highlight = host.querySelector(".cm-atomic-highlight");
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain("highlighted text");
  });

  it("does not partially highlight a triple-equals span", () => {
    const { host } = mountEditor({
      markdownSource: "This is ===not highlighted===.",
    });
    expect(host.querySelector(".cm-atomic-highlight")).toBeNull();
  });

  it("renders highlight syntax inside table cells", () => {
    const { host } = mountEditor({
      markdownSource: ["| Plain | Highlight |", "| --- | --- |", "| text | ==glow== |"].join("\n"),
    });
    const highlight = host.querySelector(".cm-atomic-table-cell-source .cm-atomic-highlight");
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain("glow");
  });

  it("paints selected fenced code above the block backdrop", () => {
    const markdown = ["```ts", "const selected = true;", "```"].join("\n");
    const { host } = mountEditor({ markdownSource: markdown });
    const editor = host.querySelector<HTMLElement>(".cm-editor");
    expect(editor).not.toBeNull();
    const view = EditorView.findFromDOM(editor!);
    expect(view).not.toBeNull();
    const from = markdown.indexOf("selected");

    view?.dispatch({
      selection: { anchor: from, head: from + "selected".length },
    });

    const selection = host.querySelector(".cm-atomic-fenced-selection");
    expect(selection).not.toBeNull();
    expect(selection?.textContent).toBe("selected");
  });
});
