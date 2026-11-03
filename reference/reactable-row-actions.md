# Add and remove rows in Shiny

Enable row controls with
`reactable(rowActions = list(add = TRUE, remove = TRUE))`.
`getReactableRowAction()` returns the latest action reactively. An
`"add"` event requests a complete new row from the server. Reply using
`addReactableRow()`, passing its `requestId`. An optional `error`
reports failure instead of inserting a row. A `"remove"` event reports a
row already removed in the browser after user confirmation. The
application must enforce permissions and persist all changes in its
authoritative data.

## Usage

``` r
getReactableRowAction(outputId, session = NULL)

addReactableRow(
  outputId,
  data = NULL,
  inputIds = NULL,
  requestId = NULL,
  error = NULL,
  session = NULL
)
```

## Arguments

- outputId:

  The Shiny output ID of the reactable instance.

- session:

  The Shiny session. Defaults to the current reactive domain.

- data:

  A complete one-row data frame or matrix with the same columns as the
  current data, including a new, unique stable row key. The server
  generates this key.

- inputIds:

  Optional named character vector or named list of input IDs indexed by
  column ID. Overrides apply to editable cells; other cells receive
  default IDs. IDs are automatically namespaced inside Shiny modules.

- requestId:

  The `"add"` action's request ID. Use `NULL` for a server-initiated
  append.

- error:

  A nonempty failure message instead of adding data. Requires
  `requestId`.

## Value

`getReactableRowAction()` returns `NULL` before the first action, or a
list containing `action` and `requestId`. Removal also includes `rowId`
and `data` (the removed record). `addReactableRow()` returns invisibly.

## Details

Added rows appear in a separate section at the bottom of every page,
outside sorting, filtering, grouping, and pagination until the next
complete data replacement. Use `updateReactable(data = ...)` to
integrate additions into the regular table. Full replacement invalidates
pending add requests; late replies to those requests are ignored. This
feature requires Shiny, stable row keys, client-side processing, and no
`.subRows` or Crosstalk data.
