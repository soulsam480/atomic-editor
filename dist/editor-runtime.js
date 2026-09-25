import { Decoration, EditorView, drawSelection, dropCursor, highlightActiveLine, highlightSpecialChars, keymap, rectangularSelection, } from "@codemirror/view";
import { Compartment, EditorState, StateEffect, StateField, } from "@codemirror/state";
import { indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo, } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { SearchQuery } from "@codemirror/search";
import { atomicEditorTheme, atomicMarkdownSyntax } from "./atomic-theme";
import { autoCloseCodeFence, extendEmphasisPair, startAsteriskList } from "./edit-helpers";
import { imageBlocks } from "./image-blocks";
import { highlightMarkdown } from "./highlight";
import { inlinePreview } from "./inline-preview";
import { readOnlyExtension } from "./read-only";
import { tables } from "./table-widget";
// Stable references so callers that don't pass `codeLanguages` or
// `extensions` don't force a rebuild.
const EMPTY_CODE_LANGUAGES = [];
const EMPTY_EXTENSIONS = [];
function defaultOpenLink(url) {
    try {
        window.open(url, "_blank", "noopener,noreferrer");
    }
    catch {
        // window.open can throw in sandboxed iframes etc.
    }
}
export function createEditorRuntime(parent, options) {
    const { markdown: markdownSource, initialRevealText, readOnly = false, onMarkdownChange, onLinkClick, codeLanguages = EMPTY_CODE_LANGUAGES, extensions = EMPTY_EXTENSIONS, } = options;
    const linkClick = (url) => {
        if (onLinkClick)
            onLinkClick(url);
        else
            defaultOpenLink(url);
    };
    const readOnlyCompartment = new Compartment();
    let clearRevealTimer = null;
    let destroyed = false;
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: markdownSource,
            extensions: [
                highlightSpecialChars(),
                history(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                indentOnInput(),
                rectangularSelection(),
                highlightActiveLine(),
                // Obsidian-style bracket pairing.
                closeBrackets(),
                startAsteriskList,
                extendEmphasisPair,
                autoCloseCodeFence,
                EditorView.lineWrapping,
                // GFM via base: markdownLanguage — tables, strikethrough, task
                // lists, autolinks. Without this, the parser is pure CommonMark
                // and inline-preview never sees Task / Table.
                markdown({
                    base: markdownLanguage,
                    codeLanguages: [...codeLanguages],
                    extensions: highlightMarkdown,
                }),
                // Extend closeBrackets to markdown's symmetric delimiters.
                markdownLanguage.data.of({
                    closeBrackets: {
                        brackets: ["(", "[", "{", "'", '"', "*", "_", "`"],
                    },
                }),
                atomicMarkdownSyntax,
                atomicEditorTheme,
                keymap.of([
                    ...closeBracketsKeymap,
                    ...historyKeymap,
                    ...markdownKeymap,
                    indentWithTab,
                    ...defaultKeymap,
                ]),
                tables({ onLinkClick: linkClick }),
                imageBlocks(),
                inlinePreview({ onLinkClick: linkClick }),
                EditorView.updateListener.of((update) => {
                    if (!update.docChanged)
                        return;
                    onMarkdownChange?.(update.state.doc.toString());
                }),
                initialRevealField,
                // Read-only state lives in a compartment so it can toggle in
                // place. Seeded from the option at construction.
                readOnlyCompartment.of(readOnlyExtension(readOnly)),
                // Consumer extensions last so they compose on top of the
                // built-ins (e.g. a custom keymap wrapped in Prec.high will beat
                // the default keymap above). Extensions intentionally trail the
                // change listener so consumer update-listeners fire after
                // onMarkdownChange.
                ...extensions,
            ],
        }),
    });
    // "Reveal" is a one-shot highlight-and-scroll: paint the first match
    // with a subtle fade-out background and scroll it near the top of the
    // viewport. No cursor move, no search panel.
    function reveal(queryText) {
        if (destroyed)
            return;
        const match = findInitialRevealRange(view.state.doc, queryText);
        if (!match)
            return;
        const { from, to } = match;
        view.dispatch({
            effects: [
                setInitialReveal.of({ from, to }),
                EditorView.scrollIntoView(from, {
                    y: "start",
                    yMargin: 72,
                }),
            ],
        });
        // After CM6 paints the highlight, try to scroll the line NEAR THE
        // TOP of whatever scrolls above it — CM6's built-in scrollIntoView
        // only pins the position to the view's own scroller, which is fine
        // until the editor is embedded in a larger scrolling surface.
        requestAnimationFrame(() => {
            if (destroyed)
                return;
            const el = view.dom.querySelector(".cm-initialRevealMatch")?.closest(".cm-line") ??
                view.dom.querySelector(".cm-initialRevealMatch");
            if (el instanceof HTMLElement)
                scrollMatchNearTop(el, 72);
        });
        if (clearRevealTimer !== null)
            window.clearTimeout(clearRevealTimer);
        clearRevealTimer = window.setTimeout(() => {
            if (destroyed)
                return;
            view.dispatch({ effects: setInitialReveal.of(null) });
            clearRevealTimer = null;
        }, REVEAL_FADE_MS);
    }
    if (initialRevealText)
        reveal(initialRevealText);
    const setReadOnly = (next) => {
        view.dispatch({
            effects: readOnlyCompartment.reconfigure(readOnlyExtension(next)),
        });
    };
    const handle = {
        view,
        focus: () => view.focus(),
        undo: () => undo(view),
        redo: () => redo(view),
        revealText: (query) => {
            if (query)
                reveal(query);
        },
        getMarkdown: () => view.state.doc.toString(),
        getContentDOM: () => view.contentDOM,
        setReadOnly,
    };
    const destroy = () => {
        destroyed = true;
        if (clearRevealTimer !== null) {
            window.clearTimeout(clearRevealTimer);
            clearRevealTimer = null;
        }
        view.destroy();
    };
    return { view, handle, setReadOnly, reveal, destroy };
}
// ---------------------------------------------------------------------
// Initial reveal
// ---------------------------------------------------------------------
const setInitialReveal = StateEffect.define();
const initialRevealField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
        for (const effect of tr.effects) {
            if (!effect.is(setInitialReveal))
                continue;
            if (!effect.value) {
                decorations = Decoration.none;
                continue;
            }
            decorations = Decoration.set([
                Decoration.mark({
                    class: "cm-initialRevealMatch",
                }).range(effect.value.from, effect.value.to),
            ]);
        }
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});
const REVEAL_FADE_MS = 3200;
function findInitialRevealRange(docText, queryText) {
    for (const candidate of buildRevealCandidates(queryText)) {
        const query = new SearchQuery({ search: candidate });
        if (!query.valid || !query.search)
            continue;
        const cursor = query.getCursor(docText);
        const first = cursor.next();
        if (!first.done && first.value.from !== first.value.to) {
            return first.value;
        }
    }
    return null;
}
// Try progressively-looser variants of the query so hits still resolve
// when the consumer's search returned an LLM-massaged snippet that
// doesn't match the source byte-for-byte (different whitespace,
// truncated, multi-line collapsed).
function buildRevealCandidates(queryText) {
    const candidates = new Set();
    const trimmed = queryText.trim();
    if (!trimmed)
        return [];
    candidates.add(trimmed);
    const collapsed = trimmed.replace(/\s+/g, " ").trim();
    if (collapsed)
        candidates.add(collapsed);
    for (const line of trimmed
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)) {
        candidates.add(line);
        const lineCollapsed = line.replace(/\s+/g, " ").trim();
        if (lineCollapsed)
            candidates.add(lineCollapsed);
    }
    if (collapsed.length > 140)
        candidates.add(collapsed.slice(0, 140).trim());
    if (collapsed.length > 80)
        candidates.add(collapsed.slice(0, 80).trim());
    // Skip candidates that are too short to be meaningfully
    // distinguishing — but always keep the original trimmed query as a
    // last-ditch option.
    return [...candidates].filter((candidate) => candidate.length >= 12 || candidate === trimmed);
}
function scrollMatchNearTop(match, offset) {
    const scrollParent = findScrollParent(match);
    if (!scrollParent) {
        match.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    const parentRect = scrollParent.getBoundingClientRect();
    const matchRect = match.getBoundingClientRect();
    const nextTop = scrollParent.scrollTop + (matchRect.top - parentRect.top) - offset;
    scrollParent.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "smooth",
    });
}
function findScrollParent(node) {
    let current = node.parentElement;
    while (current) {
        const { overflowY } = window.getComputedStyle(current);
        if ((overflowY === "auto" || overflowY === "scroll") &&
            current.scrollHeight > current.clientHeight) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}
//# sourceMappingURL=editor-runtime.js.map