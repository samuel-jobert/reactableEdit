import React from 'react'
import { validateEditingData } from './CellInput'
import { normalizeColumnData } from './columns'
import { isBrowser } from './utils'

let actionSequence = 0

export function useRowActions({
  data,
  columns,
  rowId,
  options,
  rootElement,
  language,
  setData,
  preservePage,
  editing,
  onRemove,
  addedKeys,
  setAddedKeys,
  inputIds,
  setInputIds
}) {
  const [settings, setSettings] = React.useState(options || {})
  const [pending, setPending] = React.useState(null)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState(null)
  const request = React.useRef(null)
  const current = React.useRef()
  current.current = { data, settings, addedKeys, inputIds }

  React.useEffect(() => setSettings(options || {}), [options])

  const outputId = () => rootElement.current.parentElement.getAttribute('data-reactable-output')
  const available = Boolean(isBrowser() && window.Shiny?.setInputValue)
  const publish = action => {
    const id = outputId()
    if (!id || !available) throw new Error(language.editUnavailable)
    window.Shiny.setInputValue(`${id}__reactable__row_action`, action, { priority: 'event' })
  }
  const requestAdd = () => {
    if (request.current || !current.current.settings.add) return
    const requestId = `row_${Date.now()}_${++actionSequence}`
    request.current = requestId
    setPending(requestId)
    setError(null)
    setStatus(language.rowAddPending)
    publish({ action: 'add', requestId })
  }
  const clear = nextData => {
    request.current = null
    current.current = {
      ...current.current,
      data: nextData || current.current.data,
      addedKeys: new Set(),
      inputIds: {}
    }
    setPending(null)
    setAddedKeys(new Set())
    setInputIds({})
    setStatus('')
    setError(null)
  }
  const receive = message => {
    if (message.requestId != null && message.requestId !== request.current) return
    try {
      if (message.error != null) {
        if (typeof message.error !== 'string' || !message.error) {
          throw new Error('Invalid row addition error')
        }
        setError(message.error)
        setStatus('')
        return
      }
      const { data: previous, inputIds: previousIds, addedKeys: previousKeys } = current.current
      let incoming = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
      const names = Object.keys(
        previous[0] || Object.fromEntries(columns.map(col => [col.id, null]))
      )
      if (
        names.includes('.rownames') &&
        incoming &&
        !('.rownames' in incoming) &&
        message.rowNames
      ) {
        incoming = { ...incoming, '.rownames': message.rowNames }
      }
      if (
        !incoming ||
        Object.keys(incoming).length !== names.length ||
        names.some(name => !Object.prototype.hasOwnProperty.call(incoming, name)) ||
        Object.values(incoming).some(values => !Array.isArray(values) || values.length !== 1)
      ) {
        throw new Error('Added row must have exactly the current data columns and one record')
      }
      const row = normalizeColumnData(incoming, columns)[0]
      for (const column of columns.filter(col => col.editable && col.editor === 'select')) {
        const template = document.createElement('div')
        template.innerHTML = column.editorHtml
        if (
          row[column.id] != null &&
          !Array.from(template.querySelectorAll('option')).some(
            option => option.value === String(row[column.id])
          )
        ) {
          throw new Error(`Added value does not exist in choices for ${column.id}`)
        }
      }
      const next = [...previous, row]
      validateEditingData(next, rowId, columns)
      const key = String(row[rowId])
      const overrides = message.inputIds || {}
      for (const [id, inputId] of Object.entries(overrides)) {
        if (!columns.some(col => col.id === id && col.editable)) {
          throw new Error(`Input ID override requires an editable column: ${id}`)
        }
        if (typeof inputId !== 'string' || !inputId || /[\s:]/.test(inputId)) {
          throw new Error(`Invalid added input ID: ${inputId}`)
        }
      }
      const nextIds = { ...previousIds, [key]: overrides }
      const ids = editing.validateData(next, nextIds)
      for (const [cell, id] of ids) {
        if (JSON.parse(cell)[0] === key && document.getElementById(id)) {
          throw new Error(`Editable input ID already exists on the page: ${id}`)
        }
      }
      preservePage.current = true
      current.current.data = next
      current.current.inputIds = nextIds
      const keys = new Set(previousKeys).add(key)
      current.current.addedKeys = keys
      setInputIds(nextIds)
      setAddedKeys(keys)
      setData(next)
      setError(null)
      setStatus(language.rowAdded)
    } catch (error) {
      console.error('reactable row addition:', error)
      setError(error.message)
      setStatus('')
    } finally {
      if (message.requestId != null) {
        request.current = null
        setPending(null)
      }
    }
  }
  const remove = key => {
    const { data, settings } = current.current
    if (!settings.remove || settings.removeDisabled?.includes(key)) return
    const index = data.findIndex(row => String(row[rowId]) === key)
    if (index < 0) throw new Error(`Removed row no longer exists: ${key}`)
    if (!window.confirm(language.rowRemoveConfirm.replace('{rowId}', key))) return
    const row = data[index]
    const requestId = `row_${Date.now()}_${++actionSequence}`
    preservePage.current = true
    const next = data.filter((_, i) => i !== index)
    editing.removeRow(key)
    onRemove(index)
    current.current.data = next
    current.current.addedKeys = new Set([...current.current.addedKeys].filter(id => id !== key))
    current.current.inputIds = Object.fromEntries(
      Object.entries(current.current.inputIds).filter(([id]) => id !== key)
    )
    setData(next)
    setAddedKeys(current.current.addedKeys)
    setInputIds(current.current.inputIds)
    setError(null)
    setStatus(language.rowRemoved)
    publish({ action: 'remove', requestId, rowId: key, data: row })
    return true
  }

  return {
    settings,
    setSettings,
    addedKeys,
    inputIds,
    pending,
    status,
    error,
    available,
    requestAdd,
    receive,
    remove,
    clear
  }
}

export function partitionAddedRows(hooks) {
  hooks.useInstance.push(instance => {
    const { rows, flatRows, rowsById, addedRowKeys, rowKeyColumn } = instance
    const [regular, added] = React.useMemo(
      () => [
        addedRowKeys.size
          ? rows.filter(row => !addedRowKeys.has(String(row.original[rowKeyColumn])))
          : rows,
        rows.filter(row => addedRowKeys.has(String(row.original[rowKeyColumn])))
      ],
      [rows, addedRowKeys, rowKeyColumn]
    )
    instance.addedRows = added
    instance.rows = regular
    instance.flatRows = React.useMemo(
      () =>
        addedRowKeys.size
          ? flatRows.filter(row => !addedRowKeys.has(String(row.original[rowKeyColumn])))
          : flatRows,
      [flatRows, addedRowKeys, rowKeyColumn]
    )
    instance.rowsById = React.useMemo(
      () =>
        addedRowKeys.size
          ? Object.fromEntries(
              Object.entries(rowsById).filter(
                ([, row]) => !addedRowKeys.has(String(row.original[rowKeyColumn]))
              )
            )
          : rowsById,
      [rowsById, addedRowKeys, rowKeyColumn]
    )
  })
}

export function restoreAddedRows(hooks) {
  hooks.useInstance.push(instance => {
    const { rows, flatRows, rowsById, preFilteredRowsById, nonGroupedRowsById, addedRows } =
      instance
    const addedById = React.useMemo(
      () => Object.fromEntries(addedRows.map(row => [row.id, row])),
      [addedRows]
    )
    instance.rows = React.useMemo(
      () => (addedRows.length ? [...rows, ...addedRows] : rows),
      [rows, addedRows]
    )
    instance.flatRows = React.useMemo(
      () => (addedRows.length ? [...flatRows, ...addedRows] : flatRows),
      [flatRows, addedRows]
    )
    instance.rowsById = React.useMemo(
      () => (addedRows.length ? { ...rowsById, ...addedById } : rowsById),
      [rowsById, addedById, addedRows]
    )
    instance.preFilteredRowsById = React.useMemo(
      () => (addedRows.length ? { ...preFilteredRowsById, ...addedById } : preFilteredRowsById),
      [preFilteredRowsById, addedById, addedRows]
    )
    instance.nonGroupedRowsById = React.useMemo(
      () =>
        addedRows.length
          ? { ...(nonGroupedRowsById || rowsById), ...addedById }
          : nonGroupedRowsById,
      [nonGroupedRowsById, rowsById, addedById, addedRows]
    )
  })
  hooks.stateReducers.push((state, action) => {
    if (action.type !== 'removeReactableRow') return state
    const remap = entries =>
      Object.fromEntries(
        Object.entries(entries).flatMap(([id, value]) => {
          if (!/^\d+$/.test(id)) return [[id, value]]
          const index = Number(id)
          return index === action.index
            ? []
            : [[String(index > action.index ? index - 1 : index), value]]
        })
      )
    return {
      ...state,
      selectedRowIds: remap(state.selectedRowIds),
      expanded: remap(state.expanded)
    }
  })
}
