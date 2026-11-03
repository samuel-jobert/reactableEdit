# Row actions

## Confirmed behavior

- Opt in separately with `rowActions = list(add = TRUE, remove = TRUE)`.
- Borderless action column contains a removal button for leaf rows. `removeDisabled` lists stable keys that cannot
  be removed. Add button is below the table. Controls and confirmations are keyboard accessible.
- Removing requires a localized browser confirmation, then removes locally and publishes a Shiny event.
  The application must persist the change and enforce permissions; this is not server authorization.
- Adding publishes a request. The server supplies a complete one-row data frame with a unique stable key.
  `addReactableRow()` inserts it immediately, without a second acceptance step.
- IDs default to the existing table/key/column scheme; `inputIds` provides per-column overrides for the new row.
  These IDs are module-local, automatically namespaced, and checked for collisions.
- Added rows remain in an appended section, outside sorting, filtering, grouping and pagination.
  They remain on every page until full data replacement, which integrates them into the normal row model.
  In virtual mode the appended section is sticky at the bottom, with bounded scrolling for multiple additions.
  Bound its height to half the table viewport and 45vh; preserve layout body props and override tbody overflow specificity.
- Existing records remain in their original data order. Removal preserves selection/expansion of surviving records,
  clamps the current page if needed, and invalidates only removed cells' edit requests.
  R-rendered cells/styles/details use source indices by stable key. Appended records use raw values without R details.
  Pagination counts exclude additions; public pageRows includes them, sortedData appends them, and CSV includes them.
- Full data replacement cancels an outstanding add request; late replies with its request ID are ignored.
  It clears per-addition input ID overrides as well as pinned keys.
- `addReactableRow(error = "...", requestId = ...)` reports failure and unlocks Add for retry.
- Row actions require Shiny, stable row keys, client-side processing, and no nested `.subRows` or Crosstalk data.
  Crosstalk's immutable external key arrays cannot safely follow local row additions/removals.

## API

- `reactable(rowActions = list(add = TRUE, remove = TRUE, removeDisabled = c("car1")))`.
  Same configuration in `updateReactable()` replaces action settings without replacing data.
- `getReactableRowAction(outputId, session = NULL)` returns the latest action.
  Both actions include `action` and `requestId`; removal also includes `rowId` and the removed `data` record.
- `addReactableRow(outputId, data = NULL, inputIds = NULL, requestId = NULL, error = NULL, session = NULL)`.
  Pass the add event's `requestId` when answering a user request. Omitting it allows a server-initiated append.
  Required column names match current data; cells must satisfy existing editor types and choices.
  The server owns key generation. Default input IDs are automatic; row keys are not generated in the browser.

## Input submission

Text submits on Enter, Tab (blur), or loss of focus; never on each keystroke.
Textarea preserves Enter as newline and submits with Ctrl/Cmd+Enter, Tab, or loss of focus.
These behaviors already exist; add explicit regression tests for Tab and textarea multiline semantics.

## Accessibility (WCAG 2.2 target)

Use native buttons with localized labels, including the stable row key for removal.
Keep controls at least 24 CSS pixels high, maintain visible focus, and avoid activating row selection from buttons.
Use browser confirmation rather than a custom inaccessible modal. Cancellation changes nothing.
Announce additions, removals, pending requests and errors in live regions.
After removal, focus the next enabled remove control or Add; after insertion, keep Add focused.
The appended rowgroup has a localized accessible label. Do not claim full WCAG compliance from automated tests alone.

## Validation plan

- R: invalid options, unsupported modes, event retrieval, namespaced messages, row shape/types, IDs and error replies.
- JS: request/reply/retry, duplicate keys/IDs, stale replies, deletion cancellation, disabled removal, data replacement.
- Integration: appended rows remain editable with custom/default IDs after sorting, filtering, pagination and grouping.
- Preserve remaining drafts, requests, disabled overrides, selection and expanded rows on removal.
- Test no-data and zero-initial-row cases, successive append requests, virtual layout and full-data integration.
- Real Shiny: complete server example that persists added/removed records; module IDs, keyboard/blur commits,
  row-action notifications, native updates and confirmation.
