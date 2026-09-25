import { describe, expect, it, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { AtomicCodeMirrorEditor } from "../AtomicCodeMirrorEditor";

const mounted: { host: HTMLElement; wrapper: ReturnType<typeof mount> }[] = [];

function mountEditor(markdown: string): void {
  const host = document.createElement("div");
  host.style.width = "600px";
  host.style.height = "400px";
  document.body.appendChild(host);
  const wrapper = mount(AtomicCodeMirrorEditor, {
    props: { markdownSource: markdown },
    attachTo: host,
  });
  mounted.push({ host, wrapper });
}

afterEach(() => {
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

// Regression: lezer's markdown parser emits some nodes whose range
// legitimately spans a line break — most reproducibly, a link whose
// title runs across multiple lines. ViewPlugin decorations may not
// replace a line break, so a naive Decoration.replace on such a token
// throws when the builder runs.
describe("multi-line markdown nodes do not crash the inline-preview plugin", () => {
  it.each([
    ["multi-line link title", '[label](https://example.com "first line\nsecond line")'],
    ["multi-line image title", '![alt](https://example.com/x.png "first\nsecond")'],
  ])("%s", (_name, markdown) => {
    expect(() => mountEditor(markdown)).not.toThrow();
  });
});
