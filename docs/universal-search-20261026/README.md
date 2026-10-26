# Universal library search — importer 9.9.6

The importer already recursed below one hardcoded path, so a different common library folder could never be searched. Version 9.9.6 uses the documented native BAZIS directory dialog, remembers the chosen root in per-user settings, and offers re-selection if that root disappears or lacks a required donor. Cancelling stops before model import.

Discovery uses an iterative traversal with no fixed depth/directory cutoff, follows directory junctions with realpath cycle detection, and reports unreadable paths. It matches the exported SHA-256 after a move or rename, caches hashes within the scan and refuses ambiguous unpinned legacy names. Exported path components cannot directly bypass the chosen search tree. Existing production geometry, material, placement, note and source-pin logic is retained.

Original FR3D files are read-only. Only the importer settings and existing export diagnostics are written. The downloadable standalone JS is byte-identical to the served importer. The old version snapshots are kept; tests now exercise the current packaged importer.

Native directory API reference: https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_functions.html#UI.dialogs.RunDirectorySelectDialog

Native Windows BAZIS execution is not available in this environment; automated tests exercise the documented dialog boundary and filesystem behavior.
