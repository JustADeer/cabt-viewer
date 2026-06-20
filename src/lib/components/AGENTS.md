# Component Animation Notes

- Keep board and pile animations in the same transformed frame as the board. Prefer destination-owned animations, such as a pseudo-element or child anchored to the final slot, so the card does not snap when the animation hands off to the real UI.
- For animations that cross from flat UI into the tilted board, a fixed animation layer is acceptable only when it maps the card to the exact final viewport quad. Do not use approximate fixed overlays for board destinations.
- When replay state already contains the destination card, hide that real destination content until the animated card arrives. This avoids showing the animated card and final card at the same time.
- Drive animations from structured event fields, serials, and stable `data-*` anchors instead of parsing log text.
