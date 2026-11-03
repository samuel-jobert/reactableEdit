# Disable or enable a mounted reactable input

Sends a native Shiny input message without changing its value. Standard
Shiny `update*Input()` functions do not gain a `disabled` argument.
Alternatively, use
`session$sendInputMessage(inputId, list(disabled = TRUE))`. For off-page
inputs, use `updateReactable(disabledInputs = ...)`.

## Usage

``` r
updateReactableInput(
  session = shiny::getDefaultReactiveDomain(),
  inputId,
  disabled = TRUE
)
```

## Arguments

- session:

  The Shiny session. Defaults to the current reactive domain.

- inputId:

  The input ID, without the module namespace when called inside a
  module.

- disabled:

  Whether to disable the input. Defaults to `TRUE`.

## Value

Invisibly returns `NULL`.

## Details

Per-input commands override table and column rules, and persist across
pagination and virtual scrolling. Replacing `disabledInputs` through
[`updateReactable()`](updateReactable.md) clears these per-input
overrides. Disabling restores confirmed data instead of submitting an
unsent draft. Already pending edits can finish, but the input stays
disabled. This is a user-interface control, not an authorization
mechanism.
