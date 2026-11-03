# Run from the repository root with source("@travail/app.R"), then runEditingDemo().
runEditingDemo <- function(virtual = FALSE, module = FALSE, port = getOption("shiny.port", 5873),
                           host = "127.0.0.1", launch.browser = TRUE) {
  devtools::load_all()
  script <- tempfile(fileext = ".R")
  on.exit(unlink(script))
  knitr::purl("design/cell-editing/cell-editing-test.Rmd", output = script, quiet = TRUE)
  code <- sub("^# ?", "", readLines(script, warn = FALSE))
  env <- new.env(parent = globalenv())
  eval(parse(text = code), envir = env)
  shiny::runApp(env$makeEditingApp(virtual, module), host = host, port = port, launch.browser = launch.browser)
}
