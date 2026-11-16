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

All92 retained source/asset files were compared byte-for-byte with the original Desktop-Preview source during this correction. None was edited, copied anew or replaced. The source was already extracted with history; its previous description as merely unused reference material was incorrect.

The unsolicited replacement formerly under `src/` and its two replacement-only test files have been removed from this working source tree. No replacement archive or backup was created. Ordinary pre-existing Git history has not been rewritten. The misleading `mount`/controller package exports and replacement test command are removed; the existing classic-script viewer is not falsely advertised as an interchangeable ESM mount implementation.

## Existing dependencies and ownership

This is a source silo, not a claim that opening index.html alone recreates a whole deployed site. The existing bootstrap references `.build/v86/libv86.js` and `terminal.js`; their owners are the v86 engine and Terminal repositories. Existing dynamic imports under `assets/desktop/` refer to Runtime-owned modules; account/file services and application sources remain in their separate repositories. Future assembly must compose those explicit dependencies without copying their ownership into Desktop or rewriting this viewer as part of organization.

The retained bootstrap can unregister a worker and reload when actually run; it was inspected, not executed in this correction. No website, worker, account state, service or routing was changed. Neither full beta parity nor all old apps running is a source-organization completion gate.

`legacy/reference-tests/` retains original test source separately from application source. The known original negative-control limitation remains documented in OWNED-REFERENCE-TESTS.md; it has not been made passing by changing assertions.

The previous parent development composition imports the removed replacement interface. It is obsolete and must not be represented as the intended viewer or deployed again. The parent builder now stops before producing that replacement. Future assembly wiring is separate work, not part of this source correction.
