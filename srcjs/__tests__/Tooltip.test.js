import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import TooltipTarget, { tooltipPosition } from '../Tooltip'
import { Reactable, getInstance } from '../Reactable'

const tip = html => ({ html, placement: 'top', maxWidth: 320 })

afterEach(() => {
  jest.useRealTimers()
  delete window.Shiny
})

it('opens formatted content on focus, preserves descriptions, and dismisses with Escape', async () => {
  const { getByRole, queryByRole } = render(
    <TooltipTarget tooltip={tip('<b>Helpful</b> text')} input>
      <input aria-label="Value" aria-describedby="validation" />
    </TooltipTarget>
  )
  const field = getByRole('textbox')
  fireEvent.focus(field)
  const popup = getByRole('tooltip')
  expect(popup.querySelector('b')).toHaveTextContent('Helpful')
  expect(document.body).toContainElement(popup)
  expect(field).toHaveAttribute('aria-describedby', `validation ${popup.id}`)
  act(() => field.setAttribute('aria-describedby', 'new-validation'))
  await waitFor(() =>
    expect(field).toHaveAttribute('aria-describedby', `new-validation ${popup.id}`)
  )
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(queryByRole('tooltip')).toBeNull()
  expect(field).toHaveAttribute('aria-describedby', 'new-validation')
  fireEvent.mouseEnter(field.parentElement)
  expect(queryByRole('tooltip')).toBeNull()
})

it('keeps content hoverable, closes on leave, and cleans portals on unmount', () => {
  jest.useFakeTimers()
  const { getByText, getByRole, queryByRole, unmount } = render(
    <TooltipTarget tooltip={tip('Description')}>Cell</TooltipTarget>
  )
  const target = getByText('Cell')
  expect(target).toHaveAttribute('tabindex', '0')
  fireEvent.mouseEnter(target)
  fireEvent.mouseLeave(target)
  fireEvent.mouseEnter(getByRole('tooltip'))
  act(() => jest.advanceTimersByTime(150))
  expect(getByRole('tooltip')).toBeInTheDocument()
  fireEvent.mouseLeave(getByRole('tooltip'))
  act(() => jest.advanceTimersByTime(120))
  expect(queryByRole('tooltip')).toBeNull()
  fireEvent.mouseEnter(target)
  unmount()
  expect(document.querySelector('[role=tooltip]')).toBeNull()
})

it('provides a focusable container only when an editor is disabled', async () => {
  const { getByRole } = render(
    <TooltipTarget tooltip={tip('Disabled help')} input>
      <input aria-label="Value" disabled />
    </TooltipTarget>
  )
  const field = getByRole('textbox')
  await waitFor(() => expect(field.parentElement).toHaveAttribute('tabindex', '0'))
  fireEvent.focus(field.parentElement)
  expect(getByRole('tooltip')).toHaveTextContent('Disabled help')
  act(() => {
    field.disabled = false
  })
  await waitFor(() => expect(field.parentElement).not.toHaveAttribute('tabindex'))
})

it('flips and constrains popup coordinates to the viewport', () => {
  const rect = { left: 10, top: 5, right: 50, bottom: 25, width: 40, height: 20 }
  const popup = { width: 100, height: 40 }
  expect(tooltipPosition(rect, popup, 'top', 200, 200)).toEqual({ left: 8, top: 33 })
  expect(tooltipPosition(rect, popup, 'left', 200, 200)).toEqual({ left: 58, top: 8 })
  expect(tooltipPosition({ ...rect, left: 170, right: 190 }, popup, 'right', 200, 200).left).toBe(
    62
  )
})

function setupTable(extra = {}) {
  let handler
  window.Shiny = {
    addCustomMessageHandler: (id, fn) => {
      handler = fn
    }
  }
  const props = {
    data: { id: ['a', 'b', 'c'], value: [1, 2, 3] },
    rowId: 'id',
    columns: [
      { id: 'id' },
      {
        id: 'value',
        defaultSortDesc: false,
        tooltip: tip('default'),
        headerTooltip: tip('header help')
      }
    ],
    defaultPageSize: 2,
    ...extra
  }
  const result = render(
    <div data-reactable-output="tips">
      <Reactable {...props} />
    </div>
  )
  return { ...result, message: state => act(() => handler(state)) }
}

it('applies cell, row, column and default priority and false suppression without resetting state', () => {
  const { container, getByRole, queryByRole, message } = setupTable({
    tooltips: {
      columns: { value: tip('column') },
      rows: { a: tip('row') },
      cells: { a: { value: tip('cell') }, b: { value: false } }
    }
  })
  let targets = container.querySelectorAll('.rt-tbody .rt-tooltip-target')
  fireEvent.focus(targets[1])
  expect(getByRole('tooltip')).toHaveTextContent('cell')
  fireEvent.keyDown(targets[1], { key: 'Escape' })
  expect(container.querySelectorAll('.rt-tbody .rt-tooltip-target')).toHaveLength(2)
  act(() => getInstance('tips').gotoPage(1))
  targets = container.querySelectorAll('.rt-tbody .rt-tooltip-target')
  fireEvent.focus(targets[0])
  expect(getByRole('tooltip')).toHaveTextContent('column')
  message({ tooltips: {} })
  expect(getInstance('tips').state.page).toBe(1)
  expect(getByRole('tooltip')).toHaveTextContent('default')
  message({ tooltips: { columns: { value: false } } })
  expect(queryByRole('tooltip')).toBeNull()
})

it('shows header tooltips without preventing sorting and allows header replacement', () => {
  const { container, getByRole, message } = setupTable()
  const target = container.querySelector('.rt-th .rt-tooltip-target')
  fireEvent.focus(target)
  expect(getByRole('tooltip')).toHaveTextContent('header help')
  fireEvent.click(getByRole('tooltip'))
  expect(getInstance('tips').state.sorted).toEqual([])
  fireEvent.click(target)
  expect(getInstance('tips').state.sorted).toEqual([{ id: 'value', desc: false }])
  message({ tooltips: { headers: { value: tip('updated header') } } })
  expect(getByRole('tooltip')).toHaveTextContent('updated header')
})

it('repositions an open tooltip on resize and removes global listeners on unmount', () => {
  const remove = jest.spyOn(window, 'removeEventListener')
  const { getByText, getByRole, unmount } = render(
    <TooltipTarget tooltip={tip('Positioned')}>Cell</TooltipTarget>
  )
  const target = getByText('Cell')
  let left = 20
  target.getBoundingClientRect = () => ({
    left,
    top: 100,
    bottom: 120,
    right: left + 40,
    width: 40,
    height: 20
  })
  fireEvent.focus(target)
  expect(getByRole('tooltip').style.left).toBe('40px')
  left = 80
  fireEvent.resize(window)
  expect(getByRole('tooltip').style.left).toBe('100px')
  unmount()
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  remove.mockRestore()
})

it('keeps keyed callback tooltips associated after sorting and added-row rules override defaults', () => {
  const { container, getByRole, message } = setupTable({
    rowActions: { add: true },
    columns: [{ id: 'id' }, { id: 'value', tooltipByKey: { a: tip('For a'), b: tip('For b') } }],
    tooltips: { cells: { d: { value: tip('Future row') } } }
  })
  act(() => getInstance('tips').setSortBy([{ id: 'value', desc: true }]))
  fireEvent.focus(container.querySelector('.rt-tooltip-target'))
  expect(getByRole('tooltip')).toHaveTextContent('For b')
  message({ addRow: { data: { id: ['d'], value: [4] } } })
  const appended = container.querySelector('.rt-added-rows .rt-tooltip-target')
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.focus(appended)
  expect(getByRole('tooltip')).toHaveTextContent('Future row')
})
