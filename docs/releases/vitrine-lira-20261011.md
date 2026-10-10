# Z1 / LIRA display cabinets - 2026-10-11

Adds six FR3D donors to the existing single vitrine card; twelve variants total. Original AQ 4 x 8 identities remain intact. New LIRA groove is 17.5 wide x 6.5 deep, independently confirmed in machining parameters and contours.

## Source audit

All seven panels, four Z1 frame members, hardware and nested elasticity match the corresponding 4 mm donors. Groove path is Y100..2000 / Z309 at nominal 600 x 2000 x 600. KUBIC anchors are X18/582, Y1041, Z68/548.

| Variant | SHA-256 | Constraint |
| --- | --- | --- |
| LL | 298ec5f7d35c1d45a895e17200e03b69d511b84a6ce578eb1046315f36629af1 | Internal model name says P; actual geometry/opening is L |
| LP | 69ff72d5af283cccb1cf68f620525badaa113a0d946ba36566c2a01a921c234c | Global X455 / Y1770 / Z160+445 |
| PL | c8d619028d9d7cf9f429c4e6855672144083e74fe469759b18e1e04bbdc4351c | Global X455 / Y1770 / Z160+445 |
| PP | c897428ff8730054b986035423aa3ff6dbac4e737eb6c4a515870cce86b2a040 | Global X455 / Y1770 / Z160+445 |
| BL | 076d752ac1cf119230d8db984f76fc74e82e7b14828472436daf1ef0484f1259 | No global elasticity; fixed 600 x 2000 x 600 |
| BP | 7ed7202afb11dec8cf9f188ef5bd1cf2278326ba0997edfb93477ced39f774fb | Global X455 / Y1770 / Z160+445 |

## Supplier configuration

Shared `vitrine-lighting.json` generates the browser configuration and is read by the PDF backend.

- LIRA black profile including screen: 89609 / 2 m, 89672 / 3 m. Choose one continuous bar per light line. Net cuts follow the full groove; allow for end caps during assembly.
- End cap: 89610, two per line. Holder: 77267; installation quantity and its fasteners remain explicitly unresolved, including in the PDF procurement summary.
- LIRA uses flat LED 75069, 12 V, 9.6 W/m, 8 x 1 mm, 4000 K. The supplier drawing confirms 25 mm cutting increments. AQ silicone LED-LINE 15.0341 stays with the 4 x 8 version.
- KUBIC black nickel kit 1 60200 50 BA: four per shelf. Add one 3.5 x 16 countersunk wood screw per holder; do not reuse/double-count the 20 native leg/clip screws. Supplier screw SKU remains unset.
- Z1 frame, seals and corners remain separate from LIRA. Screen is bundled and never charged twice. Power/control/wiring/connectors are explicit shared-group selection, with actual module load.

## Sources

- https://aks.by/79036-109715-p?OFFER_ID=118550
- https://aks.by/79036-109715-p?OFFER_ID=118552
- https://aks.by/80990-110547-p?OFFER_ID=118554
- https://aks.by/80995-110548-p?OFFER_ID=110552
- https://aks.by/78017-109105-p?OFFER_ID=113290
- https://aks.by/upload/Sh/imageCache/394/629/6291712098486533.webp
- https://aks.by/upload/Sh/imageCache/110/453/4537072925361031.webp
- https://www.italianaferramenta.it/en/catalog/kubic-209
- https://www.itfer.ru/catalog/polkoderzhateli-dlya-stekla/kubic-polkoderzhatel-s-fiksatorom/

## Visuals and validation

KUBIC body, removable clamp and pads are visual-only meshes in native positions. Added shelves get four supports each; zero shelves removes them. LIRA shows the black 24.4 mm flange and diffuser. Neither alters cutlist geometry. The shared read-only view also shows profile/support silhouettes.

254 JS tests pass, including 144 choice transitions, independent FR3D fixtures, stock selection, no duplicate screen and real export serialization. Five backend tests cover schema, JS/Python parity and PDF. Rendered module and procurement PDF pages were visually inspected; the module with a preview stays on one page. Browser QA and native BAZIS runtime are unavailable; neither was claimed. No real orders, messages or production data were used.
