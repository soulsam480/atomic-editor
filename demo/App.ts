import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue';
import {
  AtomicCodeMirrorEditor,
  wikiLinks,
  type AtomicCodeMirrorEditorHandle,
  type WikiLinkSuggestion,
} from '@atomic-editor/editor';
import '@atomic-editor/editor/styles.css';
import {
  SAMPLE_SIZES,
  generateSampleMarkdown,
  type SampleOptions,
  type SampleSize,
} from './sample-content';

type ThemeMode = 'dark' | 'light';

// Injected from package.json at build time via Vite `define` (see
// vite.config.ts), so the version pill can never drift from the real
// published version.
declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

const WIKI_TARGETS: WikiLinkSuggestion[] = [
  { target: 'demo-project-atlas', label: 'Project Atlas', detail: 'Project' },
  { target: 'demo-meeting-notes', label: 'Meeting Notes', detail: 'Recent' },
  { target: 'demo-editor-roadmap', label: 'Editor Roadmap', detail: 'Planning' },
  { target: 'demo-search-fallback', label: 'Search Fallback', detail: 'Content' },
];

const WIKI_SNIPPETS: Record<string, string> = {
  'demo-project-atlas':
    'A project planning page used for labeled wiki-link rendering.',
  'demo-meeting-notes':
    'Recent notes with a bare wiki-link target that resolves asynchronously.',
  'demo-editor-roadmap':
    'A roadmap page for live preview, autocomplete, and deeplink behavior.',
  'demo-search-fallback':
    'Fallback result for testing content-like matching in the demo.',
};

interface ContentToggles {
  images: boolean;
  tables: boolean;
  lists: boolean;
  code: boolean;
}

const DEFAULT_TOGGLES: ContentToggles = {
  images: true,
  tables: true,
  lists: true,
  code: true,
};

const SPOTLIGHTS: {
  label: string;
  phrase: string;
  needs?: keyof ContentToggles;
}[] = [
  { label: 'Code', phrase: 'Fenced code blocks pick up', needs: 'code' },
  { label: 'Tables', phrase: 'Tables render WYSIWYG', needs: 'tables' },
  {
    label: 'Checkboxes',
    phrase: 'Task lists are real checkboxes',
    needs: 'lists',
  },
  { label: 'Wiki links', phrase: 'Wiki links connect notes' },
  { label: 'Links', phrase: 'A link to' },
  { label: 'Escapes', phrase: 'Escapes like domain' },
];

function formatBytes(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(2)} MB`;
}

function findWikiTarget(target: string): WikiLinkSuggestion | undefined {
  return WIKI_TARGETS.find((candidate) => candidate.target === target);
}

function suggestWikiTargets(query: string): Promise<WikiLinkSuggestion[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return Promise.resolve(WIKI_TARGETS);
  return Promise.resolve(
    WIKI_TARGETS.filter((target) => {
      const snippet = WIKI_SNIPPETS[target.target] ?? '';
      return (
        target.label.toLowerCase().includes(normalized) ||
        target.target.toLowerCase().includes(normalized) ||
        snippet.toLowerCase().includes(normalized)
      );
    }),
  );
}

function readLinkedTargetFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('linkedTarget');
}

function togglesToOptions(t: ContentToggles): SampleOptions {
  return {
    mode: t.images ? 'with images' : 'imageless',
    tables: t.tables ? 'with tables' : 'no tables',
    lists: t.lists ? 'with lists' : 'no lists',
    codeBlocks: t.code ? 'with code blocks' : 'no code blocks',
  };
}

// Line-numbered raw-markdown view. Caps the numbered render so toggling
// source on a 1000-page sample doesn't spawn 100k DOM nodes — past the
// cap it falls back to a plain scrollable block.
const SOURCE_LINE_CAP = 4000;

const SourceView = defineComponent({
  name: 'SourceView',
  props: {
    markdown: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const lines = props.markdown.split('\n');
      if (lines.length > SOURCE_LINE_CAP) {
        return h('pre', { class: 'demo-source demo-source-plain' }, [
          h('code', props.markdown),
        ]);
      }
      return h(
        'div',
        { class: 'demo-source' },
        lines.map((line, i) =>
          h('div', { class: 'demo-source-line', key: i }, [
            h('span', { class: 'demo-source-ln' }, String(i + 1)),
            h('span', { class: 'demo-source-text' }, line || ' '),
          ]),
        ),
      );
    };
  },
});

const SunIcon = defineComponent({
  name: 'SunIcon',
  setup() {
    return () =>
      h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '15',
          height: '15',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        [
          h('circle', { cx: '12', cy: '12', r: '4' }),
          h('path', {
            d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
          }),
        ],
      );
  },
});

const MoonIcon = defineComponent({
  name: 'MoonIcon',
  setup() {
    return () =>
      h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '15',
          height: '15',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        [h('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' })],
      );
  },
});

const ToggleChip = defineComponent({
  name: 'ToggleChip',
  props: {
    label: { type: String, required: true },
    on: { type: Boolean, required: true },
    onClick: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          class: `demo-chip demo-chip-toggle${props.on ? ' active' : ''}`,
          'aria-pressed': props.on,
          onClick: props.onClick,
        },
        props.label,
      );
  },
});

const SegmentedControl = defineComponent({
  name: 'SegmentedControl',
  props: {
    value: { type: String, required: true },
    options: {
      type: Array as PropType<{ value: string; label: string }[]>,
      required: true,
    },
    onChange: {
      type: Function as PropType<(next: string) => void>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        { class: 'demo-segmented' },
        props.options.map((opt) =>
          h(
            'button',
            {
              key: opt.value,
              type: 'button',
              class: opt.value === props.value ? 'active' : '',
              onClick: () => props.onChange(opt.value),
            },
            opt.label,
          ),
        ),
      );
  },
});

export const App = defineComponent({
  name: 'App',
  setup() {
    const sampleSize = ref<SampleSize>('1 page');
    const theme = ref<ThemeMode>('dark');
    const readOnly = ref(false);
    const toggles = ref<ContentToggles>({ ...DEFAULT_TOGGLES });
    const showSource = ref(false);
    const liveMarkdown = ref('');
    const copied = ref(false);
    const resetNonce = ref(0);
    const perf = ref<{ rendered: number; total: number }>({
      rendered: 0,
      total: 0,
    });
    const openedWikiTarget = ref<string | null>(readLinkedTargetFromUrl());
    const controlsOpen = ref(false);

    const editor = ref<AtomicCodeMirrorEditorHandle | null>(null);
    let intervalId: number | null = null;

    // Probe hook — `?reveal=…` drives the editor's `initialRevealText`,
    // so reveal behavior can be triggered from the URL (used by the e2e
    // harness).
    const revealText = (() => {
      if (typeof window === 'undefined') return null;
      return new URLSearchParams(window.location.search).get('reveal');
    })();

    // Identity for the mounted document. Any change here remounts the
    // editor (fresh cursor/undo). `resetNonce` lets "Reset" force a
    // remount back to the generated sample.
    const documentId = computed(
      () =>
        `${sampleSize.value}|${toggles.value.images}|${toggles.value.tables}|${toggles.value.lists}|${toggles.value.code}|${resetNonce.value}`,
    );

    // Persistence key is independent of `resetNonce` so edits survive a
    // round-trip away and back, while Reset clears the key and remounts.
    const storageKey = computed(
      () =>
        `atomic-demo:${sampleSize.value}|${toggles.value.images}|${toggles.value.tables}|${toggles.value.lists}|${toggles.value.code}`,
    );

    const markdownSource = computed(() => {
      // `resetNonce` is read so Reset forces a regeneration even though
      // the generated output itself only depends on size + toggles.
      void resetNonce.value;
      const generated = generateSampleMarkdown(
        sampleSize.value,
        togglesToOptions(toggles.value),
      );
      // Deep-link-to-reveal implies "show me this exact content," so
      // start from the canonical doc rather than a saved edit. (This
      // also keeps the e2e reveal probe deterministic.)
      if (revealText) return generated;
      try {
        const saved = window.localStorage.getItem(storageKey.value);
        if (saved != null) return saved;
      } catch {
        // localStorage unavailable (private mode / sandbox) — fall back.
      }
      return generated;
    });

    const documentBytes = computed(() =>
      formatBytes(markdownSource.value.length),
    );

    const wikiLinkExtensions = [
      wikiLinks({
        suggest: suggestWikiTargets,
        resolve: async (target) => {
          const linked = findWikiTarget(target);
          if (!linked) return null;
          return { target, label: linked.label, status: 'resolved' as const };
        },
        onOpen: (target) => {
          const url = new URL(window.location.href);
          url.searchParams.set('linkedTarget', target);
          window.history.pushState(null, '', url);
          openedWikiTarget.value = target;
        },
        openOnClick: true,
      }),
    ];

    const spotlight = (phrase: string): void => {
      editor.value?.revealText(phrase);
    };

    const toggleSource = (): void => {
      showSource.value = !showSource.value;
      if (showSource.value) {
        liveMarkdown.value = editor.value?.getMarkdown() ?? '';
      }
    };

    const handleCopy = async (): Promise<void> => {
      const markdown = editor.value?.getMarkdown() ?? '';
      try {
        await navigator.clipboard.writeText(markdown);
        copied.value = true;
        window.setTimeout(() => {
          copied.value = false;
        }, 1500);
      } catch {
        // Clipboard blocked — silently no-op.
      }
    };

    const resetDoc = (): void => {
      try {
        window.localStorage.removeItem(storageKey.value);
      } catch {
        // Ignore unavailable storage.
      }
      resetNonce.value += 1;
    };

    const setToggle = (key: keyof ContentToggles): void => {
      toggles.value = { ...toggles.value, [key]: !toggles.value[key] };
    };

    const handleMarkdownChange = (markdown: string): void => {
      try {
        window.localStorage.setItem(storageKey.value, markdown);
      } catch {
        // Ignore quota / unavailable storage — persistence is a nicety.
      }
      if (showSource.value) liveMarkdown.value = markdown;
    };

    const handlePopState = (): void => {
      openedWikiTarget.value = readLinkedTargetFromUrl();
    };

    const openedWikiLabel = computed(() =>
      openedWikiTarget.value
        ? (findWikiTarget(openedWikiTarget.value)?.label ??
          openedWikiTarget.value)
        : null,
    );

    const spotlights = computed(() =>
      SPOTLIGHTS.filter((s) => !s.needs || toggles.value[s.needs]),
    );

    watch(
      theme,
      (next) => {
        document.documentElement.dataset.theme = next;
      },
      { immediate: true },
    );

    // Virtualization readout: CM6 renders only the lines in (and near)
    // the viewport. Polling the rendered `.cm-line` count against the
    // total line count makes "we only render what you see" visible.
    onMounted(() => {
      window.addEventListener('popstate', handlePopState);
      intervalId = window.setInterval(() => {
        const dom = editor.value?.getContentDOM();
        const rendered = dom ? dom.querySelectorAll('.cm-line').length : 0;
        const markdown = editor.value?.getMarkdown() ?? '';
        const total = markdown ? markdown.split('\n').length : 0;
        const prev = perf.value;
        if (prev.rendered !== rendered || prev.total !== total) {
          perf.value = { rendered, total };
        }
      }, 600);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('popstate', handlePopState);
      if (intervalId !== null) window.clearInterval(intervalId);
    });

    return () =>
      h('div', { class: 'demo-root', 'data-theme': theme.value }, [
        h('div', { class: 'demo-chrome' }, [
          h('div', { class: 'demo-topbar' }, [
            h('h1', { class: 'demo-title' }, [
              h('span', { class: 'demo-mark-strong' }, 'Atomic'),
              h('span', { class: 'demo-mark-soft' }, 'Editor'),
            ]),
            h(
              'a',
              {
                class: 'demo-pill demo-pill-accent',
                href: 'https://www.npmjs.com/package/@atomic-editor/editor',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              `v${VERSION}`,
            ),
            h('div', { class: 'demo-topbar-actions' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: 'demo-icon-btn',
                  onClick: () => {
                    theme.value = theme.value === 'dark' ? 'light' : 'dark';
                  },
                  title:
                    theme.value === 'dark'
                      ? 'Switch to light theme'
                      : 'Switch to dark theme',
                  'aria-label': 'Toggle colour theme',
                },
                [h(theme.value === 'dark' ? SunIcon : MoonIcon)],
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: `demo-btn${readOnly.value ? ' active' : ''}`,
                  onClick: () => {
                    readOnly.value = !readOnly.value;
                  },
                  'aria-pressed': readOnly.value,
                  title:
                    'Toggle read-only reading mode — links open instead of revealing source',
                },
                readOnly.value ? 'Reading ✓' : 'Reading',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: `demo-btn demo-disclosure${controlsOpen.value ? ' active' : ''}`,
                  onClick: () => {
                    controlsOpen.value = !controlsOpen.value;
                  },
                  'aria-expanded': controlsOpen.value,
                },
                [
                  'Controls ',
                  h(
                    'span',
                    { class: 'demo-caret' },
                    controlsOpen.value ? '▾' : '▸',
                  ),
                ],
              ),
              h(
                'a',
                {
                  class: 'demo-github',
                  href: 'https://github.com/kenforthewin/atomic-editor',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                'GitHub →',
              ),
            ]),
          ]),
          controlsOpen.value
            ? h('div', { class: 'demo-controls-panel' }, [
                h(
                  'p',
                  { class: 'demo-sub' },
                  'CodeMirror 6 markdown editor with Obsidian-style inline live preview. Edit anything below — it stays real markdown.',
                ),
                h('div', { class: 'demo-toolbar' }, [
                  h('div', { class: 'demo-control' }, [
                    h('span', { class: 'demo-control-label' }, 'Sample'),
                    h(SegmentedControl, {
                      value: sampleSize.value,
                      options: SAMPLE_SIZES.map((s) => ({
                        value: s,
                        label: s,
                      })),
                      onChange: (next: string) => {
                        sampleSize.value = next as SampleSize;
                      },
                    }),
                    h('span', { class: 'demo-meta' }, documentBytes.value),
                  ]),
                  h('div', { class: 'demo-control' }, [
                    h('span', { class: 'demo-control-label' }, 'Content'),
                    h('div', { class: 'demo-chip-group' }, [
                      h(ToggleChip, {
                        label: 'Images',
                        on: toggles.value.images,
                        onClick: () => setToggle('images'),
                      }),
                      h(ToggleChip, {
                        label: 'Tables',
                        on: toggles.value.tables,
                        onClick: () => setToggle('tables'),
                      }),
                      h(ToggleChip, {
                        label: 'Lists',
                        on: toggles.value.lists,
                        onClick: () => setToggle('lists'),
                      }),
                      h(ToggleChip, {
                        label: 'Code',
                        on: toggles.value.code,
                        onClick: () => setToggle('code'),
                      }),
                    ]),
                  ]),
                  h('div', { class: 'demo-actions' }, [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: `demo-btn${showSource.value ? ' active' : ''}`,
                        onClick: toggleSource,
                      },
                      showSource.value ? 'Hide source' : 'Show source',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'demo-btn',
                        onClick: handleCopy,
                      },
                      copied.value ? 'Copied ✓' : 'Copy markdown',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'demo-btn',
                        onClick: resetDoc,
                        title: 'Discard edits and reload the sample',
                      },
                      'Reset',
                    ),
                    h(
                      'span',
                      {
                        class: 'demo-perf',
                        title:
                          'CodeMirror 6 only renders the lines in (and near) the viewport — pick a big sample and watch this stay small.',
                      },
                      `${perf.value.rendered} / ${perf.value.total} lines rendered`,
                    ),
                  ]),
                ]),
                h('div', { class: 'demo-spotlight' }, [
                  h('span', { class: 'demo-control-label' }, 'Jump to'),
                  ...spotlights.value.map((s) =>
                    h(
                      'button',
                      {
                        key: s.label,
                        type: 'button',
                        class: 'demo-chip',
                        onClick: () => spotlight(s.phrase),
                      },
                      s.label,
                    ),
                  ),
                  h(
                    'span',
                    { class: 'demo-spotlight-hint' },
                    openedWikiLabel.value
                      ? `opened: ${openedWikiLabel.value} (${openedWikiTarget.value})`
                      : 'Cmd/Ctrl-click a wiki link to open it',
                  ),
                ]),
              ])
            : null,
        ]),
        h('main', { class: 'demo-canvas' }, [
          h('div', { class: 'demo-editor-pane' }, [
            h(AtomicCodeMirrorEditor, {
              ref: editor,
              markdownSource: markdownSource.value,
              documentId: documentId.value,
              readOnly: readOnly.value,
              initialRevealText: revealText,
              onMarkdownChange: handleMarkdownChange,
              onLinkClick: (url: string) => {
                window.open(url, '_blank', 'noopener,noreferrer');
              },
              extensions: wikiLinkExtensions,
            }),
          ]),
          showSource.value
            ? h('aside', { class: 'demo-source-pane' }, [
                h(
                  'div',
                  { class: 'demo-source-head' },
                  'Raw markdown — the source of truth',
                ),
                h(SourceView, { markdown: liveMarkdown.value }),
              ])
            : null,
        ]),
      ]);
  },
});
