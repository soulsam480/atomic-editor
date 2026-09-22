import { type MarkdownConfig } from '@lezer/markdown';
/** Match one complete highlight span using the same rules as the Lezer parser. */
export declare function matchHighlight(text: string, from: number): {
    contentFrom: number;
    contentTo: number;
    end: number;
} | null;
export declare const highlightMarkdown: MarkdownConfig;
//# sourceMappingURL=highlight.d.ts.map