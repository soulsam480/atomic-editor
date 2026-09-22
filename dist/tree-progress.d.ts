import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
export declare const treeGrowthEffect: import("@codemirror/state").StateEffectType<null>;
type IdleHandle = {
    kind: 'idle';
    id: number;
} | {
    kind: 'raf';
    id: number;
};
/**
 * View plugin that monitors lezer's parse progress and dispatches a
 * `treeGrowthEffect` whenever the tree has grown enough that
 * downstream decoration builders should re-run. Include this in your
 * extension set alongside the state fields that depend on tree
 * coverage — it's a no-op for small docs where the initial parse
 * already covers everything.
 */
export declare const treeProgressPlugin: ViewPlugin<{
    view: EditorView;
    _lastTreeLen: number;
    _idleHandle: IdleHandle | null;
    _destroyed: boolean;
    update(update: ViewUpdate): void;
    destroy(): void;
    _schedule(): void;
    _tick(): void;
}, undefined>;
export {};
//# sourceMappingURL=tree-progress.d.ts.map