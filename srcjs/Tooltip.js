import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'

let tooltipSequence = 0
const has = (object, key) => object && Object.prototype.hasOwnProperty.call(object, key)

export function useTooltips(options, rowId) {
  const [rules, setRules] = React.useState(options || {})
  const [overrides, setOverrides] = React.useState({})
  const update = React.useCallback(
    value => {
      if (
        !rowId &&
        (Object.keys(value.rows || {}).length || Object.keys(value.cells || {}).length)
      ) {
        throw new Error('Row and cell tooltip rules require rowId')
      }
      setRules(value)
      setOverrides({})
    },
    [rowId]
  )
  React.useEffect(() => update(options || {}), [options, update])
  return {
    update,
    setInput: (key, columnId, tooltip) =>
      setOverrides(previous => ({
        ...previous,
        [JSON.stringify([key, columnId])]: tooltip
      })),
    removeRow: key =>
      setOverrides(previous =>
        Object.fromEntries(Object.entries(previous).filter(([cell]) => JSON.parse(cell)[0] !== key))
      ),
    header: column =>
      has(rules.headers, column.id) ? rules.headers[column.id] : column.headerTooltip,
    cell: (row, column, sourceIndex) => {
      const key = String(row.original[rowId])
      const cell = JSON.stringify([key, column.id])
      if (has(overrides, cell)) return overrides[cell]
      if (has(rules.cells?.[key], column.id)) return rules.cells[key][column.id]
      if (has(rules.rows, key)) return rules.rows[key]
      if (has(rules.columns, column.id)) return rules.columns[column.id]
      if (has(column.tooltipByKey, key)) return column.tooltipByKey[key]
      if (column.tooltipByIndex) return column.tooltipByIndex[sourceIndex ?? row.index]
      return column.tooltip
    }
  }
}

export function tooltipPosition(anchor, popup, placement, width, height) {
  const gap = 8
  let side = placement
  if (side === 'top' && anchor.top < popup.height + gap) side = 'bottom'
  else if (side === 'bottom' && height - anchor.bottom < popup.height + gap) side = 'top'
  else if (side === 'left' && anchor.left < popup.width + gap) side = 'right'
  else if (side === 'right' && width - anchor.right < popup.width + gap) side = 'left'
  const x =
    side === 'left'
      ? anchor.left - popup.width - gap
      : side === 'right'
        ? anchor.right + gap
        : anchor.left + (anchor.width - popup.width) / 2
  const y =
    side === 'top'
      ? anchor.top - popup.height - gap
      : side === 'bottom'
        ? anchor.bottom + gap
        : anchor.top + (anchor.height - popup.height) / 2
  return {
    left: Math.max(gap, Math.min(x, width - popup.width - gap)),
    top: Math.max(gap, Math.min(y, height - popup.height - gap))
  }
}

export default function TooltipTarget({ tooltip, children, input = false }) {
  const target = React.useRef(null)
  const popup = React.useRef(null)
  const [id] = React.useState(() => `reactable-tooltip-${++tooltipSequence}`)
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ left: 0, top: 0 })
  const closeTimer = React.useRef(null)
  const hovering = React.useRef(false)
  const focused = React.useRef(false)
  const dismissed = React.useRef(false)
  const valid = Boolean(tooltip && tooltip.html)
  const clearTimer = () => clearTimeout(closeTimer.current)
  const show = () => {
    clearTimer()
    if (valid && !dismissed.current) setOpen(true)
  }
  const leave = () => {
    clearTimer()
    closeTimer.current = setTimeout(() => {
      if (!hovering.current && !focused.current) {
        setOpen(false)
        dismissed.current = false
      }
    }, 120)
  }
  React.useEffect(() => () => clearTimeout(closeTimer.current), [])
  React.useEffect(() => {
    if (!input || !valid) return
    const node = target.current
    const sync = () => {
      const field = node.querySelector('input, select, textarea')
      if (field?.disabled) node.setAttribute('tabindex', '0')
      else node.removeAttribute('tabindex')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled']
    })
    return () => {
      observer.disconnect()
      node.removeAttribute('tabindex')
    }
  }, [input, valid])
  React.useEffect(() => {
    if (!valid) setOpen(false)
  }, [valid])
  React.useLayoutEffect(() => {
    if (!open || !valid) return
    const node = target.current
    const describe = element => {
      const ids = new Set(
        (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      )
      ids.add(id)
      element.setAttribute('aria-describedby', [...ids].join(' '))
    }
    const described = new Set([node])
    const syncDescriptions = () => {
      node.querySelectorAll('input, select, textarea').forEach(element => described.add(element))
      for (const element of described) {
        if (!(element.getAttribute('aria-describedby') || '').split(/\s+/).includes(id))
          describe(element)
      }
    }
    syncDescriptions()
    const observer = new MutationObserver(() => {
      syncDescriptions()
    })
    observer.observe(node, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-describedby']
    })
    const reposition = () => {
      if (!node.isConnected || !popup.current) return
      const next = tooltipPosition(
        node.getBoundingClientRect(),
        popup.current.getBoundingClientRect(),
        tooltip.placement || 'top',
        window.innerWidth,
        window.innerHeight
      )
      setPosition(previous =>
        previous.left === next.left && previous.top === next.top ? previous : next
      )
    }
    const escape = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissed.current = true
        setOpen(false)
      }
    }
    reposition()
    // Portal clicks must not activate the cell's selection or header sorting.
    const popupNode = popup.current
    const stopClick = event => event.stopPropagation()
    popupNode.addEventListener('click', stopClick)
    popupNode.addEventListener('mousedown', stopClick)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    document.addEventListener('keydown', escape, true)
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null
    resize?.observe(popup.current)
    resize?.observe(node)
    return () => {
      observer.disconnect()
      popupNode.removeEventListener('click', stopClick)
      popupNode.removeEventListener('mousedown', stopClick)
      resize?.disconnect()
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      document.removeEventListener('keydown', escape, true)
      for (const element of described) {
        const ids = (element.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter(value => value && value !== id)
        if (ids.length) element.setAttribute('aria-describedby', ids.join(' '))
        else element.removeAttribute('aria-describedby')
      }
    }
  }, [open, valid, tooltip, id])
  return (
    <span
      ref={target}
      className={valid ? 'rt-tooltip-target' : undefined}
      tabIndex={valid && !input ? 0 : undefined}
      onMouseEnter={() => {
        hovering.current = true
        show()
      }}
      onMouseLeave={() => {
        hovering.current = false
        leave()
      }}
      onFocus={() => {
        focused.current = true
        dismissed.current = false
        show()
      }}
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        focused.current = false
        leave()
      }}
    >
      {children}
      {open &&
        valid &&
        ReactDOM.createPortal(
          <div
            ref={popup}
            id={id}
            role="tooltip"
            className={['rt-tooltip', tooltip.className].filter(Boolean).join(' ')}
            style={{
              ...position,
              maxWidth: `min(${tooltip.maxWidth || 320}px, calc(100vw - 16px))`
            }}
            onMouseEnter={() => {
              hovering.current = true
              show()
            }}
            onMouseLeave={() => {
              hovering.current = false
              leave()
            }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />,
          document.body
        )}
    </span>
  )
}

TooltipTarget.propTypes = {
  tooltip: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
  children: PropTypes.node,
  input: PropTypes.bool
}
