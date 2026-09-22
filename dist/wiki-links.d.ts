import { type Extension } from '@codemirror/state';
export type WikiLinkStatus = 'resolved' | 'loading' | 'missing' | 'unresolved';
export interface WikiLinkSuggestion {
    target: string;
    label: string;
    detail?: string;
    boost?: number;
}
export interface WikiLinkResolvedTarget {
    target: string;
    label: string;
    status?: Exclude<WikiLinkStatus, 'loading'>;
}
export interface WikiLinksConfig {
    suggest?: (query: string) => Promise<WikiLinkSuggestion[]>;
    resolve?: (target: string) => Promise<WikiLinkResolvedTarget | null>;
    shouldResolve?: (target: string) => boolean;
    onOpen?: (target: string) => void;
    openOnClick?: boolean;
    serializeSuggestion?: (suggestion: WikiLinkSuggestion) => string;
    maxSuggestions?: number;
    debounceMs?: number;
}
export declare function wikiLinks(config?: WikiLinksConfig): Extension;
//# sourceMappingURL=wiki-links.d.ts.map