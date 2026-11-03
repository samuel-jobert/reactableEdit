editingSession <- function(namespace = NULL) {
  session <- new.env()
  session$input <- list()
  session$ns <- function(id) shiny::NS(namespace, id)
  session$sendCustomMessage <- function(type, message) {
    session$lastMessage <- list(type = type, message = message)
  }
  session
}

test_that("editable columns validate configuration", {
  expect_error(colDef(editable = NA), "`editable`")
  expect_error(colDef(editable = c(TRUE, FALSE)), "`editable`")
  expect_error(colDef(editor = "password"), "`editor`")
  expect_error(colDef(editorOptions = list(1)), "`editorOptions`")
  expect_error(colDef(inputId = "bad:id"), "`inputId`")
  expect_error(colDef(editable = TRUE, cell = function(x) x), "cannot be combined")
  expect_error(colDef(inputDisabled = NA), "`inputDisabled`")
  expect_error(colDef(inputDisabled = c(TRUE, FALSE)), "`inputDisabled`")
  expect_error(colDef(inputDisabled = 1), "`inputDisabled`")
  for (value in list(NA, NULL, 1, c(TRUE, FALSE))) {
    expect_error(colDef(editValidation = value), "`editValidation`")
  }
  for (value in list(NA, NULL, "invalid", c("icon", "text"))) {
    expect_error(colDef(editStatus = value), "`editStatus`")
  }
  for (value in list(NA, NULL, Inf, -1, 2147483648, "2000", c(1, 2))) {
    expect_error(colDef(editStatusDuration = value), "`editStatusDuration`")
  }
  expect_equal(colDef(), structure(namedList(), class = "colDef"))
})

test_that("disabled input rules validate and serialize", {
  data <- data.frame(id = c("a", "b"), value = 1:2)
  rules <- list(rows = "a", columns = "value",
                cells = list(a = list(value = FALSE), b = "value"))
  table <- reactable(data, rowId = "id",
    columns = list(value = colDef(editable = TRUE, editor = "number", inputDisabled = TRUE)),
    disabledInputs = rules)
  expected <- list(rows = list("a"), columns = list("value"),
                   cells = list(a = list(value = FALSE), b = list(value = TRUE)))
  expect_equal(getAttrib(table, "disabledInputs"), expected)
  expect_true(getAttrib(table, "columns")[[2]]$inputDisabled)
  expect_equal(normalizeDisabledInputs(list(cells = list(a = c(value = FALSE))))$cells,
               list(a = list(value = FALSE)))
  expect_equal(normalizeDisabledInputs(list()), list(rows = list(), columns = list(), cells = list()))
  expect_equal(normalizeDisabledInputs(list(rows = character(), cells = list(a = character())))$cells,
               list(a = list()))
  for (rules in list(TRUE, list(unknown = TRUE), list("a"), list(rows = 1),
                     list(rows = c("a", "a")), list(rows = NA_character_), list(columns = ""),
                     list(cells = list("value")), list(cells = list(a = TRUE)),
                     list(cells = list(a = list(value = NA))),
                     list(cells = list(a = list(value = 1))))) {
    expect_error(reactable(data, disabledInputs = rules), "disabledInputs")
  }
  session <- editingSession("module")
  updateReactable("tbl", disabledInputs = list(rows = "a"), session = session)
  expect_equal(session$lastMessage, list(type = "__reactable__module-tbl",
    message = list(disabledInputs = list(rows = list("a"), columns = list(), cells = list()))))
  updateReactable("tbl", disabledInputs = list(), session = session)
  expect_equal(session$lastMessage$message$disabledInputs,
               list(rows = list(), columns = list(), cells = list()))
  expect_error(updateReactable("tbl", disabledInputs = FALSE, session = session), "disabledInputs")
})

test_that("per-input disabled messages delegate routing like native Shiny updaters", {
  session <- shiny::MockShinySession$new()
  sent <- list()
  session$sendInputMessage <- function(inputId, message) {
    sent[[length(sent) + 1]] <<- list(id = inputId, message = message)
  }
  module <- session$makeScope("module")
  expect_null(updateReactableInput(module, "tbl_a_value"))
  expect_equal(sent[[1]], list(id = "tbl_a_value", message = list(disabled = TRUE)))
  updateReactableInput(module, "tbl_a_value", disabled = FALSE)
  expect_equal(sent[[2]]$message, list(disabled = FALSE))
  shiny::updateTextInput(module, "tbl_a_value", value = "native")
  expect_equal(sent[[3]]$id, sent[[1]]$id)
  expect_error(updateReactableInput(NULL, "cell"), "active Shiny session")
  expect_error(updateReactableInput(module, "bad:id"), "`inputId`")
  expect_error(updateReactableInput(module, "cell", NA), "`disabled`")
  expect_error(updateReactableInput(module, "cell", c(TRUE, FALSE)), "`disabled`")
})

test_that("editing status options serialize and inherit through column defaults", {
  data <- data.frame(id = "a", value = 1, checked = "text")
  table <- reactable(data, rowId = "id",
    defaultColDef = colDef(editStatus = "text", editStatusDuration = 500),
    columns = list(
      value = colDef(editable = TRUE, editor = "number", editValidation = FALSE,
                     editStatus = "none", editStatusDuration = 0),
      checked = colDef(editable = TRUE)
    )
  )
  columns <- getAttrib(table, "columns")
  expect_false(columns[[2]]$editValidation)
  expect_equal(columns[[2]]$editStatus, "none")
  expect_equal(columns[[2]]$editStatusDuration, 0)
  expect_equal(columns[[3]]$editStatus, "text")
  expect_equal(columns[[3]]$editStatusDuration, 500)
  expect_true(colDef(editValidation = TRUE)$editValidation)
  expect_equal(colDef(editStatusDuration = 2000)$editStatusDuration, 2000)
})

test_that("editing requires stable keys and supported data processing", {
  data <- data.frame(id = c("a", "b"), value = 1:2)
  columns <- list(value = colDef(editable = TRUE, editor = "number"))
  table <- reactable(data, columns = columns)
  expect_equal(getAttrib(table, "rowId"), ".rowId")
  expect_equal(jsonlite::fromJSON(as.character(getAttrib(table, "data")))$.rowId, c("1", "2"))
  expect_false(getAttrib(table, "columns")[[3]]$show)
  rownames(data) <- c("first", "second")
  for (mode in c("rownames", "new")) {
    table <- reactable(data, rowId = mode, columns = columns)
    key <- getAttrib(table, "rowId")
    values <- jsonlite::fromJSON(as.character(getAttrib(table, "data")))[[key]]
    expect_equal(values, if (mode == "new") 1:2 else c("first", "second"))
    expect_false(tail(getAttrib(table, "columns"), 1)[[1]]$show)
  }
  table <- reactable(data.frame(new = c("a", "b"), value = 1:2), rowId = "new", columns = columns)
  expect_equal(getAttrib(table, "rowId"), "new")
  table <- reactable(data.frame(.rowId = c("a", "b"), value = 1:2, check.names = FALSE),
                     columns = columns)
  expect_equal(getAttrib(table, "rowId"), ".rowId.1")
  table <- reactable(data.frame(value = 1:2), rowId = "new")
  expect_equal(jsonlite::fromJSON(as.character(getAttrib(table, "data")))[[getAttrib(table, "rowId")]], 1:2)
  expect_error(reactable(data, rowId = "missing", columns = columns), "`rowId`")
  expect_error(reactable(transform(data, id = c("a", "a")), rowId = "id", columns = columns), "unique")
  expect_error(reactable(transform(data, id = c("a", NA)), rowId = "id", columns = columns), "nonmissing")
  expect_error(reactable(data, rowId = "id", columns = list(id = colDef(editable = TRUE))),
               "cannot be editable")
  expect_error(reactable(data, rowId = "id", columns = columns, server = TRUE), "not supported")
  data$.subRows <- list(NULL, NULL)
  expect_error(reactable(data, rowId = "id", columns = columns), "not supported")
  expect_error(reactable(data.frame(id = c(1, Inf)), rowId = "id"), "finite")
  expect_error(reactable(data.frame(id = c(1, 2^54)), rowId = "id"), "finite")
  expect_error(reactable(data.frame(id = c(1, 1.1)), rowId = "id"), "safe integer")
  expect_error(reactable(data.frame(id = "a"), rowId = "id", inputIdPrefix = "bad id"), "inputIdPrefix")
})

test_that("R creates native input templates and overrides", {
  data <- data.frame(id = c("a", "b"), value = c("one", "two"))
  for (editor in c("text", "number", "select", "checkbox", "date", "textarea")) {
    data$value <- switch(editor, number = c(1, 2), checkbox = c(TRUE, FALSE),
                         date = as.Date(c("2026-01-01", NA)), c("one", "two"))
    options <- if (editor == "select") list(choices = c("one", "two")) else NULL
    table <- reactable(data, rowId = "id", columns = list(
      value = colDef(editable = TRUE, editor = editor, editorOptions = options,
                     inputId = function(rowId, columnId) {
                       if (rowId == "a") paste(rowId, columnId, sep = "_") else NULL
                     })
    ))
    col <- getAttrib(table, "columns")[[2]]
    expect_true(col$editable)
    expect_identical(col$editor, editor)
    expect_match(col$editorHtml, "__reactable_input__", fixed = TRUE)
    expect_equal(col$inputIds, list(a = "a_value", b = NULL))
    expect_null(col[["inputId"]])
    if (editor == "date") {
      expect_true(any(vapply(table$dependencies, function(dep) grepl("datepicker", dep$name), logical(1))))
    }
  }
  expect_error(reactable(data, rowId = "id", columns = list(
    value = colDef(editable = TRUE, editor = "select")
  )), "requires")
  expect_error(reactable(data, rowId = "id", columns = list(
    value = colDef(editable = TRUE, editorOptions = list(value = "override"))
  )), "managed arguments")
  expect_error(reactable(data, rowId = "id", columns = list(
    value = colDef(editable = TRUE, inputId = function(...) "bad:id")
  )), "inputId")
})

test_that("cell editing retrieves and resolves events with module namespaces", {
  session <- editingSession("module")
  edit <- list(editId = "edit_1", inputId = "module_tbl_a_value", rowId = "a",
               columnId = "value", oldValue = 1, value = 2)
  expect_null(getReactableEdit("tbl", session = session))
  session$input$tbl__reactable__edit <- edit
  expect_equal(getReactableEdit("tbl", session = session), edit)
  expect_null(getReactableEdit("tbl"))
  resolveReactableEdit("tbl", edit, session = session)
  expect_equal(session$lastMessage, list(
    type = "__reactable__module-tbl",
    message = list(edit = c(edit[c("editId", "inputId", "rowId", "columnId")],
                           list(value = 2, error = NULL)))
  ))
  resolveReactableEdit("tbl", edit, value = 3, session = session)
  expect_equal(session$lastMessage$message$edit$value, 3)
  resolveReactableEdit("tbl", edit, value = as.Date("2026-01-02"), session = session)
  expect_identical(session$lastMessage$message$edit$value, "2026-01-02")
  resolveReactableEdit("tbl", edit, value = NULL, session = session)
  expect_true("value" %in% names(session$lastMessage$message$edit))
  expect_null(session$lastMessage$message$edit$value)
  resolveReactableEdit("tbl", edit, error = "Not permitted", session = session)
  expect_equal(session$lastMessage$message$edit$error, "Not permitted")
  expect_error(resolveReactableEdit("tbl", edit), "active Shiny session")
  expect_error(resolveReactableEdit("tbl", list(), session = session), "cell edit")
  expect_error(resolveReactableEdit("tbl", edit, error = "", session = session), "nonempty")
  expect_error(resolveReactableEdit("tbl", edit, value = Inf, session = session), "JSON scalar")
  expect_error(resolveReactableEdit("tbl", edit, value = NA, session = session), "JSON scalar")
  expect_error(getReactableEdit(1, session = session), "outputId")
})
