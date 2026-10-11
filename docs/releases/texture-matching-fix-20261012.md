# Texture matching correction — v9.7.1

The follow-up audit found two causes of missed exact matches: the decor name
"Кедр Орегон" overrode its BYSPAN folder as if KEDR were the manufacturer, and
complete matching filenames/titles with Cyrillic article letters were skipped.

This patch adds five site bindings: BYSPAN 537 WML as a surface texture, and
EVS001, EVS003, EVS007, P013 as sample previews with approximate render colours.
Only 537 WML is added to native BAZIS bindings. Full catalogue identities,
previous bindings and previous image packs stay unchanged. Filename title
matching requires both the entire title and a complete bounded article;
manufacturer conflicts still block attachment.

Coverage against the saved 2026-09-27 catalogue is 1412 / 2104 variants with
images (1251 user textures, 44 user previews, 117 official images). Native
bindings: 1360. The 692 unresolved variants comprise 384 without an exact full
match, 216 Ultradecor/Kronospan manufacturer conflicts, and 92 variants across
16 groups of distinct EXTRAVERT images. Visual review of all 16 groups found
different crops, orientation and/or colour; no global folder priority was
assumed. These remain in the offline report for a concrete choice.

Validation: 31 Python tests; native importer syntax check; real Chromium WebGL
acceptance for the five additions and four previous materials; all six optical
parts preserved; no API writes, external requests, or browser errors. The
archive was checked for integrity and correct 1412/692/1360 totals. Execution
of the new native importer in the user's installed BAZIS remains a PC check.
