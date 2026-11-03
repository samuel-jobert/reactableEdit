# Get and resolve cell edits in Shiny

`getReactableEdit()` reactively returns the latest submitted cell edit.
Use it in
[`shiny::observeEvent()`](https://rdrr.io/pkg/shiny/man/observeEvent.html)
and call `resolveReactableEdit()` after validating and saving the value.
The application must validate row IDs, editable columns, permissions,
types, and business rules on the server. Columns with
`editValidation = FALSE` apply submissions locally without waiting for a
response. They still notify Shiny, but do not display a
server-validation success indicator, and ignore resolutions. This mode
does not provide server validation or persistence.

## Usage

``` r
getReactableEdit(outputId, session = NULL)

resolveReactableEdit(
  outputId,
  edit,
  value = edit$value,
  error = NULL,
  session = NULL
)
```

## Arguments

- outputId:

  The Shiny output ID of the reactable instance.

- session:

  The Shiny session. Defaults to the current reactive domain.

- edit:

  An edit returned by `getReactableEdit()`.

- value:

  The accepted value, optionally normalized by the server. Defaults to
  the submitted value. Use `NULL` for a missing numeric or date value.

- error:

  A nonempty error message to reject the edit, or `NULL` to accept it.

## Value

`getReactableEdit()` returns `NULL` before the first edit, or a list
containing `editId`, `inputId`, `rowId`, `columnId`, `oldValue`, and
`value`. Row IDs and column IDs are strings; dates in this list are ISO
date strings. `resolveReactableEdit()` returns invisibly.

## Details

Native input values are also available individually as `input[[id]]`.
Text and number inputs submit on blur or Enter; textareas submit on blur
or Ctrl/Cmd+Enter. Select and checkbox inputs submit immediately. Dates
submit on blur, Enter, or a calendar selection. Escape restores the
confirmed value.
