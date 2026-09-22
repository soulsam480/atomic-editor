import { Facet, type Extension } from '@codemirror/state';
export declare const readOnlyFacet: Facet<boolean, boolean>;
/**
 * Bundle the CM6 levers that make the editor read-only, plus the
 * `readOnlyFacet` the feature extensions read. Designed to live inside
 * a `Compartment` so it can be reconfigured at runtime to toggle
 * reading mode in place (no remount, scroll position preserved).
 *
 * Two distinct levers are combined:
 *   - `EditorView.editable.of(!ro)` — the UX lever. With `editable`
 *     false the `contentDOM` is no longer `contenteditable`, so there's
 *     no caret and clicks don't focus the editor — the reveal never
 *     triggers and the whole doc stays rendered.
 *   - `EditorState.readOnly.of(ro)` — defense-in-depth. Blocks
 *     paste / drop / IME edits and sets `state.readOnly` for any
 *     consumer command that checks it. It does NOT block our explicit
 *     checkbox `view.dispatch`, so checkbox toggling keeps working by
 *     design.
 *
 * In read-only the editor DOM also gets a `cm-atomic-readonly` class as
 * a styling hook (whole-link pointer cursor, inert table cells, etc.).
 */
export declare function readOnlyExtension(ro: boolean): Extension;
//# sourceMappingURL=read-only.d.ts.map