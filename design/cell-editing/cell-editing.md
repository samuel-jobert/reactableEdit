# Native Shiny cell editing

## Confirmed scope

Always-visible native Shiny text, number, select, checkbox, date and textarea inputs.
Each input has a stable, individually observable ID and supports its native `update*Input()` function.
Client-side tables in Shiny are supported, including sorting, filtering, grouping leaf rows, pagination and virtual
scrolling. Server-side processing (`server = TRUE`) and pre-nested `.subRows` data are explicitly unsupported initially.
The user accepted that inputs outside the rendered page cannot receive `update*Input()` messages.

## R API

- `reactable(rowId = "id", inputIdPrefix = NULL)` requires a unique, nonmissing character or safe integer row key.
  The key column cannot be editable. Its values must not change during editing.
- `colDef(editable = TRUE, editor = "text", editorOptions = list(), inputId = NULL)` configures an editor.
  Types are `"text"`, `"number"`, `"select"`, `"checkbox"`, `"date"` and `"textarea"`.
- Options delegate to the corresponding Shiny constructor. Input IDs, labels and initial values are managed by
  reactable. Select inputs use native, single-choice selects (`selectize = FALSE`).
- Default IDs are `<outputId>_<rowKey>_<columnId>`. Row and column components are URL-encoded to avoid whitespace
  and Shiny's reserved type separator. `inputIdPrefix` replaces the output ID prefix.
- `inputId` accepts a string or `function(rowId, columnId)` returning a custom ID, or `NULL` for the default.
  Overrides are evaluated for the initial rows; newly added rows use the default convention.
- IDs are automatically namespaced when the table is rendered within a Shiny module.
  Duplicate IDs within a table are rejected before binding.
- `getReactableEdit(outputId)` returns the latest edit reactively.
- `resolveReactableEdit(outputId, edit, value = edit$value, error = NULL)` accepts a possibly normalized value,
  or rejects it with a nonempty error message. It requires an active Shiny session.

## Contract

### Disabled inputs

Confirmed API:

- `colDef(inputDisabled = TRUE)` disables a column's native editors.
- `reactable(disabledInputs = list(rows = c("car1"), columns = c("Price"),
  cells = list(car2 = c("Notes"), car3 = list(Price = FALSE))))` sets stable-key rules.
- `updateReactable(disabledInputs = ...)` replaces the table rules and clears per-ID overrides.
  `list()` clears table rules but not column defaults.
- Cell booleans override row/column defaults. The most recent per-ID command overrides cell rules.
- `updateReactableInput(session, inputId, disabled = TRUE)` sends a native input message.
  Standard Shiny `update*Input()` signatures are unchanged; `sendInputMessage(id, list(disabled = ...))`
  can combine a value update and a disabled update.
- Observe external DOM `disabled` changes (including shinyjs) and persist explicit per-cell overrides.
  ID commands require mounted inputs; table rules also apply to off-page rows.
- Disabling cancels an unsent draft and restores confirmed data without an edit event.
  An already pending request finishes normally, but never overrides the disabled state.
- Native server value updates remain possible while disabled. Data replacement clears transient drafts/requests,
  but preserves disabling rules and per-ID overrides for stable keys.

The six native controls must expose actual `disabled`, not just a visual class or `aria-disabled`.
Temporary pending/read-only states remain separate from application disabling. External enable cannot unlock a
pending editor. Native DOM observation must not mistake reactable's own attribute updates for application commands.
These controls are a UI affordance, not authorization: the application must still validate requests on the server.

Test plan: R argument validation and serialization, module IDs, row/column/cell precedence, on-page and off-page
updates, draft cancellation, pending acceptance/rejection, all six controls, combined native messages, DOM changes,
own-mutation suppression, remount persistence, full-data replacement, and native update preservation.
Extend the interactive Rmd with rule updates, per-ID toggles and external DOM/shinyjs examples.

### Status display and optional server validation

Confirmed options per column:

- `editValidation = TRUE`: require explicit server acceptance. With `FALSE`, apply valid submitted values locally,
  still publish individual inputs and global edit events, and ignore acknowledgment messages for these edits.
  Local application does not mean server verification or persistence: no success indicator is shown.
- `editStatus = "icon"`: display a small green tick at the input's upper-right after acceptance.
  Alternatives are `"text"` and `"none"`. Hidden visual statuses retain accessible announcements and error messages.
- `editStatusDuration = 2000`: hide accepted status after this many milliseconds; `0` keeps it until new input.
  Expiry uses the acceptance timestamp, including when a cell unmounts and remounts.
- Start typing: remove previous success and errors immediately. Do not validate drafts.
  Local constraints are checked on submission only. Pending server checks display a neutral indicator, not a result.
- Server refusal: error icon and message below the input, cleared by new input.
- CSS classes and custom properties control colors and placement without arbitrary renderer callbacks.

Accessibility target remains WCAG 2.2: localized live announcements, non-color status shapes, errors linked with
`aria-describedby`, and no focus movement when statuses expire. Hidden indicators remain available to screen readers.

Tests cover modes, the exact 2000 ms default, custom and persistent durations, expiry over remount,
draft/error clearing,
pending neutrality, local validation timing, and per-column opt-out with unchanged Shiny notifications.
The interactive Rmd includes status customization and a column without server validation.

The application owns the authoritative data and persistence. It must validate IDs, permissions, types, allowed choices
and business rules on the server. Browser validation is a convenience, never an authorization boundary.
An edit contains `editId`, `inputId`, `rowId`, `columnId`, `oldValue`, and `value`.
`input[[id]]` receives the native Shiny type; the global edit payload uses JSON scalars (dates are ISO strings).
Initial binding sends native initial input values but does not create an edit.

Text and number inputs commit on blur or Enter; textarea commits on blur or Ctrl/Cmd+Enter.
Escape restores the last confirmed value without submitting an edit. Select and checkbox changes commit immediately.
Typed dates commit on blur or Enter; calendar selections commit once focus leaves the text field.
One request per cell may be pending; other cells remain usable. Pending cells cannot be resubmitted.
Confirmation patches only the identified cell, preserving page, selection and expanded rows.
If filtering removes the current page, navigation clamps to the last remaining page.
Sorting and filtering recompute using confirmed values. A filtered-out row may disappear after confirmation.
Rejected drafts remain editable with a visible error; Escape restores the confirmed value.
Drafts, pending requests and errors survive pagination and virtual unmounts.
Full data replacement invalidates pending requests; replies to invalidated or superseded edits are ignored.

Native `update*Input()` messages are delegated to the original binding. Outside a pending edit, a changed server value
updates the cell's confirmed data without creating another edit. During a pending edit, the message may adjust the
display or editor options, but `resolveReactableEdit()` is still required to complete a server-validated request.
Unmounted inputs cannot receive native updater messages. Use `updateReactable(data = ...)` for off-page data updates.
Do not rebuild the whole reactive table on each keystroke; maintain application data separately.

## Implementation

R generates one native Shiny HTML template per editable column and attaches its dependencies.
React owns a wrapper, while Shiny owns the template DOM. On mounting, instantiate IDs and values, initialize and bind
the native widget, and delegate value conversion and update messages to its binding.
Use the native binding lifecycle and replace only its change subscription to implement commit semantics.
Unbind before removing widgets; guard asynchronous binding against unmounts and report failures explicitly.
Stable editor keys prevent a recycled visible row from inheriting another row's widget.
Table-level records retain drafts and server requests across unmounts.

## Accessibility (WCAG 2.2 target)

- Native keyboard-operable controls with a localized accessible name including column and stable row key.
- No mouse-only entry mode or forced focus movement on edits.
- Enter/Escape and Ctrl/Cmd+Enter respect multiline text and IME composition.
- Pending and error statuses are visible and announced with live regions.
- Invalid controls use `aria-invalid` and `aria-describedby`; pending state uses `aria-busy`.
- Focus indicators remain visible; interactive targets have a minimum height of 24 CSS pixels.
- Native datepicker keyboard and screen-reader behavior requires manual verification; do not claim WCAG conformance
  solely from automated tests.

## Test plan

1. R: validate column configuration, key uniqueness, unsupported modes, templates and dependencies.
2. R: event retrieval, namespaced acknowledgments, invalid payloads, rejection and normalized values.
3. JS: native binding initialization, cleanup, errors and asynchronous unmounts.
4. JS: six editor types, typed values, commit timing, Escape, IME, validation and accessible statuses.
5. JS: IDs, overrides, duplicates and Shiny namespaces.
6. JS: preserve page/selection/expansion, recompute sorting, reject stale replies, concurrent edits and data replacement.
7. JS: pagination/remount preserves drafts and pending requests; initialization and programmatic updates create no edits.
8. Real Shiny/browser: observe individual IDs, native update functions, date conversion and server accept/reject.
9. Run Prettier, ESLint, focused Jest/testthat suites, R documentation generation and production widget builds.

See `cell-editing-test.Rmd` for an interactive test application.
