import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "../editor-runtime";

const runtimes: EditorRuntime[] = [];
const hosts: HTMLElement[] = [];

function mount(markdown: string, options: Partial<Parameters<typeof createEditorRuntime>[1]> = {}) {
  const host = document.createElement("div");
  host.style.width = "600px";
  host.style.height = "400px";
  document.body.appendChild(host);
  hosts.push(host);
  const runtime = createEditorRuntime(host, { markdown, ...options });
  runtimes.push(runtime);
  return { host, runtime };
}

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.destroy();
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe("createEditorRuntime", () => {
  it("mounts an EditorView with the raw markdown in the doc", () => {
    const { host, runtime } = mount("# Hello\n\nWorld.");
    expect(runtime.handle.getMarkdown()).toBe("# Hello\n\nWorld.");
    expect(host.querySelector(".cm-content")).not.toBeNull();
  });

  it("reports doc mutations through onMarkdownChange", () => {
    const onMarkdownChange = vi.fn();
    const { runtime } = mount("abc", { onMarkdownChange });
    runtime.view.dispatch({ changes: { from: 3, insert: "d" } });
    expect(onMarkdownChange).toHaveBeenCalledWith("abcd");
  });

  it("toggles read-only in place", () => {
    const { host, runtime } = mount("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const cell = () => host.querySelector<HTMLElement>(".cm-atomic-table-cell-source");
    expect(cell()?.isContentEditable).toBe(true);
    runtime.setReadOnly(true);
    expect(cell()?.isContentEditable).toBe(false);
    runtime.setReadOnly(false);
    expect(cell()?.isContentEditable).toBe(true);
  });

  it("reveals the first match of a query", () => {
    const { host, runtime } = mount("alpha beta gamma");
    runtime.handle.revealText("beta");
    expect(host.querySelector(".cm-initialRevealMatch")?.textContent).toBe("beta");
  });

  it("falls back to window.open for link clicks when no handler is given", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { host } = mount("See [the docs](https://example.com/docs).", {
      readOnly: true,
    });
    host
      .querySelector<HTMLElement>(".cm-atomic-link")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(open).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
  });

  it("tears the view down on destroy", () => {
    const { host, runtime } = mount("# bye");
    runtime.destroy();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });
});
