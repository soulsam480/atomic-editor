import { Facet, type Extension } from '@codemirror/state';
interface TableModel {
    header: string[];
    rows: string[][];
}
export declare function splitRowCells(line: string): string[];
export declare function serializeTable(model: TableModel): string;
type CellToken = {
    type: 'text';
    text: string;
} | {
    type: 'strong';
    delim: '**' | '__';
    children: CellToken[];
} | {
    type: 'em';
    delim: '*' | '_';
    children: CellToken[];
} | {
    type: 'strike';
    children: CellToken[];
} | {
    type: 'highlight';
    children: CellToken[];
} | {
    type: 'link';
    textChildren: CellToken[];
    url: string;
};
export declare function parseCellInline(raw: string): CellToken[];
export interface TablesConfig {
    /**
     * Called when the user clicks the external-link icon on a link
     * rendered inside a table cell. Defaults to `window.open(url,
     * '_blank', 'noopener,noreferrer')`.
     */
    onLinkClick?: (url: string) => void;
}
export declare const tableLinkClickFacet: Facet<(url: string) => void, (url: string) => void>;
export declare function tables(config?: TablesConfig): Extension;
export {};
//# sourceMappingURL=table-widget.d.ts.map