import {
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type PropType,
  type ShallowRef,
} from 'vue';
import type { LanguageDescription } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import {
  createEditorRuntime,
  type AtomicCodeMirrorEditorHandle,
  type EditorRuntime,
} from './editor-runtime';

const EMPTY_CODE_LANGUAGES: readonly LanguageDescription[] = [];
const EMPTY_EXTENSIONS: readonly Extension[] = [];

function defaultOpenLink(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // window.open can throw in sandboxed iframes etc.
  }
}

export type { AtomicCodeMirrorEditorHandle };

export interface AtomicCodeMirrorEditorProps {
  markdownSource: string;
  documentId?: string;
  initialSearchText?: string | null;
  initialRevealText?: string | null;
  blurEditorOnMount?: boolean;
  readOnly?: boolean;
  onMarkdownChange?: (markdown: string) => void;
  onLinkClick?: (url: string) => void;
  codeLanguages?: readonly LanguageDescription[];
  extensions?: readonly Extension[];
}

/**
 * Typed ref helper for the exposed imperative handle. Vue's
 * `defineComponent` + `expose()` does not surface exposed members on the
 * component instance type, so bind this helper's `setHandle` as the
 * component `ref` and read methods off `handle.value`.
 *
 * ```ts
 * const { handle, setHandle } = useAtomicEditorHandle();
 * h(AtomicCodeMirrorEditor, { ref: setHandle, markdownSource: '# hi' });
 * handle.value?.openSearch();
 * ```
 */
export function useAtomicEditorHandle(): {
  handle: ShallowRef<AtomicCodeMirrorEditorHandle | null>;
  setHandle: (instance: unknown) => void;
} {
  const handle = shallowRef<AtomicCodeMirrorEditorHandle | null>(null);
  const setHandle = (instance: unknown): void => {
    handle.value = (instance as AtomicCodeMirrorEditorHandle | null) ?? null;
  };
  return { handle, setHandle };
}

/**
 * Vue wrapper around a CodeMirror 6 editor configured for markdown
 * editing with Obsidian-style inline live preview.
 *
 * Remember to import the accompanying CSS:
 *
 * ```ts
 * import '@atomic-editor/editor/styles.css';
 * ```
 */
export const AtomicCodeMirrorEditor = defineComponent({
  name: 'AtomicCodeMirrorEditor',
  props: {
    markdownSource: { type: String, required: true },
    documentId: { type: String, default: undefined },
    initialSearchText: {
      type: String as PropType<string | null>,
      default: null,
    },
    initialRevealText: {
      type: String as PropType<string | null>,
      default: null,
    },
    blurEditorOnMount: { type: Boolean, default: false },
    readOnly: { type: Boolean, default: false },
    codeLanguages: {
      type: Array as PropType<readonly LanguageDescription[]>,
      default: () => EMPTY_CODE_LANGUAGES,
    },
    extensions: {
      type: Array as PropType<readonly Extension[]>,
      default: () => EMPTY_EXTENSIONS,
    },
  },
  emits: {
    markdownChange: (markdown: string) => typeof markdown === 'string',
    linkClick: (url: string) => typeof url === 'string',
  },
  setup(props, { emit, expose }) {
    const rootEl = ref<HTMLElement | null>(null);
    let runtime: EditorRuntime | null = null;

    // Captured during setup: `getCurrentInstance()` is only valid inside
    // setup, but `linkClick` runs later from a CM6 event handler.
    const instance = getCurrentInstance();

    const identity = (): string => props.documentId ?? props.markdownSource;

    const linkClick = (url: string): void => {
      const hasListener = Boolean(instance?.vnode.props?.onLinkClick);
      if (hasListener) emit('linkClick', url);
      else defaultOpenLink(url);
    };

    const teardown = (): void => {
      runtime?.destroy();
      runtime = null;
    };

    const mountRuntime = (): void => {
      const parent = rootEl.value;
      if (!parent) return;
      runtime = createEditorRuntime(parent, {
        markdown: props.markdownSource,
        initialSearchText: props.initialSearchText,
        initialRevealText: props.initialRevealText,
        readOnly: props.readOnly,
        codeLanguages: props.codeLanguages,
        extensions: props.extensions,
        onMarkdownChange: (markdown) => emit('markdownChange', markdown),
        onLinkClick: linkClick,
      });
    };

    onMounted(mountRuntime);
    onBeforeUnmount(teardown);

    // Document identity keys the view: swapping `documentId` (or the
    // initial source when no id is given) remounts so cursor / undo
    // state can't bleed across documents.
    watch(
      () => identity(),
      () => {
        teardown();
        mountRuntime();
      },
    );

    // Read-only is compartment-backed: reconfigure in place (scroll and
    // search state preserved) rather than remounting.
    watch(
      () => props.readOnly,
      (next) => runtime?.setReadOnly(next),
    );

    watch(
      () => props.initialRevealText,
      (next) => {
        if (next) runtime?.reveal(next);
      },
    );

    expose({
      focus: () => runtime?.handle.focus(),
      undo: () => runtime?.handle.undo(),
      redo: () => runtime?.handle.redo(),
      openSearch: (query?: string) => runtime?.handle.openSearch(query),
      closeSearch: () => runtime?.handle.closeSearch(),
      revealText: (query: string) => runtime?.handle.revealText(query),
      isSearchOpen: () => runtime?.handle.isSearchOpen() ?? false,
      getMarkdown: () => runtime?.handle.getMarkdown() ?? '',
      getContentDOM: () => runtime?.handle.getContentDOM() ?? null,
      setReadOnly: (next: boolean) => runtime?.handle.setReadOnly(next),
    });

    return () => h('div', { ref: rootEl, class: 'atomic-cm-editor' });
  },
});
