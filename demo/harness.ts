import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from '@atomic-editor/editor';
import '@atomic-editor/editor/styles.css';
import './harness.css';

type HarnessTheme = 'dark' | 'light';

interface HarnessOptions {
  readOnly?: boolean;
  theme?: HarnessTheme;
}

interface HarnessController {
  load(markdown: string, options?: HarnessOptions): Promise<void>;
  focus(): void;
  getMarkdown(): string;
  getOpenedUrls(): string[];
}

declare global {
  interface Window {
    atomicHarness?: HarnessController;
  }
}

const Harness = defineComponent({
  name: 'Harness',
  setup() {
    const editor = ref<AtomicCodeMirrorEditorHandle | null>(null);
    const openedUrls = ref<string[]>([]);
    const markdown = ref('# harness ready');
    const readOnly = ref(false);
    const theme = ref<HarnessTheme>('dark');
    const revision = ref(0);
    let pendingLoad: (() => void) | null = null;

    onMounted(() => {
      window.atomicHarness = {
        load(nextMarkdown, options = {}) {
          openedUrls.value = [];
          return new Promise<void>((resolve) => {
            pendingLoad = resolve;
            markdown.value = nextMarkdown;
            readOnly.value = options.readOnly ?? false;
            theme.value = options.theme ?? 'dark';
            revision.value += 1;
          });
        },
        focus() {
          editor.value?.focus();
        },
        getMarkdown() {
          return editor.value?.getMarkdown() ?? '';
        },
        getOpenedUrls() {
          return [...openedUrls.value];
        },
      };
    });

    onBeforeUnmount(() => {
      delete window.atomicHarness;
    });

    // Apply theme and resolve a pending `load()` after the editor's
    // document swap has had two animation frames to settle (mirrors the
    // original React `useLayoutEffect` + double-rAF behavior so the e2e
    // probes see a stable DOM). `nextTick` flushes the vnode update
    // before we schedule the frames.
    watch(
      [markdown, readOnly, theme, revision],
      async () => {
        document.documentElement.dataset.theme = theme.value;
        const resolve = pendingLoad;
        if (!resolve) return;
        pendingLoad = null;
        await nextTick();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      },
      { flush: 'post', immediate: true },
    );

    return () =>
      h(
        'main',
        {
          class: 'harness-shell',
          'data-harness-revision': String(revision.value),
        },
        [
          h('div', { class: 'harness-editor' }, [
            h(AtomicCodeMirrorEditor, {
              ref: editor,
              documentId: `fixture-${revision.value}`,
              markdownSource: markdown.value,
              readOnly: readOnly.value,
              onLinkClick: (url: string) => {
                openedUrls.value.push(url);
              },
            }),
          ]),
        ],
      );
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createApp(Harness).mount(root);
