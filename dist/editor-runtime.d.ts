import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { type LanguageDescription } from '@codemirror/language';
export interface AtomicCodeMirrorEditorHandle {
    focus: () => void;
    undo: () => void;
    redo: () => void;
    openSearch: (query?: string) => void;
    closeSearch: () => void;
    revealText: (query: string) => void;
    isSearchOpen: () => boolean;
    getMarkdown: () => string;
    getContentDOM: () => HTMLElement | null;
    setReadOnly: (readOnly: boolean) => void;
}
export interface CreateEditorRuntimeOptions {
    markdown: string;
    initialSearchText?: string | null;
    initialRevealText?: string | null;
    readOnly?: boolean;
    onMarkdownChange?: (markdown: string) => void;
    onLinkClick?: (url: string) => void;
    codeLanguages?: readonly LanguageDescription[];
    extensions?: readonly Extension[];
}
export interface EditorRuntime {
    view: EditorView;
    handle: AtomicCodeMirrorEditorHandle;
    setReadOnly: (readOnly: boolean) => void;
    reveal: (query: string) => void;
    destroy: () => void;
}
export declare function createEditorRuntime(parent: HTMLElement, options: CreateEditorRuntimeOptions): EditorRuntime;
//# sourceMappingURL=editor-runtime.d.ts.map