# reactableEdit: Interactive and Editable Data Tables for R

Interactive data tables for R, based on the 'React Table' JavaScript
library. Provides an HTML widget that can be used in 'R Markdown' or
'Quarto' documents, 'Shiny' applications, or viewed from an R console.
An independent fork of the 'reactable' package by Greg Lin, adding
native 'Shiny' cell inputs with server validation, configurable disabled
states, row addition and removal, and rich tooltips. Not an official
release of the original 'reactable' project.

## Details

reactableEdit is an independent fork of
[reactable](https://github.com/glin/reactable), originally developed by
Greg Lin. It adds native Shiny cell editing with server validation,
configurable input states, row actions, and rich tooltips. It is not an
official release of the original project.

See the [fork
repository](https://github.com/samuel-jobert/reactableEdit) for
development and issue reports. The [upstream
documentation](https://glin.github.io/reactable/) describes the shared
API, but not the extensions in this fork.

Load the package with
[`library(reactableEdit)`](https://github.com/samuel-jobert/reactableEdit).
Function names such as [`reactable()`](reactable.md) and
[`reactableOutput()`](reactable-shiny.md), the `Reactable` JavaScript
API, widget classes, and `reactable.*` options retain their original
names for compatibility. The two packages can be installed alongside
each other, but should not be loaded together or have their widgets
mixed in the same HTML document.

## See also

Useful links:

- <https://github.com/samuel-jobert/reactableEdit>

- Report bugs at <https://github.com/samuel-jobert/reactableEdit/issues>

## Author

**Maintainer**: Samuel JOBERT <samuel.jobert@gmail.com> (reactableEdit
fork and extensions)

Authors:

- Samuel JOBERT <samuel.jobert@gmail.com> (reactableEdit fork and
  extensions)

- Greg Lin <glin@glin.io> (Original reactable package) \[copyright
  holder\]

Other contributors:

- Tanner Linsley (React Table library) \[contributor, copyright holder\]

- Emotion team and other contributors (Emotion library) \[contributor,
  copyright holder\]

- Kent Russell (reactR package) \[contributor, copyright holder\]

- Ramnath Vaidyanathan (htmlwidgets package) \[contributor, copyright
  holder\]

- Joe Cheng (htmlwidgets package) \[contributor, copyright holder\]

- JJ Allaire (htmlwidgets package) \[contributor, copyright holder\]

- Yihui Xie (htmlwidgets package) \[contributor, copyright holder\]

- Kenton Russell (htmlwidgets package) \[contributor, copyright holder\]

- Facebook, Inc. and its affiliates (React library) \[contributor,
  copyright holder\]

- FormatJS (FormatJS libraries) \[contributor, copyright holder\]

- Feross Aboukhadijeh, and other contributors (buffer library)
  \[contributor, copyright holder\]

- Roman Shtylman (process library) \[contributor, copyright holder\]

- James Halliday (stream-browserify library) \[contributor, copyright
  holder\]

- Posit Software, PBC \[funder, copyright holder\]
