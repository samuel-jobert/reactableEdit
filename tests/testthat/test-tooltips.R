test_that("tooltip content and options are validated", {
  expect_equal(reactableTooltip("a < b")$html, "a &lt; b")
  expect_equal(reactableTooltip(htmltools::tags$b("Bold"))$html, "<b>Bold</b>")
  expect_equal(reactableTooltip(htmltools::HTML("<em>Tip</em>"), "bottom", 240, "custom")$className, "custom")
  for (content in list(NA_character_, c("a", "b"), 1, TRUE, NULL)) {
    expect_error(reactableTooltip(content), "content")
  }
  expect_error(reactableTooltip("x", placement = "auto"), "placement")
  expect_error(reactableTooltip("x", maxWidth = Inf), "maxWidth")
  expect_error(reactableTooltip("x", class = NA_character_), "class")
  expect_error(reactableTooltip(htmltools::tags$button("no")), "noninteractive")
  expect_error(reactableTooltip(htmltools::HTML('<b onclick="bad()">no</b>')), "noninteractive")
})

test_that("columns and stable-key rules support selective tooltips", {
  data <- data.frame(id = c("a", "b"), value = 1:2)
  table <- reactable(data, rowId = "id", tooltips = list(
    rows = list(a = "Row"), columns = list(value = "Column"),
    cells = list(a = list(value = FALSE)), headers = list(value = "Header")
  ), columns = list(value = colDef(tooltip = function(value, index, name) {
    if (index == 1) paste(name, value) else NULL
  }, headerTooltip = "Default header")))
  expect_equal(getAttrib(table, "tooltips")$cells$a$value, FALSE)
  column <- getAttrib(table, "columns")[[2]]
  expect_equal(column$tooltipByKey$a$html, "value 1")
  expect_null(column$tooltipByKey$b)
  expect_equal(column$headerTooltip$html, "Default header")
  table <- reactable(data, columns = list(value = colDef(tooltip = function(value) as.character(value))))
  expect_equal(getAttrib(table, "columns")[[2]]$tooltipByIndex[[2]]$html, "2")
  expect_error(reactable(data, tooltips = list(rows = list(a = "tip"))), "rowId")
  expect_error(normalizeTooltips(list(other = "x")), "tooltips")
  expect_error(normalizeTooltips(list(rows = list("unnamed"))), "named lists")
  expect_error(normalizeTooltips(list(cells = list(a = list(value = NULL)))), "FALSE")
  expect_equal(normalizeTooltips(list()), list())
})

test_that("tooltip updates use table and native input namespaces", {
  session <- new.env()
  session$ns <- function(id) shiny::NS("module", id)
  session$sendCustomMessage <- function(type, message) {
    session$message <- list(type = type, message = message)
  }
  session$sendInputMessage <- function(id, message) {
    session$inputMessage <- list(id = id, message = message)
  }
  updateReactable("tbl", tooltips = list(cells = list(a = list(value = "New"))), session = session)
  expect_equal(session$message$type, "__reactable__module-tbl")
  expect_equal(session$message$message$tooltips$cells$a$value$html, "New")
  updateReactableTooltip(session, "tbl_a_value", "By input ID")
  expect_equal(session$inputMessage$id, "tbl_a_value")
  expect_equal(session$inputMessage$message$reactableTooltip$html, "By input ID")
  updateReactableTooltip(session, "tbl_a_value", FALSE)
  expect_false(session$inputMessage$message$reactableTooltip)
  expect_error(updateReactableTooltip(session, "bad:id", "x"), "inputId")
  expect_error(updateReactableTooltip(session, "valid", NULL), "FALSE")
  expect_error(updateReactableTooltip(NULL, "valid", "x"), "active Shiny")
  native <- shiny::MockShinySession$new()
  sent <- list()
  native$sendInputMessage <- function(id, message) {
    sent[[length(sent) + 1]] <<- list(id = id, message = message)
  }
  module <- native$makeScope("module")
  updateReactableTooltip(module, "tbl_a_value", "Module")
  shiny::updateTextInput(module, "tbl_a_value", value = "native")
  expect_equal(sent[[1]]$id, sent[[2]]$id)
})
