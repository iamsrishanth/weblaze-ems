/**
 * Command palette trigger helpers.
 *
 * Kept in a module with NO React component exports so that editing the
 * palette component (or the sidebar) stays a component-level Fast Refresh
 * update. A file that exports both a component and a plain value which is
 * imported outside the React tree forces Next dev to do full page reloads.
 */

export const PALETTE_OPEN_EVENT = "weblaze-ems:open-command-palette";

/** Open the command palette from any client component (e.g. sidebar buttons). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT));
}
