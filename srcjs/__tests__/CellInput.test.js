import React from 'react'
import reactR from 'reactR'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import { Reactable, getInstance } from '../Reactable'

jest.mock('reactR')
reactR.hydrate = (components, tag) => tag

// Exercise the native binding lifecycle without requiring an R installation in Jest.
function mockShiny() {
  const handlers = new WeakMap()
  const data = new WeakMap()
  const trigger = (el, event) => {
    event.target = event.target || el
    for (let node = el; node; node = node.parentElement) {
      for (const [name, handler] of handlers.get(node) || []) {
        if (name.split('.')[0] === event.type) handler(event)
      }
    }
  }
  window.jQuery = el => ({
    on(name, handler) {
      handlers.set(el, [...(handlers.get(el) || []), [name, handler]])
    },
    off() {
      handlers.delete(el)
    },
    data(name, value) {
      if (value !== undefined) data.set(el, { ...data.get(el), [name]: value })
      return data.get(el)?.[name]
    }
  })
  const messages = {}
  window.Shiny = {
    initializeInputs: jest.fn(),
    setInputValue: jest.fn(),
    onInputChange: jest.fn(),
    addCustomMessageHandler: jest.fn((name, handler) => (messages[name] = handler)),
    unbindAll: jest.fn(scope => {
      for (const el of scope.querySelectorAll('.shiny-bound-input')) {
        window.jQuery(el).data('shiny-input-binding').unsubscribe(el)
        el.classList.remove('shiny-bound-input')
      }
    }),
    bindAll: jest.fn(async scope => {
      for (const el of scope.querySelectorAll(
        'input[id], select[id], textarea[id], .shiny-date-input'
      )) {
        const field = el.matches('.shiny-date-input') ? el.querySelector('input') : el
        let listener
        const binding = {
          getType: () =>
            field.type === 'number'
              ? 'shiny.number'
              : el.matches('.shiny-date-input')
                ? 'shiny.date'
                : '',
          getValue: () =>
            field.type === 'checkbox'
              ? field.checked
              : field.type === 'number'
                ? field.value === ''
                  ? null
                  : Number(field.value)
                : el.matches('.shiny-date-input')
                  ? field.value || null
                  : field.value,
          setValue: (_, value) => {
            if (field.type === 'checkbox') field.checked = value
            else field.value = value == null ? '' : value
          },
          subscribe: (_, callback) => {
            listener = () => callback(false)
            field.addEventListener('change', listener)
          },
          unsubscribe() {
            if (this !== binding) throw new TypeError('Invalid native input binding receiver')
            field.removeEventListener('change', listener)
          },
          receiveMessage: jest.fn(async (_, message) => {
            if ('value' in message) binding.setValue(el, message.value)
            if ('min' in message) field.min = message.min
            field.dispatchEvent(new Event('change'))
          })
        }
        binding.subscribe(el, () => {})
        window.jQuery(el).data('shiny-input-binding', binding)
        el.classList.add('shiny-bound-input')
        trigger(el, { type: 'shiny:bound', bindingType: 'input', binding })
        const event = { type: 'shiny:inputchanged', el, value: binding.getValue(el) }
        trigger(el, event)
        window.Shiny.setInputValue(el.id, event.value, { priority: 'immediate' })
      }
    })
  }
  return messages
}

const templates = {
  text: '<input id="__reactable_input__" type="text">',
  number: '<input id="__reactable_input__" type="number" step="any">',
  select: '<select id="__reactable_input__"><option>a</option><option>b</option></select>',
  checkbox: '<input id="__reactable_input__" type="checkbox">',
  date: '<div id="__reactable_input__" class="shiny-date-input"><input type="text"></div>',
  textarea: '<textarea id="__reactable_input__"></textarea>'
}

function table(editor = 'text', value = 'a', extra = {}) {
  return {
    data: { id: ['r1', 'r2', 'r3'], value: [value, value, value] },
    columns: [
      { id: 'id', name: 'ID', show: false },
      { id: 'value', name: 'Value', editable: true, editor, editorHtml: templates[editor] }
    ],
    rowId: 'id',
    defaultPageSize: 2,
    ...extra
  }
}

async function setup(props = table()) {
  const result = render(
    <div data-reactable-output="tbl">
      <Reactable {...props} />
    </div>
  )
  await waitFor(() => expect(result.getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  window.Shiny.setInputValue.mockClear()
  return result
}

function edits() {
  return window.Shiny.setInputValue.mock.calls
    .filter(([id]) => id === 'tbl__reactable__edit')
    .map(([, edit]) => edit)
}

let messages
beforeEach(() => {
  messages = mockShiny()
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete window.Shiny
  delete window.jQuery
})

it.each([
  ['text', 'a', 'b', 'b'],
  ['number', 1, '2', 2],
  ['textarea', 'a', 'b', 'b']
])('commits native %s inputs on blur, not typing', async (editor, initial, entered, expected) => {
  const { getAllByLabelText } = await setup(table(editor, initial))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: entered } })
  expect(edits()).toHaveLength(0)
  fireEvent.blur(field)
  expect(edits()).toEqual([
    expect.objectContaining({
      inputId: 'tbl_r1_value',
      rowId: 'r1',
      columnId: 'value',
      oldValue: initial,
      value: expected
    })
  ])
  expect(field).toHaveAttribute('readonly')
  fireEvent.blur(field)
  expect(edits()).toHaveLength(1)
})

it.each([
  ['select', 'a', 'b'],
  ['checkbox', false, true]
])('commits native %s changes immediately', async (editor, initial, expected) => {
  const { getAllByLabelText } = await setup(table(editor, initial))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.change(field, {
    target: editor === 'checkbox' ? { checked: expected } : { value: expected }
  })
  expect(edits()[0].value).toBe(expected)
})

it('commits typed native dates on blur using the native date type', async () => {
  const { getAllByLabelText } = await setup(table('date', '2026-01-01'))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: '2026-02-02' } })
  expect(edits()).toHaveLength(0)
  fireEvent.blur(field)
  await waitFor(() => expect(edits()).toHaveLength(1))
  expect(edits()[0]).toMatchObject({ value: '2026-02-02', oldValue: '2026-01-01' })
  expect(window.Shiny.setInputValue).toHaveBeenCalledWith('tbl_r1_value:shiny.date', '2026-02-02', {
    priority: 'immediate'
  })
})

it('confirms normalized values and preserves page, selection and expanded state', async () => {
  const { getAllByLabelText, getByText } = await setup(
    table('number', 1, {
      selection: 'multiple',
      defaultSelected: [2],
      details: true
    })
  )
  act(() => getInstance('tbl').gotoPage(1))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: '2' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  const edit = edits()[0]
  act(() => messages.__reactable__tbl({ edit: { ...edit, value: 3, error: null } }))
  expect(getInstance('tbl').state.page).toBe(1)
  expect(getInstance('tbl').state.selected).toEqual([2])
  expect(getInstance('tbl').state.data[2].value).toBe(3)
  expect(field).toHaveValue(3)
  expect(field).toHaveAttribute('value', '3')
  expect(field).not.toBeDisabled()
  expect(getByText('Saved')).toHaveAttribute('role', 'status')
  expect(edits()).toHaveLength(1)
})

it('retains a rejected draft, permits retry, and cancels with Escape', async () => {
  const { getAllByLabelText, getByRole } = await setup()
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'b' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: 'Not allowed' } }))
  expect(field).toHaveValue('b')
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(getByRole('alert')).toHaveTextContent('Not allowed')
  expect(
    field.closest('.rt-cell-editor').querySelector('.rt-cell-editor-indicator-error')
  ).toHaveTextContent('!')
  expect(getInstance('tbl').state.data[0].value).toBe('a')
  fireEvent.input(field, { target: { value: 'c' } })
  expect(field).toHaveAttribute('aria-invalid', 'false')
  expect(field.closest('.rt-cell-editor').querySelector('.rt-cell-editor-indicator')).toBeNull()
  expect(field.closest('.rt-cell-editor')).not.toHaveTextContent('Not allowed')
  fireEvent.blur(field)
  expect(edits()).toHaveLength(2)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[1], error: 'Still invalid' } }))
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field).toHaveValue('a')
  expect(field).toHaveAttribute('aria-invalid', 'false')
})

it('does not submit IME Enter or unmodified textarea Enter', async () => {
  const { getAllByLabelText } = await setup(table('textarea'))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'b' } })
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(edits()).toHaveLength(0)
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
  expect(edits()).toHaveLength(1)
})

it('keeps unsent drafts and pending requests across pagination without publishing drafts', async () => {
  const { getAllByLabelText } = await setup()
  fireEvent.input(getAllByLabelText(/Edit Value/)[0], { target: { value: 'draft' } })
  act(() => getInstance('tbl').gotoPage(1))
  act(() => getInstance('tbl').gotoPage(0))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  expect(getAllByLabelText(/Edit Value/)[0]).toHaveValue('draft')
  expect(edits()).toHaveLength(0)
  expect(
    window.Shiny.setInputValue.mock.calls.filter(([id]) => id === 'tbl_r1_value').at(-1)[1]
  ).toBe('a')
  fireEvent.blur(getAllByLabelText(/Edit Value/)[0])
  const edit = edits()[0]
  act(() => getInstance('tbl').gotoPage(1))
  act(() => messages.__reactable__tbl({ edit: { ...edit, error: 'Try again' } }))
  act(() => getInstance('tbl').gotoPage(0))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  expect(getAllByLabelText(/Edit Value/)[0]).toHaveValue('draft')
  expect(getAllByLabelText(/Edit Value/)[0]).toHaveAttribute('aria-invalid', 'true')
})

it('delegates update*Input messages to the native receiver without creating edits', async () => {
  const { getAllByLabelText } = await setup(table('number', 1))
  const field = getAllByLabelText(/Edit Value/)[0]
  const receiver = window.jQuery(field).data('shiny-input-binding')
  await act(async () => receiver.receiveMessage(field, { value: 7, min: 2 }))
  expect(field).toHaveValue(7)
  expect(field).toHaveAttribute('min', '2')
  expect(getInstance('tbl').state.data[0].value).toBe(7)
  expect(edits()).toHaveLength(0)
})

it('supports independent pending edits and ignores superseded replies after replacement', async () => {
  const { getAllByLabelText } = await setup()
  for (const field of getAllByLabelText(/Edit Value/)) {
    fireEvent.input(field, { target: { value: 'b' } })
    fireEvent.blur(field)
  }
  const [first, second] = edits()
  expect(first.editId).not.toBe(second.editId)
  act(() => messages.__reactable__tbl({ edit: { ...second, value: 'second', error: null } }))
  expect(getInstance('tbl').state.data[1].value).toBe('second')
  act(() => messages.__reactable__tbl({ data: { id: ['r1'], value: ['replacement'] } }))
  act(() => messages.__reactable__tbl({ edit: { ...first, value: 'stale', error: null } }))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).toHaveValue('replacement'))
  expect(getInstance('tbl').state.data[0].value).toBe('replacement')
})

it('namespaces custom prefixes and cell-specific IDs', async () => {
  const props = table()
  props.columns[1].inputIds = { r1: 'special' }
  const { getAllByLabelText } = await setup({
    ...props,
    inputIdPrefix: 'custom',
    inputNamespace: 'module-'
  })
  const fields = getAllByLabelText(/Edit Value/)
  expect(fields[0]).toHaveAttribute('id', 'module-special')
  expect(fields[1]).toHaveAttribute('id', 'module-custom_r2_value')
})

it('checks native constraints without submitting an invalid value', async () => {
  const props = table('number', 1)
  props.columns[1].editorHtml = '<input id="__reactable_input__" type="number" min="0">'
  const { getAllByLabelText, getByRole } = await setup(props)
  fireEvent.input(getAllByLabelText(/Edit Value/)[0], { target: { value: '-1' } })
  fireEvent.blur(getAllByLabelText(/Edit Value/)[0])
  expect(edits()).toHaveLength(0)
  expect(getByRole('alert')).toBeVisible()
})

it('unbinds native controls when rows leave the page', async () => {
  const { unmount } = await setup()
  window.Shiny.unbindAll.mockClear()
  unmount()
  expect(window.Shiny.unbindAll).toHaveBeenCalledTimes(2)
})

it('does not publish an unsent draft when only native options change', async () => {
  const { getAllByLabelText } = await setup()
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'draft' } })
  const receiver = window.jQuery(field).data('shiny-input-binding')
  await act(async () => receiver.receiveMessage(field, { placeholder: 'Type here' }))
  expect(field).toHaveValue('draft')
  expect(getInstance('tbl').state.data[0].value).toBe('a')
  expect(window.Shiny.setInputValue).not.toHaveBeenCalled()
})

it('keeps normalized server updates pending until explicit confirmation', async () => {
  const { getAllByLabelText } = await setup(table('number', 1))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: '2' } })
  fireEvent.blur(field)
  const edit = edits()[0]
  await act(async () =>
    window.jQuery(field).data('shiny-input-binding').receiveMessage(field, { value: 3 })
  )
  expect(field).toHaveValue(3)
  expect(field).toHaveAttribute('readonly')
  expect(getInstance('tbl').state.data[0].value).toBe(1)
  act(() => messages.__reactable__tbl({ edit: { ...edit, value: 3, error: null } }))
  expect(getInstance('tbl').state.data[0].value).toBe(3)
  expect(field).not.toHaveAttribute('readonly')
  expect(edits()).toHaveLength(1)
})

it('uses original row keys after sorting and accepts missing numeric values', async () => {
  const { getAllByLabelText } = await setup(
    table('number', 1, {
      data: { id: ['r1', 'r2', 'r3'], value: [1, 3, 2] },
      defaultSorted: [{ id: 'value', desc: true }]
    })
  )
  const field = getAllByLabelText(/Edit Value/)[0]
  expect(field.id).toBe('tbl_r2_value')
  fireEvent.input(field, { target: { value: '' } })
  fireEvent.blur(field)
  expect(edits()[0]).toMatchObject({ rowId: 'r2', oldValue: 3, value: null })
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], value: null, error: null } }))
  expect(getInstance('tbl').state.data[1].value).toBeNull()
})

it('shows invalid server response types instead of corrupting the data', async () => {
  const { getAllByLabelText, getByRole } = await setup(table('number', 1))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: '2' } })
  fireEvent.blur(field)
  act(() =>
    messages.__reactable__tbl({ edit: { ...edits()[0], value: 'not a number', error: null } })
  )
  expect(getByRole('alert')).toHaveTextContent('Invalid server value')
  expect(getInstance('tbl').state.data[0].value).toBe(1)
})

it('cleans up an asynchronous binding that finishes after unmount', async () => {
  const bind = window.Shiny.bindAll
  let finish
  window.Shiny.bindAll = jest.fn(async el => {
    await new Promise(resolve => (finish = resolve))
    await bind(el)
  })
  const { unmount } = render(
    <div data-reactable-output="tbl">
      <Reactable {...table('text', 'a', { defaultPageSize: 1 })} />
    </div>
  )
  await waitFor(() => expect(finish).toBeDefined())
  const scope = window.Shiny.bindAll.mock.calls[0][0]
  unmount()
  window.Shiny.unbindAll.mockClear()
  await act(async () => finish())
  expect(window.Shiny.unbindAll).toHaveBeenCalledWith(scope)
  expect(scope.querySelector('.shiny-bound-input')).toBeNull()
})

it('clamps to the last page when an accepted edit removes the current filtered page', async () => {
  const { getAllByLabelText } = await setup(table('text', 'a', { searchable: true }))
  act(() => getInstance('tbl').setGlobalFilter('a'))
  act(() => getInstance('tbl').gotoPage(1))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'b' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], value: 'b', error: null } }))
  expect(getInstance('tbl').state.page).toBe(0)
  expect(getAllByLabelText(/Edit Value/)).toHaveLength(2)
})

it('rejects invalid typed dates without submitting a missing date', async () => {
  const { getAllByLabelText, getByRole } = await setup(table('date', '2026-01-01'))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'invalid' } })
  fireEvent.blur(field)
  await waitFor(() => expect(getByRole('alert')).toHaveTextContent('Enter a valid date'))
  expect(field).toHaveValue('invalid')
  expect(edits()).toHaveLength(0)
})

it('rejects duplicate cell IDs before binding native inputs', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const props = table()
  props.columns[1].inputIds = { r1: 'duplicate', r2: 'duplicate' }
  expect(() =>
    render(
      <div data-reactable-output="tbl">
        <Reactable {...props} />
      </div>
    )
  ).toThrow('Duplicate or invalid editable input ID')
  expect(window.Shiny.bindAll).not.toHaveBeenCalled()
})

it('renders unavailable editors read-only outside a Shiny output', () => {
  const { getAllByLabelText, getAllByText } = render(<Reactable {...table()} />)
  expect(getAllByLabelText(/Edit Value/).every(field => field.disabled)).toBe(true)
  expect(getAllByText('Cell editing requires a Shiny output')).toHaveLength(2)
  expect(window.Shiny.bindAll).not.toHaveBeenCalled()
})

it.each([2000, 500])('expires accepted icons after exactly %i ms', async duration => {
  const props = table()
  if (duration !== 2000) props.columns[1].editStatusDuration = duration
  const { getAllByLabelText } = await setup(props)
  jest.useFakeTimers()
  const field = getAllByLabelText(/Edit Value/)[0]
  const wrapper = field.closest('.rt-cell-editor')
  fireEvent.input(field, { target: { value: 'b' } })
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
  fireEvent.blur(field)
  expect(wrapper.querySelector('.rt-cell-editor-indicator-pending')).toHaveTextContent('\u2026')
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).toBeNull()
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).toHaveTextContent('\u2713')
  expect(wrapper.querySelector('[role="status"]')).toHaveTextContent('Saved')
  expect(wrapper.querySelector('[role="status"]')).toHaveClass('rt-cell-editor-sr-only')
  act(() => jest.advanceTimersByTime(duration - 1))
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).not.toBeNull()
  act(() => jest.advanceTimersByTime(1))
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
  expect(wrapper.querySelector('[role="status"]')).toBeEmptyDOMElement()
})

it('retains a persistent success only until new input and never validates drafts', async () => {
  const props = table('number', 1)
  props.columns[1].editStatusDuration = 0
  props.columns[1].editorHtml = '<input id="__reactable_input__" type="number" min="0">'
  const { getAllByLabelText } = await setup(props)
  jest.useFakeTimers()
  const field = getAllByLabelText(/Edit Value/)[0]
  const wrapper = field.closest('.rt-cell-editor')
  fireEvent.input(field, { target: { value: '2' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  act(() => jest.advanceTimersByTime(60000))
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).not.toBeNull()
  fireEvent.input(field, { target: { value: '-1' } })
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
  expect(field).toHaveAttribute('aria-invalid', 'false')
  fireEvent.blur(field)
  expect(wrapper.querySelector('.rt-cell-editor-indicator-error')).not.toBeNull()
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(edits()).toHaveLength(1)
})

it.each(['text', 'none'])(
  'supports %s mode without icons and keeps errors accessible',
  async mode => {
    const props = table()
    props.columns[1].editStatus = mode
    const { getAllByLabelText, getByRole } = await setup(props)
    const field = getAllByLabelText(/Edit Value/)[0]
    const wrapper = field.closest('.rt-cell-editor')
    fireEvent.input(field, { target: { value: 'b' } })
    fireEvent.blur(field)
    const status = wrapper.querySelector('[role="status"]')
    expect(status).toHaveTextContent('Saving...')
    expect(status.classList.contains('rt-cell-editor-sr-only')).toBe(mode === 'none')
    act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
    expect(status).toHaveTextContent('Saved')
    expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
    fireEvent.input(field, { target: { value: 'c' } })
    expect(status).toBeEmptyDOMElement()
    fireEvent.blur(field)
    act(() => messages.__reactable__tbl({ edit: { ...edits()[1], error: 'Rejected' } }))
    expect(getByRole('alert')).toHaveTextContent('Rejected')
    expect(getByRole('alert')).not.toHaveClass('rt-cell-editor-sr-only')
    expect(field).toHaveAttribute('aria-describedby', 'tbl_r1_value_status')
  }
)

it('does not restart expired success when a cell remounts', async () => {
  const { getAllByLabelText } = await setup()
  jest.useFakeTimers()
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'b' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  act(() => getInstance('tbl').gotoPage(1))
  act(() => jest.advanceTimersByTime(2000))
  await act(async () => getInstance('tbl').gotoPage(0))
  const remounted = getAllByLabelText(/Edit Value/)[0]
  expect(remounted).toHaveValue('b')
  expect(remounted.closest('.rt-cell-editor').querySelector('.rt-cell-editor-indicator')).toBeNull()
  expect(edits()).toHaveLength(1)
})

it('preserves the remaining success duration over remount and cancels stale timers', async () => {
  const { getAllByLabelText } = await setup()
  jest.useFakeTimers()
  let field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'b' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  act(() => jest.advanceTimersByTime(500))
  act(() => getInstance('tbl').gotoPage(1))
  await act(async () => getInstance('tbl').gotoPage(0))
  field = getAllByLabelText(/Edit Value/)[0]
  const wrapper = field.closest('.rt-cell-editor')
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).not.toBeNull()
  act(() => jest.advanceTimersByTime(1499))
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).not.toBeNull()
  act(() => jest.advanceTimersByTime(1))
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
  fireEvent.input(field, { target: { value: 'c' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[1], error: null } }))
  act(() => jest.advanceTimersByTime(1000))
  fireEvent.input(field, { target: { value: 'd' } })
  fireEvent.blur(field)
  act(() => messages.__reactable__tbl({ edit: { ...edits()[2], error: null } }))
  act(() => jest.advanceTimersByTime(1000))
  expect(wrapper.querySelector('.rt-cell-editor-indicator-saved')).not.toBeNull()
  act(() => jest.advanceTimersByTime(1000))
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
})

it('opts out of server validation per column while retaining typed Shiny notifications', async () => {
  const props = table('number', 1)
  props.columns[1].editValidation = false
  props.columns.push({
    id: 'checked',
    name: 'Checked',
    editable: true,
    editor: 'text',
    editorHtml: templates.text
  })
  props.data.checked = ['a', 'a', 'a']
  const { getAllByLabelText } = await setup(props)
  const field = getAllByLabelText(/Edit Value/)[0]
  const wrapper = field.closest('.rt-cell-editor')
  fireEvent.input(field, { target: { value: '2' } })
  expect(getInstance('tbl').state.data[0].value).toBe(1)
  fireEvent.blur(field)
  const edit = edits()[0]
  expect(edit).toMatchObject({ oldValue: 1, value: 2 })
  expect(window.Shiny.setInputValue).toHaveBeenCalledWith('tbl_r1_value:shiny.number', 2, {
    priority: 'immediate'
  })
  expect(getInstance('tbl').state.data[0].value).toBe(2)
  expect(field).not.toHaveAttribute('readonly')
  expect(wrapper.querySelector('.rt-cell-editor-indicator')).toBeNull()
  act(() => messages.__reactable__tbl({ edit: { ...edit, value: 99, error: 'Too late' } }))
  expect(getInstance('tbl').state.data[0].value).toBe(2)
  fireEvent.input(field, { target: { value: '3' } })
  fireEvent.blur(field)
  expect(edits()[1]).toMatchObject({ oldValue: 2, value: 3 })
  const checked = getAllByLabelText(/Edit Checked/)[0]
  fireEvent.input(checked, { target: { value: 'b' } })
  fireEvent.blur(checked)
  expect(checked).toHaveAttribute('readonly')
  expect(getInstance('tbl').state.data[0].checked).toBe('a')
})

it('supports initial row and column disabling with enabled cell exceptions', async () => {
  const props = table()
  props.columns[1].inputDisabled = true
  props.disabledInputs = { rows: ['r1'], cells: { r1: { value: false } } }
  const { getAllByLabelText } = await setup(props)
  const [first, second] = getAllByLabelText(/Edit Value/)
  expect(first).not.toBeDisabled()
  expect(second).toBeDisabled()
  fireEvent.input(second, { target: { value: 'blocked' } })
  fireEvent.keyDown(second, { key: 'Enter' })
  fireEvent.blur(second)
  expect(edits()).toHaveLength(0)
  act(() => messages.__reactable__tbl({ disabledInputs: { columns: ['value'] } }))
  expect(first).toBeDisabled()
  act(() => messages.__reactable__tbl({ disabledInputs: {} }))
  expect(first).toBeDisabled()
})

it.each(Object.keys(templates))(
  'uses native disabled for %s and permits native value updates',
  async editor => {
    const initial =
      editor === 'checkbox'
        ? false
        : editor === 'number'
          ? 1
          : editor === 'date'
            ? '2026-01-01'
            : 'a'
    const changed =
      editor === 'checkbox'
        ? true
        : editor === 'number'
          ? 2
          : editor === 'date'
            ? '2026-02-02'
            : 'b'
    const { getAllByLabelText } = await setup(table(editor, initial))
    const field = getAllByLabelText(/Edit Value/)[0]
    const input = editor === 'date' ? field.parentElement : field
    const receiver = window.jQuery(input).data('shiny-input-binding')
    await act(async () => receiver.receiveMessage(input, { disabled: true, value: changed }))
    expect(field).toBeDisabled()
    expect(getInstance('tbl').state.data[0].value).toBe(changed)
    expect(edits()).toHaveLength(0)
    await act(async () => receiver.receiveMessage(input, { disabled: false }))
    expect(field).not.toBeDisabled()
    expect(edits()).toHaveLength(0)
  }
)

it('cancels drafts on disable, persists off-page rules, and clears ID overrides on rule replacement', async () => {
  const { getAllByLabelText } = await setup()
  let field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'draft' } })
  act(() => messages.__reactable__tbl({ disabledInputs: { rows: ['r1', 'r3'] } }))
  expect(field).toBeDisabled()
  expect(field).toHaveValue('a')
  expect(edits()).toHaveLength(0)
  const receiver = window.jQuery(field).data('shiny-input-binding')
  await act(async () => receiver.receiveMessage(field, { disabled: false }))
  expect(field).not.toBeDisabled()
  act(() => getInstance('tbl').gotoPage(1))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).toBeDisabled())
  await act(async () => getInstance('tbl').gotoPage(0))
  field = getAllByLabelText(/Edit Value/)[0]
  expect(field).not.toBeDisabled()
  expect(field).toHaveValue('a')
  act(() => messages.__reactable__tbl({ disabledInputs: { rows: ['r1'] } }))
  expect(field).toBeDisabled()
  act(() => messages.__reactable__tbl({ disabledInputs: {} }))
  expect(field).not.toBeDisabled()
})

it.each([null, 'Rejected'])(
  'keeps a disabled pending editor locked after resolution: %s',
  async error => {
    const { getAllByLabelText } = await setup()
    const field = getAllByLabelText(/Edit Value/)[0]
    fireEvent.input(field, { target: { value: 'b' } })
    fireEvent.blur(field)
    const edit = edits()[0]
    act(() => messages.__reactable__tbl({ disabledInputs: { cells: { r1: { value: true } } } }))
    expect(field).toBeDisabled()
    expect(field).toHaveValue('b')
    act(() => messages.__reactable__tbl({ edit: { ...edit, value: 'accepted', error } }))
    expect(field).toBeDisabled()
    expect(getInstance('tbl').state.data[0].value).toBe(error ? 'a' : 'accepted')
    await act(async () => {})
    act(() => messages.__reactable__tbl({ disabledInputs: {} }))
    expect(field).not.toBeDisabled()
    expect(edits()).toHaveLength(1)
  }
)

it('persists external DOM toggles like shinyjs across redraw, remount and data replacement', async () => {
  const { getAllByLabelText } = await setup()
  let field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(field, { target: { value: 'draft' } })
  await act(async () => {
    field.disabled = true
  })
  expect(field).toHaveValue('a')
  expect(field).toBeDisabled()
  act(() => getInstance('tbl').gotoPage(1))
  await act(async () => getInstance('tbl').gotoPage(0))
  field = getAllByLabelText(/Edit Value/)[0]
  expect(field).toBeDisabled()
  act(() => messages.__reactable__tbl({ data: { id: ['r1', 'r2'], value: ['new', 'a'] } }))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).toHaveValue('new'))
  field = getAllByLabelText(/Edit Value/)[0]
  expect(field).toBeDisabled()
  await act(async () => {
    field.disabled = false
  })
  expect(field).not.toBeDisabled()
  expect(edits()).toHaveLength(0)
})

it('does not turn temporary pending disabling into a persistent override', async () => {
  const { getAllByLabelText } = await setup(table('checkbox', false))
  const field = getAllByLabelText(/Edit Value/)[0]
  fireEvent.change(field, { target: { checked: true } })
  expect(field).toBeDisabled()
  await act(async () => {})
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  await act(async () => {})
  expect(field).not.toBeDisabled()
  expect(getInstance('tbl').state.data[0].value).toBe(true)
})

it('uses stable keys after sorting and preserves table state during rule updates', async () => {
  const { getAllByLabelText } = await setup(
    table('text', 'a', {
      data: { id: ['r1', 'r2', 'r3'], value: ['a', 'b', 'c'] },
      disabledInputs: { rows: ['r1'] },
      defaultSorted: [{ id: 'value', desc: true }],
      selection: 'multiple',
      defaultSelected: [2],
      details: true,
      defaultExpanded: true
    })
  )
  expect(getAllByLabelText(/Edit Value/)[0].id).toBe('tbl_r3_value')
  act(() => getInstance('tbl').gotoPage(1))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).toBeDisabled())
  expect(getAllByLabelText(/Edit Value/)[0].id).toBe('tbl_r1_value')
  const before = getInstance('tbl').state
  act(() => messages.__reactable__tbl({ disabledInputs: { rows: ['r2'] } }))
  expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled()
  const after = getInstance('tbl').state
  expect(after.page).toBe(before.page)
  expect(after.selected).toEqual(before.selected)
  expect(after.expanded).toEqual(before.expanded)
  expect(after.sorted).toEqual(before.sorted)
  expect(edits()).toHaveLength(0)
})

function rowActions() {
  return window.Shiny.setInputValue.mock.calls
    .filter(([id]) => id === 'tbl__reactable__row_action')
    .map(([, action]) => action)
}

it('requests a server row and appends editable inputs with automatic and custom IDs', async () => {
  const { getByRole, getAllByLabelText } = await setup(
    table('number', 1, {
      rowActions: { add: true, remove: true }
    })
  )
  fireEvent.click(getByRole('button', { name: 'Add row' }))
  const action = rowActions()[0]
  expect(action).toMatchObject({ action: 'add', requestId: expect.any(String) })
  expect(getByRole('button', { name: 'Add row' })).toBeDisabled()
  act(() =>
    messages.__reactable__tbl({
      addRow: {
        data: JSON.stringify({ id: ['r4'], value: [4] }),
        requestId: action.requestId,
        inputIds: { value: 'custom_new_value' }
      }
    })
  )
  await waitFor(() => expect(document.getElementById('custom_new_value')).not.toBeDisabled())
  expect(getInstance('tbl').state.data.map(row => row.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
  const added = getByRole('rowgroup', { name: 'Added rows' })
  expect(added).toContainElement(document.getElementById('custom_new_value'))
  fireEvent.input(document.getElementById('custom_new_value'), { target: { value: '5' } })
  fireEvent.blur(document.getElementById('custom_new_value'))
  expect(edits()[0]).toMatchObject({ rowId: 'r4', value: 5, inputId: 'custom_new_value' })
  act(() => messages.__reactable__tbl({ edit: { ...edits()[0], error: null } }))
  expect(getInstance('tbl').state.data[3].value).toBe(5)
  expect(getInstance('tbl').state.pageRows).toHaveLength(3)
  fireEvent.click(getByRole('button', { name: 'Add row' }))
  act(() =>
    messages.__reactable__tbl({
      addRow: { data: { id: ['r5'], value: [6] }, requestId: rowActions()[1].requestId }
    })
  )
  await waitFor(() => expect(document.getElementById('tbl_r5_value')).not.toBeDisabled())
  expect(getAllByLabelText(/Edit Value/)).toHaveLength(4)
  expect(getByRole('button', { name: 'Add row' })).not.toBeDisabled()
})

it('keeps additions outside sorting, filtering, grouping and pagination until data replacement', async () => {
  const { getByRole, getAllByLabelText } = await setup(
    table('text', 'a', {
      rowActions: { add: true },
      filterable: true,
      searchable: true
    })
  )
  act(() => getInstance('tbl').gotoPage(1))
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r4'], value: ['z'] } } }))
  await waitFor(() => expect(document.getElementById('tbl_r4_value')).not.toBeDisabled())
  expect(getInstance('tbl').state.page).toBe(1)
  act(() => getInstance('tbl').setSortBy([{ id: 'value', desc: true }]))
  act(() => getInstance('tbl').setFilter('value', 'no match'))
  act(() => getInstance('tbl').setGlobalFilter('no match'))
  expect(getByRole('rowgroup', { name: 'Added rows' })).toContainElement(
    document.getElementById('tbl_r4_value')
  )
  expect(getAllByLabelText(/Edit Value/)).toHaveLength(1)
  act(() => getInstance('tbl').setGroupBy(['value']))
  expect(document.getElementById('tbl_r4_value')).toBeInTheDocument()
  expect(getInstance('tbl').getDataCSV()).toContain('z')
  act(() =>
    messages.__reactable__tbl({
      data: { id: ['r1', 'r2', 'r3', 'r4'], value: ['a', 'a', 'a', 'z'] }
    })
  )
  expect(document.getElementById('tbl_r4_value')).not.toBeInTheDocument()
  expect(document.querySelector('.rt-added-rows')).toBeNull()
})

it('reports failed additions, allows retries and ignores stale responses after replacement', async () => {
  const { getByRole, queryByRole } = await setup(table('text', 'a', { rowActions: { add: true } }))
  fireEvent.click(getByRole('button', { name: 'Add row' }))
  const first = rowActions()[0].requestId
  act(() => messages.__reactable__tbl({ addRow: { requestId: first, error: 'Try later' } }))
  expect(getByRole('alert')).toHaveTextContent('Try later')
  fireEvent.click(getByRole('button', { name: 'Add row' }))
  const second = rowActions()[1].requestId
  expect(queryByRole('alert')).toBeNull()
  act(() => messages.__reactable__tbl({ data: { id: ['r1'], value: ['replacement'] } }))
  act(() =>
    messages.__reactable__tbl({
      addRow: { requestId: second, data: { id: ['late'], value: ['late'] } }
    })
  )
  expect(getInstance('tbl').state.data).toEqual([{ id: 'r1', value: 'replacement' }])
  expect(getByRole('button', { name: 'Add row' })).not.toBeDisabled()
})

it.each([
  [{ id: ['r1'], value: ['b'] }, null, 'unique'],
  [{ id: ['r4'], wrong: ['b'] }, null, 'current data columns'],
  [{ id: ['r4'], value: ['b'] }, { value: 'tbl_r1_value' }, 'Duplicate'],
  [{ id: ['r4'], value: ['b'] }, { id: 'not_editable' }, 'editable column']
])('rejects invalid additions without corrupting data or IDs', async (data, inputIds, message) => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const { getByRole } = await setup(table('text', 'a', { rowActions: { add: true } }))
  fireEvent.click(getByRole('button', { name: 'Add row' }))
  act(() =>
    messages.__reactable__tbl({
      addRow: { requestId: rowActions()[0].requestId, data, inputIds }
    })
  )
  expect(getByRole('alert')).toHaveTextContent(message)
  expect(getInstance('tbl').state.data).toHaveLength(3)
  expect(getByRole('button', { name: 'Add row' })).not.toBeDisabled()
})

it('confirms removal, respects disabled keys and remaps selected/expanded surviving records', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
  const props = table('text', 'a', {
    rowActions: { remove: true, removeDisabled: ['r2'] },
    selection: 'multiple',
    defaultSelected: [1],
    defaultExpanded: true
  })
  props.columns[1].details = ['first', 'second', 'third']
  const { getByRole, getAllByLabelText } = await setup(props)
  fireEvent.click(getByRole('button', { name: 'Remove row r1' }))
  expect(getInstance('tbl').state.data).toHaveLength(3)
  expect(rowActions()).toHaveLength(0)
  expect(getByRole('button', { name: 'Remove row r2' })).toBeDisabled()
  confirm.mockReturnValue(true)
  fireEvent.input(getAllByLabelText(/Edit Value/)[1], { target: { value: 'surviving draft' } })
  fireEvent.click(getByRole('button', { name: 'Remove row r1' }))
  expect(rowActions()[0]).toMatchObject({
    action: 'remove',
    rowId: 'r1',
    data: { id: 'r1', value: 'a' }
  })
  expect(getInstance('tbl').state.data.map(row => row.id)).toEqual(['r2', 'r3'])
  expect(getInstance('tbl').state.selected).toEqual([0])
  expect(getInstance('tbl').state.expanded['0']).toBe(true)
  expect(document.querySelector('.rt-tr-details')).toHaveTextContent('second')
  await waitFor(() =>
    expect(document.getElementById('tbl_r2_value')).toHaveValue('surviving draft')
  )
})

it('invalidates edits only for removed rows and clamps the last page', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  const { getAllByLabelText, getByRole } = await setup(
    table('text', 'a', {
      rowActions: { remove: true }
    })
  )
  const firstField = getAllByLabelText(/Edit Value/)[0]
  fireEvent.input(firstField, { target: { value: 'first' } })
  fireEvent.blur(firstField)
  const first = edits()[0]
  act(() => getInstance('tbl').gotoPage(1))
  await waitFor(() => expect(getAllByLabelText(/Edit Value/)[0]).not.toBeDisabled())
  fireEvent.input(getAllByLabelText(/Edit Value/)[0], { target: { value: 'removed' } })
  fireEvent.blur(getAllByLabelText(/Edit Value/)[0])
  const removed = edits()[1]
  fireEvent.click(getByRole('button', { name: 'Remove row r3' }))
  expect(getInstance('tbl').state.page).toBe(0)
  act(() => messages.__reactable__tbl({ edit: { ...removed, error: null } }))
  act(() => messages.__reactable__tbl({ edit: { ...first, error: null } }))
  expect(getInstance('tbl').state.data).toEqual([
    { id: 'r1', value: 'first' },
    { id: 'r2', value: 'a' }
  ])
})

it('handles initially empty tables and remove-only/add-only control updates', async () => {
  const props = table('text', 'a', { data: { id: [], value: [] }, rowActions: { add: true } })
  const { getByRole, queryByRole } = render(
    <div data-reactable-output="tbl">
      <Reactable {...props} />
    </div>
  )
  await waitFor(() => expect(getByRole('button', { name: 'Add row' })).not.toBeDisabled())
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r1'], value: ['first'] } } }))
  await waitFor(() => expect(document.getElementById('tbl_r1_value')).not.toBeDisabled())
  act(() => messages.__reactable__tbl({ rowActions: { remove: true } }))
  expect(queryByRole('button', { name: 'Add row' })).toBeNull()
  expect(getByRole('button', { name: 'Remove row r1' })).toBeInTheDocument()
})

it.each(['text', 'textarea'])(
  'submits native %s on Tab blur, not typing or multiline Enter',
  async editor => {
    const { getAllByLabelText } = await setup(table(editor))
    const field = getAllByLabelText(/Edit Value/)[0]
    fireEvent.input(field, { target: { value: editor === 'textarea' ? 'line1\nline2' : 'typed' } })
    if (editor === 'textarea') fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.keyDown(field, { key: 'Tab' })
    expect(edits()).toHaveLength(0)
    fireEvent.blur(field)
    expect(edits()).toHaveLength(1)
    expect(edits()[0].value).toBe(field.value)
  }
)

it('supports row actions without editable columns', async () => {
  const props = table('text', 'a', {
    columns: [{ id: 'id' }, { id: 'value' }],
    rowActions: { add: true, remove: true }
  })
  const { getByRole } = render(
    <div data-reactable-output="tbl">
      <Reactable {...props} />
    </div>
  )
  await waitFor(() => expect(getByRole('button', { name: 'Add row' })).not.toBeDisabled())
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r4'], value: ['b'] } } }))
  expect(getByRole('rowgroup', { name: 'Added rows' })).toHaveTextContent('r4')
  expect(getInstance('tbl').state.data).toHaveLength(4)
  expect(edits()).toHaveLength(0)
})

it('preserves R-rendered cell metadata after removal and falls back to raw values for additions', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  const props = table('text', 'a', {
    columns: [
      { id: 'id' },
      {
        id: 'value',
        cell: ['first', 'second', 'third'],
        className: ['first-class', 'second-class', 'third-class']
      }
    ],
    rowClassName: ['first-row', 'second-row', 'third-row'],
    rowActions: { add: true, remove: true }
  })
  const { getByRole, getByText } = render(
    <div data-reactable-output="tbl">
      <Reactable {...props} />
    </div>
  )
  await waitFor(() => expect(getByRole('button', { name: 'Remove row r1' })).not.toBeDisabled())
  fireEvent.click(getByRole('button', { name: 'Remove row r1' }))
  expect(getByText('second').closest('.rt-td')).toHaveClass('second-class')
  expect(getByText('second').closest('.rt-tr')).toHaveClass('second-row')
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r4'], value: ['new value'] } } }))
  expect(getByRole('rowgroup', { name: 'Added rows' })).toHaveTextContent('new value')
})

it('rejects unknown select choices and preserves missing numeric values on append', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const { getByRole, unmount } = await setup(table('select', 'a', { rowActions: { add: true } }))
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r4'], value: ['unknown'] } } }))
  expect(getByRole('alert')).toHaveTextContent('choices')
  expect(getInstance('tbl').state.data).toHaveLength(3)
  unmount()
  const numeric = table('number', 1, { rowActions: { add: true } })
  numeric.columns[1].type = 'numeric'
  await setup(numeric)
  act(() => messages.__reactable__tbl({ addRow: { data: { id: ['r4'], value: ['NA'] } } }))
  await waitFor(() => expect(document.getElementById('tbl_r4_value')).not.toBeDisabled())
  expect(document.getElementById('tbl_r4_value')).toHaveValue(null)
  expect(getInstance('tbl').state.data[3].value).toBeNull()
})

it('rejects added IDs owned by another widget before inserting the row', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const external = document.createElement('input')
  external.id = 'external_input'
  document.body.appendChild(external)
  try {
    const { getByRole } = await setup(table('text', 'a', { rowActions: { add: true } }))
    act(() =>
      messages.__reactable__tbl({
        addRow: { data: { id: ['r4'], value: ['new'] }, inputIds: { value: 'external_input' } }
      })
    )
    expect(getByRole('alert')).toHaveTextContent('already exists on the page')
    expect(getInstance('tbl').state.data).toHaveLength(3)
  } finally {
    external.remove()
  }
})

it('retains R row names when adding a complete one-row frame', async () => {
  const props = table('text', 'a', { rowActions: { add: true } })
  props.data['.rownames'] = ['First', 'Second', 'Third']
  props.columns.unshift({ id: '.rownames', rowHeader: true })
  const { getByRole } = await setup(props)
  act(() =>
    messages.__reactable__tbl({
      addRow: { data: { id: ['r4'], value: ['new'] }, rowNames: ['Fourth'] }
    })
  )
  expect(getByRole('rowgroup', { name: 'Added rows' })).toHaveTextContent('Fourth')
  expect(getInstance('tbl').state.data[3]['.rownames']).toBe('Fourth')
})

it('updates tooltips by native input ID and preserves overrides over remounts and replacement', async () => {
  const props = table('text', 'a', {
    tooltips: { columns: { value: { html: 'Column help' } } }
  })
  const { getByRole } = await setup(props)
  let field = document.getElementById('tbl_r1_value')
  fireEvent.focus(field)
  expect(getByRole('tooltip')).toHaveTextContent('Column help')
  await act(async () => {
    await window
      .jQuery(field)
      .data('shiny-input-binding')
      .receiveMessage(field, {
        reactableTooltip: { html: '<b>Input override</b>', placement: 'bottom' }
      })
  })
  expect(getByRole('tooltip')).toHaveTextContent('Input override')
  expect(edits()).toHaveLength(0)
  expect(field).toHaveAttribute('aria-describedby', expect.stringContaining('tbl_r1_value_status'))
  act(() => getInstance('tbl').gotoPage(1))
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  act(() => getInstance('tbl').gotoPage(0))
  await waitFor(() => expect(document.getElementById('tbl_r1_value')).not.toBeDisabled())
  field = document.getElementById('tbl_r1_value')
  fireEvent.focus(field)
  expect(getByRole('tooltip')).toHaveTextContent('Input override')
  act(() => messages.__reactable__tbl({ data: { id: ['r1'], value: ['replacement'] } }))
  await waitFor(() => expect(document.getElementById('tbl_r1_value')).not.toBeDisabled())
  field = document.getElementById('tbl_r1_value')
  fireEvent.focus(field)
  expect(getByRole('tooltip')).toHaveTextContent('Input override')
  act(() => messages.__reactable__tbl({ tooltips: {} }))
  expect(document.querySelector('[role=tooltip]')).toBeNull()
})

it('keeps unsent editor drafts when Escape dismisses a tooltip first', async () => {
  await setup(table('text', 'a', { tooltips: { columns: { value: { html: 'Help' } } } }))
  const field = document.getElementById('tbl_r1_value')
  fireEvent.focus(field)
  fireEvent.input(field, { target: { value: 'draft' } })
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field).toHaveValue('draft')
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field).toHaveValue('a')
  expect(edits()).toHaveLength(0)
})
