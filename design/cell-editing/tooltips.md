# Rich tooltips

## Confirmed contract

Provide `reactableTooltip()` and `updateReactableTooltip(session, inputId, tooltip)`.
Support ordinary cells, native editable inputs (including disabled inputs), and column headers.
Show on hover and keyboard focus; Escape dismisses until the next interaction.
Content supports trusted HTML formatting but no interactive controls. This is a tooltip, not a popover.

`colDef(tooltip = ..., headerTooltip = ...)` defines defaults. Cell defaults may be an R function of
value, row index and column name. Evaluate these at construction, keyed by stable row key when available.
`reactable(tooltips = list(rows = ..., columns = ..., cells = ..., headers = ...))` defines overrides.
Rows and columns are named lists of tooltip values; cells is a named list of rows containing named column lists.
Targeted rows/cells require `rowId`. Rules for unknown keys apply to later additions.

Priority: per-input command > cell > row > table column > column default.
`FALSE` suppresses a tooltip. `NULL` leaves an update unchanged; empty rules clear table rules and input overrides.
Rule replacement clears input overrides, matching disabled-input rules. Ordinary data replacement does not.
Per-input commands require a mounted native input and follow the stable cell across remounts.
Headers have their own rules, independent of body rules.

## Implementation and accessibility

Use the existing Shiny native receiver decorator and table message channel, not a second binding.
Use a React portal outside clipped/virtualized table containers; no new runtime dependency or bundle author required.
Position using fixed coordinates, flip at viewport edges, and recompute during scrolling/resizing.
Unmounting the target closes its portal and removes listeners/timers. Never retain recycled row DOM nodes.
Provide `role=tooltip`, unique IDs and `aria-describedby`, preserving editor validation descriptions.
Plain cells and disabled input containers receive a keyboard focus target. Enabled inputs retain their native focus.
Keep the tooltip hoverable with a short close delay, and dismissible with Escape (WCAG 2.2 target, especially 1.4.13).
Formatting is text/HTML only, not htmlwidgets or interactive Shiny content. Applications must not pass untrusted HTML.
Expose placement, maximum width, class name and CSS variables for visual customization.

## Test plan

- R: constructors, content/options validation, escaping, HTML, callback evaluation, stable-key rules,
  false suppression, message shape and module namespace parity with native Shiny updaters.
- JS: precedence, focus/hover/Escape, portal cleanup, descriptions alongside editing errors,
  disabled targets, positioning, rule updates, input updates and persistence over page/data replacement.
- Integration: header sorting unchanged; row selection unchanged; added and virtual rows remain correctly targeted.
- Real Shiny: rich header/cell content, disabled input focus, input-ID update, module namespace and remounts.
- Use the existing MASS::Cars93 interactive Rmd demo for executable/manual examples.
