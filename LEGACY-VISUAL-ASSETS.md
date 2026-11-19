# Existing viewer visual assets

Current source decision: these assets belong to the intended existing Desktop/Workspace viewer under active-system/, not to an optional discarded theme. The replacement src/ renderer was removed during the source-organization correction. The historical retention evidence below remains valid; it is not a claim that the replacement is the intended desktop.


The captured desktop reference menu and stylesheet consume `active-system/assets/icons/` and `active-system/assets/wallpaper.jpg`. Desktop owns this legacy launcher/theme collection; applications keep their own implementation repositories. This addition retains74 numbered PNGs, one JPEG and ten captured license/copyright files. It adds no new asset repository or runtime service.

Source snapshot `4f72ea86928666189b32f6f05c2c697a37341d06`; exact filtered baseline `3b2793b1b4b09aa77eff2131cf111c8e5bd3a90a`; separate mechanical history merge `8063cb91cd58de27f01d73ad512605859191853e`. Private phase40 preserves current/earlier path and commit/ref maps. `legacy-visual-assets.json` records every path, source blob, mode, size and SHA-256. The original code and assets remain untouched.

All PNG chunk CRCs and decompressed scanline streams were checked; representative utility/application/warning icons and the wallpaper decoded/viewed successfully. This proves input retention, not full old-shell visual fidelity. At the time of that earlier retention step, the replacement src/ renderer was unchanged. That replacement has since been removed; active-system/ is now the designated viewer source.

Captured GPL/LGPL and package copyright files are preserved verbatim. They cover multiple legacy visual/font packages; their presence does not prove per-image upstream identity or release notice completeness. Resolve exact provenance/attribution/distribution obligations before enabling or releasing a legacy asset set. Do not assume a generic license match establishes ownership.

No old theme, host configuration or deployment was enabled. Future assembly should use the existing viewer inputs with an explicit asset graph and license evidence; no renderer redesign is authorized by this organization step.

## Source and notices for the captured artwork

The [artwork manifest](third-party/desktop-artwork/artwork-attribution.json) maps the 74 numbered
icons and wallpaper to their upstream source files and copyright notices. The directory contains
the identified upstream artwork and notices. The viewer continues to load the captured bytes
under `active-system/assets/`.
