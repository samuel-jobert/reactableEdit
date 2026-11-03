import React from 'react'
import PropTypes from 'prop-types'
import { renderTemplate } from './language'
import { isBrowser } from './utils'

let editSequence = 0
const cellKey = (rowId, columnId) => JSON.stringify([String(rowId), columnId])
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function validValue(editor, value) {
  if (editor === 'checkbox') return typeof value === 'boolean'
  if (value == null) return true
  if (editor === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (editor === 'date') {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    )
  }
  return ['string', 'number', 'boolean'].includes(typeof value)
}

export function validateEditingData(data, rowId, columns = []) {
  const keys = new Set()
  for (const row of data) {
    const key = row[rowId]
    if (
      row['.subRows'] ||
      key == null ||
      !['string', 'number'].includes(typeof key) ||
      (typeof key === 'number' && !Number.isSafeInteger(key)) ||
      keys.has(String(key))
    ) {
      throw new Error('Editing requires unique, nonmissing row keys and no .subRows data')
    }
    keys.add(String(key))
    for (const column of columns.filter(col => col.editable)) {
      if (!validValue(column.editor || 'text', row[column.id])) {
        throw new Error(`Invalid ${column.editor || 'text'} value in editable column ${column.id}`)
      }
    }
  }
}

export function useCellEditing({
  data,
  columns,
  rowId,
  inputIdPrefix,
  inputNamespace = '',
  disabledInputs,
  addedInputIds = {},
  rowActionsEnabled = false,
  rootElement,
  language,
  patchCell
}) {
  const enabled = rowActionsEnabled || columns.some(col => col.editable)
  const [outputId, setOutputId] = React.useState(null)
  const records = React.useRef(new Map())
  const disabledRules = React.useRef(disabledInputs || {})
  const disabledOverrides = React.useRef(new Map())
  const [version, setVersion] = React.useState(0)
  const [, redraw] = React.useReducer(n => n + 1, 0)
  const latest = React.useRef()
  latest.current = { data, patchCell }

  React.useEffect(() => {
    if (enabled) {
      setOutputId(rootElement.current.parentElement.getAttribute('data-reactable-output'))
    }
  }, [enabled, rootElement])

  const buildInputIds = (data, addedInputIds) => {
    const ids = new Map()
    if (!enabled) return ids
    if (!rowId || columns.some(col => col.id === rowId && col.editable)) {
      throw new Error('Editing requires a noneditable rowId column')
    }
    validateEditingData(data, rowId, columns)
    if (!outputId) return ids
    const usedIds = new Set()
    const prefix = inputIdPrefix == null ? outputId : inputNamespace + inputIdPrefix
    for (const row of data) {
      const key = String(row[rowId])
      for (const col of columns.filter(col => col.editable)) {
        const override = Object.prototype.hasOwnProperty.call(addedInputIds, key)
          ? addedInputIds[key][col.id]
          : col.inputIds && Object.prototype.hasOwnProperty.call(col.inputIds, key)
            ? col.inputIds[key]
            : null
        const id =
          override != null
            ? inputNamespace + override
            : `${prefix}_${encodeURIComponent(key)}_${encodeURIComponent(col.id)}`
        if (!id || /[\s:]/.test(id) || usedIds.has(id)) {
          throw new Error(`Duplicate or invalid editable input ID: ${id}`)
        }
        usedIds.add(id)
        ids.set(cellKey(key, col.id), id)
      }
    }
    return ids
  }
  const ids = React.useMemo(
    () => buildInputIds(data, addedInputIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, data, columns, rowId, outputId, inputIdPrefix, inputNamespace, addedInputIds]
  )

  const getRecord = (key, columnId) => records.current.get(cellKey(key, columnId))
  const isDisabled = (key, columnId) => {
    const id = cellKey(key, columnId)
    if (disabledOverrides.current.has(id)) return disabledOverrides.current.get(id)
    const rules = disabledRules.current
    const cells = rules.cells
    const row = cells && Object.prototype.hasOwnProperty.call(cells, key) ? cells[key] : null
    if (row && Object.prototype.hasOwnProperty.call(row, columnId)) return row[columnId]
    return Boolean(
      rules.rows?.includes(key) ||
      rules.columns?.includes(columnId) ||
      columns.find(col => col.id === columnId)?.inputDisabled
    )
  }
  const cancelDisabledDrafts = () => {
    for (const [id, record] of records.current) {
      const [key, columnId] = JSON.parse(id)
      if (isDisabled(key, columnId) && !record.pending) records.current.delete(id)
    }
  }
  const setDisabled = (key, columnId, disabled) => {
    if (typeof disabled !== 'boolean') throw new Error('Input disabled must be true or false')
    disabledOverrides.current.set(cellKey(key, columnId), disabled)
    cancelDisabledDrafts()
    redraw()
  }
  const updateDisabledInputs = rules => {
    disabledRules.current = rules
    disabledOverrides.current.clear()
    cancelDisabledDrafts()
    redraw()
  }
  latest.current.updateDisabledInputs = updateDisabledInputs
  React.useEffect(() => {
    latest.current.updateDisabledInputs(disabledInputs || {})
  }, [disabledInputs])
  const putRecord = (key, columnId, record, render = true) => {
    records.current.set(cellKey(key, columnId), record)
    if (render) redraw()
  }
  const draft = (key, columnId, value, draftText) => {
    if (isDisabled(key, columnId)) return
    const record = getRecord(key, columnId) || {}
    putRecord(
      key,
      columnId,
      { ...record, draft: value, draftText, error: null, saved: false, savedAt: null },
      Boolean(record.error || record.saved)
    )
  }
  const fail = (key, columnId, error) => {
    putRecord(key, columnId, { ...getRecord(key, columnId), error, pending: false })
  }
  const clear = () => {
    records.current.clear()
    setVersion(n => n + 1)
  }
  const reset = (key, columnId) => {
    if (getRecord(key, columnId)?.pending) return
    records.current.delete(cellKey(key, columnId))
    redraw()
  }
  const submit = (key, columnId, inputId, value, binding, el) => {
    if (isDisabled(key, columnId) || getRecord(key, columnId)?.pending) return
    const row = latest.current.data.find(row => String(row[rowId]) === key)
    if (!row) throw new Error(`Edited row no longer exists: ${key}`)
    const edit = {
      editId: `edit_${Date.now()}_${++editSequence}`,
      inputId,
      rowId: key,
      columnId,
      oldValue: row[columnId] == null ? null : row[columnId],
      value
    }
    const requiresValidation = columns.find(col => col.id === columnId).editValidation !== false
    putRecord(key, columnId, {
      draft: value,
      publishedValue: value,
      pending: requiresValidation,
      edit
    })
    if (!requiresValidation) latest.current.patchCell(key, columnId, value)
    const type = binding.getType(el)
    // Queue the individual input with the edit so both arrive in the same Shiny flush.
    window.Shiny.setInputValue(type ? `${inputId}:${type}` : inputId, value, {
      priority: 'immediate'
    })
    window.Shiny.setInputValue(`${outputId}__reactable__edit`, edit, { priority: 'event' })
  }
  const resolve = result => {
    const record = getRecord(result.rowId, result.columnId)
    if (
      !record?.pending ||
      record.edit.editId !== result.editId ||
      record.edit.inputId !== result.inputId
    ) {
      return
    }
    if (result.error != null) {
      putRecord(result.rowId, result.columnId, { ...record, pending: false, error: result.error })
    } else {
      const column = columns.find(col => col.id === result.columnId)
      if (!validValue(column.editor || 'text', result.value)) {
        fail(result.rowId, result.columnId, `Invalid server value for ${result.columnId}`)
        return
      }
      latest.current.patchCell(result.rowId, result.columnId, result.value)
      putRecord(result.rowId, result.columnId, {
        draft: result.value,
        publishedValue: result.value,
        saved: true,
        savedAt: Date.now()
      })
    }
  }
  const serverUpdate = (key, columnId, value) => {
    const record = getRecord(key, columnId)
    if (!record?.pending) {
      latest.current.patchCell(key, columnId, value)
    }
    putRecord(key, columnId, {
      ...record,
      draft: value,
      publishedValue: value,
      error: null,
      saved: false,
      savedAt: null
    })
  }

  return {
    enabled,
    available: Boolean(isBrowser() && outputId && window.Shiny?.bindAll && window.jQuery),
    version,
    language,
    getInputId: (key, columnId) => ids.get(cellKey(key, columnId)),
    getRecord,
    draft,
    fail,
    reset,
    submit,
    resolve,
    serverUpdate,
    isDisabled,
    setDisabled,
    updateDisabledInputs,
    validateData: (data, inputIds) => buildInputIds(data, inputIds),
    removeRow: key => {
      for (const id of records.current.keys()) {
        if (JSON.parse(id)[0] === key) records.current.delete(id)
      }
      for (const id of disabledOverrides.current.keys()) {
        if (JSON.parse(id)[0] === key) disabledOverrides.current.delete(id)
      }
    },
    clear
  }
}

function displayValue(editor, value) {
  if (editor === 'checkbox') return Boolean(value)
  if (editor === 'text' || editor === 'textarea' || editor === 'select') {
    return value == null ? '' : String(value)
  }
  return value == null ? null : value
}

export default class CellInput extends React.Component {
  componentDidMount() {
    this.mounted = true
    this.el.addEventListener('click', this.onClick)
    this.bind()
    this.scheduleStatusExpiry()
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.record?.savedAt !== this.props.record?.savedAt ||
      prevProps.record?.saved !== this.props.record?.saved ||
      prevProps.editStatusDuration !== this.props.editStatusDuration
    ) {
      this.scheduleStatusExpiry()
    }
    if (!this.binding) return
    const { record, value } = this.props
    if (this.props.disabled && !prevProps.disabled && !record?.pending) {
      this.setValue(value)
      this.sendValue(this.binding.getValue(this.input))
    }
    if (this.props.editor === 'date' && record?.draftText !== undefined && !record.pending) {
      this.field.value = record.draftText
      this.updateAccessibility()
      return
    }
    if (!sameValue(prevProps.value, value) || record !== prevProps.record) {
      if (
        !record ||
        record.saved ||
        (record.draft !== undefined && !sameValue(record.draft, prevProps.record?.draft))
      ) {
        this.setValue(record?.draft !== undefined ? record.draft : value)
        if (record?.saved) this.sendValue(this.binding.getValue(this.input))
      }
    }
    this.updateAccessibility()
  }

  componentWillUnmount() {
    this.mounted = false
    this.disabledObserver?.disconnect()
    clearTimeout(this.statusTimer)
    this.el.removeEventListener('click', this.onClick)
    if (this.props.available) {
      window.Shiny.unbindAll(this.el)
      window.jQuery(this.el).off('.reactableEditor')
    }
    if (this.field) {
      this.field.removeEventListener('blur', this.onBlur)
      this.field.removeEventListener('keydown', this.onKeyDown)
      this.field.removeEventListener('input', this.onInput)
      // Shiny's date binding does not destroy its popup when unbinding.
      if (this.props.editor === 'date' && window.jQuery(this.field).data('datepicker')) {
        window.jQuery(this.field).bsDatepicker('destroy')
      }
    }
  }

  scheduleStatusExpiry() {
    clearTimeout(this.statusTimer)
    const { record, editStatusDuration = 2000 } = this.props
    if (!record?.saved || !editStatusDuration) return
    const remaining = record.savedAt + editStatusDuration - Date.now()
    if (remaining > 0) {
      this.statusTimer = setTimeout(() => {
        if (this.mounted) this.forceUpdate()
      }, Math.ceil(remaining))
    }
  }

  async bind() {
    const { html, inputId, editor, record, value, available } = this.props
    this.el.innerHTML = html
    for (const node of this.el.querySelectorAll('*')) {
      for (const attr of Array.from(node.attributes)) {
        if (attr.value.includes('__reactable_input__')) {
          node.setAttribute(attr.name, attr.value.replace(/__reactable_input__/g, inputId || ''))
        }
      }
    }
    this.field = this.el.querySelector('input:not([type="hidden"]), select, textarea')
    if (!this.field) {
      this.reportError(new Error('The cell editor has no input element'))
      return
    }
    const initial = record?.draft !== undefined ? record.draft : value
    if (editor === 'checkbox') this.field.checked = Boolean(initial)
    else this.field.value = initial == null ? '' : String(initial)
    if (editor === 'date') {
      this.field.setAttribute('data-initial-date', initial == null ? '' : initial)
      // Parse on commit instead of resetting typed dates when the popup closes.
      this.field.setAttribute('data-date-force-parse', 'false')
    }
    this.field.setAttribute('data-update-on', 'blur')
    this.updateAccessibility()
    if (!available) {
      this.field.disabled = true
      return
    }
    const existing = document.getElementById(inputId)
    if (existing && !this.el.contains(existing)) {
      this.reportError(new Error(`An input already uses ID ${inputId}`))
      return
    }
    const $ = window.jQuery
    this.initializing = true
    $(this.el).on('shiny:inputchanged.reactableEditor', event => {
      if (event.el !== this.input || !this.initializing) return
      event.value =
        record?.publishedValue !== undefined ? record.publishedValue : displayValue(editor, value)
    })
    $(this.el).on('shiny:bound.reactableEditor', event => {
      if (event.bindingType !== 'input' || event.target.id !== inputId) return
      this.input = event.target
      this.binding = event.binding
      this.binding.unsubscribe(this.input)
      this.binding.subscribe(this.input, () => {
        if (this.updating || !this.mounted) return
        if (['checkbox', 'select'].includes(editor)) this.commit()
        if (editor === 'date') {
          this.props.onDraft(this.binding.getValue(this.input), this.field.value)
          if (document.activeElement !== this.field) this.deferCommit()
        }
      })
      // Decorate only this element's receiver, retaining the native binding and Shiny's async message ordering.
      const receiveMessage = async (el, message) => {
        this.updating = true
        try {
          if (Object.prototype.hasOwnProperty.call(message, 'disabled')) {
            if (typeof message.disabled !== 'boolean') {
              throw new Error('Input disabled must be true or false')
            }
          }
          const previous = this.binding.getValue(el)
          const nativeMessage = { ...message }
          delete nativeMessage.disabled
          delete nativeMessage.reactableTooltip
          if (Object.keys(nativeMessage).length) {
            await this.binding.receiveMessage(el, nativeMessage)
          }
          if (!this.mounted) return
          const updated = this.binding.getValue(el)
          if (
            Object.prototype.hasOwnProperty.call(message, 'value') ||
            !sameValue(previous, updated)
          ) {
            this.props.onServerUpdate(updated)
            this.sendValue(updated)
          }
          if (Object.prototype.hasOwnProperty.call(message, 'disabled')) {
            this.props.onDisabledChange(message.disabled)
          }
          if (Object.prototype.hasOwnProperty.call(message, 'reactableTooltip')) {
            this.props.onTooltipChange(message.reactableTooltip)
          }
        } catch (error) {
          this.reportError(error)
        } finally {
          this.updating = false
          if (this.mounted) this.updateAccessibility()
        }
      }
      const receiver = new Proxy(this.binding, {
        get(binding, name) {
          if (name === 'receiveMessage') return receiveMessage
          const value = Reflect.get(binding, name, binding)
          return typeof value === 'function' ? value.bind(binding) : value
        }
      })
      $(this.input).data('shiny-input-binding', receiver)
    })
    this.field.addEventListener('blur', this.onBlur)
    this.field.addEventListener('keydown', this.onKeyDown)
    this.field.addEventListener('input', this.onInput)
    const scope = this.el
    try {
      window.Shiny.initializeInputs(scope)
      await window.Shiny.bindAll(scope)
      this.initializing = false
      if (!this.mounted) {
        window.Shiny.unbindAll(scope)
        return
      }
      if (!this.binding) throw new Error(`No native Shiny binding found for ${inputId}`)
      this.setValue(
        this.props.record?.draft !== undefined ? this.props.record.draft : this.props.value
      )
      if (editor === 'date' && this.props.record?.draftText !== undefined) {
        this.field.value = this.props.record.draftText
      }
      this.updateAccessibility()
      this.disabledObserver = new MutationObserver(mutations => {
        if (!this.mounted) return
        const changes = mutations.filter(mutation => mutation.target === this.field)
        if (!changes.length) return
        const disabled = this.field.disabled
        if (disabled !== this.expectedDisabled) {
          this.props.onDisabledChange(disabled)
          this.updateAccessibility()
        }
      })
      this.disabledObserver.observe(this.field, { attributes: true, attributeFilter: ['disabled'] })
    } catch (error) {
      this.reportError(error)
    }
  }

  reportError(error) {
    if (!this.mounted) return
    console.error('reactable cell editor:', error)
    if (this.field) {
      this.expectedDisabled = true
      this.field.disabled = true
    }
    this.props.onError(error.message)
  }

  setValue(value) {
    const updating = this.updating
    this.updating = true
    this.binding.setValue(
      this.input,
      value == null && ['number', 'text', 'textarea'].includes(this.props.editor) ? '' : value
    )
    if (this.props.editor === 'number') {
      this.field.setAttribute('value', this.field.value)
    }
    this.updating = updating
  }

  sendValue(value) {
    const type = this.binding.getType(this.input)
    window.Shiny.setInputValue(type ? `${this.props.inputId}:${type}` : this.props.inputId, value, {
      priority: 'immediate'
    })
  }

  updateAccessibility() {
    if (!this.field) return
    const { label, record, inputId, available, disabled } = this.props
    this.field.setAttribute('aria-label', label)
    this.field.setAttribute('aria-invalid', record?.error ? 'true' : 'false')
    if (inputId) this.field.setAttribute('aria-describedby', `${inputId}_status`)
    const textEditor = ['text', 'number', 'textarea'].includes(this.props.editor)
    this.expectedDisabled =
      !available || !this.binding || disabled || (Boolean(record?.pending) && !textEditor)
    if (this.field.disabled !== this.expectedDisabled) this.field.disabled = this.expectedDisabled
    this.field.readOnly = Boolean(record?.pending) && textEditor
    if (
      this.expectedDisabled &&
      this.props.editor === 'date' &&
      window.jQuery?.(this.field).data('datepicker')
    ) {
      window.jQuery(this.field).bsDatepicker('hide')
    }
  }

  onClick = event => event.stopPropagation()

  onInput = () => {
    if (this.binding && !this.field.disabled && !this.updating && !this.props.record?.pending) {
      this.props.onDraft(
        this.binding.getValue(this.input),
        this.props.editor === 'date' ? this.field.value : undefined
      )
    }
  }

  onBlur = () => {
    if (['text', 'number', 'textarea'].includes(this.props.editor)) this.commit()
    if (this.props.editor === 'date') this.deferCommit()
  }

  deferCommit = () =>
    Promise.resolve().then(() => {
      if (this.mounted) this.commit()
    })

  onKeyDown = event => {
    if (this.field.disabled) return
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape' && !this.props.record?.pending && this.binding) {
      event.preventDefault()
      event.stopPropagation()
      this.setValue(this.props.value)
      this.sendValue(this.binding.getValue(this.input))
      this.props.onReset()
    } else if (
      event.key === 'Enter' &&
      (this.props.editor !== 'textarea' || event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault()
      event.stopPropagation()
      if (this.props.editor === 'date') this.deferCommit()
      else this.commit()
    }
  }

  commit() {
    if (!this.binding || this.field.disabled || this.updating || this.props.record?.pending) return
    if (!this.field.checkValidity()) {
      this.props.onError(this.field.validationMessage)
      return
    }
    const dateText = this.field.value
    if (this.props.editor === 'date' && window.jQuery(this.field).data('datepicker')) {
      this.updating = true
      window.jQuery(this.field).bsDatepicker('update')
      this.updating = false
    }
    const value = this.binding.getValue(this.input)
    if (
      this.props.editor === 'date' &&
      dateText.trim() &&
      (!value || !validValue('date', value) || dateText.trim() !== this.field.value)
    ) {
      this.field.value = dateText
      this.props.onError(this.props.language.editInvalidDate)
      return
    }
    if (sameValue(value, displayValue(this.props.editor, this.props.value))) return
    try {
      this.props.onSubmit(value, this.binding, this.input)
    } catch (error) {
      this.reportError(error)
    }
  }

  render() {
    const {
      record,
      inputId,
      available,
      language,
      editStatus = 'icon',
      editStatusDuration = 2000
    } = this.props
    const saved =
      record?.saved && (!editStatusDuration || Date.now() < record.savedAt + editStatusDuration)
    const state = record?.error ? 'error' : record?.pending ? 'pending' : saved ? 'saved' : ''
    const status = !available
      ? language.editUnavailable
      : record?.error || (record?.pending ? language.editPending : saved ? language.editSaved : '')
    return (
      <div
        className={`rt-cell-editor rt-cell-editor-mode-${editStatus}`}
        aria-busy={record?.pending ? 'true' : 'false'}
      >
        <div ref={el => (this.el = el)} />
        {available && state && editStatus === 'icon' && (
          <span
            className={`rt-cell-editor-indicator rt-cell-editor-indicator-${state}`}
            aria-hidden="true"
          >
            {state === 'saved' ? '\u2713' : state === 'error' ? '!' : '\u2026'}
          </span>
        )}
        <div
          id={inputId ? `${inputId}_status` : undefined}
          className={
            record?.error
              ? 'rt-cell-editor-error'
              : available && editStatus !== 'text'
                ? 'rt-cell-editor-status rt-cell-editor-sr-only'
                : 'rt-cell-editor-status'
          }
          role={record?.error ? 'alert' : 'status'}
        >
          {status}
        </div>
      </div>
    )
  }
}

CellInput.propTypes = {
  html: PropTypes.string.isRequired,
  inputId: PropTypes.string,
  editor: PropTypes.string.isRequired,
  editStatus: PropTypes.oneOf(['icon', 'text', 'none']),
  editStatusDuration: PropTypes.number,
  value: PropTypes.any,
  record: PropTypes.object,
  available: PropTypes.bool,
  disabled: PropTypes.bool,
  label: PropTypes.string,
  language: PropTypes.object.isRequired,
  onDraft: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
  onServerUpdate: PropTypes.func.isRequired,
  onDisabledChange: PropTypes.func.isRequired,
  onTooltipChange: PropTypes.func.isRequired
}

export function editorLabel(language, column, rowId) {
  return renderTemplate(language.editLabel, { name: column.name, rowId })
}
