# Changelog

## reactableEdit 0.4.5.9000 (Unreleased)

### Fork

- Renamed the R package to `reactableEdit`, an independent fork of Greg
  Lin’s `reactable`, maintained by Samuel JOBERT under the MIT license.
  Load it with
  [`library(reactableEdit)`](https://github.com/samuel-jobert/reactableEdit);
  existing R function names, widget bindings, JavaScript APIs, and
  `reactable.*` options are unchanged. Original authors, copyright
  notices, and third-party licenses are retained. Earlier release
  sections below describe upstream reactable history.

### Documentation

- Added a comprehensive editing guide covering native Shiny inputs,
  stable and custom IDs, modules, individual observers, native updaters,
  explicit server validation, disabled rules, row actions, rich
  tooltips, persistence and troubleshooting, with a complete runnable
  Shiny application.

### New features

- Native Shiny cell editing with `colDef(editable = TRUE)`, six input
  types (`text`, `number`, `select`, `checkbox`, `date`, and
  `textarea`), stable row keys via `reactable(rowId = ...)`,
  customizable input IDs, and explicit server acceptance or rejection
  via [`getReactableEdit()`](../reference/reactable-editing.md) and
  [`resolveReactableEdit()`](../reference/reactable-editing.md).
  Accepted edits display a customizable status (`editStatus`), with a
  green tick for 2 seconds by default (`editStatusDuration`). Previous
  success and errors clear on new input. Columns can opt out of server
  validation with `editValidation = FALSE` without displaying a
  validation tick. Native `input[[id]]` observers and `update*Input()`
  functions work for mounted cells. Editing preserves table state and is
  initially limited to client-side Shiny tables without `.subRows` data.

- Add and remove rows in Shiny with
  `rowActions = list(add = TRUE, remove = TRUE)`. Handle server requests
  with
  [`getReactableRowAction()`](../reference/reactable-row-actions.md) and
  supply complete rows using
  [`addReactableRow()`](../reference/reactable-row-actions.md),
  optionally overriding new cell input IDs. Appended rows remain visible
  outside sorting, filtering, grouping and pagination until full data
  replacement. Removal requires confirmation, notifies the server
  immediately, and can be disabled per row. Requires stable row keys and
  client-side tables without `.subRows` or Crosstalk data.

- Rich noninteractive tooltips for cells, native editable inputs
  (including disabled inputs), and column headers via
  [`reactableTooltip()`](../reference/reactable-tooltips.md),
  `colDef(tooltip = ..., headerTooltip = ...)`, and stable-key
  `tooltips` rules in [`reactable()`](../reference/reactable.md) and
  [`updateReactable()`](../reference/updateReactable.md). Use
  [`updateReactableTooltip()`](../reference/reactable-tooltips.md) to
  override a mounted input’s help by ID. Tooltips support hover,
  keyboard focus, Escape dismissal, viewport-aware positioning and
  custom CSS; rules and per-input overrides survive pagination, virtual
  scrolling and data replacement.

- Disable native cell inputs by column with
  `colDef(inputDisabled = TRUE)`, or by stable row key, column, and cell
  using `disabledInputs` in [`reactable()`](../reference/reactable.md)
  and [`updateReactable()`](../reference/updateReactable.md). Cell
  exceptions can enable otherwise disabled inputs. Use
  [`updateReactableInput()`](../reference/updateReactableInput.md) or
  native input messages for mounted cells; external DOM changes such as
  `shinyjs::disable()` also persist across remounts. Disabling discards
  unsent drafts without interrupting pending server responses.

- Experimental support for server-side data processing in Shiny apps.
  Use `reactable(server = TRUE)` to render a table using server-side
  data processing in Shiny. Server-side data processing requires the V8
  package, which is not installed with reactable by default.
  ([\#22](https://github.com/glin/reactable/issues/22))

  ``` r

  library(shiny)
  library(reactableEdit)

  tbl <- reactable(
    mtcars,
    server = TRUE
  )

  ui <- fluidPage(
    reactableOutput("tbl")
  )

  server <- function(input, output) {
    output$tbl <- renderReactable({
      tbl
    })
  }

  shinyApp(ui, server)
  ```

- [`reactable()`](../reference/reactable.md) gains a
  [`virtual`](https://glin.github.io/reactable/articles/examples.html#virtual-scrolling)
  argument to enable virtual scrolling. Virtual scrolling renders only
  the visible rows on screen, allowing you to scroll through large
  tables without performance issues.
  ([\#203](https://github.com/glin/reactable/issues/203))

  ``` r

  reactable(
    data.frame(x = 1:100000, y = rnorm(100000)),
    pagination = FALSE,
    virtual = TRUE,
    height = 500
  )
  ```

- New
  [`Reactable.toggleSortBy()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-togglesortby)
  and
  [`Reactable.setSortBy()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-setsortby)
  methods in the JavaScript API to programmatically control column
  sorting. `toggleSortBy()` toggles sort on a single column (cycling
  between ascending and descending), while `setSortBy()` sets the full
  sort state declaratively. Also available via
  `updateReactable(sortBy = ...)` in Shiny.
  ([\#316](https://github.com/glin/reactable/issues/316),
  [\#322](https://github.com/glin/reactable/issues/322))

- New
  [`Reactable.toggleRowSelected()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-togglerowselected),
  [`Reactable.setRowsSelected()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-setrowsselected),
  and
  [`Reactable.toggleAllRowsSelected()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-toggleallrowsselected)
  methods in the JavaScript API to programmatically control row
  selection. Additionally, `rowInfo.toggleRowSelected()` and
  `cellInfo.toggleRowSelected()` are now available in JavaScript render
  and style functions.
  ([\#322](https://github.com/glin/reactable/issues/322),
  [\#394](https://github.com/glin/reactable/issues/394),
  [\#412](https://github.com/glin/reactable/issues/412))

- New
  [`Reactable.gotoPage()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-gotopage)
  and
  [`Reactable.setPageSize()`](https://glin.github.io/reactable/articles/javascript-api.html#reactable-setpagesize)
  methods in the JavaScript API to change the current page or page size.
  ([\#322](https://github.com/glin/reactable/issues/322))

- JSON serialization of data can now be customized using the
  `reactable.json.func` option. This is an experimental feature for
  advanced use only, and intentionally undocumented outside of NEWS.
  reactable may change how data is serialized between versions and does
  not guarantee stability. See `reactableEdit:::toJSON` as a reference
  for how data is currently serialized.
  ([@khusmann](https://github.com/khusmann),
  [\#415](https://github.com/glin/reactable/issues/415))

  Example usage:

  ``` r

  # Use yyjsonr as a faster alternative for JSON serialization. Note that this is not 1:1 consistent with
  # jsonlite, and several edge cases are not handled here, including data frames with 1 row, datetimes, and NULLs.
  options(reactable.json.func = function(x, ...) {
    result <- yyjsonr::write_json_str(
      x,
      opts = yyjsonr::opts_write_json(
        dataframe = "columns",
        auto_unbox = TRUE,
        num_specials = "string"
      )
    )
    class(result) <- "json"
    result
  })
  ```

- [`colDef()`](../reference/colDef.md) gains an `initWidth` argument to
  set a column’s initial width in pixels while keeping the column
  resizable. Unlike `width`, which sets a fixed width and disables
  resizing, `initWidth` only sets the starting width, so the column can
  still be resized within its `minWidth` and `maxWidth`.
  ([@nteetor](https://github.com/nteetor),
  [\#223](https://github.com/glin/reactable/issues/223),
  [\#374](https://github.com/glin/reactable/issues/374))

### Minor improvements and bug fixes

- Improved rendering performance for large tables.
- Fixed inconsistent spacing between column group borders on resizable
  tables. ([@wvictor14](https://github.com/wvictor14),
  [\#396](https://github.com/glin/reactable/issues/396))
- Fixed [`JS()`](https://rdrr.io/pkg/htmlwidgets/man/JS.html) not
  working when `htmlwidgets` 1.6.3 or later is installed.
  ([\#348](https://github.com/glin/reactable/issues/348))
- In [`reactableTheme()`](../reference/reactableTheme.md),
  `stripedColor` and `highlightColor` now work when using sticky
  columns. ([@grcatlin](https://github.com/grcatlin),
  [\#401](https://github.com/glin/reactable/issues/401))
- In Crosstalk tables, pagination no longer resets when selecting a row
  on a page greater than 1. ([@msaltieri](https://github.com/msaltieri),
  [\#349](https://github.com/glin/reactable/issues/349))
- In Shiny apps, tables now update correctly when reactive `meta` values
  change. ([@khusmann](https://github.com/khusmann),
  [\#416](https://github.com/glin/reactable/issues/416))
- Fixed pagination showing incorrect page buttons (e.g., “1 2 3 4 5
  NaN”) when using `pagination = FALSE` with `showPagination = TRUE` and
  filtering out all rows.

### Breaking changes

- Internet Explorer 11 (IE 11) is no longer supported.
- `core-js` is no longer included in the HTML dependencies. This was
  required to support IE 11 and old versions of the RStudio Viewer.
  ([\#245](https://github.com/glin/reactable/issues/245))
- `meta` is now converted to JavaScript in the same way as `data`, using
  reactable’s internal JSON serialization function rather than
  htmlwidgets’s JSON serialization function. This should only be a
  breaking change in rare cases, as the major difference is that numeric
  `NA`, `NaN`, `Inf`, and `-Inf` values are now serialized as strings
  and preserved, rather than always being converted to `null`.
  ([@khusmann](https://github.com/khusmann),
  [\#415](https://github.com/glin/reactable/issues/415))
