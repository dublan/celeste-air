import { tm } from './data'
import { generateSeats, planeForModel } from './seats'

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const DIAS_POR_NUMERO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const TRANSICIONES = {
  Programado: ['Abordando', 'Retrasado', 'Cancelado'],
  Abordando: ['Finalizado'],
  Retrasado: ['Abordando', 'Cancelado'],
  Cancelado: [],
  Finalizado: [],
}

export const REQUERIMIENTOS_TRIPULACION = { Piloto: 1, Copiloto: 1, Auxiliar: 2 }

export const flightKey = (flight) => String(flight?.codigoVuelo || flight?.id || '')
export const flightAirplane = (flight) => String(flight?.codigoAvion || planeForModel(flight?.mod) || '')

export function parseMinutos(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const [hora, minuto] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return 0
  return hora * 60 + minuto
}

export function minutosATiempo(value) {
  const total = parseMinutos(value)
  return tm(total)
}

export function flightStart(flight) {
  const [anio, mes, dia] = String(flight?.date || '2000-01-01').split('-').map(Number)
  const fecha = new Date(anio, (mes || 1) - 1, dia || 1)
  fecha.setMinutes(fecha.getMinutes() + parseMinutos(flight?.s))
  return fecha
}

export function flightEnd(flight) {
  return new Date(flightStart(flight).getTime() + (Number(flight?.dur) || 0) * 60000)
}

export function flightOverlap(a, b, margen = 0) {
  const margenMs = margen * 60000
  const inicioA = flightStart(a).getTime()
  const finA = inicioA + (Number(a?.dur) || 0) * 60000
  const inicioB = flightStart(b).getTime()
  const finB = inicioB + (Number(b?.dur) || 0) * 60000
  return inicioA < finB + margenMs && inicioB < finA + margenMs
}

export function dateKey(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

export function addDays(dateKeyValue, days) {
  const [anio, mes, dia] = String(dateKeyValue).split('-').map(Number)
  const date = new Date(anio, (mes || 1) - 1, dia || 1)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function findPlane(flight = {}, aviones = []) {
  return aviones.find((avion) => avion.codigoAvion === flightAirplane(flight)) || aviones.find((avion) => avion.modelo === flight.mod) || null
}

export function makeSeatStates(flight = {}, aviones = []) {
  const avion = findPlane(flight, aviones)
  const asientos = avion?.asientos?.length ? avion.asientos : generateSeats(avion || { codigoAvion: flightAirplane(flight) || 'AV-001' })
  return asientos.map((asiento) => ({ ...asiento, estado: 'disponible' }))
}

function normalizeSeedFlight(flight = {}) {
  return {
    ...flight,
    codigoVuelo: flightKey(flight) || flight.id,
    codigoHorario: flight.codigoHorario || '',
    codigoRuta: flight.codigoRuta || '',
    codigoAvion: flightAirplane(flight),
    gate: flight.gate ?? '',
    term: flight.term ?? '',
  }
}

export function createSeedOperations(legacyFlights = [], aviones = [], horarios = [], catalogs = {}, rango = {}) {
  let flights = legacyFlights.map(normalizeSeedFlight)
  const seatStates = {}
  flights.forEach((flight) => {
    seatStates[flightKey(flight)] = makeSeatStates(flight, aviones)
  })

  const desde = rango.desde || dateKey(new Date())
  const hasta = rango.hasta || addDays(desde, 29)
  horarios.forEach((horario) => {
    if (!horario || (horario.estado && horario.estado !== 'Activo')) return
    const resultado = generateFlightsFromSchedule(horario, { desde, hasta }, { catalogs: { ...catalogs, aviones }, operations: { flights, seatStates } })
    flights = resultado.flights
    Object.assign(seatStates, resultado.seatStates)
  })

  return { flights, seatStates, crewAssignments: {}, notifications: [] }
}

export const isValidOperations = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray(value.flights) &&
  Array.isArray(value.notifications) &&
  value.seatStates !== null &&
  typeof value.seatStates === 'object' &&
  !Array.isArray(value.seatStates) &&
  value.crewAssignments !== null &&
  typeof value.crewAssignments === 'object' &&
  !Array.isArray(value.crewAssignments)

export function normalizeOperations(value, aviones = []) {
  if (!isValidOperations(value)) return createSeedOperations([], aviones)
  const flights = value.flights.map(normalizeSeedFlight)
  const seatStates = {}
  flights.forEach((flight) => {
    const key = flightKey(flight)
    const stored = value.seatStates[key]
    seatStates[key] = Array.isArray(stored) && stored.length ? stored : makeSeatStates(flight, aviones)
  })
  const crewAssignments = {}
  Object.entries(value.crewAssignments).forEach(([key, ids]) => {
    if (Array.isArray(ids)) crewAssignments[key] = ids.filter((id) => typeof id === 'string')
  })
  return { flights, seatStates, crewAssignments, notifications: value.notifications }
}

export function validateFlightCandidate(candidate = {}, context = {}) {
  const { catalogs = {}, flights = [], crewAssignments = {}, excludeKey = '' } = context
  const codigoAvion = flightAirplane(candidate)
  const avion = (catalogs.aviones || []).find((item) => item.codigoAvion === codigoAvion)
  if (!avion) return { ok: false, message: `El avión ${codigoAvion || 'sin código'} no existe en el catálogo.` }
  if (['Mantenimiento', 'Retirado'].includes(avion.estado)) {
    return { ok: false, message: `El avión ${codigoAvion} está en ${avion.estado} y no puede asignarse.` }
  }

  const choqueAvion = flights.find(
    (flight) => flightKey(flight) !== excludeKey && flightAirplane(flight) === codigoAvion && flightOverlap(candidate, flight, 45),
  )
  if (choqueAvion) return { ok: false, message: `El avión ${codigoAvion} choca con el vuelo ${flightKey(choqueAvion)}.` }

  const tripulacion = candidate.tripulacion || crewAssignments[excludeKey] || []
  for (const id of tripulacion) {
    const choqueTripulante = flights.find(
      (flight) =>
        flightKey(flight) !== excludeKey &&
        (crewAssignments[flightKey(flight)] || []).includes(id) &&
        flightOverlap(candidate, flight, 60),
    )
    if (choqueTripulante) return { ok: false, message: `El tripulante ${id} choca con el vuelo ${flightKey(choqueTripulante)}.` }
  }

  return { ok: true, avion }
}

export function generateFlightsFromSchedule(horario = {}, rango = {}, context = {}) {
  if (!rango.desde || !rango.hasta || rango.desde > rango.hasta) {
    return { ok: false, message: 'El rango de fechas no es válido.' }
  }
  if (horario.estado !== 'Activo') return { ok: false, message: 'El horario está inactivo. Actívalo antes de generar vuelos.' }

  const { catalogs = {}, operations = {} } = context
  const ruta = (catalogs.rutas || []).find((item) => item.codigoRuta === horario.codigoRuta)
  if (!ruta) return { ok: false, message: 'La ruta del horario ya no existe.' }

  const flights = [...(operations.flights || [])]
  const seatStates = { ...(operations.seatStates || {}) }
  const dias = Array.isArray(horario.diasSemana) ? horario.diasSemana : []
  const dur = Number(ruta.tiempoEstimado) || 90
  const salida = parseMinutos(horario.horaSalida)
  const resultado = { creados: 0, omitidos: 0, detalles: [] }

  let cursor = rango.desde
  let guard = 0
  while (cursor <= rango.hasta && guard < 400) {
    guard += 1
    const fecha = new Date(`${cursor}T12:00:00`)
    const nombreDia = DIAS_POR_NUMERO[fecha.getDay()]
    if (dias.includes(nombreDia)) {
      if (cursor < horario.fechaInicioVigencia || cursor > horario.fechaFinVigencia) {
        resultado.omitidos += 1
        resultado.detalles.push(`${cursor}: fuera de la vigencia del horario.`)
      } else {
        const candidato = {
          codigoVuelo: `VL-${horario.codigoHorario}-${cursor.replace(/-/g, '')}`,
          codigoHorario: horario.codigoHorario,
          codigoRuta: horario.codigoRuta,
          codigoAvion: horario.codigoAvion,
          o: ruta.aeropuertoOrigen,
          d: ruta.aeropuertoDestino,
          date: cursor,
          s: salida,
          e: salida + dur,
          dur,
          mod: (catalogs.aviones || []).find((avion) => avion.codigoAvion === horario.codigoAvion)?.modelo || '',
          price: Math.round((60000 + dur * 1100) / 1000) * 1000,
          st: 'Programado',
          gate: '',
          term: '',
        }

        if (flights.some((flight) => flightKey(flight) === candidato.codigoVuelo)) {
          resultado.omitidos += 1
          resultado.detalles.push(`${cursor}: ya existe el vuelo ${candidato.codigoVuelo}.`)
        } else {
          const validacion = validateFlightCandidate(candidato, { ...context, flights })
          if (!validacion.ok) {
            resultado.omitidos += 1
            resultado.detalles.push(`${cursor}: ${validacion.message}`)
          } else {
            flights.push(candidato)
            seatStates[candidato.codigoVuelo] = makeSeatStates(candidato, catalogs.aviones || [])
            resultado.creados += 1
          }
        }
      }
    }
    cursor = addDays(cursor, 1)
  }

  return { ...resultado, flights, seatStates }
}

export function crewCounts(codigoVuelo, operations = {}, catalogs = {}) {
  const ids = operations.crewAssignments?.[codigoVuelo] || []
  const tripulantes = ids.map((id) => (catalogs.tripulantes || []).find((item) => item.idTripulante === id)).filter(Boolean)
  const conteo = { Piloto: 0, Copiloto: 0, Auxiliar: 0, total: tripulantes.length, faltantes: [] }
  Object.entries(REQUERIMIENTOS_TRIPULACION).forEach(([tipo, minimo]) => {
    conteo[tipo] = tripulantes.filter((item) => item.tipoTripulante === tipo).length
    if (conteo[tipo] < minimo) conteo.faltantes.push(`${minimo - conteo[tipo]} ${tipo}${minimo - conteo[tipo] > 1 ? 's' : ''}`)
  })
  return conteo
}

export function assignCrew(codigoVuelo, ids, context = {}) {
  const { operations = {}, catalogs = {} } = context
  const flight = (operations.flights || []).find((item) => flightKey(item) === codigoVuelo)
  if (!flight) return { ok: false, message: 'El vuelo ya no existe.' }
  const tripulantes = (catalogs.tripulantes || []).filter((item) => ids.includes(item.idTripulante))
  if (tripulantes.length !== ids.length) return { ok: false, message: 'Uno de los tripulantes ya no existe.' }
  const inactivos = tripulantes.filter((item) => item.estado !== 'Activo')
  if (inactivos.length) return { ok: false, message: `${inactivos[0].nombre} ${inactivos[0].apellido} está inactivo.` }

  const validacion = validateFlightCandidate(
    { ...flight, tripulacion: ids },
    {
      catalogs,
      flights: operations.flights || [],
      crewAssignments: { ...(operations.crewAssignments || {}), [codigoVuelo]: ids },
      excludeKey: codigoVuelo,
    },
  )
  if (!validacion.ok) return validacion

  return { ok: true, crewAssignments: { ...(operations.crewAssignments || {}), [codigoVuelo]: ids } }
}

export function allowedTransitions(estado) {
  return TRANSICIONES[estado] || []
}

export function validateStatusChange(flight, siguiente, context = {}) {
  const permitidas = allowedTransitions(flight?.st)
  if (!permitidas.includes(siguiente)) {
    return { ok: false, message: `Transición no válida: ${flight?.st} → ${siguiente}.` }
  }
  if (siguiente === 'Abordando') {
    const conteo = crewCounts(flightKey(flight), context.operations || {}, context.catalogs || {})
    if (conteo.faltantes.length) {
      return { ok: false, message: `No se puede abordar: faltan ${conteo.faltantes.join(', ')}.` }
    }
  }
  return { ok: true }
}

export function buildFlightFromForm(form = {}, catalogs = {}) {
  const ruta = (catalogs.rutas || []).find((item) => item.codigoRuta === form.codigoRuta)
  const avion = (catalogs.aviones || []).find((item) => item.codigoAvion === form.codigoAvion)
  if (!ruta) return { ok: false, message: 'Selecciona una ruta válida.' }
  if (!avion) return { ok: false, message: 'Selecciona un avión válido.' }
  const dur = Number(ruta.tiempoEstimado) || 90
  const salida = parseMinutos(form.horaSalida)
  return {
    ok: true,
    flight: {
      codigoVuelo: String(form.codigoVuelo || '').trim().toUpperCase(),
      codigoHorario: form.codigoHorario || '',
      codigoRuta: ruta.codigoRuta,
      codigoAvion: avion.codigoAvion,
      o: ruta.aeropuertoOrigen,
      d: ruta.aeropuertoDestino,
      date: form.fecha,
      s: salida,
      e: salida + dur,
      dur,
      mod: avion.modelo,
      price: Number(form.price) || Math.round((60000 + dur * 1100) / 1000) * 1000,
      st: form.estado || 'Programado',
      gate: form.gate || '',
      term: form.terminal ?? '',
    },
  }
}

export function seatStateSummary(codigoVuelo, operations = {}) {
  const asientos = operations.seatStates?.[codigoVuelo] || []
  const resumen = { disponible: 0, bloqueado: 0, reservado: 0, ocupado: 0, total: asientos.length }
  asientos.forEach((asiento) => {
    if (Object.hasOwn(resumen, asiento.estado)) resumen[asiento.estado] += 1
  })
  return resumen
}
