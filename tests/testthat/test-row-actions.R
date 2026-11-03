test_that("row action configuration validates and serializes", {
  data <- data.frame(id = c("a", "b"), value = 1:2)
  table <- reactable(data, rowId = "id",
                     rowActions = list(add = TRUE, remove = TRUE, removeDisabled = "a"))
  expect_equal(getAttrib(table, "rowActions"),
               list(add = TRUE, remove = TRUE, removeDisabled = list("a")))
  expect_error(reactable(data, rowActions = list(add = TRUE)), "rowId")
  expect_error(reactable(data, rowId = "id", server = TRUE, rowActions = list()), "not supported")
  data$.subRows <- list(NULL, NULL)
  expect_error(reactable(data, rowId = "id", rowActions = list()), "not supported")
  for (rules in list(TRUE, list("add"), list(add = NA), list(remove = 1),
                     list(other = TRUE), list(removeDisabled = c("a", "a")),
                     list(removeDisabled = NA_character_))) {
    expect_error(normalizeRowActions(rules), "rowActions")
  }
  session <- new.env()
  session$ns <- function(id) shiny::NS("module", id)
  session$sendCustomMessage <- function(type, message) {
    session$message <- list(type = type, message = message)
  }
  updateReactable("tbl", rowActions = list(remove = TRUE), session = session)
  expect_equal(session$message, list(type = "__reactable__module-tbl",
    message = list(rowActions = list(add = FALSE, remove = TRUE, removeDisabled = list()))))
})

test_that("row actions retrieve events and send namespaced typed rows", {
  session <- new.env()
  session$input <- list()
  session$ns <- function(id) shiny::NS("module", id)
  session$sendCustomMessage <- function(type, message) {
    session$message <- list(type = type, message = message)
  }
  expect_null(getReactableRowAction("tbl", session))
  action <- list(action = "add", requestId = "row_1")
  session$input$tbl__reactable__row_action <- action
  expect_equal(getReactableRowAction("tbl", session), action)
  expect_null(getReactableRowAction("tbl"))
  row <- data.frame(id = "a", number = NA_real_, date = as.Date("2026-01-01"), checked = TRUE)
  expect_null(addReactableRow("tbl", row, inputIds = c(number = "custom_number"),
                             requestId = "row_1", session = session))
  expect_equal(session$message$type, "__reactable__module-tbl")
  payload <- session$message$message$addRow
  expect_equal(payload$inputIds, list(number = "custom_number"))
  expect_equal(payload$rowNames, list("1"))
  expect_equal(payload$requestId, "row_1")
  expect_equal(jsonlite::fromJSON(payload$data),
               list(id = "a", number = NA, date = "2026-01-01", checked = TRUE))
  addReactableRow("tbl", matrix(c("b", "value"), nrow = 1, dimnames = list(NULL, c("id", "value"))),
                  session = session)
  expect_null(session$message$message$addRow$requestId)
  addReactableRow("tbl", requestId = "row_1", error = "Try again", session = session)
  expect_equal(session$message$message$addRow$error, "Try again")
  expect_null(session$message$message$addRow$data)
  expect_error(addReactableRow("tbl", row), "active Shiny session")
  expect_error(addReactableRow("tbl", row[FALSE, ], session = session), "one-row")
  expect_error(addReactableRow("tbl", rbind(row, row), session = session), "one-row")
  expect_error(addReactableRow("tbl", row, inputIds = c("unnamed"), session = session), "inputIds")
  expect_error(addReactableRow("tbl", row, inputIds = c(number = "bad:id"), session = session), "inputIds")
  expect_error(addReactableRow("tbl", row, requestId = NA, session = session), "requestId")
  expect_error(addReactableRow("tbl", error = "failure", session = session), "error")
  expect_error(addReactableRow("tbl", row, error = "failure", requestId = "r1", session = session), "error")
  expect_error(getReactableRowAction("bad:id", session), "outputId")
})
