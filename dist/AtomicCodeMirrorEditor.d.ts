import { type PropType, type ShallowRef } from "vue";
import type { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { type AtomicCodeMirrorEditorHandle } from "./editor-runtime";
export type { AtomicCodeMirrorEditorHandle };
export interface AtomicCodeMirrorEditorProps {
    markdownSource: string;
    documentId?: string;
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
 * const { handle } = useAtomicEditorHandle();
 * h(AtomicCodeMirrorEditor, { ref: handle, markdownSource: '# hi' });
 * handle.value?.revealText('needle');
 * ```
 */
export declare function useAtomicEditorHandle(): {
    handle: ShallowRef<AtomicCodeMirrorEditorHandle | null>;
};
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
export declare const AtomicCodeMirrorEditor: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    markdownSource: {
        type: StringConstructor;
        required: true;
    };
    documentId: {
        type: StringConstructor;
        default: undefined;
    };
    initialRevealText: {
        type: PropType<string | null>;
        default: null;
    };
    blurEditorOnMount: {
        type: BooleanConstructor;
        default: boolean;
    };
    readOnly: {
        type: BooleanConstructor;
        default: boolean;
    };
    codeLanguages: {
        type: PropType<readonly LanguageDescription[]>;
        default: () => readonly LanguageDescription[];
    };
    extensions: {
        type: PropType<readonly Extension[]>;
        default: () => readonly Extension[];
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    markdownChange: (markdown: string) => boolean;
    linkClick: (url: string) => boolean;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    markdownSource: {
        type: StringConstructor;
        required: true;
    };
    documentId: {
        type: StringConstructor;
        default: undefined;
    };
    initialRevealText: {
        type: PropType<string | null>;
        default: null;
    };
    blurEditorOnMount: {
        type: BooleanConstructor;
        default: boolean;
    };
    readOnly: {
        type: BooleanConstructor;
        default: boolean;
    };
    codeLanguages: {
        type: PropType<readonly LanguageDescription[]>;
        default: () => readonly LanguageDescription[];
    };
    extensions: {
        type: PropType<readonly Extension[]>;
        default: () => readonly Extension[];
    };
}>> & Readonly<{
    onLinkClick?: ((url: string) => any) | undefined;
    onMarkdownChange?: ((markdown: string) => any) | undefined;
}>, {
    documentId: string;
    initialRevealText: string | null;
    blurEditorOnMount: boolean;
    readOnly: boolean;
    codeLanguages: readonly LanguageDescription[];
    extensions: readonly Extension[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=AtomicCodeMirrorEditor.d.ts.map