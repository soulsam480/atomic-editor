import { type Extension } from '@codemirror/state';
export interface InlinePreviewConfig {
    /**
     * Called when the user plain-clicks a rendered link. Defaults to
     * `window.open(url, '_blank', 'noopener,noreferrer')`. Consumers in
     * platform-specific shells (Tauri, Electron, Capacitor) should pass
     * their own opener so links route through the host's external-URL
     * mechanism.
     */
    onLinkClick?: (url: string) => void;
}
/**
 * Assemble the inline-preview extension set. Call once per editor and
 * include the result in your EditorState `extensions` list. Accepts an
 * `onLinkClick` callback so consumers can route link opens through
 * their platform's external-URL mechanism (Tauri IPC, Capacitor
 * browser, etc.) instead of the default `window.open`.
 */
export declare function inlinePreview(config?: InlinePreviewConfig): Extension;
//# sourceMappingURL=inline-preview.d.ts.map