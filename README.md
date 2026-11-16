# Desktop / Workspace viewer source

This independent repository owns the existing Desktop/Workspace viewer, as shown on beta.ksu.codes. It is source organized for future development. No desktop rewrite, recoloring or replacement is intended.

The source lives under `active-system/`, keeping its original paths and bytes:

- `index.html`: existing page entry.
- `bootstrap.js`: existing script loading and worker-release handling.
- `app.js`: existing Desktop/Workspace viewer, windows, rail, menus and account presentation.
- `desktop-apps.js`: existing app hosting/operation glue.
- `reference.js`: existing menu, icon and reference settings.
- `style.css`: existing presentation, including dark workspace/rail and bottom APPs placement.
- `assets/`: existing icons, wallpaper and captured notices.

All92 retained source/asset files matched the original Desktop-Preview source during the source-organization correction. The later, explicitly authorized ksu.codes integration changes only bootstrap/account/app/lifecycle wiring in bootstrap.js, app.js and desktop-apps.js. The stylesheet, reference data, page entry and artwork remain unchanged. Public Accounts keeps credentials; the viewer receives verified session metadata and a shared account-file capability. The original rail, workspace and window implementation remain the viewer.

The unsolicited replacement formerly under `src/` and its two replacement-only test files have been removed from this working source tree. No replacement archive or backup was created. Ordinary pre-existing Git history has not been rewritten. The misleading `mount`/controller package exports and replacement test command are removed; the existing classic-script viewer is not falsely advertised as an interchangeable ESM mount implementation.

## Existing dependencies and ownership

The parent now composes a scoped test release through scripts/build_viewer.mjs. Its immutable viewer-profile.json selects enabled apps and optional capabilities. Linux and voice are off; bootstrap no longer requires a v86 library for startup. Terminal's retained classic source has its own owner. Runtime, account/file services and applications remain separately owned. App-owned asynchronous readiness and close decisions are explicit while mount remains synchronous.

The retained bootstrap can unregister a worker and reload when actually run; it was inspected, not executed in this correction. No website, worker, account state, service or routing was changed. Neither full beta parity nor all old apps running is a source-organization completion gate.

`legacy/reference-tests/` retains original test source separately from application source. The known original negative-control limitation remains documented in OWNED-REFERENCE-TESTS.md; it has not been made passing by changing assertions.

The removed replacement composition remains obsolete. The new scoped composition uses this existing viewer, with Calculator, Files, Text, WordCraft and Help. Unselected menu entries are disabled. Broader app integration is separate work. See the parent's deploy/VIEWER-TEST.md for source/build/qualification limits and the explicitly authorized test rollout.

Text's public file-binding signal is composed into `updateAccountFileBinding`.
Desktop validates the current window/account and confirmed canonical resource,
then updates its owned launch metadata, caption, accessibility label and saved
layout without remounting the editor. Untitled Text binds to a file on its first
confirmed Save; Save As changes that same window's binding. Rejected/cancelled
saves do not change it. No editable Text document is copied into the shell.

Saved Text layouts are restored with an explicit historical-navigation marker.
The app reads current server bytes and reports their actual revision; the old
layout SHA is not a permanent open precondition. Explicit Files-selected launches
still carry an exact selected revision, and recovery drafts retain their own
base revision/conflict checks. Missing/unavailable Text stays identified and
read-only with Retry in the same app view. Login persistence remains separate work.

`activateTextFile` validates the signed-in account and canonical full path, then
finds the existing Text window through its confirmed launch binding. It restores
minimized/rolled state, selects the existing workspace and delegates keyboard
focus to the app. It never reads file bytes, changes the buffer/base revision or
remounts CodeMirror. Save As and first Save use the same binding path as layout
persistence; no second resource registry is maintained. Untitled windows and
different full paths remain independent. A late synchronous lookup before launch
prevents concurrent Files opens from creating duplicate Text windows. Focus
requested before attachment/readiness is delivered only while that window is
still active, avoiding delayed focus theft. WordCraft's internal multi-document
activation is outside this Text-scoped change.

The existing login gate now first asks Accounts to restore a remembered session.
Only a freshly server-validated registered identity opens the desktop and its
account-scoped layout/recovery drafts. The viewer keeps its public projection;
Accounts owns credentials, IndexedDB and signed renewal. The original login form
appears for an absent, invalid or expired login, with a short status message for
invalid retention or unavailable browser storage. A transient renewal outage
keeps account views closed and uses the existing startup reconnect behavior.
Successful refresh and browser reopening do not ask for a password while the
server session remains valid. Sign-out forgets retention before server revocation;
dirty-work decisions and local-draft protections remain unchanged. No layout,
colors, rail order or account-file server behavior changes for this feature.
