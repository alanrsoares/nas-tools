# NAS Tools

NAS Tools manages personal NAS media workflows around downloads, audits, and library organization.

## Language

**NAS Tools Cockpit**:
A fully integrated web workspace for operating NAS Tools workflows from one place, reachable from trusted devices on the LAN without authentication in the first version. It is not a thin wrapper around terminal commands.
_Avoid_: Web UI, dashboard, control plane

**NAS Tools CLI**:
The terminal entry point for NAS Tools workflows.
_Avoid_: App, server

**NAS Library**:
The organized media collection on the NAS, such as music, movies, TV, and audiobooks.
_Avoid_: Target folder, output directory

**Download Staging Area**:
The place where completed downloads wait before they are inspected, classified, and moved into the NAS Library.
_Avoid_: Source folder, complete folder

**Dry Run**:
A preview of proposed NAS changes where no files are moved, deleted, renamed, or written. File operations in the NAS Tools Cockpit begin with a Dry Run before confirmation.
_Avoid_: Test run, simulation

**Confirmation**:
A user decision to apply a Dry Run plan to the NAS Library or Download Staging Area.
_Avoid_: Approval, submit

**Move Plan**:
The editable set of proposed file moves produced from the Download Staging Area before Confirmation. It may include manual corrections such as artist names or excluded items.
_Avoid_: Operations list, move operations

**NAS Path Configuration**:
The saved Cockpit settings for Download Staging Area, NAS Library destinations, and backup location.
_Avoid_: Environment defaults, path options

## Example Dialogue

Dev: "Should this action run from the NAS Tools CLI or the NAS Tools Cockpit?"

Domain expert: "Both should support it, but the Cockpit should show the Dry Run before touching the NAS Library."

Dev: "Is this folder already in the NAS Library?"

Domain expert: "No. It is still in the Download Staging Area and needs review first."
