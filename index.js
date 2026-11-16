/**
 * Host half of the workspace status board.
 *
 * The bundle is a browser-side UI layer: the sidebar shell declares
 * `sidebar.workspaces`, and this package's Client half shadows the shipped
 * browser occupant to render the status-sorted board. Nothing here is
 * model-facing, so the Host entry only needs to exist for the Loader row.
 */
export function apply() {}
