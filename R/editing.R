isInputId <- function(x) {
  is.character(x) && length(x) == 1 && !is.na(x) && nzchar(x) && !grepl("[[:space:]:]", x)
}

normalizeDisabledInputs <- function(x) {
  validNames <- function(x) {
    !is.null(names(x)) && !anyNA(names(x)) && all(nzchar(names(x))) && !anyDuplicated(names(x))
  }
  if (!is.list(x) || (length(x) > 0 && (!validNames(x) ||
      any(!names(x) %in% c("rows", "columns", "cells"))))) {
    stop("`disabledInputs` must be a list with rows, columns, and/or cells")
  }
  ids <- function(value) {
    if (is.null(value)) return(list())
    if (!is.character(value) || anyNA(value) || any(!nzchar(value)) || anyDuplicated(value)) {
      stop("`disabledInputs` rows and columns must contain unique, nonempty character IDs")
    }
    as.list(unname(value))
  }
  cells <- x[["cells"]]
  if (is.null(cells)) cells <- list()
  if (!is.list(cells) || (length(cells) > 0 && !validNames(cells))) {
    stop("`disabledInputs$cells` must be a named list of row keys")
  }
  cells <- lapply(cells, function(value) {
    if (is.character(value)) {
      columns <- ids(value)
      return(stats::setNames(rep(list(TRUE), length(columns)), unlist(columns)))
    }
    if (is.logical(value)) value <- as.list(value)
    if (!is.list(value) || (length(value) > 0 && !validNames(value)) ||
        !all(vapply(value, function(flag) is.logical(flag) && length(flag) == 1 && !is.na(flag),
                    logical(1)))) {
      stop("`disabledInputs$cells` entries must be column IDs or named TRUE/FALSE values")
    }
    value
  })
  list(rows = ids(x[["rows"]]), columns = ids(x[["columns"]]), cells = cells)
}

#' Disable or enable a mounted reactable input
#'
#' Sends a native Shiny input message without changing its value.
#' Standard Shiny `update*Input()` functions do not gain a `disabled` argument.
#' Alternatively, use `session$sendInputMessage(inputId, list(disabled = TRUE))`.
#' For off-page inputs, use `updateReactable(disabledInputs = ...)`.
#'
#' Per-input commands override table and column rules, and persist across pagination and virtual scrolling.
#' Replacing `disabledInputs` through [updateReactable()] clears these per-input overrides.
#' Disabling restores confirmed data instead of submitting an unsent draft.
#' Already pending edits can finish, but the input stays disabled.
#' This is a user-interface control, not an authorization mechanism.
#'
#' @param session The Shiny session. Defaults to the current reactive domain.
#' @param inputId The input ID, without the module namespace when called inside a module.
#' @param disabled Whether to disable the input. Defaults to `TRUE`.
#' @return Invisibly returns `NULL`.
#' @export
updateReactableInput <- function(session = shiny::getDefaultReactiveDomain(), inputId, disabled = TRUE) {
  if (is.null(session)) stop("`updateReactableInput()` requires an active Shiny session")
  if (!isInputId(inputId)) stop("`inputId` must be a nonempty ID without whitespace or colons")
  if (!is.logical(disabled) || length(disabled) != 1 || is.na(disabled)) {
    stop("`disabled` must be TRUE or FALSE")
  }
  session$sendInputMessage(inputId, list(disabled = disabled))
  invisible(NULL)
}

validateEditRowId <- function(data, rowId) {
  if (!is.character(rowId) || length(rowId) != 1 || is.na(rowId) || !rowId %in% names(data)) {
    stop("`rowId` must name a column in `data`")
  }
  keys <- data[[rowId]]
  if ((!is.character(keys) && !is.numeric(keys)) || is.object(keys) ||
      anyNA(keys) || anyDuplicated(as.character(keys)) ||
      (is.numeric(keys) && any(!is.finite(keys) | abs(keys) > 2^53 - 1 | keys != trunc(keys)))) {
    stop("`rowId` values must be unique, nonmissing character or finite safe integer keys")
  }
}

buildCellEditor <- function(column, keys, values) {
  editor <- if (is.null(column[["editor"]])) "text" else column[["editor"]]
  constructor <- getExportedValue("shiny", switch(editor,
    text = "textInput", number = "numericInput", select = "selectInput",
    checkbox = "checkboxInput", date = "dateInput", textarea = "textAreaInput"
  ))
  options <- column$editorOptions
  reserved <- c("inputId", "label", "value", "selected", "multiple", "selectize", "updateOn")
  allowed <- setdiff(names(formals(constructor)), c(reserved, "..."))
  if (anyDuplicated(names(options)) || any(!names(options) %in% allowed)) {
    stop("`editorOptions` contains unsupported or managed arguments for editor `", editor, "`")
  }
  if (editor == "select" && is.null(options$choices)) {
    stop('The "select" editor requires `editorOptions = list(choices = ...)`')
  }
  if (editor == "number" &&
      (!is.numeric(values) || any(!is.na(values) & !is.finite(values)))) {
    stop('The "number" editor requires finite numeric or missing values')
  }
  if (editor == "checkbox" && (!is.logical(values) || anyNA(values))) {
    stop('The "checkbox" editor requires nonmissing logical values')
  }
  if (editor == "date" && !is.Date(values) &&
      (!is.character(values) || any(!is.na(values) & !grepl("^\\d{4}-\\d{2}-\\d{2}$", values)))) {
    stop('The "date" editor requires Date values or ISO date strings')
  }
  if (editor == "select" &&
      any(!is.na(values) & !as.character(values) %in% as.character(unlist(options$choices, use.names = FALSE)))) {
    stop('Values for the "select" editor must exist in `choices`')
  }
  args <- c(list(inputId = "__reactable_input__", label = ""), options)
  if (editor == "select") {
    args$selectize <- FALSE
    args$multiple <- FALSE
  } else {
    args$value <- switch(editor, number = 0, checkbox = FALSE, date = as.Date("1970-01-01"), "")
  }
  column$editorTag <- do.call(constructor, args)
  column$editor <- editor
  if (!is.null(column$inputId)) {
    ids <- lapply(keys, function(key) {
      id <- if (is.function(column$inputId)) column$inputId(key, column$id) else column$inputId
      if (!is.null(id) && !isInputId(id)) {
        stop("`inputId` must return NULL or a nonempty ID without whitespace or colons")
      }
      id
    })
    column$inputIds <- stats::setNames(ids, as.character(keys))
  }
  column$inputId <- NULL
  column$editorOptions <- NULL
  column
}

#' Get and resolve cell edits in Shiny
#'
#' `getReactableEdit()` reactively returns the latest submitted cell edit.
#' Use it in `shiny::observeEvent()` and call `resolveReactableEdit()` after validating and saving the value.
#' The application must validate row IDs, editable columns, permissions, types, and business rules on the server.
#' Columns with `editValidation = FALSE` apply submissions locally without waiting for a response.
#' They still notify Shiny, but do not display a server-validation success indicator, and ignore resolutions.
#' This mode does not provide server validation or persistence.
#'
#' Native input values are also available individually as `input[[id]]`.
#' Text and number inputs submit on blur or Enter; textareas submit on blur or Ctrl/Cmd+Enter.
#' Select and checkbox inputs submit immediately. Dates submit on blur, Enter, or a calendar selection.
#' Escape restores the confirmed value.
#'
#' @param outputId The Shiny output ID of the reactable instance.
#' @param session The Shiny session. Defaults to the current reactive domain.
#' @param edit An edit returned by `getReactableEdit()`.
#' @param value The accepted value, optionally normalized by the server.
#'   Defaults to the submitted value. Use `NULL` for a missing numeric or date value.
#' @param error A nonempty error message to reject the edit, or `NULL` to accept it.
#' @return `getReactableEdit()` returns `NULL` before the first edit, or a list containing
#'   `editId`, `inputId`, `rowId`, `columnId`, `oldValue`, and `value`.
#'   Row IDs and column IDs are strings; dates in this list are ISO date strings.
#'   `resolveReactableEdit()` returns invisibly.
#'
#' @name reactable-editing
#' @export
getReactableEdit <- function(outputId, session = NULL) {
  if (!isInputId(outputId)) {
    stop("`outputId` must be a nonempty ID without whitespace or colons")
  }
  if (is.null(session) && requireNamespace("shiny", quietly = TRUE)) {
    session <- shiny::getDefaultReactiveDomain()
  }
  if (is.null(session)) {
    return(NULL)
  }
  session$input[[sprintf("%s__reactable__edit", outputId)]]
}

#' @rdname reactable-editing
#' @export
resolveReactableEdit <- function(outputId, edit, value = edit$value, error = NULL, session = NULL) {
  if (!isInputId(outputId)) {
    stop("`outputId` must be a nonempty ID without whitespace or colons")
  }
  if (!is.list(edit) || !all(c("editId", "inputId", "rowId", "columnId", "value") %in% names(edit)) ||
      !all(vapply(edit[c("editId", "inputId")], isInputId, logical(1))) ||
      !is.character(edit$columnId) || length(edit$columnId) != 1 || is.na(edit$columnId) ||
      !is.character(edit$rowId) || length(edit$rowId) != 1 || is.na(edit$rowId)) {
    stop("`edit` must be a cell edit returned by `getReactableEdit()`")
  }
  if (!is.null(error) && (!is.character(error) || length(error) != 1 || is.na(error) || !nzchar(error))) {
    stop("`error` must be NULL or a nonempty character string")
  }
  if (is.Date(value)) {
    value <- as.character(value)
  }
  if (!is.null(value) && (length(value) != 1 || is.object(value) ||
      !(is.character(value) || is.numeric(value) || is.logical(value)) || anyNA(value) ||
      (is.numeric(value) && !is.finite(value)))) {
    stop("`value` must be NULL or a finite, nonmissing JSON scalar (or a Date)")
  }
  if (is.null(session) && requireNamespace("shiny", quietly = TRUE)) {
    session <- shiny::getDefaultReactiveDomain()
  }
  if (is.null(session)) {
    stop("`resolveReactableEdit()` requires an active Shiny session")
  }
  session$sendCustomMessage(sprintf("__reactable__%s", session$ns(outputId)), list(
    edit = list(
      editId = edit$editId, inputId = edit$inputId, rowId = edit$rowId,
      columnId = edit$columnId, value = value, error = error
    )
  ))
  invisible(NULL)
}
