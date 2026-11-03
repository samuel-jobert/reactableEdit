normalizeRowActions <- function(x) {
  if (!is.list(x) || (length(x) > 0 && (is.null(names(x)) || anyNA(names(x)) ||
      anyDuplicated(names(x)) || any(!names(x) %in% c("add", "remove", "removeDisabled"))))) {
    stop("`rowActions` must be a list with add, remove, and/or removeDisabled")
  }
  for (name in c("add", "remove")) {
    value <- x[[name]]
    if (!is.null(value) && (!is.logical(value) || length(value) != 1 || is.na(value))) {
      stop("`rowActions$", name, "` must be TRUE or FALSE")
    }
  }
  keys <- x[["removeDisabled"]]
  if (!is.null(keys) && (!is.character(keys) || anyNA(keys) || anyDuplicated(keys))) {
    stop("`rowActions$removeDisabled` must contain unique, nonmissing character row keys")
  }
  list(add = isTRUE(x[["add"]]), remove = isTRUE(x[["remove"]]),
       removeDisabled = as.list(if (is.null(keys)) character() else unname(keys)))
}

#' Add and remove rows in Shiny
#'
#' Enable row controls with `reactable(rowActions = list(add = TRUE, remove = TRUE))`.
#' `getReactableRowAction()` returns the latest action reactively.
#' An `"add"` event requests a complete new row from the server. Reply using `addReactableRow()`,
#' passing its `requestId`. An optional `error` reports failure instead of inserting a row.
#' A `"remove"` event reports a row already removed in the browser after user confirmation.
#' The application must enforce permissions and persist all changes in its authoritative data.
#'
#' Added rows appear in a separate section at the bottom of every page, outside sorting, filtering,
#' grouping, and pagination until the next complete data replacement.
#' Use `updateReactable(data = ...)` to integrate additions into the regular table.
#' Full replacement invalidates pending add requests; late replies to those requests are ignored.
#' This feature requires Shiny, stable row keys, client-side processing, and no `.subRows` or Crosstalk data.
#'
#' @param outputId The Shiny output ID of the reactable instance.
#' @param session The Shiny session. Defaults to the current reactive domain.
#' @param data A complete one-row data frame or matrix with the same columns as the current data,
#'   including a new, unique stable row key. The server generates this key.
#' @param inputIds Optional named character vector or named list of input IDs indexed by column ID.
#'   Overrides apply to editable cells; other cells receive default IDs.
#'   IDs are automatically namespaced inside Shiny modules.
#' @param requestId The `"add"` action's request ID. Use `NULL` for a server-initiated append.
#' @param error A nonempty failure message instead of adding data. Requires `requestId`.
#' @return `getReactableRowAction()` returns `NULL` before the first action, or a list containing
#'   `action` and `requestId`. Removal also includes `rowId` and `data` (the removed record).
#'   `addReactableRow()` returns invisibly.
#' @name reactable-row-actions
#' @export
getReactableRowAction <- function(outputId, session = NULL) {
  if (!isInputId(outputId)) stop("`outputId` must be a nonempty ID without whitespace or colons")
  if (is.null(session) && requireNamespace("shiny", quietly = TRUE)) {
    session <- shiny::getDefaultReactiveDomain()
  }
  if (is.null(session)) return(NULL)
  session$input[[sprintf("%s__reactable__row_action", outputId)]]
}

#' @rdname reactable-row-actions
#' @export
addReactableRow <- function(outputId, data = NULL, inputIds = NULL, requestId = NULL,
                            error = NULL, session = NULL) {
  if (!isInputId(outputId)) stop("`outputId` must be a nonempty ID without whitespace or colons")
  if (!is.null(requestId) && !isInputId(requestId)) {
    stop("`requestId` must be NULL or an add action request ID")
  }
  if (!is.null(error)) {
    if (!is.character(error) || length(error) != 1 || is.na(error) || !nzchar(error) ||
        is.null(requestId) || !is.null(data) || !is.null(inputIds)) {
      stop("`error` must be nonempty and accompanied only by a `requestId`")
    }
  } else {
    if ((!is.data.frame(data) && !is.matrix(data)) || nrow(data) != 1 || ncol(data) == 0) {
      stop("`data` must be a complete one-row data frame or matrix")
    }
    if (is.matrix(data)) data <- as.data.frame(data, stringsAsFactors = FALSE)
    if (anyDuplicated(names(data)) || any(!nzchar(names(data)))) {
      stop("`data` must have unique, nonempty column names")
    }
  }
  if (!is.null(inputIds)) {
    if (is.character(inputIds)) inputIds <- as.list(inputIds)
    if (!isNamedList(inputIds) || anyDuplicated(names(inputIds)) ||
        !all(vapply(inputIds, isInputId, logical(1)))) {
      stop("`inputIds` must contain named, valid input IDs")
    }
  }
  if (is.null(session)) session <- shiny::getDefaultReactiveDomain()
  if (is.null(session)) stop("`addReactableRow()` requires an active Shiny session")
  session$sendCustomMessage(sprintf("__reactable__%s", session$ns(outputId)), list(
    addRow = list(data = if (!is.null(data)) toJSON(data),
                  rowNames = if (!is.null(data)) as.list(rownames(data)), inputIds = inputIds,
                  requestId = requestId, error = error)
  ))
  invisible(NULL)
}
