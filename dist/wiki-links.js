import { autocompletion } from '@codemirror/autocomplete';
import { Prec, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { readOnlyFacet } from './read-only';
const WIKI_LINK_QUERY_RE = /\[\[[^\]\n|]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
// Cap on cached resolutions so a long session scrolling through many
// distinct wiki-link targets doesn't grow the map without bound. The
// resolver re-fetches any target that gets evicted and later returns
// to the viewport, so eviction only costs an occasional re-resolve.
const MAX_RESOLVED_ENTRIES = 600;
const wikiLinkResolved = StateEffect.define();
class WikiLinkWidget extends WidgetType {
    constructor(target, label, status) {
        super();
        Object.defineProperty(this, "target", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: target
        });
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: label
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: status
        });
    }
    eq(other) {
        return this.target === other.target && this.label === other.label && this.status === other.status;
    }
    toDOM() {
        const span = document.createElement('span');
        span.className = `cm-atomic-wiki-link cm-atomic-wiki-link-${this.status}`;
        span.dataset.wikiLinkTarget = this.target;
        span.textContent = this.label;
        return span;
    }
    ignoreEvent() {
        return false;
    }
}
class WikiLinkResolverPlugin {
    constructor(view, config, decorationField) {
        Object.defineProperty(this, "view", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: view
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "decorationField", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: decorationField
        });
        Object.defineProperty(this, "pending", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "destroyed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.resolveVisibleLinks();
    }
    update(update) {
        const readOnlyChanged = update.startState.facet(readOnlyFacet) !==
            update.state.facet(readOnlyFacet);
        if (update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            readOnlyChanged) {
            this.resolveVisibleLinks();
        }
    }
    destroy() {
        this.destroyed = true;
    }
    resolveVisibleLinks() {
        if (!this.config.resolve)
            return;
        const links = findWikiLinksInVisibleRanges(this.view.state.doc, this.view.visibleRanges);
        const resolved = this.view.state.field(this.decorationField).resolved;
        const readOnly = this.view.state.facet(readOnlyFacet);
        for (const link of links) {
            if (link.label ||
                (!readOnly && isSelectionInsideLink(this.view.state, link)) ||
                !shouldResolveWikiLink(this.config, link.target) ||
                this.pending.has(link.target) ||
                resolved.has(link.target)) {
                continue;
            }
            this.resolve(link.target);
        }
    }
    resolve(target) {
        if (!this.config.resolve)
            return;
        this.pending.add(target);
        this.config.resolve(target)
            .then((resolved) => {
            if (!this.destroyed) {
                this.view.dispatch({ effects: wikiLinkResolved.of({ target, resolved }) });
            }
        })
            .catch(() => {
            if (!this.destroyed) {
                this.view.dispatch({ effects: wikiLinkResolved.of({ target, resolved: null }) });
            }
        })
            .finally(() => {
            this.pending.delete(target);
        });
    }
}
export function wikiLinks(config = {}) {
    const field = StateField.define({
        create(state) {
            const resolved = new Map();
            return { resolved, decorations: buildDecorations(state, resolved, config) };
        },
        update(value, transaction) {
            let resolved = value.resolved;
            let resolutionChanged = false;
            for (const effect of transaction.effects) {
                if (!effect.is(wikiLinkResolved))
                    continue;
                if (resolved === value.resolved)
                    resolved = new Map(value.resolved);
                resolved.set(effect.value.target, effect.value.resolved);
                resolutionChanged = true;
            }
            // Evict oldest insertions (Map preserves insertion order) once the
            // cache exceeds the cap, keeping memory flat across long sessions.
            if (resolutionChanged && resolved.size > MAX_RESOLVED_ENTRIES) {
                let overflow = resolved.size - MAX_RESOLVED_ENTRIES;
                for (const key of resolved.keys()) {
                    if (overflow-- <= 0)
                        break;
                    resolved.delete(key);
                }
            }
            const readOnlyChanged = transaction.startState.facet(readOnlyFacet) !==
                transaction.state.facet(readOnlyFacet);
            if (transaction.docChanged ||
                transaction.selection ||
                resolutionChanged ||
                readOnlyChanged) {
                return { resolved, decorations: buildDecorations(transaction.state, resolved, config) };
            }
            return { resolved, decorations: value.decorations.map(transaction.changes) };
        },
        provide: (fieldValue) => EditorView.decorations.from(fieldValue, (value) => value.decorations),
    });
    return [
        field,
        ViewPlugin.define((view) => new WikiLinkResolverPlugin(view, config, field)),
        makeWikiLinkPointerGuard(config),
        wikiLinkEditKeymap(),
        wikiLinkCompletions(config),
        makeWikiLinkClickHandler(config),
    ];
}
function wikiLinkEditKeymap() {
    return Prec.highest(keymap.of([
        {
            key: 'Backspace',
            run: revealWikiLinkBeforeCursor,
        },
    ]));
}
function wikiLinkCompletions(config) {
    if (!config.suggest)
        return [];
    return autocompletion({
        activateOnTyping: true,
        icons: false,
        override: [async (context) => completionSource(context, config)],
    });
}
async function completionSource(context, config) {
    if (!config.suggest)
        return null;
    const match = context.matchBefore(WIKI_LINK_QUERY_RE);
    if (!match || (match.from === match.to && !context.explicit))
        return null;
    const query = match.text.slice(2);
    const debounceMs = config.debounceMs ?? 120;
    if (debounceMs > 0) {
        await delay(debounceMs);
        if (context.aborted)
            return null;
    }
    const suggestions = dedupeSuggestions(await config.suggest(query)).slice(0, config.maxSuggestions ?? 12);
    if (context.aborted)
        return null;
    return {
        from: match.from + 2,
        to: context.pos,
        options: suggestions.map((suggestion) => toCompletion(suggestion, config)),
        validFor: /^[^\]\n|]*$/,
    };
}
function toCompletion(suggestion, config) {
    return {
        label: suggestion.label,
        detail: suggestion.detail,
        type: 'text',
        boost: suggestion.boost,
        apply: (view, completion, from, to) => {
            const selected = completion.suggestion;
            const insert = (config.serializeSuggestion ?? defaultSerializeSuggestion)(selected);
            const replaceTo = view.state.doc.sliceString(to, to + 2) === ']]' ? to + 2 : to;
            view.dispatch({
                changes: { from, to: replaceTo, insert },
                selection: { anchor: from + insert.length },
            });
        },
        suggestion,
    };
}
function makeWikiLinkClickHandler(config) {
    return EditorView.domEventHandlers({
        click(event) {
            if (!shouldOpenFromEvent(config, event))
                return false;
            if (event.button !== 0)
                return false;
            const link = wikiLinkElementFromEvent(event);
            const wikiTarget = link?.dataset.wikiLinkTarget;
            if (!wikiTarget)
                return false;
            event.preventDefault();
            event.stopPropagation();
            config.onOpen(wikiTarget);
            return true;
        },
    });
}
function makeWikiLinkPointerGuard(config) {
    return ViewPlugin.fromClass(class {
        constructor(view) {
            Object.defineProperty(this, "view", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: view
            });
            Object.defineProperty(this, "onPointerDown", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: (event) => {
                    if (!shouldOpenFromEvent(config, event))
                        return;
                    if (event.button !== 0)
                        return;
                    const link = wikiLinkElementFromEvent(event, this.view.contentDOM);
                    if (!link)
                        return;
                    // This pointerdown is an open-link gesture, not an edit gesture.
                    // Stop CM6 from moving the cursor into the wiki-link source and
                    // revealing the raw `[[target|label]]` before the click opens.
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            });
            view.dom.addEventListener('pointerdown', this.onPointerDown, true);
        }
        destroy() {
            this.view.dom.removeEventListener('pointerdown', this.onPointerDown, true);
        }
    });
}
function shouldOpenFromEvent(config, event) {
    if (!config.onOpen)
        return false;
    if (event.shiftKey || event.altKey)
        return false;
    return config.openOnClick !== false || event.metaKey || event.ctrlKey;
}
function wikiLinkElementFromEvent(event, root) {
    const target = event.target;
    if (!(target instanceof Element))
        return null;
    const link = target.closest('[data-wiki-link-target]');
    if (!link || (root && !root.contains(link)))
        return null;
    return link;
}
function buildDecorations(state, resolved, config) {
    const builder = new RangeSetBuilder();
    const links = findWikiLinksInVisibleRanges(state.doc, [{ from: 0, to: state.doc.length }]);
    const readOnly = state.facet(readOnlyFacet);
    for (const link of links) {
        if (!isSingleLineRange(state, link.from, link.to))
            continue;
        if (!readOnly && isSelectionInsideLink(state, link)) {
            builder.add(link.from, link.to, Decoration.mark({ class: 'cm-atomic-wiki-link-active' }));
            continue;
        }
        if (link.label && link.labelFrom != null && link.labelTo != null && link.labelFrom < link.labelTo) {
            builder.add(link.from, link.labelFrom, Decoration.mark({ class: 'cm-atomic-wiki-link-hidden-syntax' }));
            builder.add(link.labelFrom, link.labelTo, Decoration.mark({
                class: 'cm-atomic-wiki-link cm-atomic-wiki-link-resolved',
                attributes: { 'data-wiki-link-target': link.target },
            }));
            builder.add(link.labelTo, link.to, Decoration.mark({ class: 'cm-atomic-wiki-link-hidden-syntax' }));
            continue;
        }
        if (!config.resolve || !shouldResolveWikiLink(config, link.target)) {
            continue;
        }
        const target = resolved.get(link.target);
        const label = target === undefined ? 'Wiki link' : target?.label.trim() || 'Missing link';
        const status = target === undefined
            ? 'loading'
            : target
                ? target.status ?? 'resolved'
                : 'missing';
        builder.add(link.from, link.to, Decoration.mark({ class: 'cm-atomic-wiki-link-hidden-syntax' }));
        builder.add(link.to, link.to, Decoration.widget({
            widget: new WikiLinkWidget(link.target, label, status),
            side: -1,
        }));
    }
    return builder.finish();
}
function shouldResolveWikiLink(config, target) {
    return config.shouldResolve?.(target) ?? true;
}
function revealWikiLinkBeforeCursor(view) {
    if (view.state.facet(readOnlyFacet))
        return false;
    const range = view.state.selection.main;
    if (!range.empty)
        return false;
    const cursor = range.head;
    const link = findWikiLinkEndingAt(view.state.doc, cursor);
    if (!link || link.label)
        return false;
    view.dispatch({
        selection: { anchor: Math.max(link.from + 2, link.to - 2) },
        scrollIntoView: true,
    });
    return true;
}
function findWikiLinkEndingAt(doc, pos) {
    if (pos <= 0 || pos > doc.length)
        return null;
    const line = doc.lineAt(pos);
    return findWikiLinksInLine(line.text, line.from).find((link) => link.to === pos) ?? null;
}
function findWikiLinksInVisibleRanges(doc, ranges) {
    const links = [];
    for (const range of ranges) {
        const firstLine = doc.lineAt(range.from);
        const lastLine = doc.lineAt(Math.max(range.from, range.to - 1));
        const fence = fenceStateBeforeLine(doc, firstLine.number);
        for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber++) {
            const line = doc.line(lineNumber);
            const text = line.text;
            const fenceMatch = text.match(FENCE_RE);
            if (!fence.marker && fenceMatch) {
                fence.marker = fenceMatch[1][0];
                fence.length = fenceMatch[1].length;
                continue;
            }
            if (fence.marker) {
                if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) {
                    fence.marker = null;
                    fence.length = 0;
                }
                continue;
            }
            links.push(...findWikiLinksInLine(text, line.from));
        }
    }
    return links;
}
function findWikiLinksInLine(text, lineStart) {
    const links = [];
    const codeSpans = inlineCodeSpans(text);
    let searchFrom = 0;
    while (searchFrom < text.length) {
        const open = text.indexOf('[[', searchFrom);
        if (open === -1)
            break;
        if (isInsideAny(open, codeSpans)) {
            searchFrom = open + 2;
            continue;
        }
        const close = text.indexOf(']]', open + 2);
        if (close === -1)
            break;
        if (isInsideAny(close, codeSpans)) {
            searchFrom = close + 2;
            continue;
        }
        const body = text.slice(open + 2, close);
        const pipe = body.indexOf('|');
        const rawTarget = pipe === -1 ? body : body.slice(0, pipe);
        const rawLabel = pipe === -1 ? null : body.slice(pipe + 1);
        const target = rawTarget.trim();
        if (!target) {
            searchFrom = close + 2;
            continue;
        }
        let label = null;
        let labelFrom = null;
        let labelTo = null;
        if (rawLabel != null) {
            const labelStart = leadingWhitespaceLength(rawLabel);
            const labelEnd = rawLabel.length - trailingWhitespaceLength(rawLabel);
            label = rawLabel.slice(labelStart, labelEnd);
            labelFrom = lineStart + open + 2 + pipe + 1 + labelStart;
            labelTo = lineStart + open + 2 + pipe + 1 + labelEnd;
        }
        links.push({
            from: lineStart + open,
            to: lineStart + close + 2,
            target,
            label,
            labelFrom,
            labelTo,
        });
        searchFrom = close + 2;
    }
    return links;
}
function fenceStateBeforeLine(doc, lineNumber) {
    const fence = { marker: null, length: 0 };
    for (let current = 1; current < lineNumber; current++) {
        const match = doc.line(current).text.match(FENCE_RE);
        if (!match)
            continue;
        const marker = match[1][0];
        const length = match[1].length;
        if (!fence.marker) {
            fence.marker = marker;
            fence.length = length;
        }
        else if (marker === fence.marker && length >= fence.length) {
            fence.marker = null;
            fence.length = 0;
        }
    }
    return fence;
}
function inlineCodeSpans(text) {
    const spans = [];
    let pos = 0;
    while (pos < text.length) {
        const start = text.indexOf('`', pos);
        if (start === -1)
            break;
        let tickCount = 1;
        while (text[start + tickCount] === '`')
            tickCount++;
        const needle = '`'.repeat(tickCount);
        const end = text.indexOf(needle, start + tickCount);
        if (end === -1)
            break;
        spans.push({ from: start, to: end + tickCount });
        pos = end + tickCount;
    }
    return spans;
}
function isSelectionInsideLink(state, link) {
    return state.selection.ranges.some((range) => {
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        if (from === to)
            return from > link.from && from < link.to;
        return from < link.to && to > link.from;
    });
}
function isSingleLineRange(state, from, to) {
    const end = Math.max(from, to - 1);
    return state.doc.lineAt(from).number === state.doc.lineAt(end).number;
}
function dedupeSuggestions(suggestions) {
    const seen = new Set();
    const deduped = [];
    for (const suggestion of suggestions) {
        if (seen.has(suggestion.target))
            continue;
        seen.add(suggestion.target);
        deduped.push(suggestion);
    }
    return deduped;
}
function defaultSerializeSuggestion(suggestion) {
    return `${suggestion.target}|${escapeLabel(suggestion.label)}]]`;
}
function escapeLabel(label) {
    return label.replace(/[\]\|]/g, ' ').replace(/\s+/g, ' ').trim();
}
function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function isInsideAny(pos, spans) {
    return spans.some((span) => pos >= span.from && pos < span.to);
}
function leadingWhitespaceLength(value) {
    const match = value.match(/^\s*/);
    return match?.[0].length ?? 0;
}
function trailingWhitespaceLength(value) {
    const match = value.match(/\s*$/);
    return match?.[0].length ?? 0;
}
//# sourceMappingURL=wiki-links.js.map