import { defineComponent, getCurrentInstance, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, } from "vue";
import { createEditorRuntime, } from "./editor-runtime";
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
/**
 * Typed ref helper for the exposed imperative handle. Vue's
 * `defineComponent` + `expose()` does not surface exposed members on the
 * component instance type, so bind this helper's `setHandle` as the
 * component `ref` and read methods off `handle.value`.
 *
 * ```ts
 * const { handle } = useAtomicEditorHandle();
 * h(AtomicCodeMirrorEditor, { ref: handle, markdownSource: '# hi' });
 * handle.value?.revealText('needle');
 * ```
 */
export function useAtomicEditorHandle() {
    const handle = shallowRef(null);
    return { handle };
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
    name: "AtomicCodeMirrorEditor",
    props: {
        markdownSource: { type: String, required: true },
        documentId: { type: String, default: undefined },
        initialRevealText: {
            type: String,
            default: null,
        },
        blurEditorOnMount: { type: Boolean, default: false },
        readOnly: { type: Boolean, default: false },
        codeLanguages: {
            type: Array,
            default: () => EMPTY_CODE_LANGUAGES,
        },
        extensions: {
            type: Array,
            default: () => EMPTY_EXTENSIONS,
        },
    },
    emits: {
        markdownChange: (markdown) => typeof markdown === "string",
        linkClick: (url) => typeof url === "string",
    },
    setup(props, { emit, expose }) {
        const rootEl = ref(null);
        let runtime = null;
        // Captured during setup: `getCurrentInstance()` is only valid inside
        // setup, but `linkClick` runs later from a CM6 event handler.
        const instance = getCurrentInstance();
        const identity = () => props.documentId ?? props.markdownSource;
        const linkClick = (url) => {
            const hasListener = Boolean(instance?.vnode.props?.onLinkClick);
            if (hasListener)
                emit("linkClick", url);
            else
                defaultOpenLink(url);
        };
        const teardown = () => {
            runtime?.destroy();
            runtime = null;
        };
        const mountRuntime = () => {
            const parent = rootEl.value;
            if (!parent)
                return;
            runtime = createEditorRuntime(parent, {
                markdown: props.markdownSource,
                initialRevealText: props.initialRevealText,
                readOnly: props.readOnly,
                codeLanguages: props.codeLanguages,
                extensions: props.extensions,
                onMarkdownChange: (markdown) => emit("markdownChange", markdown),
                onLinkClick: linkClick,
            });
        };
        onMounted(mountRuntime);
        onBeforeUnmount(teardown);
        // Document identity keys the view: swapping `documentId` (or the
        // initial source when no id is given) remounts so cursor / undo
        // state can't bleed across documents.
        watch(() => identity(), () => {
            teardown();
            mountRuntime();
        });
        // Read-only is compartment-backed: reconfigure in place (scroll
        // state preserved) rather than remounting.
        watch(() => props.readOnly, (next) => runtime?.setReadOnly(next));
        watch(() => props.initialRevealText, (next) => {
            if (next)
                runtime?.reveal(next);
        });
        expose({
            // Exposed as a getter so consumers read the live `EditorView`
            // (matching the handle type), not a function.
            get view() {
                return runtime?.handle.view;
            },
            focus: () => runtime?.handle.focus(),
            undo: () => runtime?.handle.undo(),
            redo: () => runtime?.handle.redo(),
            revealText: (query) => runtime?.handle.revealText(query),
            getMarkdown: () => runtime?.handle.getMarkdown() ?? "",
            getContentDOM: () => runtime?.handle.getContentDOM() ?? null,
            setReadOnly: (next) => runtime?.handle.setReadOnly(next),
        });
        return () => h("div", { ref: rootEl, class: "atomic-cm-editor" });
    },
});
//# sourceMappingURL=AtomicCodeMirrorEditor.js.map