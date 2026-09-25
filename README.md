# Atomic Editor

**Obsidian-style live preview for [CodeMirror 6](https://codemirror.net/), in Vue.**

[![npm version](https://img.shields.io/npm/v/@atomic-editor/editor?color=7c3aed&labelColor=2d2d2d)](https://www.npmjs.com/package/@atomic-editor/editor)
[![license](https://img.shields.io/npm/l/@atomic-editor/editor?color=7c3aed&labelColor=2d2d2d)](./LICENSE)

A markdown editor where formatting renders as you type — headings, bold,
tables, images, task lists — while the text underneath stays plain markdown.
The document you read is the document you edit: no split preview, and copy /
save / round-trip behave exactly like a plain textarea full of markdown. An
optional reading mode locks that same rendered surface without introducing a
separate preview document.

It's the writing surface behind
[**Atomic**](https://github.com/kenforthewin/atomic), a personal knowledge
base — extracted to stand on its own, and hardened on real user documents.

[**Try the live demo →**](https://kenforthewin.github.io/atomic-editor/)

> **Fork notice.** This is a fork of
> [kenforthewin/atomic-editor](https://github.com/kenforthewin/atomic-editor).
> The React-to-Vue port was done **entirely by AI** — no human wrote the
> port. The work was performed by the model **`deepseek-v4.1-flash`**
> running in [opencode](https://opencode.ai).

> **0.7.0 — Vue.** The React wrapper was replaced by a Vue component.
> React props/refs map to Vue events and an exposed handle:
> `onMarkdownChange` → `@markdown-change`, `onLinkClick` → `@link-click`,
> `editorHandleRef` → a component `ref` (see `useAtomicEditorHandle`).
> React consumers should pin `0.6.x` until they migrate.

## Features

- **Live preview.** Headings, emphasis, `==highlights==`, links, images,
  and tables render inline; the raw syntax appears only on the line your
  cursor is on, then tucks itself away when you move on.
- **Raw markdown is the source of truth.** Every decoration is view-only, so
  copy, save, and round-trip through any other markdown tool are byte-for-byte
  identical to a plain textarea.
- **Virtualized and layout-stable.** CM6 renders only the viewport, and lines
  never reflow when you click into them — open a 500-page document and scroll
  stays smooth, even on iOS.
- **WYSIWYG tables.** Click a cell to edit in place; wide tables scroll
  horizontally inside a contained wrapper instead of stretching the page.
- **Wiki links.** `[[target]]` / `[[target|label]]` with async resolution,
  autocomplete, and click-to-open — for knowledge-base-style cross-linking.
- **Smart lists.** Enter continues tight bullets and task checkboxes, Enter on
  an empty item dedents, and `- [ ]` becomes a real, clickable checkbox.
- **Bring-your-own syntax highlighting.** No grammars ship with the
  editor; pass the `@codemirror/lang-*` packages you want, each
  lazy-loaded the first time a fence uses it so unused languages never
  hit the wire.
- **Themed with CSS variables** — dark by default, light via a single
  `data-theme="light"` attribute, every color overridable.

## Install

```bash
npm install @atomic-editor/editor \
  @codemirror/state @codemirror/view @codemirror/commands \
  @codemirror/autocomplete @codemirror/language @codemirror/search \
  @codemirror/lang-markdown \
  @lezer/common @lezer/highlight @lezer/markdown \
  vue
```

The CodeMirror and Vue packages are declared as **peer dependencies**
rather than regular deps. You install them alongside the editor so
your bundler resolves a single shared copy — two copies of
`@codemirror/state` in one bundle would silently break the editor's
state-field identity checks.

Fenced-code language grammars are **not bundled** — install and pass
the `@codemirror/lang-*` packages you want highlighted. See
[Syntax highlighting](#syntax-highlighting) below.

## Use

```ts
import { createApp, h } from "vue";
import { AtomicCodeMirrorEditor } from "@atomic-editor/editor";
import "@atomic-editor/editor/styles.css";

createApp({
  render: () =>
    h(AtomicCodeMirrorEditor, {
      markdownSource: "# Hello\n\nA paragraph.",
      onMarkdownChange: (md) => console.log(md),
      onLinkClick: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    }),
}).mount("#app");
```

The editor fills its parent — wrap it in a height-bounded flex or grid
container.

### Imperative handle

Reach for the exposed handle if you need to drive the editor from
outside — e.g. wire your own toolbar buttons to focus, undo/redo, or
jump to a paragraph:

```ts
import { h } from "vue";
import { AtomicCodeMirrorEditor, useAtomicEditorHandle } from "@atomic-editor/editor";

const { handle } = useAtomicEditorHandle();

export default {
  setup() {
    return () =>
      h("div", [
        h("button", { onClick: () => handle.value?.focus() }, "Focus"),
        h(AtomicCodeMirrorEditor, {
          ref: handle,
          markdownSource: "…",
        }),
      ]);
  },
};
```

The handle exposes `view` (the underlying `EditorView`), `focus`,
`undo`, `redo`, `revealText(query)`, `getMarkdown`, `getContentDOM`,
and `setReadOnly(readOnly)`.

### Read-only (reading) mode

Pass `readOnly` to render the document as a reading surface, like
Obsidian's Reading view:

```ts
h(AtomicCodeMirrorEditor, { markdownSource: "…", readOnly: true });
```

In read-only mode the whole document stays rendered — source never
reveals under a caret — typing / paste / table editing are disabled,
and clicking a link (anywhere on it, not just the trailing icon) opens
it instead of placing a caret. Task checkboxes stay toggleable.

`readOnly` is backed by a CodeMirror `Compartment`, so flipping it
reconfigures the live view in place — scroll position is preserved, no
remount. Drive it from a prop, or imperatively via
`handle.setReadOnly(true)` for a toolbar toggle outside the component's
render cycle. For consumers composing a custom editor, the underlying
`readOnlyFacet` and `readOnlyExtension` are exported too.

### Arriving from a search result

`initialRevealText` drops the user near a relevant paragraph on mount:
a scroll-into-view with a 3.2 s fade-out highlight on the first match —
no cursor move. Good for "I clicked a search result, take me to the
paragraph it came from".

It accepts `string | null`. The reveal matcher falls back progressively
— exact, whitespace-collapsed, individual lines, then truncated
prefixes (140 and 80 chars) — so hits still resolve when the query came
from an LLM-massaged snippet that doesn't match the source
byte-for-byte. For post-mount reveals, call `handle.revealText(query)`
via the imperative handle.

The fade highlight uses CSS variables
`--atomic-editor-initial-reveal-bg` and
`--atomic-editor-initial-reveal-bg-strong`; override to theme the peak
and settled colors.

## Syntax highlighting

The editor bundles **no** language grammars — fenced code blocks render
as plain monospace by default. Bring your own: install the
`@codemirror/lang-*` package(s) you want and pass a `codeLanguages`
array. `@codemirror/lang-markdown` dynamically imports each grammar the
first time a fence uses it, so large lists don't bloat the initial
bundle.

```bash
npm install @codemirror/lang-python
```

```ts
import { h } from "vue";
import { LanguageDescription } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { AtomicCodeMirrorEditor } from "@atomic-editor/editor";

const codeLanguages = [
  LanguageDescription.of({
    name: "Python",
    alias: ["py"],
    extensions: ["py"],
    load: () => Promise.resolve(python()),
  }),
];

h(AtomicCodeMirrorEditor, { markdownSource: "…", codeLanguages });
```

Any `LanguageDescription` list works — e.g. build one per language from
`@codemirror/lang-javascript`, `@codemirror/lang-rust`, or the legacy
stream parsers in `@codemirror/legacy-modes`.

## Wiki links

`[[target]]` and `[[target|label]]` links — the way Atomic and Obsidian
cross-link notes — ship as a composable extension. It renders labeled links,
resolves bare targets asynchronously (to show a real title and a
resolved / missing state), opens links on click, and offers autocomplete as
soon as you type `[[`:

```ts
import { h } from "vue";
import { AtomicCodeMirrorEditor, wikiLinks } from "@atomic-editor/editor";

h(AtomicCodeMirrorEditor, {
  markdownSource: "See [[atom-42|the design doc]] for details.",
  extensions: [
    wikiLinks({
      suggest: async (query) => store.search(query), // autocomplete source
      resolve: async (target) => store.resolve(target), // label + status for bare links
      onOpen: (target) => router.open(target), // click / Cmd-click to navigate
    }),
  ],
});
```

Draft links stay editable while the cursor is inside them; resolution is
debounced and cached. See [`src/wiki-links.ts`](./src/wiki-links.ts) for the
full config — custom serialization, resolver policies, suggestion limits, and
the `WikiLinkSuggestion` / `WikiLinkResolvedTarget` types.

## Theming

Every color, font, and size reads from a CSS custom property with an
inline fallback. Override on any ancestor of the editor.

The package ships a **light variant** that activates whenever
`data-theme="light"` is set on an ancestor — including `<html>` or
`<body>`. The dark defaults remain unchanged; the light block just
re-maps the same variables.

```html
<html data-theme="light">
  …
</html>
```

| Variable                           | Dark default (auto-light on `[data-theme="light"]`) |
| ---------------------------------- | --------------------------------------------------- |
| `--atomic-editor-font`             | system sans                                         |
| `--atomic-editor-font-mono`        | system mono                                         |
| `--atomic-editor-body-size`        | `1.0625rem`                                         |
| `--atomic-editor-body-leading`     | `1.7`                                               |
| `--atomic-editor-measure`          | `70ch`                                              |
| `--atomic-editor-fg`               | `#dcddde`                                           |
| `--atomic-editor-fg-muted`         | `#888`                                              |
| `--atomic-editor-fg-faint`         | `#666`                                              |
| `--atomic-editor-bg`               | `#1e1e1e`                                           |
| `--atomic-editor-bg-panel`         | `#252525`                                           |
| `--atomic-editor-bg-surface`       | `#2d2d2d`                                           |
| `--atomic-editor-border`           | `#3d3d3d`                                           |
| `--atomic-editor-accent`           | `#7c3aed`                                           |
| `--atomic-editor-accent-bright`    | `#a78bfa`                                           |
| `--atomic-editor-accent-soft`      | blockquote rail / reveal tint                       |
| `--atomic-editor-link`             | `#818cf8`                                           |
| `--atomic-editor-link-hover`       | `#a5b4fc`                                           |
| `--atomic-editor-code-bg`          | subtle dark panel                                   |
| `--atomic-editor-selection-bg`     | accent-tinted 28%                                   |
| **Code-token colors** (Palenight)  |                                                     |
| `--atomic-editor-hl-keyword`       | `#c792ea`                                           |
| `--atomic-editor-hl-string`        | `#c3e88d`                                           |
| `--atomic-editor-hl-number`        | `#f78c6c`                                           |
| `--atomic-editor-hl-comment`       | `#6a7a82`                                           |
| `--atomic-editor-hl-type`          | `#ffcb6b`                                           |
| `--atomic-editor-hl-function`      | `#82aaff`                                           |
| `--atomic-editor-hl-property`      | `#82aaff`                                           |
| `--atomic-editor-hl-regexp`        | `#f07178`                                           |
| `--atomic-editor-hl-escape`        | `#89ddff`                                           |
| `--atomic-editor-hl-tag`           | `#f07178`                                           |
| `--atomic-editor-hl-variable`      | `#eeffff`                                           |
| `--atomic-editor-hl-operator`      | `#89ddff`                                           |
| `--atomic-editor-hl-invalid`       | `#ff5370`                                           |

## Extending with plugins

CodeMirror 6 is extension-based, and so is this package. Pass any
number of CM6 extensions via the `extensions` prop to layer in
autocomplete sources, custom decorations, domain-specific keymaps,
collaboration (yjs), vim mode, or anything else. (The
[wiki-links](#wiki-links) extension above is built with exactly this hook.)

```ts
import { h } from "vue";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";

const hashtags = autocompletion({
  override: [
    (ctx: CompletionContext) => {
      const match = ctx.matchBefore(/#\w*$/);
      if (!match) return null;
      return {
        from: match.from + 1,
        options: myTagStore.list().map((tag) => ({ label: tag })),
      };
    },
  ],
});

h(AtomicCodeMirrorEditor, {
  markdownSource: "…",
  extensions: [hashtags],
});
```

Consumer extensions are appended after the built-ins, so wrap a custom
keymap in `Prec.high` (from `@codemirror/state`) if it needs to beat
the default bindings. The array is captured at mount — pass a stable
reference unless you want a remount.

### Low-level composition

If the Vue wrapper's extension set is too opinionated, every piece
is exported individually so you can assemble a fully custom editor:

```ts
import {
  inlinePreview, // live preview decorations
  imageBlocks, // rendered image widgets
  tables, // WYSIWYG table widget
  wikiLinks, // [[...]] links
  atomicEditorTheme,
  atomicMarkdownSyntax,
  extendEmphasisPair,
} from "@atomic-editor/editor";
```

You could build an editor that includes `inlinePreview()` + `tables()`
but skips `atomicEditorTheme` for your own `EditorView.theme({...})`,
or swap `atomicMarkdownSyntax` for a custom
`syntaxHighlighting(HighlightStyle.define([...]))`. At that point
you're outside the Vue wrapper and in plain CM6 territory.

## Design notes

See [docs/architecture.md](./docs/architecture.md) for the full design
rationale. Short version:

- **Raw markdown is the source of truth.** All decorations are
  view-only — copy, save, and round-trip to any markdown parser are
  identical to what you'd expect from a plain textarea.
- **No layout shifts.** Every line has a stable height regardless of
  cursor position. Inline decorations hide syntax tokens on inactive
  lines without changing line heights.
- **Narrow invalidation.** Decoration rebuilds only touch lines whose
  content (or surrounding trigger characters) changed, so editing a
  paragraph in a 50KB doc costs O(change size), not O(doc).
- **Mouse-freeze guard.** Clicks don't trigger a decoration rebuild
  mid-interaction — eliminates a class of cursor-drift bugs.
- **iOS-aware.** Momentum-scroll halts (image remount jank, heightmap
  drift, anchor conflicts) were tracked down and fixed; the demo's
  sample-size picker doubles as a stress harness for spotting any
  regressions.

## Contributing

Development requires Node.js 20.19+, 22.12+, or 24+. The published editor
itself continues to support Node.js 18 and newer.

```bash
git clone https://github.com/kenforthewin/atomic-editor
cd atomic-editor
npm install
npm run dev        # demo dev server at http://localhost:5173
npm test           # vitest unit tests
npm run build      # tsc emit to dist/
npm run test:e2e   # legacy probes + deterministic browser suites
npm run test:package  # pack and build a clean consumer app
```

The browser harness combines the broad legacy probe suite with focused,
isolated Playwright Test specs. Chromium runs the full matrix; Firefox and
WebKit run the compatibility smoke tests. See
[docs/testing.md](./docs/testing.md) for the layers, commands, and the rule for
turning a bug fix into a lasting regression test.

Because the editor ships inside [Atomic](https://github.com/kenforthewin/atomic),
real user documents are its de-facto fuzz corpus — odd inputs (multi-line
link titles, over-escaped RSS imports, wide tables) tend to surface there
first, and fixes land here. Issues and PRs welcome.

## License

MIT. See [LICENSE](./LICENSE).
