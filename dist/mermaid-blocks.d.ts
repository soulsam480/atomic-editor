import { type EditorState, type Extension } from "@codemirror/state";
import { type DecorationSet } from "@codemirror/view";
export interface MermaidFence {
    from: number;
    to: number;
    code: string;
}
export interface MermaidBlocksConfig {
    /**
     * Width cap for the rendered SVG, in pixels. Unset means Pele sizes the
     * diagram to its content.
     */
    maxWidth?: number;
}
export declare function mermaidFences(state: EditorState): MermaidFence[];
export declare function buildMermaidBlocks(state: EditorState, options?: {
    includeSelection?: boolean;
    maxWidth?: number;
}): DecorationSet;
export declare function mermaidBlocks(config?: MermaidBlocksConfig): Extension;
//# sourceMappingURL=mermaid-blocks.d.ts.map