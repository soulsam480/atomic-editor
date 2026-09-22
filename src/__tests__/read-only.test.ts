import { describe, expect, it, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from '../AtomicCodeMirrorEditor';

type EditorProps = InstanceType<typeof AtomicCodeMirrorEditor>['$props'];

type Mounted = {
  host: HTMLElement;
  wrapper: ReturnType<typeof mount>;
  handle: AtomicCodeMirrorEditorHandle;
  setProps: (props: EditorProps) => Promise<void>;
};

const mounted: Mounted[] = [];

function mountEditor(props: EditorProps): Mounted {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const wrapper = mount(AtomicCodeMirrorEditor, { props, attachTo: host });
  const handle = wrapper.vm as unknown as AtomicCodeMirrorEditorHandle;
  const setProps = async (nextProps: EditorProps) => {
    await wrapper.setProps(nextProps);
    await nextTick();
  };
  const entry = { host, wrapper, handle, setProps };
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
  document
    .querySelectorAll('.cm-atomic-table-menu')
    .forEach((menu) => menu.remove());
  vi.restoreAllMocks();
});

const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |';

describe('read-only mode', () => {
  it('renders table cells non-editable when read-only', () => {
    const { host } = mountEditor({ markdownSource: TABLE, readOnly: true });
    const sources = host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.isContentEditable).toBe(false);
    }
  });

  it('keeps table cells editable in the default (editable) mode', () => {
    const { host } = mountEditor({ markdownSource: TABLE });
    const source = host.querySelector<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(source).not.toBeNull();
    expect(source?.isContentEditable).toBe(true);
  });

  it('toggles table cell editability in place when the prop flips', async () => {
    const { host, setProps } = mountEditor({
      markdownSource: TABLE,
      readOnly: false,
    });
    expect(
      host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')
        ?.isContentEditable,
    ).toBe(true);

    await setProps({ markdownSource: TABLE, readOnly: true });
    const cells = host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.isContentEditable).toBe(false);

    await setProps({ markdownSource: TABLE, readOnly: false });
    expect(
      host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')
        ?.isContentEditable,
    ).toBe(true);
  });

  it('toggles read-only through the imperative handle', () => {
    const { host, handle } = mountEditor({ markdownSource: TABLE });
    const content = host.querySelector<HTMLElement>('.cm-content');
    expect(content?.isContentEditable).toBe(true);
    expect(
      host.querySelector<HTMLElement>('.cm-atomic-table-cell-source')
        ?.isContentEditable,
    ).toBe(true);

    handle.setReadOnly(true);
    expect(content?.isContentEditable).toBe(false);
    expect(host.querySelector('.cm-editor')?.classList).toContain(
      'cm-atomic-readonly',
    );
    for (const cell of host.querySelectorAll<HTMLElement>(
      '.cm-atomic-table-cell-source',
    )) {
      expect(cell.isContentEditable).toBe(false);
    }

    handle.setReadOnly(false);
    expect(content?.isContentEditable).toBe(true);
    expect(host.querySelector('.cm-editor')?.classList).not.toContain(
      'cm-atomic-readonly',
    );
  });

  it('preserves an open search panel while toggling read-only', () => {
    const { handle } = mountEditor({ markdownSource: 'find the needle' });

    handle.openSearch('needle');
    expect(handle.isSearchOpen()).toBe(true);

    handle.setReadOnly(true);
    expect(handle.isSearchOpen()).toBe(true);
  });

  it('opens a link when its text (not just the icon) is clicked in read-only', () => {
    const onLinkClick = vi.fn();
    const { host } = mountEditor({
      markdownSource: 'See [the docs](https://example.com/docs).',
      readOnly: true,
      onLinkClick,
    });

    const link = host.querySelector<HTMLElement>('.cm-atomic-link');
    expect(link).not.toBeNull();
    link?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('uses window.open when no link callback is supplied', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { host } = mountEditor({
      markdownSource: 'See [the docs](https://example.com/docs).',
      readOnly: true,
    });

    host
      .querySelector<HTMLElement>('.cm-atomic-link')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );

    expect(open).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens a table-cell link from its text (not just the icon) in read-only', () => {
    const onLinkClick = vi.fn();
    const { host } = mountEditor({
      markdownSource:
        '| Site | Note |\n| --- | --- |\n| [docs](https://example.com/docs) | ok |',
      readOnly: true,
      onLinkClick,
    });

    const wrap = host.querySelector<HTMLElement>('.cm-atomic-link-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap?.dataset.url).toBe('https://example.com/docs');
    const textTarget =
      wrap?.querySelector<HTMLElement>(':not(.cm-atomic-link-icon)') ?? wrap;
    textTarget?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('keeps task checkboxes toggleable in read-only', () => {
    const onMarkdownChange = vi.fn();
    const { host } = mountEditor({
      markdownSource: '- [ ] buy milk',
      readOnly: true,
      onMarkdownChange,
    });

    const checkbox = host.querySelector<HTMLInputElement>(
      'input.cm-atomic-task-checkbox',
    );
    expect(checkbox).not.toBeNull();
    checkbox?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(onMarkdownChange).toHaveBeenCalledWith('- [x] buy milk');
  });

  it('blocks a stale table menu action after switching to read-only', async () => {
    const onMarkdownChange = vi.fn();
    const { host, handle, setProps } = mountEditor({
      markdownSource: TABLE,
      onMarkdownChange,
    });

    host.querySelector<HTMLElement>('tbody td')?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    const menuAction = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cm-atomic-table-menu-item'),
    ).find((button) => button.textContent === 'Insert row above');
    expect(menuAction).toBeDefined();

    await setProps({ markdownSource: TABLE, readOnly: true, onMarkdownChange });
    menuAction?.click();

    expect(handle.getMarkdown()).toBe(TABLE);
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });
});
