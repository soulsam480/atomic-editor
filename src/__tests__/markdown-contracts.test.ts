import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { AtomicCodeMirrorEditor } from '../AtomicCodeMirrorEditor';
import { MARKDOWN_CONTRACTS } from './fixtures/markdown-contracts';

const mounted: { host: HTMLElement; wrapper: ReturnType<typeof mount> }[] = [];

function mountEditor(markdown: string): HTMLElement {
  const host = document.createElement('div');
  host.style.width = '720px';
  host.style.height = '640px';
  document.body.appendChild(host);
  const wrapper = mount(AtomicCodeMirrorEditor, {
    props: { markdownSource: markdown },
    attachTo: host,
  });
  mounted.push({ host, wrapper });
  return host;
}

afterEach(() => {
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe('shared Markdown rendering contracts', () => {
  for (const contract of MARKDOWN_CONTRACTS) {
    it(contract.name, () => {
      const host = mountEditor(contract.markdown);
      const visible = host.querySelector('.cm-content')?.textContent ?? '';

      for (const text of contract.containsText ?? []) {
        expect(visible).toContain(text);
      }
      for (const text of contract.notContainsText ?? []) {
        expect(visible).not.toContain(text);
      }
      for (const selector of contract.selectors ?? []) {
        const matches = host.querySelectorAll(selector.selector);
        expect(matches).toHaveLength(selector.count);
        if (selector.text !== undefined) {
          expect(matches[0]?.textContent).toBe(selector.text);
        }
      }
    });
  }
});
