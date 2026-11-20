import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { COP } from './data'
import { emptyRow, referentialBlock, relationOptions, validateCatalogRow } from './catalogs'
import { CLASS_INDEX, generateSeats, planeCapacity, seatRows } from './seats'

const BTN =
  'inline-flex items-center justify-center rounded-[2px] border px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const BTN_PRI = `${BTN} border-azure bg-azure text-white hover:border-azure-deep hover:bg-azure-deep`
const BTN_SEC = `${BTN} border-ink/25 bg-paper text-ink hover:border-ink hover:bg-mist`
const INPUT =
  'mt-1.5 w-full rounded-[2px] border border-rule bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20'
const PAGE_SIZE = 10

export function Dialog({ title, description, onClose, children, footer }) {
  const panel = useRef(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement
    const focusables = () =>
      [...panel.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.offsetParent !== null,
      )

    focusables()[0]?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[1px] sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="my-6 w-full max-w-2xl border border-rule bg-paper shadow-[0_24px_70px_rgba(17,30,45,0.22)]"
      >
        <div className="flex items-start justify-between gap-6 border-b border-rule px-6 py-5">
          <div>
            <h2 id={titleId} className="font-display text-2xl leading-none">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-2 text-sm text-slate">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-1 -mt-1 px-2 py-1 text-xl leading-none text-slate hover:text-ink">
            ×
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-rule bg-mist/40 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

function Field({ field, value, error, disabled, options, onChange, onBlur, inputRef }) {
  const describedBy = error ? `${field.key}-error` : undefined
  const common = {
    id: field.key,
    value: value ?? '',
    disabled,
    onChange: (event) => onChange(event.target.value),
    onBlur: () => onBlur(),
    ref: inputRef,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    className: INPUT,
  }

  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{field.label}</span>
      {field.type === 'select' || field.type === 'relation' ? (
        <select {...common}>
          <option value="">Selecciona…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === 'number' || field.type === 'time' || field.type === 'date' ? (
        <input {...common} type={field.type === 'number' ? 'number' : field.type} min={field.min} max={field.max} step={field.step} />
      ) : field.type === 'boolean' ? (
        <input
          id={field.key}
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          onBlur={onBlur}
          ref={inputRef}
          type="checkbox"
          className="mt-3 h-4 w-4 accent-azure"
        />
      ) : (
        <input {...common} type="text" />
      )}
      {error && (
        <span id={describedBy} className="mt-1.5 block text-xs text-airmail">
          {error}
        </span>
      )}
    </label>
  )
}

function MultiSelect({ field, value, onChange, error }) {
  const selected = Array.isArray(value) ? value : []
  return (
    <fieldset className="mt-1.5">
      <legend className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{field.label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {field.options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((x) => x !== option) : [...selected, option])}
              className={`rounded-[2px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? 'border-azure bg-azure/10 text-azure' : 'border-rule text-slate hover:border-ink hover:text-ink'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
      {error && <span className="mt-1.5 block text-xs text-airmail">{error}</span>}
    </fieldset>
  )
}

function Tramos({ value, onChange, error }) {
  const tramos = Array.isArray(value) ? value : []
  return (
    <fieldset className="mt-1.5">
      <legend className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate">Política de cancelación</legend>
      <div className="mt-2 space-y-2">
        {tramos.map((tramo, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="block text-[11px] text-slate">
              Horas antes
              <input
                type="number"
                min="0"
                value={tramo.horasAntes}
                onChange={(event) => onChange(tramos.map((t, i) => (i === index ? { ...t, horasAntes: event.target.value } : t)))}
                className={INPUT}
              />
            </label>
            <label className="block text-[11px] text-slate">
              % reembolso
              <input
                type="number"
                min="0"
                max="100"
                value={tramo.porcentaje}
                onChange={(event) => onChange(tramos.map((t, i) => (i === index ? { ...t, porcentaje: event.target.value } : t)))}
                className={INPUT}
              />
            </label>
            <button type="button" onClick={() => onChange(tramos.filter((_, i) => i !== index))} className={`${BTN_SEC} mb-[2px] px-3`}>
              Quitar
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...tramos, { horasAntes: 24, porcentaje: 50 }])} className={`${BTN_SEC} mt-3`}>
        Agregar tramo
      </button>
      {error && <span className="mt-1.5 block text-xs text-airmail">{error}</span>}
    </fieldset>
  )
}

function SeatPreview({ avion }) {
  const filas = seatRows(generateSeats(avion))
  const capacidad = planeCapacity(avion)

  return (
    <div className="border border-rule bg-mist/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate">Vista previa del mapa</span>
        <span className="text-xs font-semibold tabular-nums text-ink">
          {capacidad.capacidadPrimera} + {capacidad.capacidadBusiness} + {capacidad.capacidadEconomica} = {capacidad.capacidadTotal}
        </span>
      </div>
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="mx-auto w-max rounded-t-[110px] rounded-b-[22px] border border-ink/20 bg-paper px-4 pb-4 pt-9">
          {filas.length ? (
            filas.map(({ fila, items, clase }, index) => {
              const next = filas[index + 1]?.clase
              return (
                <div key={fila}>
                  <div className="mb-1 grid grid-cols-[repeat(3,24px)_20px_repeat(3,24px)] items-center gap-1">
                    {['A', 'B', 'C'].map((col) => {
                      const seat = items.find((s) => s.columna === col)
                      return seat ? (
                        <span
                          key={col}
                          title={`${seat.numeroAsiento} · ${clase} · ${seat.ubicacion}`}
                          className={`grid h-6 place-items-center rounded-[3px] border text-[9px] font-semibold ${
                            CLASS_INDEX[clase] === 2
                              ? 'border-ink bg-ink text-white'
                              : CLASS_INDEX[clase] === 1
                                ? 'border-azure bg-azure/75 text-white'
                                : 'border-celeste bg-celeste-pale text-azure-deep'
                          }`}
                        >
                          {col}
                        </span>
                      ) : (
                        <span key={col} />
                      )
                    })}
                    <span className="text-center text-[9px] text-slate">{fila}</span>
                    {['D', 'E', 'F'].map((col) => {
                      const seat = items.find((s) => s.columna === col)
                      return seat ? (
                        <span
                          key={col}
                          title={`${seat.numeroAsiento} · ${clase} · ${seat.ubicacion}`}
                          className={`grid h-6 place-items-center rounded-[3px] border text-[9px] font-semibold ${
                            CLASS_INDEX[clase] === 2
                              ? 'border-ink bg-ink text-white'
                              : CLASS_INDEX[clase] === 1
                                ? 'border-azure bg-azure/75 text-white'
                                : 'border-celeste bg-celeste-pale text-azure-deep'
                          }`}
                        >
                          {col}
                        </span>
                      ) : (
                        <span key={col} />
                      )
                    })}
                  </div>
                  {next && next !== clase && <div className="h-3" />}
                </div>
              )
            })
          ) : (
            <p className="px-6 py-10 text-center text-xs text-slate">Agrega filas para ver el mapa.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function FormModal({ schema, row, catalogs, onClose, onSave }) {
  const isNew = !row
  const editingKey = row ? String(row[schema.pk]) : ''
  const [draft, setDraft] = useState(() => (row ? { ...row } : emptyRow(schema, catalogs)))
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const refs = useRef({})

  const setField = (field, raw) => {
    let value = raw
    if (field.transform) value = field.transform(raw)
    else if (field.cast === 'number' && raw !== '') value = Number(raw)
    else if (field.type === 'number') value = raw === '' ? '' : Number(raw)
    const next = { ...draft, [field.key]: value }
    setDraft(next)
    if (touched[field.key]) setErrors(validateCatalogRow(schema, next, catalogs, editingKey))
  }

  const blur = (field) => {
    setTouched((prev) => ({ ...prev, [field.key]: true }))
    setErrors(validateCatalogRow(schema, draft, catalogs, editingKey))
  }

  const submit = (event) => {
    event.preventDefault()
    const found = validateCatalogRow(schema, draft, catalogs, editingKey)
    setErrors(found)
    setTouched(Object.fromEntries(schema.fields.map((field) => [field.key, true])))
    const firstError = schema.fields.find((field) => found[field.key])
    if (firstError) {
      refs.current[firstError.key]?.focus?.()
      return
    }
    onSave(draft, isNew)
  }

  return (
    <Dialog
      title={isNew ? `${schema.article || 'Nueva'} ${schema.name.toLowerCase()}` : `Editar ${schema.name.toLowerCase()}`}
      description={isNew ? 'Completa los datos y guarda para agregarlo al catálogo.' : `Se guardarán los cambios de ${row[schema.pk]}.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SEC}>
            Cancelar
          </button>
          <button type="submit" form="crud-form" className={BTN_PRI}>
            Guardar {schema.name.toLowerCase()}
          </button>
        </>
      }
    >
      <form id="crud-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
        {schema.fields.map((field) => {
          const disabled = !isNew && field.key === schema.pk
          const options = field.type === 'relation' ? relationOptions(field, catalogs) : field.options || []
          return (
            <div key={field.key} className={['multiselect', 'tramos', 'computed'].includes(field.type) ? 'sm:col-span-2' : ''}>
              {field.type === 'computed' ? (
                <div className="flex items-center justify-between border-b border-rule py-2 text-sm">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{field.label}</span>
                  <span className="font-semibold tabular-nums text-ink">{field.compute(draft, catalogs)}</span>
                </div>
              ) : field.type === 'multiselect' ? (
                <MultiSelect field={field} value={draft[field.key]} error={errors[field.key]} onChange={(value) => setField(field, value)} />
              ) : field.type === 'tramos' ? (
                <Tramos value={draft[field.key]} error={errors[field.key]} onChange={(value) => setField(field, value)} />
              ) : (
                <Field
                  field={field}
                  value={draft[field.key]}
                  error={errors[field.key]}
                  disabled={disabled}
                  options={options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }))}
                  onChange={(value) => setField(field, value)}
                  onBlur={() => blur(field)}
                  inputRef={(el) => {
                    refs.current[field.key] = el
                  }}
                />
              )}
              {disabled && <span className="mt-1 block text-[11px] text-slate">La clave no se puede cambiar.</span>}
            </div>
          )
        })}
        {schema.preview === 'seatMap' && (
          <div className="sm:col-span-2">
            <SeatPreview avion={draft} />
          </div>
        )}
      </form>
    </Dialog>
  )
}

function DeleteModal({ schema, row, onClose, onConfirm, blockReason }) {
  return (
    <Dialog
      title={`Eliminar ${schema.name.toLowerCase()}`}
      description={blockReason || `Se eliminará ${row[schema.pk]} del catálogo. Esta acción no se puede deshacer.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SEC}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={Boolean(blockReason)} className={BTN_PRI}>
            {blockReason ? 'No se puede eliminar' : 'Eliminar'}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate">
        {blockReason ? 'Quita las referencias y vuelve a intentarlo.' : 'Si quieres conservar el historial, usa Activo/Inactivo en las entidades que lo permiten.'}
      </p>
    </Dialog>
  )
}

function cellText(schema, row, column, catalogs) {
  const value = column.compute ? column.compute(row, catalogs) : row[column.key]
  const field = schema.fields.find((f) => f.key === column.key)
  if (column.key === 'estado') return value
  if (column.key === 'precioBase' || column.key === 'total') return COP(value)
  if (field?.type === 'relation') {
    const options = relationOptions(field, catalogs)
    return options.find((o) => o.value === String(value))?.label || value
  }
  if (field?.type === 'multiselect') return Array.isArray(value) && value.length ? value.join(', ') : '—'
  if (field?.options) {
    const option = field.options.find((o) => (typeof o === 'object' ? String(o.value) === String(value) : o === value))
    return typeof option === 'object' ? option.label : option || value
  }
  if (Array.isArray(value)) return value.length ? `${value.length} ${value.length === 1 ? 'servicio' : 'servicios'}` : '—'
  return value ?? '—'
}

export default function CrudManager({ schema, catalogs, onSave, onDelete, onToggleStatus, onRowAction }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: schema.pk, dir: 'asc' })
  const [form, setForm] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [action, setAction] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const rows = catalogs[schema.key] || []
  const q = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    const found = q
      ? rows.filter((row) => schema.searchable.some((key) => String(row[key] ?? '').toLowerCase().includes(q)))
      : rows
    return [...found].sort((a, b) => {
      const left = String(a[sort.key] ?? '')
      const right = String(b[sort.key] ?? '')
      const result = left.localeCompare(right, 'es', { numeric: true })
      return sort.dir === 'asc' ? result : -result
    })
  }, [rows, schema, q, sort])

  useEffect(() => setPage(1), [q, schema.key])
  useEffect(() => {
    setSort({ key: schema.pk, dir: 'asc' })
    setFeedback(null)
  }, [schema.key, schema.pk])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const blockReason = removing ? referentialBlock(schema, removing, catalogs) : ''

  const toggleSort = (key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const save = (row, isNew) => {
    const result = onSave(row, isNew)
    if (result && result.ok === false) {
      setFeedback({ type: 'error', text: result.message })
      return
    }
    setForm(null)
    setFeedback({ type: 'success', text: isNew ? 'Registro creado correctamente.' : 'Registro actualizado correctamente.' })
  }

  const runAction = () => {
    if (!action || !onRowAction) return
    const result = onRowAction(schema.key, action.def.id, action.row, { desde: action.desde, hasta: action.hasta })
    if (result && result.ok === false) setAction((prev) => ({ ...prev, error: result.message, result: null }))
    else setAction((prev) => ({ ...prev, error: '', result }))
  }

  const confirmDelete = () => {
    if (!removing || blockReason) return
    const result = onDelete(removing[schema.pk])
    if (result && result.ok === false) {
      setRemoving(null)
      setFeedback({ type: 'error', text: result.message })
      return
    }
    setRemoving(null)
    setFeedback({ type: 'success', text: 'Registro eliminado correctamente.' })
  }

  const toggleStatus = (row) => {
    const result = onToggleStatus(row)
    if (result && result.ok === false) {
      setFeedback({ type: 'error', text: result.message })
      return
    }
    const next = result?.estado || (row.estado === 'Activo' ? 'Inactivo' : 'Activo')
    setFeedback({ type: 'success', text: `${schema.name} marcado como ${next.toLowerCase()}.` })
  }

  return (
    <section>
      <div className="flex flex-col gap-4 border-y border-rule py-5 sm:flex-row sm:items-end sm:justify-between">
        <label className="block max-w-[340px] flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate">Buscar {schema.plural.toLowerCase()}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Escribe un código, nombre o ciudad" className={INPUT} />
        </label>
        <button type="button" onClick={() => setForm({ row: null })} className={BTN_PRI}>
          {schema.article || 'Nueva'} {schema.name.toLowerCase()}
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 flex items-center justify-between gap-4 border px-4 py-3 text-sm ${
            feedback.type === 'error' ? 'border-airmail/40 bg-airmail/5 text-airmail' : 'border-azure/40 bg-azure/5 text-azure'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Cerrar mensaje" className="text-lg leading-none">
            ×
          </button>
        </div>
      )}

      <div className="mt-5 overflow-x-auto border border-rule">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-[11px] text-slate">
              {schema.columns.map((column) => (
                <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 hover:text-ink">
                    {column.label}
                    <span aria-hidden="true" className="text-[10px] text-slate">
                      {sort.key === column.key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row) => (
                <tr key={String(row[schema.pk])} className="border-b border-rule last:border-0">
                  {schema.columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {column.key === 'estado' ? (
                        <span className={`text-xs font-semibold ${row.estado === 'Activo' ? 'text-azure' : 'text-slate'}`}>{row.estado}</span>
                      ) : (
                        <span className="text-ink">{cellText(schema, row, column, catalogs)}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs font-semibold">
                      {(schema.rowActions || []).map((def) => (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() =>
                            setAction({
                              def,
                              row,
                              desde: new Date().toISOString().slice(0, 10),
                              hasta: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                              error: '',
                              result: null,
                            })
                          }
                          className="text-azure-deep hover:underline"
                        >
                          {def.label}
                        </button>
                      ))}
                      <button type="button" onClick={() => setForm({ row })} className="text-azure hover:underline">
                        Editar
                      </button>
                      {schema.softDelete ? (
                        <button type="button" onClick={() => toggleStatus(row)} className="text-ink hover:underline">
                          {row.estado === 'Activo' ? 'Desactivar' : 'Activar'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => setRemoving(row)} className="text-airmail hover:underline">
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={schema.columns.length + 1} className="px-3 py-10 text-center text-slate">
                  No hay resultados. Ajusta la búsqueda o crea un registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 text-xs text-slate sm:flex-row sm:items-center sm:justify-between">
        <span>
          {filtered.length ? `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} de ${filtered.length}` : 'Sin registros'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)} className={BTN_SEC}>
            Anterior
          </button>
          <span className="tabular-nums">
            {currentPage} / {pages}
          </span>
          <button type="button" disabled={currentPage === pages} onClick={() => setPage((p) => p + 1)} className={BTN_SEC}>
            Siguiente
          </button>
        </div>
      </div>

      {form && (
        <FormModal
          schema={schema}
          row={form.row}
          catalogs={catalogs}
          onClose={() => setForm(null)}
          onSave={save}
        />
      )}
      {removing && <DeleteModal schema={schema} row={removing} blockReason={blockReason} onClose={() => setRemoving(null)} onConfirm={confirmDelete} />}
      {action && (
        <Dialog
          title={`${action.def.label} · ${action.row[schema.pk]}`}
          description="Elige el rango de fechas. Solo se generarán vuelos en los días activos del horario y dentro de su vigencia."
          onClose={() => setAction(null)}
          footer={
            <>
              <button type="button" onClick={() => setAction(null)} className={BTN_SEC}>
                Cerrar
              </button>
              <button type="button" onClick={runAction} className={BTN_PRI}>
                Generar vuelos
              </button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate">Desde</span>
              <input type="date" value={action.desde} onChange={(e) => setAction((prev) => ({ ...prev, desde: e.target.value }))} className={INPUT} />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate">Hasta</span>
              <input type="date" value={action.hasta} onChange={(e) => setAction((prev) => ({ ...prev, hasta: e.target.value }))} className={INPUT} />
            </label>
          </div>
          {action.error && <p role="alert" className="mt-4 text-sm font-semibold text-airmail">{action.error}</p>}
          {action.result && (
            <div role="status" className="mt-4 border border-rule bg-mist/50 p-4 text-sm">
              <p className="font-semibold text-ink">Se crearon {action.result.creados} vuelos. Se omitieron {action.result.omitidos} por conflicto.</p>
              {action.result.detalles?.length > 0 && (
                <ul className="mt-3 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-[13px] text-slate">
                  {action.result.detalles.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Dialog>
      )}
    </section>
  )
}
