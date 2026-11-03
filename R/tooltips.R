#' Rich, accessible cell tooltips
#'
#' Tooltips appear on hover or keyboard focus and close with Escape. Content must be noninteractive.
#' Use ordinary text (escaped automatically), or trusted [htmltools::tags] / [htmltools::HTML()] for formatting.
#' Do not pass untrusted HTML, links, controls, scripts, or htmlwidgets.
#'
#' Set defaults with `colDef(tooltip = ..., headerTooltip = ...)`, or use `reactable(tooltips = ...)`.
#' Rules are named lists: `rows = list(key = tooltip)`, `columns = list(column = tooltip)`,
#' `cells = list(key = list(column = tooltip))`, and `headers = list(column = tooltip)`.
#' Rows and cells require `rowId`. Rules follow stable keys across sorting, pagination, virtual scrolling,
#' additions and data replacement.
#'
#' Priority is per-input override, cell, row, table column, then `colDef`.
#' `FALSE` explicitly hides a tooltip. `updateReactable(tooltips = list())` clears table rules and
#' per-input overrides, but keeps column defaults. `NULL` leaves rules unchanged during updates.
#' `updateReactableTooltip()` targets a mounted native editor by input ID, automatically namespaced by Shiny.
#' Its override persists after remounts and data replacement. This helper requires an active session.
#'
#' @param content Text or trusted noninteractive HTML content.
#' @param placement Preferred position: `"top"`, `"bottom"`, `"left"`, or `"right"`.
#'   Tooltips flip and stay within the viewport when space is limited.
#' @param maxWidth Maximum width in CSS pixels. Defaults to 320.
#' @param class Additional CSS classes for the tooltip.
#' @param session The Shiny session.
#' @param inputId Local input ID of a mounted editable cell.
#' @param tooltip A tooltip, text, trusted HTML, or `FALSE` to hide it.
#' @return `reactableTooltip()` returns a tooltip definition.
#'   `updateReactableTooltip()` returns invisibly.
#' @examples
#' reactable(
#'   mtcars,
#'   columns = list(mpg = colDef(
#'     tooltip = function(value) paste("Fuel economy:", value),
#'     headerTooltip = reactableTooltip(htmltools::tags$b("Miles per gallon"))
#'   ))
#' )
#' @name reactable-tooltips
#' @export
reactableTooltip <- function(content, placement = "top", maxWidth = 320, class = NULL) {
  if (!is.character(placement) || length(placement) != 1 || is.na(placement) ||
      !placement %in% c("top", "bottom", "left", "right")) {
    stop("`placement` must be top, bottom, left, or right")
  }
  if (!is.numeric(maxWidth) || length(maxWidth) != 1 || !is.finite(maxWidth) || maxWidth <= 0) {
    stop("`maxWidth` must be a positive finite number")
  }
  if (!is.null(class) && (!is.character(class) || length(class) != 1 || is.na(class))) {
    stop("`class` must be NULL or a character string")
  }
  if (inherits(content, c("shiny.tag", "shiny.tag.list", "html"))) {
    content <- as.character(htmltools::tagList(content))
    if (grepl("<\\s*(a|button|input|select|textarea|iframe|script|style|object|embed|form|audio|video)\\b|\\bon[a-z]+\\s*=|\\b(tabindex|contenteditable)\\s*=",
              content, ignore.case = TRUE, perl = TRUE)) {
      stop("Tooltip HTML must contain only trusted, noninteractive formatting")
    }
    html <- content
  } else {
    if (!is.character(content) || length(content) != 1 || is.na(content)) {
      stop("`content` must be text or trusted noninteractive HTML")
    }
    html <- as.character(htmltools::htmlEscape(content))
  }
  structure(list(html = html, placement = placement, maxWidth = maxWidth, className = class),
            class = "reactableTooltip")
}

normalizeTooltip <- function(x) {
  if (is.null(x) || identical(x, FALSE) || inherits(x, "reactableTooltip")) return(x)
  reactableTooltip(x)
}

normalizeTooltips <- function(x) {
  named <- function(x) is.list(x) && (length(x) == 0 ||
    (!is.null(names(x)) && !anyNA(names(x)) && !anyDuplicated(names(x)) && all(nzchar(names(x)))))
  if (!named(x) || any(!names(x) %in% c("rows", "columns", "cells", "headers"))) {
    stop("`tooltips` must be a named list of rows, columns, cells, and/or headers")
  }
  values <- function(x) {
    if (!named(x)) stop("Tooltip rules must be named lists with unique, nonempty names")
    lapply(x, function(value) {
      if (is.null(value)) stop("Use FALSE to suppress a tooltip rule, not NULL")
      normalizeTooltip(value)
    })
  }
  for (name in names(x)) {
    if (name == "cells") {
      if (!named(x[[name]])) stop("`tooltips$cells` must be a named list of rows")
      x[[name]] <- lapply(x[[name]], values)
    } else {
      x[[name]] <- values(x[[name]])
    }
  }
  x
}

#' @rdname reactable-tooltips
#' @export
updateReactableTooltip <- function(session, inputId, tooltip) {
  if (!isInputId(inputId)) stop("`inputId` must be a nonempty ID without whitespace or colons")
  tooltip <- normalizeTooltip(tooltip)
  if (is.null(tooltip)) stop("Use FALSE to hide an input tooltip")
  if (is.null(session)) stop("`updateReactableTooltip()` requires an active Shiny session")
  session$sendInputMessage(inputId, list(reactableTooltip = tooltip))
  invisible(NULL)
}
