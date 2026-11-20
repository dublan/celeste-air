import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ADM as INITIAL_ADM,
  AP,
  BOOK as INITIAL_BOOK,
  COP,
  CREDITS,
  IMAGES,
  du,
  fd,
  iso,
  rnd,
  taken,
  tm,
} from './data'
import { KEYS, clearPersisted, isPlainObject, usePersistedState } from './storage'
import CrudManager, { Dialog } from './CrudManager'
import { ROLE_INFO, SCHEMAS, createSeedCatalogs, isValidCatalogs, normalizeCatalogs } from './catalogs'
import { CLASS_INDEX, planeForModel, planesWithBookings, preparePlane, seatClassForFlight, seatPrice, seatRows, seatsForFlight } from './seats'
import {
  DIAS_SEMANA,
  addDays,
  allowedTransitions,
  assignCrew,
  buildFlightFromForm,
  crewCounts,
  createSeedOperations,
  dateKey,
  flightAirplane,
  flightKey,
  generateFlightsFromSchedule,
  isValidOperations,
  makeSeatStates,
  normalizeOperations,
  seatStateSummary,
  validateFlightCandidate,
  validateStatusChange,
} from './operations'
import { fechasConVuelos, precioMinimoDestino, routeForFlight, sellableFlights } from './pricing'

const PLANE_PATH = 'M2 13l20-9-5 17-4-7-7-1z'
const STEP_LABELS = ['Vuelo', 'Asientos', 'Pasajeros y pago', 'Boleto']
const DESTINATIONS = ['MDE', 'CTG', 'CLO', 'MIA', 'MAD', 'PTY']
const CAL_STATE = {
  Programado: 'border-celeste bg-celeste-pale text-azure-deep',
  Abordando: 'border-azure bg-azure/10 text-azure',
  Retrasado: 'border-airmail bg-airmail/10 text-airmail',
  Cancelado: 'border-rule bg-mist text-slate',
  Finalizado: 'border-ink bg-ink text-white',
}
const ROLES = Object.entries(ROLE_INFO).map(([id, info]) => [id, info.label, info.description])
const ROLE_IDS = ROLES.map(([id]) => id)
const AUDIT_LIMIT = 500
const auditEntityName = (key) => SCHEMAS.find((schema) => schema.key === key)?.name || 'Registro'

const isFlight = (f) =>
  isPlainObject(f) && typeof (f.codigoVuelo || f.id) === 'string' && typeof f.o === 'string' && typeof f.d === 'string' && typeof f.s === 'number'

const normalizeFlight = (f) =>
  isFlight(f)
    ? {
        ...f,
        id: f.id || f.codigoVuelo,
        codigoVuelo: f.codigoVuelo || f.id,
        codigoAvion: f.codigoAvion || planeForModel(f.mod),
        gate: f.gate ?? '',
        term: f.term ?? '',
      }
    : f

const isBooking = (b) =>
  isPlainObject(b) &&
  typeof b.code === 'string' &&
  typeof b.total === 'number' &&
  typeof b.est === 'string' &&
  isFlight(b.fl) &&
  Array.isArray(b.pax) &&
  b.pax.every((p) => isPlainObject(p) && typeof p.n === 'string' && typeof p.doc === 'string') &&
  Array.isArray(b.seats)

const isUser = (u) => u === null || (isPlainObject(u) && ROLE_IDS.includes(u.role) && typeof u.name === 'string')

const isMilesMovement = (m) =>
  isPlainObject(m) && typeof m.fecha === 'string' && typeof m.vuelo === 'string' && typeof m.millas === 'number'

const isPassengerProfile = (p) =>
  isPlainObject(p) &&
  typeof p.id === 'string' &&
  typeof p.idUsuario === 'string' &&
  Array.isArray(p.movimientos) &&
  p.movimientos.every(isMilesMovement)

const isSeatHold = (h) =>
  h === null ||
  (isPlainObject(h) &&
    typeof h.codigoVuelo === 'string' &&
    Array.isArray(h.asientos) &&
    h.asientos.every((s) => typeof s === 'string') &&
    typeof h.expira === 'number' &&
    Number.isFinite(h.expira))

const docKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const defaultProfile = (u = {}) => {
  const nombreCompleto = String(u.name || '').trim().split(/\s+/)
  const nombre = u.nombre || nombreCompleto[0] || ''
  const apellido = u.apellido || nombreCompleto.slice(1).join(' ') || ''
  return {
    id: `P-${u.id || u.idUsuario || 'NUEVO'}`,
    idUsuario: u.id || u.idUsuario || '',
    tipoDocumento: u.tipoDocumento || 'CC',
    numeroDocumento: u.numeroDocumento || '',
    fechaExpedicion: u.fechaExpedicion || '',
    nombre,
    apellido,
    fechaNacimiento: u.fechaNacimiento || '',
    sexo: u.sexo || 'Prefiero no decirlo',
    celular: u.celular || '',
    correo: u.correo || '',
    nacionalidad: u.nacionalidad || 'Colombiana',
    direccion: u.direccion || '',
    ciudad: u.ciudad || '',
    pais: u.pais || 'Colombia',
    preferencias: {
      ubicacion: u.preferencias?.ubicacion || PREFERENCE_NONE,
      zona: u.preferencias?.zona || PREFERENCE_NONE,
    },
    movimientos: Array.isArray(u.movimientos) ? u.movimientos.filter(isMilesMovement) : [],
    millasAcumuladas: Number(u.millasAcumuladas) || 0,
  }
}

const normalizePassengerProfiles = (value, users = []) => {
  const map = new Map(users.filter((u) => u.rol === 'pas').map((u) => [u.id, defaultProfile(u)]))
  const stored = Array.isArray(value) ? value.filter(isPassengerProfile) : []
  stored.forEach((profile) => {
    const base = map.get(profile.idUsuario) || defaultProfile(profile)
    const vistos = new Set()
    const movimientos = profile.movimientos.filter((movimiento) => {
      const clave = movimiento.clave || `${movimiento.vuelo}-${movimiento.fecha}-${movimiento.millas}`
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
    map.set(profile.idUsuario, {
      ...base,
      ...profile,
      movimientos,
      millasAcumuladas: movimientos.reduce((sum, movimiento) => sum + Number(movimiento.millas || 0), 0),
    })
  })
  return [...map.values()]
}

const formatMiles = (value) => Number(value || 0).toLocaleString('es-CO')

const formatCountdown = (ms) => {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const millasVuelo = (flight, seat, aviones, catalogs) => {
  const ruta = routeForFlight(flight, catalogs)
  const clase = seatClassForFlight(flight, seat, aviones).claseCabina
  return Math.round((Number(ruta?.distanciaKm) || 0) * (MILES_FACTOR[clase] ?? MILES_FACTOR.Económica))
}

const seatMatchesPreferences = (seat, preferencias = {}, maxFila = 0) => {
  const ubicacion = preferencias.ubicacion || PREFERENCE_NONE
  const zona = preferencias.zona || PREFERENCE_NONE
  if (ubicacion === PREFERENCE_NONE && zona === PREFERENCE_NONE) return false
  const mitad = Math.max(1, Math.ceil(maxFila / 2))
  const coincideUbicacion = ubicacion === PREFERENCE_NONE || (ubicacion === 'ventana' && ['A', 'F'].includes(seat.columna)) || (ubicacion === 'pasillo' && ['C', 'D'].includes(seat.columna))
  const coincideZona = zona === PREFERENCE_NONE || (zona === 'delantera' ? Number(seat.fila) <= mitad : Number(seat.fila) > mitad)
  return coincideUbicacion && coincideZona
}

const validarPerfil = (form = {}, hoy = dateKey(new Date())) => {
  const errors = {}
  if (!String(form.numeroDocumento || '').trim()) errors.numeroDocumento = 'El documento es obligatorio.'
  if (!String(form.correo || '').trim()) errors.correo = 'Escribe un correo válido.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.correo).trim())) errors.correo = 'Escribe un correo válido.'
  if (form.celular && !/^\d+$/.test(String(form.celular))) errors.celular = 'Usa solo dígitos.'
  if (form.fechaNacimiento && form.fechaNacimiento > hoy) errors.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.'
  return errors
}

const isAuditEntry = (a) =>
  isPlainObject(a) &&
  typeof a.fechaHora === 'string' &&
  typeof a.usuario === 'string' &&
  typeof a.rol === 'string' &&
  typeof a.entidad === 'string' &&
  typeof a.accion === 'string' &&
  (a.antes === null || isPlainObject(a.antes)) &&
  (a.despues === null || isPlainObject(a.despues))

const isQuery = (q) =>
  isPlainObject(q) &&
  typeof q.f === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(q.f) &&
  q.o !== q.d &&
  Object.hasOwn(AP, q.o) &&
  Object.hasOwn(AP, q.d) &&
  [1, 2, 3, 4].includes(q.n)

const CHECKIN_STEPS = ['Pasajeros', 'Asientos', 'Equipaje', 'Confirmación']
const GROUPS = { Primera: 1, Business: 2, 'Económica': 3 }
const BAGGAGE = {
  allowance: { Económica: 23, Business: 32, Primera: 40 },
  maxPiezas: 3,
  maxKgPieza: 32,
  costoKg: 15000,
  tipos: ['Maleta', 'Mochila', 'Equipo especial'],
}
const MILES_FACTOR = { Económica: 0.5, Business: 1, Primera: 1.5 }
const PREFERENCE_NONE = 'sin preferencia'
const SEAT_HOLD_MS = 10 * 60 * 1000
const SEAT_HOLD_WARNING_MS = 2 * 60 * 1000
const SEAT_HOLD_CLEANUP_MS = 15 * 1000
const DOCUMENT_TYPES = ['CC', 'Pasaporte', 'CE']
const SEX_OPTIONS = ['Femenino', 'Masculino', 'Prefiero no decirlo']
const LOCATION_OPTIONS = [
  ['ventana', 'Ventana'],
  ['pasillo', 'Pasillo'],
  [PREFERENCE_NONE, 'Sin preferencia'],
]
const ZONE_OPTIONS = [
  ['delantera', 'Delantera'],
  ['trasera', 'Trasera'],
  [PREFERENCE_NONE, 'Sin preferencia'],
]
const PROFILE_FIELDS = [
  ['tipoDocumento', 'Tipo de documento'],
  ['numeroDocumento', 'Número de documento'],
  ['fechaExpedicion', 'Fecha de expedición'],
  ['nombre', 'Nombre'],
  ['apellido', 'Apellido'],
  ['fechaNacimiento', 'Fecha de nacimiento'],
  ['sexo', 'Sexo'],
  ['celular', 'Celular'],
  ['correo', 'Correo'],
  ['nacionalidad', 'Nacionalidad'],
  ['direccion', 'Dirección'],
  ['ciudad', 'Ciudad'],
  ['pais', 'País'],
]
const HOUR = 60 * 60 * 1000
const pad = (n) => String(n).padStart(2, '0')
const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const clockNow = (sim) => {
  if (sim && /^\d{4}-\d{2}-\d{2}$/.test(sim.date) && /^\d{2}:\d{2}$/.test(sim.time)) {
    const [y, m, d] = sim.date.split('-').map(Number)
    const [hh, mm] = sim.time.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm, 0, 0)
  }
  return new Date()
}

const departureAt = (f) => {
  const [y, m, d] = f.date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setMinutes(f.s)
  return dt
}

const fmtWhen = (d) =>
  d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const DEFAULT_CANCEL_POLICY = [
  { horasAntes: 72, porcentaje: 100 },
  { horasAntes: 24, porcentaje: 50 },
  { horasAntes: 0, porcentaje: 0 },
]

const isPayment = (p) =>
  isPlainObject(p) &&
  typeof p.codigoPago === 'string' &&
  typeof p.codigoReserva === 'string' &&
  typeof p.monto === 'number' &&
  typeof p.estadoPago === 'string'

const isRefund = (r) =>
  isPlainObject(r) &&
  typeof r.codigoReembolso === 'string' &&
  typeof r.codigoPago === 'string' &&
  typeof r.codigoReserva === 'string' &&
  typeof r.monto === 'number' &&
  typeof r.porcentaje === 'number' &&
  typeof r.fecha === 'string' &&
  r.estado === 'Procesado'

const normalizarPolitica = (politica) => {
  const tramos = (Array.isArray(politica) ? politica : [])
    .map((tramo) => ({ horasAntes: Number(tramo?.horasAntes), porcentaje: Number(tramo?.porcentaje) }))
    .filter(
      (tramo) =>
        Number.isFinite(tramo.horasAntes) &&
        tramo.horasAntes >= 0 &&
        Number.isFinite(tramo.porcentaje) &&
        tramo.porcentaje >= 0 &&
        tramo.porcentaje <= 100,
    )
    .sort((a, b) => b.horasAntes - a.horasAntes)
  return tramos.length ? tramos : DEFAULT_CANCEL_POLICY
}

const politicaPorDefecto = (politica) => !Array.isArray(politica) || politica.length === 0

const descripcionPolitica = (politica) =>
  normalizarPolitica(politica).map((tramo, i, tramos) => {
    const anterior = tramos[i - 1]
    if (!anterior) return `Más de ${tramo.horasAntes} h antes del vuelo: ${tramo.porcentaje}% de devolución.`
    if (tramo.horasAntes === 0) return `Menos de ${anterior.horasAntes} h antes del vuelo: ${tramo.porcentaje}% de devolución.`
    return `Entre ${tramo.horasAntes} h y ${anterior.horasAntes} h antes del vuelo: ${tramo.porcentaje}% de devolución.`
  })

const pagoDeReserva = (b) => {
  const sufijo = String(b.code || 'RS').replace(/[^A-Z0-9]/gi, '').slice(-5).toUpperCase()
  const fechaPago = b.pago?.fechaPago || new Date(`${b.fl.date}T${pad(Math.floor(b.fl.s / 60))}:${pad(b.fl.s % 60)}:00`).toISOString()
  return {
    codigoPago: b.pago?.codigoPago || `PG${sufijo}`,
    codigoReserva: b.code,
    monto: Number(b.pago?.monto ?? b.total) || 0,
    moneda: b.pago?.moneda || b.fl?.moneda || 'COP',
    metodoPago: b.pago?.metodoPago || 'Tarjeta',
    fechaPago,
    estadoPago: b.pago?.estadoPago || 'Pagado',
    referenciaTransaccion: b.pago?.referenciaTransaccion || `SIM-${sufijo}`,
    numeroCuotas: Number(b.pago?.numeroCuotas) || 1,
  }
}

const estadoPagoPorPorcentaje = (porcentaje) =>
  porcentaje >= 100 ? 'Reembolsado' : porcentaje > 0 ? 'Reembolso parcial' : 'Sin reembolso'

const datosCancelacion = (b, pago, fechaActual) => {
  const horas = Math.max(0, (departureAt(b.fl).getTime() - fechaActual.getTime()) / HOUR)
  const tramos = normalizarPolitica(b.politicaCancelacion)
  const tramo = tramos.find((item) => horas >= item.horasAntes) || tramos[tramos.length - 1]
  const tramoTexto = descripcionPolitica(b.politicaCancelacion)[tramos.indexOf(tramo)] || `Desde ${tramo.horasAntes} h antes`
  const porcentaje = Math.round(Number(tramo.porcentaje) || 0)
  const pagado = Number(pago?.monto ?? b.total) || 0
  const reembolsar = Math.round((pagado * porcentaje) / 100)
  return {
    horas,
    horasEnteras: Math.floor(horas),
    tramo,
    tramoTexto,
    porcentaje,
    pagado,
    reembolsar,
    retenido: pagado - reembolsar,
    porDefecto: b.politicaPorDefecto === true,
  }
}

const checkinWindow = (b, now) => {
  const dep = departureAt(b.fl)
  const open = new Date(dep.getTime() - 24 * HOUR)
  const close = new Date(dep.getTime() - HOUR)
  if (now < open) return { open: false, reason: `Se habilita el ${fmtWhen(open)}` }
  if (now >= close) return { open: false, reason: `Cerró el ${fmtWhen(close)}` }
  return { open: true, reason: '' }
}

const KIOSCO_STEPS = ['Leer boleto', 'Confirmar pasajero', 'Imprimir pase']

const isDeviceActivity = (entry) =>
  isPlainObject(entry) &&
  typeof entry.fecha === 'string' &&
  typeof entry.codigoDispositivo === 'string' &&
  typeof entry.codigoAeropuerto === 'string' &&
  typeof entry.pasajero === 'string' &&
  typeof entry.vuelo === 'string'

const airportName = (code, catalogs) =>
  (catalogs?.aeropuertos || []).find((a) => a.codigoIATA === code)?.nombreAeropuerto || AP[code]?.c || code

const kioscoService = {
  leerBoleto(codigo, { bookings = [], dispositivo, catalogs }) {
    const texto = String(codigo || '').trim().toUpperCase()
    if (!dispositivo) {
      return { ok: false, mensaje: 'No hay un dispositivo seleccionado.', accion: 'Elige un dispositivo activo para continuar.' }
    }
    if (!texto) {
      return { ok: false, mensaje: 'Escribe o toca un código de boleto.', accion: 'Usa el código de la reserva o consulta tus boletos disponibles.' }
    }
    const base = texto.split('-')[0]
    const booking = bookings.find(
      (b) => String(b.code || '').toUpperCase() === texto || String(b.code || '').toUpperCase() === base,
    )
    if (!booking) {
      return { ok: false, mensaje: `No encontramos una reserva con el código ${texto}.`, accion: 'Revisa el boleto e inténtalo de nuevo.' }
    }
    if (booking.fl.o !== dispositivo.codigoAeropuerto) {
      const nombre = airportName(booking.fl.o, catalogs)
      return {
        ok: false,
        mensaje: `Este boleto sale desde ${nombre} (${booking.fl.o}).`,
        accion: `Haz el check-in en un dispositivo de ${nombre}.`,
      }
    }
    return { ok: true, booking }
  },

  validarPasajero(booking, paxIndex, { ahora, dispositivo, catalogs }) {
    const pasajero = booking?.pax?.[paxIndex]
    if (!pasajero) return { ok: false, mensaje: 'Selecciona un pasajero.', accion: 'Toca el nombre del pasajero para continuar.' }
    if (booking.fl.o !== dispositivo.codigoAeropuerto) {
      const nombre = airportName(booking.fl.o, catalogs)
      return {
        ok: false,
        mensaje: `Este vuelo sale desde ${nombre} (${booking.fl.o}).`,
        accion: `Haz el check-in en un dispositivo de ${nombre}.`,
      }
    }
    if (booking.est !== 'Confirmada') {
      return {
        ok: false,
        mensaje: `La reserva ${booking.code} está ${String(booking.est).toLowerCase()}.`,
        accion: 'Solo se puede hacer check-in en reservas confirmadas. Consulta con un agente.',
      }
    }
    if (pasajero.checkin?.hecho) {
      return {
        ok: false,
        mensaje: `${pasajero.n} ${pasajero.a} ya tiene check-in.`,
        accion: 'Puedes imprimir su pase en Mis reservas o elegir otro pasajero.',
      }
    }
    const dep = departureAt(booking.fl)
    const open = new Date(dep.getTime() - 24 * HOUR)
    const close = new Date(dep.getTime() - HOUR)
    if (ahora < open) {
      return { ok: false, mensaje: `Tu check-in abre el ${fmtWhen(open)}.`, accion: 'Vuelve cuando se abra la ventana de check-in.' }
    }
    if (ahora >= close) {
      return { ok: false, mensaje: `El check-in cerró el ${fmtWhen(close)}.`, accion: 'Ya no puedes hacer check-in en el kiosco.' }
    }
    const asiento = pasajero.checkin?.asiento || booking.seats?.[paxIndex] || ''
    if (!asiento) {
      return { ok: false, mensaje: 'Este pasajero no tiene asiento asignado.', accion: 'Consulta con un agente para asignar un asiento.' }
    }
    const bolsas = calcBags(pasajero.bags || [], asiento, booking.fl, catalogs.aviones).bags
    return { ok: true, asiento, bolsas, mensaje: '', accion: '' }
  },

  registrarCheckIn({ booking, paxIndex, dispositivo, ahora, catalogs, guardar, registrarActividad }) {
    const validacion = kioscoService.validarPasajero(booking, paxIndex, { ahora, dispositivo, catalogs })
    if (!validacion.ok) return validacion
    const pasajero = booking.pax[paxIndex]
    const fecha = ahora.toISOString()
    guardar({
      code: booking.code,
      paxIndex,
      asiento: validacion.asiento,
      fecha,
      codigoDispositivo: dispositivo.codigoDispositivo,
      bolsas: validacion.bolsas,
    })
    registrarActividad({
      fecha,
      codigoDispositivo: dispositivo.codigoDispositivo,
      codigoAeropuerto: dispositivo.codigoAeropuerto,
      codigoReserva: booking.code,
      pasajero: `${pasajero.n} ${pasajero.a}`.trim(),
      vuelo: `${booking.fl.id} · ${booking.fl.o} → ${booking.fl.d}`,
    })
    return { ok: true, asiento: validacion.asiento, bolsas: validacion.bolsas }
  },

  imprimirPase() {
    window.print()
    return { ok: true }
  },
}

const isClock = (c) =>
  c === null ||
  (isPlainObject(c) && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && /^\d{2}:\d{2}$/.test(c.time))

const isKey = (v) => v === null || typeof v === 'string'

const legacyAirports = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.airports) || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

const sessionFromCatalog = (u) => ({
  id: u.id,
  role: u.rol,
  name: [u.nombre, u.apellido].filter(Boolean).join(' '),
  codigoAeropuertoAsignado: u.codigoAeropuertoAsignado || '',
})

const liveSession = (session, users = []) => {
  if (!session) return null
  const byId = session.id ? users.find((u) => String(u.id) === String(session.id)) : null
  if (byId) return byId.estado === 'Activo' && ROLE_IDS.includes(byId.rol) ? sessionFromCatalog(byId) : null
  if (ROLE_IDS.includes(session.role)) {
    const byRole = users.find((u) => u.rol === session.role && u.estado === 'Activo')
    return byRole ? sessionFromCatalog(byRole) : null
  }
  return null
}

const catalogPk = (key) => SCHEMAS.find((s) => s.key === key)?.pk || 'id'

const addCheckin = (b) => {
  const politica = Array.isArray(b.politicaCancelacion) && b.politicaCancelacion.length ? b.politicaCancelacion : b.fl?.politicaCancelacion
  return {
    ...b,
    codigoTarifa: b.codigoTarifa || b.fl?.codigoTarifa || '',
    politicaCancelacion: normalizarPolitica(politica),
    politicaPorDefecto: b.politicaPorDefecto === true || politicaPorDefecto(politica),
    pago: b.pago || pagoDeReserva(b),
    cancelacion: b.cancelacion || null,
    pax: b.pax.map((p) => ({
      ...p,
      bags: Array.isArray(p.bags) ? p.bags.map((bag) => (isPlainObject(bag) ? bag : null)).filter(Boolean) : [],
      checkin: isPlainObject(p.checkin)
        ? {
            hecho: p.checkin.hecho === true,
            asiento: typeof p.checkin.asiento === 'string' ? p.checkin.asiento : '',
            fecha: typeof p.checkin.fecha === 'string' ? p.checkin.fecha : '',
            ...(typeof p.checkin.equipaje === 'number' ? { equipaje: p.checkin.equipaje } : {}),
            ...(typeof p.checkin.codigoDispositivo === 'string' ? { codigoDispositivo: p.checkin.codigoDispositivo } : {}),
          }
        : { hecho: false, asiento: '', fecha: '' },
    })),
  }
}

const seatOf = (b, i) => b.pax[i]?.checkin?.asiento || b.seats[i] || ''

const reservaService = {
  confirmar({ hold, flight, seats = [], bookings = [] }) {
    const codigoVuelo = flightKey(flight)
    if (!hold || hold.codigoVuelo !== codigoVuelo) {
      return { ok: false, message: 'Tu bloqueo de asientos ya no es válido. Elige tus asientos de nuevo.' }
    }
    if (Date.now() >= hold.expira) {
      return { ok: false, message: 'Tu tiempo terminó. Elige tus asientos de nuevo.' }
    }
    if (!hold.asientos.length || hold.asientos.some((seat) => !seats.includes(seat))) {
      return { ok: false, message: 'Tus asientos cambiaron. Elígelos de nuevo antes de pagar.' }
    }
    const ocupados = new Set()
    bookings
      .filter((b) => !['Cancelada', 'Vuelo cancelado'].includes(b.est) && flightKey(b.fl) === codigoVuelo)
      .forEach((b) => {
        const reservados = b.seats || []
        reservados.forEach((seat) => ocupados.add(seat))
        const pasajeros = b.pax || []
        pasajeros.forEach((pax) => {
          if (pax.checkin?.hecho && pax.checkin.asiento) ocupados.add(pax.checkin.asiento)
        })
      })
    const perdido = hold.asientos.find((seat) => ocupados.has(seat))
    if (perdido) {
      return { ok: false, message: `El asiento ${perdido} ya fue reservado. Elige otro asiento.` }
    }
    return { ok: true }
  },
}

const acumularMillasPorVuelo = (vuelo, reservas, catalogos, fecha, perfiles) => {
  const codigoVuelo = flightKey(vuelo)
  const ruta = routeForFlight(vuelo, catalogos)
  if (!Number(ruta?.distanciaKm)) return { perfiles: [], movimientos: [] }

  const actualizados = new Map()
  const movimientos = []
  reservas
    .filter((b) => b.est === 'Confirmada' && flightKey(b.fl) === codigoVuelo)
    .forEach((b) =>
      b.pax.forEach((pax, index) => {
        if (!pax.checkin?.hecho || !docKey(pax.doc)) return
        const perfil = perfiles.find(
          (item) => item.numeroDocumento && docKey(`${item.tipoDocumento} ${item.numeroDocumento}`) === docKey(pax.doc),
        )
        if (!perfil) return
        const destino = actualizados.get(perfil.id) || perfil
        if (destino.movimientos.some((m) => (m.clave || m.vuelo) === codigoVuelo)) return
        const millas = millasVuelo(b.fl, seatOf(b, index), catalogos.aviones, catalogos)
        if (!millas) return
        const movimiento = { clave: codigoVuelo, fecha: fecha.toISOString(), vuelo: codigoVuelo, millas }
        actualizados.set(perfil.id, {
          ...destino,
          movimientos: [...destino.movimientos, movimiento],
          millasAcumuladas: (destino.millasAcumuladas || 0) + millas,
        })
        movimientos.push({ perfil: perfil.id, ...movimiento })
      }),
    )
  return { perfiles: [...actualizados.values()], movimientos }
}

const allowanceFor = (seat, flight, aviones) => BAGGAGE.allowance[seatClassForFlight(flight, seat, aviones).claseCabina] || BAGGAGE.allowance.Económica

function calcBags(bags, seat, flight, aviones) {
  const permitido = allowanceFor(seat, flight, aviones)
  const registrados = bags.reduce((a, bag) => a + (Number(bag.pesoKg) || 0), 0)
  const exceso = Math.max(0, registrados - permitido)
  let restante = exceso
  const calculados = [...bags]
    .reverse()
    .map((bag) => {
      const propio = Math.min(restante, Number(bag.pesoKg) || 0)
      restante -= propio
      return { ...bag, exceso: propio, costoExtra: propio * BAGGAGE.costoKg }
    })
    .reverse()
  return { permitido, registrados, exceso, costo: exceso * BAGGAGE.costoKg, bags: calculados }
}

const unpaidBags = (p) => (p.bags || []).some((bag) => bag.estado !== 'Pagado')

function makeBag(tipo, pesoKg, pax) {
  const id = 'B' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const codigoBarras = 'CL-' + rnd(id + pax.doc)().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')
  return { id, pesoKg, tipo, exceso: 0, costoExtra: 0, codigoBarras, estado: 'Registrado' }
}

const BTN =
  'inline-flex items-center justify-center rounded-[2px] border px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const BTN_PRI = `${BTN} border-azure bg-azure text-white hover:border-azure-deep hover:bg-azure-deep`
const BTN_SEC = `${BTN} border-ink/25 bg-paper text-ink hover:border-ink hover:bg-mist`
const INPUT =
  'mt-1.5 w-full rounded-[2px] border border-rule bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20 focus-visible:outline-none'
const FOOTER_INPUT =
  'mt-1 block rounded-[2px] border border-rule bg-paper px-2 py-1.5 text-xs text-ink focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20'

function Plane({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={PLANE_PATH} fill="currentColor" />
    </svg>
  )
}

function Photo({ src, alt, className = '', eager = false }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className={`flex items-center justify-center bg-celeste-pale text-azure/40 ${className}`}>
        <Plane className="h-8 w-8" />
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

function Status({ value }) {
  const tone =
    value === 'Retrasado' || value === 'Cancelada' || value === 'Cancelado' || value === 'Vuelo cancelado' || value === 'Reembolso parcial'
      ? 'text-airmail'
      : value === 'Finalizada' || value === 'Pagado' || value === 'Reembolsado'
        ? 'text-azure-deep'
        : value === 'Abordando' || value === 'Confirmada'
          ? 'text-azure'
          : 'text-slate'

  return <span className={`text-[11px] font-semibold ${tone}`}>{value}</span>
}

function Steps({ current, labels = STEP_LABELS, title = 'Progreso de la reserva' }) {
  return (
    <ol className="mt-8 flex flex-wrap items-baseline gap-x-7 gap-y-3 border-y border-rule py-4" aria-label={title}>
      {labels.map((label, i) => {
        const active = i === current
        return (
          <li key={label} className="flex items-baseline gap-2" aria-current={active ? 'step' : undefined}>
            <span className={`font-display text-lg ${active ? 'text-azure' : 'text-slate/60'}`}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={`text-sm ${active ? 'font-semibold text-ink' : 'text-slate'}`}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function QR({ value, size = 104 }) {
  const r = rnd(value)
  const N = 21
  const cells = []

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      let on

      if (finder) {
        const a = x < 7 ? x : x - 14
        const b = y < 7 ? y : y - 14
        on = a == 0 || a == 6 || b == 0 || b == 6 || (a > 1 && a < 5 && b > 1 && b < 5)
      } else {
        on = r() > 0.52
      }

      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  }

  return (
    <svg viewBox="0 0 21 21" width={size} height={size} fill="currentColor" shapeRendering="crispEdges" role="img" aria-label="Código QR" className="block">
      {cells}
    </svg>
  )
}

function useHashRoute() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'home')

  useEffect(() => {
    const onChange = () => {
      window.scrollTo(0, 0)
      setRoute(location.hash.slice(1) || 'home')
    }

    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export default function App() {
  const route = useHashRoute()
  const [catalogs, setCatalogs] = usePersistedState(
    KEYS.catalogs,
    () => createSeedCatalogs(legacyAirports()),
    isValidCatalogs,
    (value) => normalizeCatalogs(value, legacyAirports()),
  )
  const [user, setUser] = usePersistedState(KEYS.user, null, isUser)
  const [passengerProfiles, setPassengerProfiles] = usePersistedState(
    KEYS.passengerProfiles,
    () => catalogs.usuarios.filter((u) => u.rol === 'pas').map(defaultProfile),
    (v) => Array.isArray(v) && v.every(isPassengerProfile),
    (v) => normalizePassengerProfiles(v, catalogs.usuarios),
  )
  const [seatHold, setSeatHold] = usePersistedState(KEYS.seatHold, null, isSeatHold)
  const [query, setQuery] = usePersistedState(KEYS.query, { o: 'BAQ', d: 'BOG', f: iso(14), n: 1 }, isQuery)
  const [sort, setSort] = useState('p')
  const [flight, setFlight] = useState(null)
  const [seats, setSeats] = useState([])
  const [bookingCode, setBookingCode] = usePersistedState(KEYS.ticket, null, isKey)
  const [bookings, setBookings] = usePersistedState(
    KEYS.bookings,
    INITIAL_BOOK,
    (v) => Array.isArray(v) && v.every(isBooking),
    (v) => v.map((b) => addCheckin({ ...b, fl: normalizeFlight(b.fl) })),
  )
  const [payments, setPayments] = usePersistedState(
    KEYS.payments,
    () => bookings.map(pagoDeReserva),
    (v) => Array.isArray(v) && v.every(isPayment),
    (v) => {
      const vistos = new Set()
      const validos = (Array.isArray(v) ? v : []).filter((p) => isPayment(p) && !vistos.has(p.codigoReserva) && vistos.add(p.codigoReserva))
      return [...bookings.filter((b) => !vistos.has(b.code)).map(pagoDeReserva), ...validos]
    },
  )
  const [refunds, setRefunds] = usePersistedState(
    KEYS.refunds,
    [],
    (v) => Array.isArray(v) && v.every(isRefund),
    (v) => (Array.isArray(v) ? v.filter(isRefund) : []),
  )
  const [operations, setOperations] = usePersistedState(
    KEYS.operations,
    () => {
      let legacy = INITIAL_ADM
      try {
        const raw = localStorage.getItem(KEYS.adminFlights)
        const parsed = raw ? JSON.parse(raw) : null
        if (Array.isArray(parsed) && parsed.length) legacy = parsed
      } catch {}
      return createSeedOperations(legacy.map(normalizeFlight), catalogs.aviones, catalogs.horariosVuelo, catalogs)
    },
    isValidOperations,
    (value) => normalizeOperations(value, catalogs.aviones),
  )
  const [audits, setAudits] = usePersistedState(
    KEYS.audit,
    [],
    (v) => Array.isArray(v) && v.every(isAuditEntry),
    (v) => v.filter(isAuditEntry).slice(0, AUDIT_LIMIT),
  )
  const admFlights = operations.flights
  const [simClock, setSimClock] = usePersistedState(KEYS.clock, null, isClock)
  const [checkinCode, setCheckinCode] = usePersistedState(KEYS.checkin, null, isKey)
  const [passKey, setPassKey] = usePersistedState(KEYS.pass, null, isKey)
  const [luggageCode, setLuggageCode] = usePersistedState(KEYS.luggage, null, isKey)
  const [tab, setTab] = useState('res')
  const [next, setNext] = useState(null)
  const [error, setError] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReceipt, setCancelReceipt] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [deviceActivity, setDeviceActivity] = usePersistedState(
    KEYS.deviceActivity,
    [],
    (v) => Array.isArray(v) && v.every(isDeviceActivity),
    (v) => (Array.isArray(v) ? v.filter(isDeviceActivity) : []),
  )
  const [kioscoDeviceCode, setKioscoDeviceCode] = useState(null)

  const now = () => clockNow(simClock)
  const logAudit = (entidad, idRegistro, accion, antes, despues) => {
    const entrada = {
      fechaHora: now().toISOString(),
      usuario: activeUser?.name || 'Sistema',
      rol: activeUser?.role || 'sistema',
      entidad,
      idRegistro: String(idRegistro ?? ''),
      accion,
      antes: antes ?? null,
      despues: despues ?? null,
    }
    setAudits((prev) => [entrada, ...prev].slice(0, AUDIT_LIMIT))
  }
  const resultados = useMemo(
    () =>
      sellableFlights(query, catalogs, operations).sort((a, b) =>
        sort === 'p' ? a.price - b.price : sort === 'd' ? a.dur - b.dur : a.s - b.s,
      ),
    [query, catalogs, operations, sort],
  )
  const sugerencias = useMemo(() => fechasConVuelos(query, catalogs, operations), [query, catalogs, operations])
  const booking = bookingCode ? bookings.find((b) => b.code === bookingCode) ?? null : null
  const checkinBooking = checkinCode ? bookings.find((b) => b.code === checkinCode) ?? null : null
  const [passCode, passIndexRaw] = passKey ? passKey.split('|') : []
  const passIndex = Number(passIndexRaw)
  const passBooking = passCode ? bookings.find((b) => b.code === passCode) ?? null : null
  const passPax = passBooking && Number.isInteger(passIndex) ? passBooking.pax[passIndex] : null
  const luggageBooking = luggageCode ? bookings.find((b) => b.code === luggageCode) ?? null : null

  const go = (hash) => {
    setError('')
    if (location.hash.slice(1) === hash) return
    location.hash = hash
  }

  const liberarAsientos = () => {
    setSeatHold(null)
    setSeats([])
  }

  const search = (q) => {
    if (q.o === q.d) {
      setError('El origen y el destino deben ser distintos.')
      return
    }
    if (!q.f) {
      setError('Elige una fecha de salida.')
      return
    }
    if (q.f < iso(0)) {
      setError('Elige una fecha de salida futura.')
      return
    }
    setQuery(q)
    go('results')
  }

  const pickFlight = (id) => {
    setFlight(resultados.find((f) => f.id === id) || null)
    setSeats([])
    go('seats')
  }

  const searchDate = (fecha) => search({ ...query, f: fecha })

  const toggleSeat = (id) => {
    setError('')
    setSeats((prev) => {
      const i = prev.indexOf(id)
      if (i >= 0) return prev.filter((s) => s !== id)
      const nextSeats = [...prev, id]
      if (nextSeats.length > query.n) nextSeats.shift()
      return nextSeats
    })
  }

  const nextStep = () => {
    if (!user || user.role !== 'pas') {
      setNext('checkout')
      go('login')
      return
    }
    go('checkout')
  }

  const loginAs = (catalogUser) => {
    setUser(sessionFromCatalog(catalogUser))
    const role = catalogUser.rol
    const destination = next && role === 'pas' ? next : role === 'pas' ? 'trips' : 'panel'
    setNext(null)
    go(destination)
  }

  const createBooking = (bk) => {
    const confirmacion = reservaService.confirmar({ hold: seatHold, flight, seats, bookings })
    if (!confirmacion.ok) {
      setError(confirmacion.message)
      liberarAsientos()
      if (location.hash.slice(1) === 'checkout') location.hash = 'seats'
      return
    }
    const next = addCheckin(bk)
    const pago = pagoDeReserva(next)
    setBookings((prev) => [next, ...prev])
    setPayments((prev) => [pago, ...prev.filter((p) => p.codigoReserva !== next.code)])
    logAudit('Reserva', next.code, 'Creación', null, {
      estado: next.est,
      total: next.total,
      vuelo: flightKey(next.fl),
      fecha: next.fl.date,
      ruta: `${next.fl.o}-${next.fl.d}`,
      codigoPago: pago.codigoPago,
    })
    setBookingCode(next.code)
    liberarAsientos()
    go('ticket')
  }

  const viewBooking = (b) => {
    setBookingCode(b.code)
    go('ticket')
  }

  const openCancel = (b) => {
    setCancelTarget(b)
    setCancelError('')
    setCancelReceipt(null)
  }

  const confirmCancel = () => {
    const objetivo = cancelTarget
    if (!objetivo) return
    const fecha = now()
    const anterior = bookings.find((x) => x.code === objetivo.code) || objetivo
    const pago = payments.find((p) => p.codigoReserva === objetivo.code) || pagoDeReserva(anterior)

    if (anterior.est !== 'Confirmada') {
      setCancelError('Esta reserva no está confirmada.')
      return
    }
    if (departureAt(anterior.fl).getTime() <= fecha.getTime()) {
      setCancelError('El vuelo ya salió; no se puede cancelar.')
      return
    }
    if (anterior.pax.some((p) => p.checkin?.hecho)) {
      setCancelError('Primero anula el check-in de esta reserva.')
      return
    }

    const datos = datosCancelacion(anterior, pago, fecha)
    const reembolso =
      datos.reembolsar > 0
        ? {
            codigoReembolso: 'RB' + Math.random().toString(36).slice(2, 8).toUpperCase(),
            codigoPago: pago.codigoPago,
            codigoReserva: anterior.code,
            monto: datos.reembolsar,
            porcentaje: datos.porcentaje,
            fecha: fecha.toISOString(),
            estado: 'Procesado',
          }
        : null
    const pagoActualizado = { ...pago, estadoPago: estadoPagoPorPorcentaje(datos.porcentaje) }

    setBookings((prev) =>
      prev.map((x) =>
        x.code === anterior.code
          ? {
              ...x,
              est: 'Cancelada',
              pago: pagoActualizado,
              cancelacion: { ...datos, fecha: fecha.toISOString(), codigoReembolso: reembolso?.codigoReembolso || '' },
            }
          : x,
      ),
    )
    setPayments((prev) => prev.map((p) => (p.codigoReserva === anterior.code ? pagoActualizado : p)))
    if (reembolso) setRefunds((prev) => [reembolso, ...prev.filter((r) => r.codigoReembolso !== reembolso.codigoReembolso)])
    logAudit(
      'Reserva',
      anterior.code,
      'Cancelación',
      { estado: anterior.est, pago: pago.estadoPago },
      { estado: 'Cancelada', pago: pagoActualizado.estadoPago, porcentaje: datos.porcentaje, reembolso: datos.reembolsar },
    )
    if (reembolso) logAudit('Reembolso', reembolso.codigoReembolso, 'Procesamiento', null, { codigoReserva: reembolso.codigoReserva, monto: reembolso.monto, porcentaje: reembolso.porcentaje })
    setCancelTarget(null)
    setCancelError('')
    setCancelReceipt({ ...datos, reserva: anterior.code, pago: pagoActualizado, reembolso, fecha: fecha.toISOString() })
  }

  const anularCheckin = (b) => {
    setBookings((prev) =>
      prev.map((x) =>
        x.code === b.code
          ? {
              ...x,
              pax: x.pax.map((p) => ({
                ...p,
                bags: (p.bags || []).map((bag) => ({ ...bag, estado: 'Retirado' })),
                checkin: { hecho: false, asiento: '', fecha: '' },
              })),
            }
          : x,
      ),
    )
    if (passKey?.startsWith(`${b.code}|`)) setPassKey(null)
    if (checkinCode === b.code) setCheckinCode(null)
    logAudit('Reserva', b.code, 'Anulación de check-in', { pasajeros: b.pax.filter((p) => p.checkin?.hecho).length }, { pasajeros: 0, equipaje: 'Retirado' })
  }

  const startCheckin = (b) => {
    setCheckinCode(b.code)
    go('checkin')
  }

  const completeCheckin = (b, updates) => {
    const stamp = now().toISOString()
    setBookings((prev) =>
      prev.map((x) =>
        x.code === b.code
          ? {
              ...x,
              pax: x.pax.map((p, i) => {
                const u = updates.find((item) => item.index === i)
                if (!u) return p
                const bags = calcBags(u.bags || [], u.seat, b.fl, catalogs.aviones).bags
                return {
                  ...p,
                  bags,
                  checkin: { hecho: true, asiento: u.seat, fecha: stamp, equipaje: bags.length },
                }
              }),
            }
          : x,
      ),
    )
    logAudit('Reserva', b.code, 'Check-in', { pasajeros: b.pax.length }, { pasajeros: updates.length, asientos: updates.map((u) => u.seat) })
    setPassKey(`${b.code}|${updates[0].index}`)
    go('boarding')
  }

  const openPass = (b) => {
    setPassKey(`${b.code}|${b.pax.findIndex((p) => p.checkin?.hecho)}`)
    go('boarding')
  }

  const openLuggage = (b) => {
    setLuggageCode(b.code)
    go('luggage')
  }

  const updateBags = (b, index, bags) => {
    const calculados = calcBags(bags, seatOf(b, index), b.fl, catalogs.aviones).bags
    setBookings((prev) =>
      prev.map((x) => (x.code === b.code ? { ...x, pax: x.pax.map((p, i) => (i === index ? { ...p, bags: calculados } : p)) } : x)),
    )
    logAudit('Reserva', b.code, 'Edición de equipaje', { pasajero: index + 1, piezas: b.pax[index]?.bags?.length || 0 }, { pasajero: index + 1, piezas: calculados.length })
  }

  const payBags = (b, index, bags) => {
    const calculados = calcBags(bags, seatOf(b, index), b.fl, catalogs.aviones).bags.map((bag) => ({ ...bag, estado: 'Pagado' }))
    setBookings((prev) =>
      prev.map((x) => (x.code === b.code ? { ...x, pax: x.pax.map((p, i) => (i === index ? { ...p, bags: calculados } : p)) } : x)),
    )
    logAudit('Reserva', b.code, 'Pago de equipaje', { estado: 'Pendiente', piezas: calculados.length }, { estado: 'Pagado', piezas: calculados.length })
  }

  const changeSimClock = (field, value) => {
    if (!value) return
    const current = clockNow(simClock)
    setSimClock({
      date: field === 'date' ? value : dateValue(current),
      time: field === 'time' ? value : timeValue(current),
    })
  }

  const clearSimClock = () => setSimClock(null)

  const changeFlightStatus = (codigoVuelo, siguiente) => {
    const vuelo = admFlights.find((item) => flightKey(item) === codigoVuelo)
    if (!vuelo) return { ok: false, message: 'El vuelo ya no existe.' }
    const validacion = validateStatusChange(vuelo, siguiente, { operations, catalogs })
    if (!validacion.ok) return validacion

    const fecha = now()
    const afectadas = siguiente === 'Cancelado' ? bookings.filter((b) => flightKey(b.fl) === codigoVuelo && b.est === 'Confirmada') : []
    const reembolsos = afectadas.map((b) => {
      const pago = payments.find((p) => p.codigoReserva === b.code) || pagoDeReserva(b)
      return {
        codigoReembolso: 'RB' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        codigoPago: pago.codigoPago,
        codigoReserva: b.code,
        monto: Number(pago.monto) || 0,
        porcentaje: 100,
        fecha: fecha.toISOString(),
        estado: 'Procesado',
        pago,
      }
    })
    const millas =
      siguiente === 'Finalizado' ? acumularMillasPorVuelo(vuelo, bookings, catalogs, fecha, passengerProfiles) : { perfiles: [], movimientos: [] }
    setOperations((prev) => ({
      ...prev,
      flights: prev.flights.map((item) => (flightKey(item) === codigoVuelo ? { ...item, st: siguiente } : item)),
      notifications:
        siguiente === 'Cancelado'
          ? [
              {
                id: `N-${Date.now()}`,
                texto: `Vuelo ${codigoVuelo} cancelado. ${reembolsos.length} ${reembolsos.length === 1 ? 'reserva reembolsada' : 'reservas reembolsadas'}.`,
                fecha: fecha.toISOString(),
                leida: false,
              },
              ...prev.notifications,
            ]
          : prev.notifications,
    }))
    logAudit('Vuelo', codigoVuelo, 'Cambio de estado', { estado: vuelo.st }, { estado: siguiente })
    if (millas.perfiles.length) {
      setPassengerProfiles((prev) => {
        const mapa = new Map(prev.map((perfil) => [perfil.id, perfil]))
        millas.perfiles.forEach((perfil) => mapa.set(perfil.id, perfil))
        return [...mapa.values()]
      })
      millas.movimientos.forEach((movimiento) => {
        logAudit('Pasajero', movimiento.perfil, 'Acumulación de millas', null, { vuelo: movimiento.vuelo, millas: movimiento.millas })
      })
    }
    if (reembolsos.length) {
      setBookings((prev) =>
        prev.map((b) => {
          const reembolso = reembolsos.find((r) => r.codigoReserva === b.code)
          return reembolso
            ? {
                ...b,
                est: 'Vuelo cancelado',
                pago: { ...reembolso.pago, estadoPago: 'Reembolsado' },
                cancelacion: { porcentaje: 100, reembolsar: reembolso.monto, retenido: 0, fecha: reembolso.fecha, codigoReembolso: reembolso.codigoReembolso, porDefecto: false },
              }
            : b
        }),
      )
      setPayments((prev) =>
        prev.map((p) => {
          const reembolso = reembolsos.find((r) => r.codigoPago === p.codigoPago)
          return reembolso ? { ...p, estadoPago: 'Reembolsado' } : p
        }),
      )
      setRefunds((prev) => [...reembolsos.map(({ pago, ...r }) => r), ...prev])
      reembolsos.forEach((r) => {
        logAudit('Reserva', r.codigoReserva, 'Cambio de estado', { estado: 'Confirmada' }, { estado: 'Vuelo cancelado', reembolso: r.monto })
        logAudit('Reembolso', r.codigoReembolso, 'Procesamiento', null, { codigoReserva: r.codigoReserva, monto: r.monto, porcentaje: 100 })
      })
    }
    const detalleMillas = millas.movimientos.length
      ? ` ${millas.movimientos.length} ${millas.movimientos.length === 1 ? 'movimiento de millas registrado' : 'movimientos de millas registrados'}.`
      : ''
    return {
      ok: true,
      message: `Vuelo ${codigoVuelo} pasó a ${siguiente}. ${reembolsos.length} ${reembolsos.length === 1 ? 'reserva reembolsada' : 'reservas reembolsadas'}.${detalleMillas}`,
    }
  }

  const generateFlights = (key, actionId, horario, rango) => {
    if (key !== 'horariosVuelo' || actionId !== 'generate') return { ok: false, message: 'Acción no disponible.' }
    const resultado = generateFlightsFromSchedule(horario, rango, { catalogs, operations })
    if (!resultado || !Array.isArray(resultado.flights)) return { ok: false, message: 'No se pudieron generar los vuelos.' }
    setOperations((prev) => ({ ...prev, flights: resultado.flights, seatStates: resultado.seatStates }))
    logAudit('Horario de vuelo', horario.codigoHorario, 'Generación', { vuelos: admFlights.length }, {
      creados: resultado.creados,
      omitidos: resultado.omitidos,
      desde: rango.desde,
      hasta: rango.hasta,
      vuelos: resultado.flights.length,
    })
    return { creados: resultado.creados, omitidos: resultado.omitidos, detalles: resultado.detalles }
  }

  const saveFlight = (form, existingKey = '') => {
    const construido = buildFlightFromForm(form, catalogs)
    if (!construido.ok) return construido
    const flight = normalizeFlight(construido.flight)
    const duplicado = admFlights.some((item) => flightKey(item) === flight.codigoVuelo && flightKey(item) !== existingKey)
    if (duplicado) return { ok: false, message: `Ya existe el vuelo ${flight.codigoVuelo}.` }

    const validacion = validateFlightCandidate(flight, {
      catalogs,
      flights: admFlights,
      crewAssignments: operations.crewAssignments,
      excludeKey: existingKey,
    })
    if (!validacion.ok) return validacion
    const anterior = admFlights.find((item) => flightKey(item) === existingKey) || null

    setOperations((prev) => ({
      ...prev,
      flights: existingKey
        ? prev.flights.map((item) => (flightKey(item) === existingKey ? flight : item))
        : [...prev.flights, flight],
      seatStates: {
        ...prev.seatStates,
        [flight.codigoVuelo]:
          prev.seatStates[flight.codigoVuelo] ||
          (existingKey ? prev.seatStates[existingKey] : null) ||
          makeSeatStates(flight, catalogs.aviones),
      },
    }))
    logAudit('Vuelo', flight.codigoVuelo, existingKey ? 'Edición' : 'Creación', anterior, flight)
    return { ok: true, message: `Vuelo ${flight.codigoVuelo} guardado.` }
  }

  const saveCrew = (codigoVuelo, ids) => {
    const resultado = assignCrew(codigoVuelo, ids, { operations, catalogs })
    if (!resultado.ok) return resultado
    setOperations((prev) => ({ ...prev, crewAssignments: resultado.crewAssignments }))
    logAudit('Vuelo', codigoVuelo, 'Edición de tripulación', { tripulacion: operations.crewAssignments[codigoVuelo] || [] }, { tripulacion: resultado.crewAssignments[codigoVuelo] || [] })
    return { ok: true, message: 'Tripulación actualizada.' }
  }

  const markNotificationsRead = () => {
    const sinLeer = operations.notifications.filter((item) => !item.leida).length
    setOperations((prev) => ({ ...prev, notifications: prev.notifications.map((item) => ({ ...item, leida: true })) }))
    logAudit('Notificación', 'todas', 'Cambio de estado', { sinLeer }, { sinLeer: 0 })
  }

  const saveCatalog = (key, row, isNew) => {
    const pk = catalogPk(key)
    const anterior = (catalogs[key] || []).find((item) => String(item[pk]) === String(row[pk])) || null
    if (key === 'aviones') {
      const configKeys = ['filasPrimera', 'filasBusiness', 'filasEconomica']
      const configChanged = anterior && configKeys.some((field) => Number(anterior[field]) !== Number(row[field]))
      if (configChanged) {
        const vuelos = planesWithBookings(row[pk], bookings)
        if (vuelos.length) {
          return {
            ok: false,
            message: `No puedes cambiar la configuración de este avión: tiene ${vuelos.length} ${vuelos.length === 1 ? 'vuelo con reserva' : 'vuelos con reservas'}.`,
          }
        }
      }
    }
    const nextRow = key === 'aviones' ? preparePlane(row) : row
    setCatalogs((prev) => {
      const rows = prev[key] || []
      const exists = rows.some((item) => String(item[pk]) === String(nextRow[pk]))
      const updated = isNew && !exists ? [...rows, nextRow] : rows.map((item) => (String(item[pk]) === String(nextRow[pk]) ? nextRow : item))
      return { ...prev, [key]: updated }
    })
    const snapshot = (r) => (r && key === 'aviones' ? { ...r, asientos: undefined } : r)
    logAudit(auditEntityName(key), nextRow[pk], isNew ? 'Creación' : 'Edición', snapshot(anterior), snapshot(nextRow))
    return { ok: true }
  }

  const deleteCatalog = (key, pkValue) => {
    const pk = catalogPk(key)
    if (key === 'tripulantes' && Object.values(operations.crewAssignments).some((ids) => ids.includes(String(pkValue)))) {
      return { ok: false, message: 'No puedes eliminar este tripulante: está asignado a uno o más vuelos.' }
    }
    if (key === 'aviones' && admFlights.some((flight) => flightAirplane(flight) === String(pkValue))) {
      return { ok: false, message: 'No puedes eliminar este avión: tiene vuelos asignados.' }
    }
    if (key === 'rutas' && (catalogs.horariosVuelo.some((h) => h.codigoRuta === String(pkValue)) || admFlights.some((flight) => flight.codigoRuta === String(pkValue)))) {
      return { ok: false, message: 'No puedes eliminar esta ruta: tiene horarios o vuelos asignados.' }
    }
    if (key === 'horariosVuelo' && admFlights.some((flight) => flight.codigoHorario === String(pkValue))) {
      return { ok: false, message: 'No puedes eliminar este horario de vuelo: ya tiene vuelos generados.' }
    }
    if (key === 'aeropuertos' && (catalogs.dispositivosCheckIn || []).some((device) => device.codigoAeropuerto === String(pkValue))) {
      const count = catalogs.dispositivosCheckIn.filter((device) => device.codigoAeropuerto === String(pkValue)).length
      return { ok: false, message: `No puedes eliminar este aeropuerto: tiene ${count} ${count === 1 ? 'dispositivo asignado' : 'dispositivos asignados'}.` }
    }
    const eliminado = (catalogs[key] || []).find((item) => String(item[pk]) === String(pkValue)) || null
    setCatalogs((prev) => ({ ...prev, [key]: (prev[key] || []).filter((item) => String(item[pk]) !== String(pkValue)) }))
    logAudit(auditEntityName(key), pkValue, 'Eliminación', eliminado, null)
    return { ok: true }
  }

  const toggleCatalogStatus = (key, row) => {
    const pk = catalogPk(key)
    const anterior = (catalogs[key] || []).find((item) => String(item[pk]) === String(row[pk])) || row
    const estado = anterior.estado === 'Activo' ? 'Inactivo' : 'Activo'
    if (key === 'aeropuertos' && estado === 'Inactivo') {
      const devices = (catalogs.dispositivosCheckIn || []).filter((device) => device.codigoAeropuerto === String(row[pk]))
      if (devices.length) {
        return { ok: false, message: `No puedes desactivar este aeropuerto: tiene ${devices.length} ${devices.length === 1 ? 'dispositivo asignado' : 'dispositivos asignados'}.` }
      }
    }
    setCatalogs((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((item) => (String(item[pk]) === String(row[pk]) ? { ...item, estado } : item)),
    }))
    logAudit(auditEntityName(key), row[pk], 'Cambio de estado', { estado: anterior.estado }, { estado })
    return { ok: true, estado }
  }

  const logout = () => {
    setUser(null)
    go('home')
  }

  const resetDemo = () => {
    const ok = window.confirm('¿Reiniciar la experiencia Celeste Air? Se borrarán reservas, catálogos y sesión guardados en este navegador.')
    if (!ok) return
    clearPersisted()
    window.location.hash = 'home'
    window.location.reload()
  }

  const guardarCheckinKiosco = ({ code, paxIndex, asiento, fecha, codigoDispositivo, bolsas }) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.code !== code
          ? b
          : {
              ...b,
              pax: b.pax.map((p, i) =>
                i !== paxIndex
                  ? p
                  : {
                      ...p,
                      bags: Array.isArray(bolsas) && bolsas.length ? bolsas : p.bags,
                      checkin: {
                        hecho: true,
                        asiento,
                        fecha,
                        equipaje: (p.bags || []).length,
                        codigoDispositivo,
                      },
                    },
              ),
            },
      ),
    )
  }

  const registrarActividadKiosco = (entry) => {
    setDeviceActivity((prev) => [entry, ...prev].slice(0, AUDIT_LIMIT))
    logAudit('Dispositivo de check-in', entry.codigoDispositivo, 'Check-in', null, {
      reserva: entry.codigoReserva,
      pasajero: entry.pasajero,
      vuelo: entry.vuelo,
    })
  }

  const activeUser = liveSession(user, catalogs.usuarios)
  const activeProfile =
    passengerProfiles.find((perfil) => perfil.idUsuario === activeUser?.id) ||
    defaultProfile(catalogs.usuarios.find((u) => u.id === activeUser?.id) || activeUser || {})
  const saveProfile = (form) => {
    const errores = validarPerfil(form)
    if (Object.keys(errores).length) return { ok: false, errors: errores, message: 'Revisa los campos marcados.' }
    const anterior = activeProfile
    const actualizado = {
      ...anterior,
      ...form,
      nombre: String(form.nombre || '').trim(),
      apellido: String(form.apellido || '').trim(),
      celular: String(form.celular || '').replace(/\D/g, ''),
      correo: String(form.correo || '').trim().toLowerCase(),
      preferencias: {
        ubicacion: form.preferencias?.ubicacion || PREFERENCE_NONE,
        zona: form.preferencias?.zona || PREFERENCE_NONE,
      },
      movimientos: anterior.movimientos,
      millasAcumuladas: anterior.millasAcumuladas,
    }
    setPassengerProfiles((prev) => [...prev.filter((perfil) => perfil.idUsuario !== activeUser.id), actualizado])
    setCatalogs((prev) => ({
      ...prev,
      usuarios: prev.usuarios.map((u) =>
        u.id === activeUser.id
          ? {
              ...u,
              nombre: actualizado.nombre,
              apellido: actualizado.apellido,
              correo: actualizado.correo,
              celular: actualizado.celular,
              ciudad: actualizado.ciudad,
              pais: actualizado.pais,
            }
          : u,
      ),
    }))
    setUser({ ...activeUser, name: [actualizado.nombre, actualizado.apellido].filter(Boolean).join(' ') })
    logAudit('Pasajero', activeUser.id, 'Edición', { nombre: anterior.nombre, correo: anterior.correo, preferencias: anterior.preferencias }, {
      nombre: actualizado.nombre,
      correo: actualizado.correo,
      preferencias: actualizado.preferencias,
    })
    return { ok: true }
  }
  const kioscoDevices = (catalogs.dispositivosCheckIn || []).filter((device) => device.estado === 'Activo')
  const selectedKioscoDevice = kioscoDevices.find((device) => device.codigoDispositivo === kioscoDeviceCode) || null
  const agentAirport = activeUser?.role === 'age' ? activeUser.codigoAeropuertoAsignado : ''
  const panelBookings = agentAirport ? bookings.filter((b) => b.fl.o === agentAirport || b.fl.d === agentAirport) : bookings
  const panelFlights = agentAirport ? admFlights.filter((f) => f.o === agentAirport || f.d === agentAirport) : admFlights
  const panelCatalogs = activeUser?.role === 'age' ? {} : { ...catalogs, vuelos: panelFlights }
  const panelOperations = activeUser?.role === 'age' ? { ...operations, flights: panelFlights, notifications: [] } : operations
  const panelAudits = activeUser?.role === 'adm' ? audits : []
  const NEEDS = {
    seats: flight,
    checkout: flight,
    ticket: booking,
    trips: activeUser,
    panel: activeUser,
    checkin: checkinBooking,
    boarding: passPax?.checkin?.hecho,
    luggage: luggageBooking,
    payments: activeUser,
    profile: activeUser,
    perfil: activeUser,
  }
  const VIEWS = ['home', 'results', 'seats', 'checkout', 'ticket', 'login', 'trips', 'panel', 'checkin', 'boarding', 'luggage', 'payments', 'kiosco', 'profile', 'perfil']

  let view = VIEWS.includes(route) ? route : 'home'
  if (NEEDS[view] !== undefined && !NEEDS[view]) view = 'home'
  if (view === 'checkout' && (!activeUser || activeUser.role !== 'pas')) view = 'login'
  if (view === 'payments' && (!activeUser || activeUser.role !== 'pas')) view = 'trips'
  if (['profile', 'perfil'].includes(view) && (!activeUser || activeUser.role !== 'pas')) view = 'trips'
  if (view === 'checkin' && checkinBooking.est !== 'Confirmada') view = 'trips'

  const expirarBloqueo = () => {
    const enCheckout = location.hash.slice(1) === 'checkout'
    liberarAsientos()
    if (enCheckout) location.hash = 'seats'
    setError('Tu tiempo terminó. Elige tus asientos de nuevo.')
  }

  useEffect(() => {
    const limpiar = () => {
      if (seatHold && Date.now() >= seatHold.expira) expirarBloqueo()
    }
    limpiar()
    const id = setInterval(limpiar, SEAT_HOLD_CLEANUP_MS)
    return () => clearInterval(id)
  }, [seatHold])

  useEffect(() => {
    if (!seatHold || view === 'checkout') return
    liberarAsientos()
  }, [view, seatHold])

  useEffect(() => {
    if (view !== 'checkout' || !flight || !seats.length) return
    if (seatHold && seatHold.codigoVuelo === flightKey(flight)) return
    setSeatHold({ codigoVuelo: flightKey(flight), asientos: [...seats], expira: Date.now() + SEAT_HOLD_MS })
    setError('')
  }, [view, flight, seats, seatHold])

  const panelTab = tab

  return (
    <div className="min-h-screen bg-paper">
      {view !== 'kiosco' && (
        <Header
          view={view}
          user={activeUser}
          notifications={activeUser?.role === 'adm' ? operations.notifications : []}
          onNotifications={() => {
            setTab('not')
            go('panel')
          }}
          onHome={() => go('home')}
          onLogin={() => go('login')}
          onTrips={() => go('trips')}
          onProfile={() => go('profile')}
          onPanel={() => go('panel')}
          onLogout={logout}
        />
      )}

      {view === 'kiosco' && (
        <Kiosco
          catalogs={catalogs}
          bookings={bookings}
          dispositivos={kioscoDevices}
          dispositivo={selectedKioscoDevice}
          now={now}
          onSelectDevice={setKioscoDeviceCode}
          onCheckin={(payload) =>
            kioscoService.registrarCheckIn({
              ...payload,
              catalogs,
              guardar: guardarCheckinKiosco,
              registrarActividad: registrarActividadKiosco,
            })
          }
          onPrint={() => kioscoService.imprimirPase()}
        />
      )}

      {view !== 'kiosco' && (
        <>
          {view === 'home' && (
        <Home
          query={query}
          error={error}
          catalogs={catalogs}
          operations={operations}
          onSearch={search}
          onDest={(code) => {
            setQuery((prev) => ({ ...prev, o: 'BAQ', d: code }))
            go('results')
          }}
        />
      )}
      {view === 'results' && (
        <Results query={query} sort={sort} list={resultados} sugerencias={sugerencias} onSort={setSort} onPick={pickFlight} onDate={searchDate} />
      )}
      {view === 'seats' && (
        <SeatSelection
          query={query}
          flight={flight}
          seats={seats}
          aviones={catalogs.aviones}
          bookings={bookings}
          preferencias={activeProfile.preferencias}
          error={error}
          onSeat={toggleSeat}
          onNext={nextStep}
        />
      )}
      {view === 'checkout' && (
        <Checkout
          flight={flight}
          seats={seats}
          aviones={catalogs.aviones}
          catalogs={catalogs}
          perfil={activeUser?.role === 'pas' ? activeProfile : null}
          hold={seatHold}
          error={error}
          onError={setError}
          onExpire={expirarBloqueo}
          onCreate={createBooking}
        />
      )}
      {view === 'ticket' && (
        <Ticket booking={booking} aviones={catalogs.aviones} catalogs={catalogs} onPrint={() => window.print()} onTrips={() => go('trips')} />
      )}
      {view === 'login' && <Login users={catalogs.usuarios} onLogin={loginAs} />}
      {view === 'trips' && (
        <Trips
          bookings={bookings}
          now={now}
          onView={viewBooking}
          onCancel={openCancel}
          onCheckin={startCheckin}
          onPass={openPass}
          onLuggage={openLuggage}
          onAnularCheckin={anularCheckin}
          onPayments={() => go('payments')}
          onProfile={() => go('profile')}
        />
      )}
      {view === 'payments' && (
        <Payments
          bookings={bookings}
          payments={payments}
          refunds={refunds}
          onPrint={() => window.print()}
          onTrips={() => go('trips')}
        />
      )}
      {['profile', 'perfil'].includes(view) && <Profile perfil={activeProfile} onSave={saveProfile} onTrips={() => go('trips')} />}
      {view === 'checkin' && (
        <Checkin
          booking={checkinBooking}
          aviones={catalogs.aviones}
          now={now}
          onDone={(updates) => completeCheckin(checkinBooking, updates)}
          onTrips={() => go('trips')}
        />
      )}
      {view === 'boarding' && <Boarding booking={passBooking} aviones={catalogs.aviones} onPrint={() => window.print()} onTrips={() => go('trips')} />}
      {view === 'luggage' && (
        <Luggage
          booking={luggageBooking}
          aviones={catalogs.aviones}
          onChange={(index, bags) => updateBags(luggageBooking, index, bags)}
          onPay={(index, bags) => payBags(luggageBooking, index, bags)}
          onTrips={() => go('trips')}
        />
      )}
      {view === 'panel' && (
        <Panel
          user={activeUser}
          tab={panelTab}
          setTab={setTab}
          bookings={panelBookings}
          onCancel={openCancel}
          now={now}
          operations={panelOperations}
          admFlights={panelFlights}
          onStatus={changeFlightStatus}
          onSaveFlight={saveFlight}
          onSaveCrew={saveCrew}
          onMarkNotificationsRead={markNotificationsRead}
          catalogs={panelCatalogs}
          audits={panelAudits}
          deviceActivity={deviceActivity}
          onSaveCatalog={saveCatalog}
          onDeleteCatalog={deleteCatalog}
          onToggleCatalogStatus={toggleCatalogStatus}
          onRowAction={generateFlights}
        />
      )}

      {cancelTarget && (
        <CancellationDialog
          reserva={bookings.find((b) => b.code === cancelTarget.code) || cancelTarget}
          pago={payments.find((p) => p.codigoReserva === cancelTarget.code)}
          datos={datosCancelacion(bookings.find((b) => b.code === cancelTarget.code) || cancelTarget, payments.find((p) => p.codigoReserva === cancelTarget.code), now())}
          error={cancelError}
          onClose={() => {
            setCancelTarget(null)
            setCancelError('')
          }}
          onConfirm={confirmCancel}
        />
      )}
      {cancelReceipt && (
        <CancellationReceiptDialog
          recibo={cancelReceipt}
          onClose={() => setCancelReceipt(null)}
          onPrint={() => window.print()}
        />
      )}

          <Footer onReset={resetDemo} simClock={simClock} now={now} onSimChange={changeSimClock} onSimClear={clearSimClock} />
        </>
      )}
    </div>
  )
}

function Header({ view, user, notifications = [], onNotifications, onHome, onLogin, onTrips, onProfile, onPanel, onLogout }) {
  const unread = notifications.filter((item) => !item.leida).length
  const link = (active) =>
    `rounded-[2px] px-2 py-1 text-sm font-medium transition-colors ${
      active ? 'text-ink underline decoration-azure decoration-2 underline-offset-8' : 'text-slate hover:text-ink'
    }`

  const tripsActive = user?.role === 'pas' ? ['trips', 'checkin', 'boarding', 'luggage', 'payments'].includes(view) : view === 'panel'
  const profileActive = ['profile', 'perfil'].includes(view)

  return (
    <header
      className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <button type="button" onClick={onHome} className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Ir al inicio">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-azure text-white sm:h-9 sm:w-9">
            <Plane className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="whitespace-nowrap font-display text-[18px] font-semibold tracking-tight sm:text-[23px]">Celeste Air</span>
        </button>

        <nav className="ml-auto flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={onHome} className={`${link(view === 'home')} hidden sm:inline-flex`}>
            Vuelos
          </button>

          {user ? (
            <>
              {user.role === 'adm' && (
                <button type="button" onClick={onNotifications} aria-label={`Notificaciones, ${unread} sin leer`} className={`${BTN_SEC} relative px-2.5 py-2 text-[12px] sm:text-[13px]`}>
                  Avisos
                  {unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-airmail px-1 text-[10px] font-bold text-white">{unread}</span>}
                </button>
              )}
              <button type="button" onClick={user.role === 'pas' ? onTrips : onPanel} className={link(tripsActive)}>
                <span className="sm:hidden">{user.role === 'pas' ? 'Reservas' : 'Panel'}</span>
                <span className="hidden sm:inline">{user.role === 'pas' ? 'Mis reservas' : 'Panel'}</span>
              </button>
              {user.role === 'pas' && (
                <button type="button" onClick={onProfile} className={`${link(profileActive)} hidden sm:inline-flex`}>
                  Mi perfil
                </button>
              )}
              <span className="hidden text-sm text-slate md:inline">{user.name}</span>
              <button type="button" onClick={onLogout} className={`${BTN_SEC} px-2.5 py-2 text-[12px] sm:px-3 sm:text-[13px]`}>
                Salir
              </button>
            </>
          ) : (
            <button type="button" onClick={onLogin} className={`${BTN_PRI} px-3 py-2 text-[12px] sm:px-4 sm:text-[13px]`}>
              Ingresar
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

function Kiosco({ catalogs, bookings, dispositivos, dispositivo, now, onSelectDevice, onCheckin, onPrint }) {
  const [codigo, setCodigo] = useState('')
  const [paso, setPaso] = useState(0)
  const [reserva, setReserva] = useState(null)
  const [paxIndex, setPaxIndex] = useState(0)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    setCodigo('')
    setPaso(0)
    setReserva(null)
    setPaxIndex(0)
    setError(null)
    setResultado(null)
  }, [dispositivo?.codigoDispositivo])

  const aeropuerto = dispositivo ? airportName(dispositivo.codigoAeropuerto, catalogs) : ''
  const demos = bookings.filter((b) => b.fl.o === dispositivo?.codigoAeropuerto && b.est === 'Confirmada')
  const pasajero = reserva?.pax?.[paxIndex]
  const validacion = reserva && paso === 1 ? kioscoService.validarPasajero(reserva, paxIndex, { ahora: now(), dispositivo, catalogs }) : null
  const bolsas = validacion?.bolsas || (pasajero ? calcBags(pasajero.bags || [], seatOf(reserva, paxIndex), reserva.fl, catalogs.aviones).bags : [])
  const textoEquipaje = bolsas.length
    ? `${bolsas.length} ${bolsas.length === 1 ? 'pieza' : 'piezas'} · ${bolsas.reduce((sum, bag) => sum + Number(bag.pesoKg || 0), 0)} kg · ${unpaidBags({ bags: bolsas }) ? 'Pendiente de pago' : 'Pagado'}`
    : 'Sin piezas registradas'

  const leer = (valor) => {
    const respuesta = kioscoService.leerBoleto(valor, { bookings, dispositivo, catalogs })
    if (!respuesta.ok) {
      setError(respuesta)
      setReserva(null)
      setResultado(null)
      return
    }
    setError(null)
    setReserva(respuesta.booking)
    setPaxIndex(0)
    setResultado(null)
    setPaso(1)
  }

  const confirmar = () => {
    const respuesta = onCheckin({ booking: reserva, paxIndex, dispositivo, ahora: now() })
    if (!respuesta.ok) {
      setError(respuesta)
      return
    }
    setError(null)
    setResultado(respuesta)
    setPaso(2)
  }

  const reiniciar = () => {
    setCodigo('')
    setReserva(null)
    setPaxIndex(0)
    setError(null)
    setResultado(null)
    setPaso(0)
  }

  if (!dispositivo) {
    return (
      <div className="min-h-screen bg-ink text-white">
        <div className="kiosco-screen">
          <header className="border-b border-white/15">
            <div className="mx-auto flex min-h-[72px] max-w-[1100px] items-center justify-between gap-4 px-6">
              <span className="font-display text-2xl font-semibold tracking-tight">Celeste Air</span>
              <span className="rounded-[2px] bg-white/10 px-4 py-2 font-mono text-lg">--</span>
            </div>
          </header>
          <main className="mx-auto max-w-[900px] px-6 py-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-airmail">Check-in</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Elige un dispositivo activo</h1>
            <p className="mt-4 max-w-[52ch] text-xl leading-relaxed text-white/75">
              Todo el check-in se hará en nombre del dispositivo que selecciones.
            </p>
            {dispositivos.length ? (
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {dispositivos.map((item) => (
                  <button
                    key={item.codigoDispositivo}
                    type="button"
                    onClick={() => onSelectDevice(item.codigoDispositivo)}
                    className="min-h-[96px] rounded-[2px] bg-white px-6 py-5 text-left text-ink transition hover:bg-airmail hover:text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-airmail"
                  >
                    <span className="block font-mono text-2xl font-semibold">{item.codigoDispositivo}</span>
                    <span className="mt-2 block text-lg">{airportName(item.codigoAeropuerto, catalogs)}</span>
                    <span className="mt-1 block text-base text-slate">{item.ubicacion} · {item.tipoDispositivo}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-10 border border-white/25 p-6 text-xl">
                No hay dispositivos activos. Pide a un administrador que active un dispositivo de check-in.
              </div>
            )}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="kiosco-screen">
        <header className="border-b border-white/15">
          <div className="mx-auto flex min-h-[72px] max-w-[1100px] items-center justify-between gap-4 px-6">
            <span className="font-display text-2xl font-semibold tracking-tight">Celeste Air</span>
            <span className="rounded-[2px] bg-white/10 px-4 py-2 font-mono text-lg">{dispositivo.codigoDispositivo}</span>
          </div>
        </header>

        <main className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
          <div className="rounded-[2px] bg-white p-4 text-ink sm:p-5">
            <Steps current={paso} labels={KIOSCO_STEPS} title="Progreso del check-in" />
          </div>

          {error && (
            <div role="alert" className="mt-8 min-h-[72px] border-l-4 border-airmail bg-airmail/15 p-5">
              <p className="text-xl font-semibold">{error.mensaje}</p>
              <p className="mt-1 text-lg text-white/85">{error.accion}</p>
            </div>
          )}

          {paso === 0 && (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Lee tu boleto</h1>
              <p className="mt-3 text-xl text-white/75">Vuelos que salen desde {aeropuerto} ({dispositivo.codigoAeropuerto}).</p>
              <form
                className="mt-8"
                onSubmit={(event) => {
                  event.preventDefault()
                  leer(codigo)
                }}
              >
                <label htmlFor="kiosco-codigo" className="block text-lg font-semibold">
                  Código de reserva o boleto
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="kiosco-codigo"
                    value={codigo}
                    onChange={(event) => setCodigo(event.target.value)}
                    placeholder="Ej. CEL-483920"
                    autoComplete="off"
                    className="min-h-[64px] flex-1 border-2 border-white/40 bg-white px-5 text-2xl font-medium text-ink placeholder:text-slate focus:border-airmail focus:outline-none"
                  />
                  <button type="submit" className="min-h-[64px] bg-airmail px-8 text-xl font-semibold text-white transition hover:bg-airmail/90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white">
                    Leer boleto
                  </button>
                </div>
              </form>

              <section className="mt-12">
                <h2 className="text-2xl font-semibold">Boletos listos para check-in</h2>
                {demos.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {demos.map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => leer(b.code)}
                        className="min-h-[72px] rounded-[2px] border-2 border-white/35 bg-white/10 px-5 py-4 text-left transition hover:border-white hover:bg-white/20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-airmail"
                      >
                        <span className="block font-mono text-xl font-semibold">{b.code}</span>
                        <span className="mt-1 block text-base text-white/80">
                          {b.fl.o} → {b.fl.d} · {b.fl.id} · {fd(b.fl.date)}
                        </span>
                        <span className="mt-1 block text-base text-white/65">{b.pax.map((p) => p.n).join(', ')}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 border border-white/25 p-5 text-lg">
                    No hay boletos listos para check-in en este aeropuerto. Puedes escribir un código de reserva.
                  </p>
                )}
              </section>
            </>
          )}

          {paso === 1 && reserva && (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Confirma tu pasajero</h1>
              <p className="mt-3 text-xl text-white/75">Reserva {reserva.code} · {aeropuerto}</p>
              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="rounded-[2px] bg-white p-6 text-ink sm:p-8">
                  {reserva.pax.length > 1 && (
                    <div className="mb-7">
                      <p className="text-lg font-semibold">Selecciona un pasajero</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {reserva.pax.map((p, i) => (
                          <button
                            key={`${p.doc}-${i}`}
                            type="button"
                            onClick={() => {
                              setPaxIndex(i)
                              setError(null)
                            }}
                            aria-pressed={i === paxIndex}
                            className={`min-h-[64px] rounded-[2px] border-2 px-4 py-3 text-left text-lg font-semibold ${
                              i === paxIndex ? 'border-ink bg-ink text-white' : 'border-rule bg-paper text-ink hover:border-azure'
                            }`}
                          >
                            {p.n} {p.a}
                            {p.checkin?.hecho && <span className="mt-1 block text-sm font-normal opacity-75">Ya tiene check-in</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate">Pasajero</p>
                  <p className="mt-1 font-display text-3xl font-semibold">{pasajero?.n} {pasajero?.a}</p>
                  <dl className="mt-7 grid gap-5 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-slate">Vuelo</dt>
                      <dd className="mt-1 text-xl font-semibold">{reserva.fl.id} · {reserva.fl.o} → {reserva.fl.d}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-slate">Asiento</dt>
                      <dd className="mt-1 text-xl font-semibold">{validacion?.asiento || seatOf(reserva, paxIndex) || 'Sin asignar'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-slate">Equipaje</dt>
                      <dd className="mt-1 text-xl font-semibold">{textoEquipaje}</dd>
                    </div>
                  </dl>

                  {validacion && !validacion.ok && (
                    <div role="alert" className="mt-7 min-h-[72px] border-l-4 border-airmail bg-airmail/10 p-5">
                      <p className="text-xl font-semibold text-ink">{validacion.mensaje}</p>
                      <p className="mt-1 text-base text-slate">{validacion.accion}</p>
                    </div>
                  )}

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={confirmar}
                      disabled={!validacion?.ok}
                      className="min-h-[64px] bg-azure px-8 text-xl font-semibold text-white transition hover:bg-azure-deep disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-azure"
                    >
                      Confirmar pasajero
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReserva(null)
                        setPaso(0)
                        setError(null)
                      }}
                      className="min-h-[64px] border-2 border-rule px-8 text-lg font-semibold text-ink hover:border-ink focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      Leer otro boleto
                    </button>
                  </div>
                </div>

                <aside className="rounded-[2px] border border-white/25 p-6">
                  <h2 className="text-xl font-semibold">Antes de continuar</h2>
                  <ul className="mt-4 space-y-3 text-lg text-white/80">
                    <li>La reserva debe estar confirmada.</li>
                    <li>El check-in abre 24 h antes y cierra 1 h antes del vuelo.</li>
                    <li>Cada pasajero debe hacer su propio check-in.</li>
                  </ul>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>

      {paso === 2 && reserva && (
        <div className="bg-white px-6 py-10 text-ink">
          <div className="mx-auto max-w-[680px]">
            <BoardingPass
              booking={reserva}
              pax={reserva.pax[paxIndex]}
              seat={resultado?.asiento || seatOf(reserva, paxIndex)}
              aviones={catalogs.aviones}
            />
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="kiosco-screen mx-auto flex max-w-[680px] flex-col gap-3 px-6 pb-16 sm:flex-row">
          <button type="button" onClick={onPrint} className="min-h-[64px] bg-airmail px-8 text-xl font-semibold text-white transition hover:bg-airmail/90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white">
            Imprimir pase
          </button>
          <button type="button" onClick={reiniciar} className="min-h-[64px] border-2 border-white px-8 text-xl font-semibold text-white transition hover:bg-white hover:text-ink focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-airmail">
            Nuevo pasajero
          </button>
        </div>
      )}
    </div>
  )
}

function Home({ query, error, catalogs, operations, onSearch, onDest }) {
  const [form, setForm] = useState({ ...query })

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const options = Object.entries(AP)
    .map(([code, a]) => (
      <option key={code} value={code}>
        {a.c} ({code})
      </option>
    ))

  return (
    <main className="mx-auto max-w-[1180px] px-6">
      <section className="grid items-center gap-10 pt-12 sm:pt-16 lg:grid-cols-12">
        <div className="hero-copy lg:col-span-7">
          <h1 className="max-w-[15ch] text-balance font-display text-[clamp(2.3rem,6vw,4.4rem)] leading-[0.98] tracking-[-0.02em]">
            Reserva tu vuelo en minutos, elige tu asiento y viaja.
          </h1>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-slate">
            Compara horarios, escoge tu lugar en el avión y recibe tu pase de abordar al instante.
          </p>
        </div>

        <div className="hero-photo lg:col-span-5">
          <div className="relative h-[300px] overflow-hidden border border-ink/20 sm:h-[390px] lg:h-[440px]">
            <Photo
              src={IMAGES.hero}
              alt="Ala de un avión sobre las nubes del Caribe"
              eager
              className="h-full w-full object-cover object-[32%_62%]"
            />
            <span className="airmail absolute inset-x-0 top-0 h-1.5" />
          </div>
        </div>
      </section>

      <form className="relative z-10 -mt-8 lg:-mt-10" onSubmit={(e) => e.preventDefault()}>
        <div className="grid divide-y divide-rule border border-ink/20 bg-paper shadow-[8px_8px_0_0_#e6f2f8] md:grid-cols-[1.1fr_1.1fr_1fr_0.7fr_auto] md:divide-x md:divide-y-0">
          <label className="block px-5 py-4">
            <span className="block text-[11px] font-medium text-slate">Origen</span>
            <select value={form.o} onChange={set('o')} className="mt-1 w-full border-0 bg-transparent py-0 pl-0 pr-7 text-[15px] font-semibold text-ink">
              {options}
            </select>
          </label>

          <label className="block px-5 py-4">
            <span className="block text-[11px] font-medium text-slate">Destino</span>
            <select value={form.d} onChange={set('d')} className="mt-1 w-full border-0 bg-transparent py-0 pl-0 pr-7 text-[15px] font-semibold text-ink">
              {options}
            </select>
          </label>

          <label className="block px-5 py-4">
            <span className="block text-[11px] font-medium text-slate">Fecha de salida</span>
            <input type="date" value={form.f} min={iso(0)} onChange={set('f')} className="mt-1 w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-ink" />
          </label>

          <label className="block px-5 py-4">
            <span className="block text-[11px] font-medium text-slate">Pasajeros</span>
            <select value={form.n} onChange={set('n')} className="mt-1 w-full border-0 bg-transparent py-0 pl-0 pr-7 text-[15px] font-semibold text-ink">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-stretch p-3">
            <button type="button" onClick={() => onSearch({ ...form, n: Number(form.n) })} className={`${BTN_PRI} w-full md:w-auto`}>
              Buscar vuelos
            </button>
          </div>
        </div>
      </form>
      <p role="alert" className="mt-3 min-h-5 text-sm font-semibold text-airmail">
        {error}
      </p>

      <section className="mt-14 sm:mt-20">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-ink/20 pb-5">
          <h2 className="font-display text-[clamp(1.8rem,3.2vw,2.6rem)] leading-none">Destinos desde Barranquilla</h2>
          <p className="max-w-[36ch] text-sm text-slate">Toca un destino para ver los vuelos de la fecha elegida.</p>
        </div>

        <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {DESTINATIONS.map((code) => {
            const price = precioMinimoDestino(catalogs, operations, 'BAQ', code, iso(14))

            return (
              <button key={code} type="button" onClick={() => onDest(code)} className="group block w-full text-left">
                <span className="relative block aspect-[4/5] overflow-hidden border border-rule bg-mist">
                  <Photo
                    src={IMAGES[code]}
                    alt={`Vista de ${AP[code].c}`}
                    eager
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                  <span className="absolute left-0 top-0 bg-paper/95 px-3 py-1.5 font-display text-lg leading-none">{code}</span>
                  <span className="airmail absolute inset-x-0 bottom-0 h-1" />
                </span>

                <span className="mt-4 flex items-start justify-between gap-4">
                  <span className="block">
                    <span className="block font-display text-[26px] leading-tight">{AP[code].c}</span>
                    <span className="mt-1 block font-display text-[15px] italic text-slate">{AP[code].t}</span>
                  </span>
                  <span className="block shrink-0 text-right">
                    <span className="block text-[11px] text-slate">Desde</span>
                    <span className="block text-sm font-semibold tabular-nums">{price ? COP(price) : 'Sin vuelos'}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function Results({ query, sort, list, sugerencias, onSort, onPick, onDate }) {
  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={0} />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">
            {AP[query.o].c} a {AP[query.d].c}
          </h1>
          <p className="mt-2 text-sm text-slate">
            {fd(query.f)}, {query.n} pasajero{query.n > 1 ? 's' : ''}
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm text-slate">
          Ordenar por
          <select value={sort} onChange={(e) => onSort(e.target.value)} className="rounded-[2px] border border-rule bg-paper py-2 pl-3 pr-8 text-sm font-medium text-ink">
            <option value="p">Precio</option>
            <option value="h">Hora de salida</option>
            <option value="d">Duración</option>
          </select>
        </label>
      </div>

      <div className="mt-6 border-t border-ink/20">
        {list.length ? list.map((f) => (
          <article
            key={f.id}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-rule px-1 py-7 transition-colors hover:bg-mist/60 sm:grid-cols-[130px_1fr_130px_190px] sm:gap-6 sm:px-2"
          >
            <div className="min-w-0">
              <div className="font-display text-[2rem] leading-none tabular-nums sm:text-[2.4rem]">{tm(f.s)}</div>
              <div className="mt-1 text-xs font-semibold">{f.o}</div>
              <div className="text-[11px] text-slate">{AP[f.o].n}</div>
            </div>

            <div className="flex min-w-0 flex-col items-center gap-1">
              <span className="text-[11px] text-slate">{du(f.dur)}</span>
              <div className="relative w-full max-w-[220px] border-t border-dashed border-slate/40">
                <Plane className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-azure" />
              </div>
              <span className="text-center text-[11px] text-slate">
                Directo, {f.mod}
              </span>
            </div>

            <div className="min-w-0 text-right">
              <div className="font-display text-[2rem] leading-none tabular-nums sm:text-[2.4rem]">
                {tm(f.e)}
                {f.e >= 1440 && <span className="ml-1 align-top text-xs text-slate">+1</span>}
              </div>
              <div className="mt-1 text-xs font-semibold">{f.d}</div>
              <div className="text-[11px] text-slate">{AP[f.d].n}</div>
            </div>

            <div className="col-span-3 mt-1 flex items-end justify-between gap-4 border-t border-rule pt-4 sm:col-span-1 sm:mt-0 sm:block sm:border-0 sm:pt-0 sm:text-right">
              <div>
                <div className="flex items-center gap-2 text-[11px] text-slate sm:justify-end">
                  <span>{f.id}</span>
                  <Status value={f.st} />
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{COP(f.price)}</div>
              </div>
              <button type="button" onClick={() => onPick(f.id)} className={`${BTN_PRI} mt-3 px-4 py-2.5 text-[13px] sm:mt-2`}>
                Elegir vuelo
              </button>
            </div>
          </article>
        )) : (
          <div className="border-b border-rule px-1 py-14 text-center">
            <h2 className="font-display text-2xl">No hay vuelos para esa fecha. Prueba con estas fechas cercanas</h2>
            {sugerencias.length ? (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {sugerencias.map((fecha) => (
                  <button key={fecha} type="button" onClick={() => onDate(fecha)} className={BTN_SEC}>
                    {fd(fecha)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate">No encontramos vuelos disponibles en los próximos días para esta ruta.</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function SeatSelection({ query, flight, seats, aviones, bookings = [], preferencias = {}, error, onSeat, onNext }) {
  const mapa = seatsForFlight(flight, aviones)
  const maxFila = mapa.reduce((max, seat) => Math.max(max, seat.fila), 0)
  const occupied = taken(flight, maxFila, 'ABCDEF')
  bookings
    .filter((b) => !['Cancelada', 'Vuelo cancelado'].includes(b.est) && flightKey(b.fl) === flightKey(flight))
    .forEach((b) => b.pax.forEach((_, i) => occupied.add(seatOf(b, i))))
  const n = query.n
  const total = seats.reduce((a, s) => a + seatPrice(flight, s, aviones), 0)
  const hasPreferences = (preferencias.ubicacion || PREFERENCE_NONE) !== PREFERENCE_NONE || (preferencias.zona || PREFERENCE_NONE) !== PREFERENCE_NONE

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={1} />

      <div className="mt-8">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">
          Elige {n > 1 ? `${n} asientos` : 'tu asiento'}
        </h1>
        <p className="mt-2 text-sm text-slate">
          {flight.o} a {flight.d}, vuelo {flight.id}, {flight.mod}
        </p>
        {error && (
          <p role="alert" className="mt-3 border border-airmail/30 bg-airmail/5 px-3 py-2 text-sm font-semibold text-airmail">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[auto_330px] lg:items-start lg:justify-center">
        <SeatMap seats={mapa} occupied={occupied} selected={seats} preferencias={preferencias} onSeat={onSeat} />

        <aside className="h-max border border-ink/20 p-6 lg:sticky lg:top-28">
          <h2 className="font-display text-2xl">Tu selección</h2>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate">
            <Legend className="bg-ink" label="Primera" />
            <Legend className="bg-azure/75" label="Business" />
            <Legend className="border border-celeste bg-celeste-pale" label="Económica" />
            <Legend className="bg-rule" label="Ocupado" />
            {hasPreferences && <Legend className="border-2 border-dashed border-airmail bg-airmail/10" label="Coincide con tus preferencias" />}
          </div>

          <div className="mt-5 border-t border-rule">
            {seats.length ? (
              seats.map((s) => (
                <div key={s} className="flex items-center justify-between gap-3 border-b border-rule py-2.5 text-sm">
                  <span>
                    Asiento {s}, {seatClassForFlight(flight, s, aviones).claseCabina}
                  </span>
                  <span className="font-semibold tabular-nums">{COP(seatPrice(flight, s, aviones))}</span>
                </div>
              ))
            ) : (
              <p className="py-4 text-sm text-slate">
                Selecciona {n} asiento{n > 1 ? 's' : ''} en el mapa.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-sm text-slate">Subtotal</span>
            <span className="font-display text-2xl tabular-nums">{COP(total)}</span>
          </div>

          <button type="button" onClick={onNext} disabled={seats.length !== n} className={`${BTN_PRI} mt-5 w-full`}>
            Continuar
          </button>
        </aside>
      </div>
    </main>
  )
}

function SeatMap({ seats, occupied, selected, preferencias = {}, onSeat }) {
  const filas = seatRows(seats)
  const maxFila = seats.reduce((max, seat) => Math.max(max, seat.fila), 0)

  return (
    <div className="overflow-x-auto pb-4">
      <div className="mx-auto w-max">
        <div className="rounded-t-[140px] rounded-b-[28px] border-2 border-ink/20 bg-mist/60 px-6 pb-6 pt-14">
          {filas.map(({ fila, items, clase }, index) => (
            <div key={fila}>
              <div className="mb-1 grid grid-cols-[repeat(3,36px)_26px_repeat(3,36px)] items-center gap-1.5">
                {['A', 'B', 'C'].map((col) => {
                  const seat = items.find((s) => s.columna === col)
                  return seat ? (
                    <Seat
                      key={col}
                      id={seat.numeroAsiento}
                      cls={CLASS_INDEX[clase]}
                      occupied={occupied.has(seat.numeroAsiento)}
                      selected={selected.includes(seat.numeroAsiento)}
                      preference={seatMatchesPreferences(seat, preferencias, maxFila)}
                      onToggle={onSeat}
                    />
                  ) : (
                    <span key={col} />
                  )
                })}
                <span className="text-center text-[11px] text-slate">{fila}</span>
                {['D', 'E', 'F'].map((col) => {
                  const seat = items.find((s) => s.columna === col)
                  return seat ? (
                    <Seat
                      key={col}
                      id={seat.numeroAsiento}
                      cls={CLASS_INDEX[clase]}
                      occupied={occupied.has(seat.numeroAsiento)}
                      selected={selected.includes(seat.numeroAsiento)}
                      preference={seatMatchesPreferences(seat, preferencias, maxFila)}
                      onToggle={onSeat}
                    />
                  ) : (
                    <span key={col} />
                  )
                })}
              </div>
              {filas[index + 1] && filas[index + 1].clase !== clase && <div className="h-4" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Legend({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${className}`} />
      {label}
    </span>
  )
}

function Seat({ id, cls, occupied, selected, preference, onToggle }) {
  const base = 'relative grid h-9 w-full place-items-center rounded-[4px] border text-[10px] font-semibold transition-transform'

  let look
  if (occupied) look = 'cursor-not-allowed border-rule bg-rule/60 text-transparent'
  else if (selected) look = 'scale-110 border-azure bg-azure text-white'
  else if (cls === 2) look = 'border-ink bg-ink text-white hover:scale-105'
  else if (cls === 1) look = 'border-azure bg-azure/75 text-white hover:scale-105'
  else look = 'border-celeste bg-celeste-pale text-azure-deep hover:scale-105'

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      disabled={occupied}
      aria-pressed={selected}
      aria-label={`Asiento ${id}`}
      title={preference ? 'Coincide con tus preferencias' : undefined}
      className={`${base} ${look} ${preference ? 'ring-2 ring-airmail ring-offset-1' : ''}`}
    >
      {id.replace(/\d+/, '')}
      {preference && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-white bg-airmail" />}
    </button>
  )
}

function Checkout({ flight, seats, aviones, catalogs = {}, perfil, hold, error, onError, onExpire, onCreate }) {
  const [pax, setPax] = useState(() =>
    seats.map((seat, i) =>
      i === 0 && perfil
        ? { n: perfil.nombre || '', a: perfil.apellido || '', t: perfil.tipoDocumento || DOCUMENT_TYPES[0], x: perfil.numeroDocumento || '' }
        : { n: '', a: '', t: DOCUMENT_TYPES[0], x: '' },
    ),
  )
  const [card, setCard] = useState({ cn: '', cu: '1', ce: '', cv: '' })
  const [, setTick] = useState(0)
  const expirado = useRef(false)
  const docTypes = perfil?.tipoDocumento && !DOCUMENT_TYPES.includes(perfil.tipoDocumento) ? [perfil.tipoDocumento, ...DOCUMENT_TYPES] : DOCUMENT_TYPES
  const restante = hold ? Math.max(0, hold.expira - Date.now()) : 0

  useEffect(() => {
    expirado.current = false
    if (!hold) return undefined
    const id = setInterval(() => setTick((value) => value + 1), 1000)
    return () => clearInterval(id)
  }, [hold?.expira])

  useEffect(() => {
    if (!hold || restante > 0 || expirado.current) return
    expirado.current = true
    onExpire?.()
  }, [restante, hold, onExpire])

  const subtotal = seats.reduce((a, s) => a + seatPrice(flight, s, aviones), 0)
  const tax = Math.round(subtotal * 0.08)
  const total = Math.round(subtotal * 1.08)
  const millas = seats.reduce((sum, seat) => sum + millasVuelo(flight, seat, aviones, catalogs), 0)
  const advertencia = Boolean(hold && restante > 0 && restante <= SEAT_HOLD_WARNING_MS)

  const setPaxField = (index, key, value) => {
    setPax((prev) => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)))
  }

  const setCardField = (key, value) => setCard((prev) => ({ ...prev, [key]: value }))

  const pay = () => {
    if (pax.some((p) => !p.n.trim() || !p.a.trim() || !p.x.trim())) {
      onError('Completa nombre, apellido y documento de cada pasajero.')
      return
    }
    if (card.cn.trim().replace(/\s/g, '').length < 12 || !card.ce.trim() || card.cv.trim().length < 3) {
      onError('Revisa los datos de la tarjeta.')
      return
    }

    const code = 'RS' + Math.random().toString(36).slice(2, 7).toUpperCase()
    onCreate({
      code,
      fl: flight,
      pax: pax.map((p) => ({ n: p.n.trim(), a: p.a.trim(), doc: p.t + ' ' + p.x.trim() })),
      seats: [...seats],
      total,
      est: 'Confirmada',
      codigoTarifa: flight?.codigoTarifa || '',
      politicaCancelacion: normalizarPolitica(flight?.politicaCancelacion),
      politicaPorDefecto: politicaPorDefecto(flight?.politicaCancelacion),
      pago: {
        codigoPago: 'PG' + Math.random().toString(36).slice(2, 7).toUpperCase(),
        codigoReserva: code,
        monto: total,
        moneda: flight?.moneda || 'COP',
        metodoPago: 'Tarjeta',
        fechaPago: new Date().toISOString(),
        estadoPago: 'Pagado',
        referenciaTransaccion: `SIM-${code}`,
        numeroCuotas: Number(card.cu) || 1,
      },
    })
  }

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={2} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_0.8fr] lg:items-start">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Datos de los pasajeros</h1>

          <div className="mt-6 grid gap-4">
            {seats.map((seat, i) => (
              <div key={seat} className="border border-rule p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                  <h2 className="font-display text-xl">Pasajero {i + 1}</h2>
                  <span className="text-xs text-slate">
                    Asiento {seat}, {seatClassForFlight(flight, seat, aviones).claseCabina}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Nombre</span>
                    <input value={pax[i].n} onChange={(e) => setPaxField(i, 'n', e.target.value)} autoComplete="given-name" className={INPUT} />
                  </label>

                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Apellido</span>
                    <input value={pax[i].a} onChange={(e) => setPaxField(i, 'a', e.target.value)} autoComplete="family-name" className={INPUT} />
                  </label>

                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Tipo de documento</span>
                      <select value={pax[i].t} onChange={(e) => setPaxField(i, 't', e.target.value)} className={`${INPUT} pr-8`}>
                        {docTypes.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </select>

                  </label>

                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Número de documento</span>
                    <input value={pax[i].x} onChange={(e) => setPaxField(i, 'x', e.target.value)} inputMode="numeric" className={INPUT} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <h2 className="mt-10 font-display text-3xl">Pago</h2>

          <div className="mt-4 border border-rule p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-medium text-slate">Número de tarjeta</span>
                <input value={card.cn} onChange={(e) => setCardField('cn', e.target.value)} inputMode="numeric" placeholder="4242 4242 4242 4242" autoComplete="cc-number" className={INPUT} />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-slate">Cuotas</span>
                <select value={card.cu} onChange={(e) => setCardField('cu', e.target.value)} className={`${INPUT} pr-8`}>
                  {[1, 3, 6, 12].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-slate">Vence</span>
                <input value={card.ce} onChange={(e) => setCardField('ce', e.target.value)} placeholder="MM/AA" autoComplete="cc-exp" className={INPUT} />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-slate">CVV</span>
                <input value={card.cv} onChange={(e) => setCardField('cv', e.target.value)} inputMode="numeric" maxLength={4} autoComplete="cc-csc" className={INPUT} />
              </label>
            </div>

            <p className="mt-4 text-xs text-slate">Pago seguro Celeste Air · Tu próximo destino te espera.</p>
          </div>

          <p role="alert" className="mt-3 min-h-5 text-sm font-semibold text-airmail">
            {error}
          </p>
        </div>

        <aside className="border border-ink/20 p-6 lg:sticky lg:top-28">
          <h2 className="font-display text-2xl">Resumen</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            {flight.o} a {flight.d}, {fd(flight.date)}
            <br />
            {tm(flight.s)} a {tm(flight.e)}, vuelo {flight.id}
          </p>

          {hold && (
            <div
              role={advertencia ? 'status' : undefined}
              className={`hold-timer no-print mt-5 border px-3 py-2.5 text-sm font-semibold ${
                advertencia ? 'hold-timer--warning border-airmail bg-airmail/5 text-airmail' : 'border-celeste bg-celeste-pale text-azure-deep'
              }`}
            >
              <span className="block text-[11px] font-medium uppercase tracking-[0.08em]">
                {advertencia ? 'Quedan menos de 2 minutos' : 'Bloqueo de asientos'}
              </span>
              <span className="mt-1 block">
                {advertencia ? 'Tus asientos se liberan pronto:' : 'Tus asientos están reservados por'}{' '}
                <strong className="tabular-nums">{formatCountdown(restante)}</strong>
              </span>
            </div>
          )}

          <div className="mt-5 border-t border-rule">
            <div className="flex items-center justify-between gap-3 border-b border-rule py-2.5 text-sm">
              <span className="text-slate">Asientos</span>
              <span className="font-semibold tabular-nums">{COP(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-rule py-2.5 text-sm">
              <span className="text-slate">Tasas e impuestos</span>
              <span className="font-semibold tabular-nums">{COP(tax)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-sm text-slate">Total</span>
            <span className="font-display text-3xl tabular-nums">{COP(total)}</span>
          </div>

          <p className="mt-4 border border-celeste bg-celeste-pale px-3 py-2.5 text-sm font-semibold text-azure-deep">
            Con este vuelo acumularás {formatMiles(millas)} millas
          </p>

          <div className="mt-5 border-t border-rule pt-4">
            <h3 className="font-display text-lg">Política de cancelación</h3>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate">
              {descripcionPolitica(flight?.politicaCancelacion).map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
            {politicaPorDefecto(flight?.politicaCancelacion) && (
              <p className="mt-2 text-xs font-semibold text-airmail">Esta tarifa no tiene política registrada. Aplicamos la política por defecto.</p>
            )}
          </div>

          <button type="button" onClick={pay} className={`${BTN_PRI} mt-5 w-full`}>
            Pagar y emitir boletos
          </button>
        </aside>
      </div>
    </main>
  )
}

function Ticket({ booking, aviones, catalogs = {}, onPrint, onTrips }) {
  const b = booking

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={3} />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Reserva {b.est.toLowerCase()}</h1>
          <p className="mt-2 text-sm text-slate">Código {b.code}. Enviamos un boleto por pasajero.</p>
        </div>

        <div className="no-print flex flex-wrap gap-3">
          <button type="button" onClick={onPrint} className={`${BTN_SEC} px-4 py-2.5 text-[13px]`}>
            Imprimir boletos
          </button>
          <button type="button" onClick={onTrips} className={`${BTN_PRI} px-4 py-2.5 text-[13px]`}>
            Ver mis reservas
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6">
        {b.pax.map((p, i) => {
          const seat = b.seats[i]
          const f = b.fl
          const millas = millasVuelo(f, seat, aviones, catalogs)

          return (
            <article key={p.doc + i} className="ticket border border-ink/25 bg-paper">
              <div className="airmail h-2" />

              <div className="grid md:grid-cols-[1fr_220px]">
                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4 text-[11px] text-slate">
                    <span>Pase de abordar</span>
                    <span className="border border-rule px-2 py-1">{seatClassForFlight(booking.fl, seat, aviones).claseCabina}</span>
                  </div>

                  <div className="mt-6 text-[11px] text-slate">{p.doc}</div>
                  <div className="font-display text-2xl">
                    {p.n} {p.a}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-azure-deep">
                    Con este vuelo acumularás {formatMiles(millas)} millas
                  </p>

                  <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-end gap-3">
                    <div>
                      <div className="font-display text-[2.8rem] leading-none sm:text-5xl">{f.o}</div>
                      <div className="mt-1 text-[11px] text-slate">{AP[f.o].c}</div>
                    </div>

                    <div className="pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-px flex-1 bg-rule" />
                        <Plane className="h-5 w-5 shrink-0 text-azure" />
                        <span className="h-px flex-1 bg-rule" />
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-display text-[2.8rem] leading-none sm:text-5xl">{f.d}</div>
                      <div className="mt-1 text-[11px] text-slate">{AP[f.d].c}</div>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                    <Field label="Fecha" value={fd(f.date)} />
                    <Field label="Salida" value={tm(f.s)} />
                    <Field label="Vuelo" value={f.id} />
                    <Field label="Puerta" value={f.gate} />
                    <Field label="Terminal" value={f.term} />
                    <Field label="Asiento" value={seat} />
                  </div>
                </div>

                <div className="perf flex flex-col items-center justify-center gap-3 p-6">
                  <QR value={b.code + seat + p.a} />
                  <span className="text-[11px] text-slate">
                    {b.code}-{seat}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-slate">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  )
}

function BoardingPass({ booking, pax, seat, aviones }) {
  const f = booking.fl
  const cls = seatClassForFlight(f, seat, aviones).claseCabina
  const totals = calcBags(pax.bags || [], seat, f, aviones)
  const pendiente = totals.costo > 0 && unpaidBags({ bags: pax.bags || [] })

  return (
    <article className="ticket bp border border-ink/25 bg-paper">
      <div className="airmail h-2" />

      <div className="grid md:grid-cols-[1fr_220px]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate">
            <span className="font-semibold text-azure-deep">Check-in realizado</span>
            <span className="border border-rule px-2 py-1">{cls}</span>
          </div>

          <div className="mt-6 text-[11px] text-slate">{pax.doc}</div>
          <div className="font-display text-2xl">
            {pax.n} {pax.a}
          </div>
          {pendiente && (
            <p className="mt-1 text-[11px] font-semibold text-airmail">Equipaje pendiente de pago</p>
          )}

          <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-end gap-3">
            <div>
              <div className="font-display text-[2.8rem] leading-none sm:text-5xl">{f.o}</div>
              <div className="mt-1 text-[11px] text-slate">{AP[f.o].c}</div>
            </div>

            <div className="pb-2">
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-rule" />
                <Plane className="h-5 w-5 shrink-0 text-azure" />
                <span className="h-px flex-1 bg-rule" />
              </div>
            </div>

            <div className="text-right">
              <div className="font-display text-[2.8rem] leading-none sm:text-5xl">{f.d}</div>
              <div className="mt-1 text-[11px] text-slate">{AP[f.d].c}</div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <Field label="Fecha" value={fd(f.date)} />
            <Field label="Salida" value={tm(f.s)} />
            <Field label="Vuelo" value={f.id} />
            <Field label="Puerta" value={f.gate} />
            <Field label="Terminal" value={f.term} />
            <Field label="Asiento" value={seat} />
            <Field label="Grupo" value={GROUPS[cls]} />
            <Field
              label="Equipaje"
              value={
                totals.registrados
                  ? `${totals.registrados} kg${pendiente ? ' · Pendiente' : ''}`
                  : 'De mano'
              }
            />
          </div>
        </div>

        <div className="perf flex flex-col items-center justify-center gap-3 p-6">
          <QR value={booking.code + seat + pax.a + 'CI'} />
          <span className="text-[11px] text-slate">
            {booking.code}-{seat}
          </span>
        </div>
      </div>
    </article>
  )
}

function Boarding({ booking, aviones, onPrint, onTrips }) {
  const done = booking.pax.map((p, i) => ({ p, i })).filter(({ p }) => p.checkin?.hecho)

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={3} labels={CHECKIN_STEPS} title="Progreso del check-in" />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Pase de abordar</h1>
          <p className="mt-2 text-sm text-slate">
            Reserva {booking.code}. Check-in realizado para {done.length} pasajero{done.length > 1 ? 's' : ''}.
          </p>
        </div>

        <div className="no-print flex flex-wrap gap-3">
          <button type="button" onClick={onPrint} className={`${BTN_SEC} px-4 py-2.5 text-[13px]`}>
            Imprimir pases
          </button>
          <button type="button" onClick={onTrips} className={`${BTN_PRI} px-4 py-2.5 text-[13px]`}>
            Ver mis reservas
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6">
        {done.map(({ p, i }) => (
          <BoardingPass key={p.doc + i} booking={booking} pax={p} seat={p.checkin.asiento} aviones={aviones} />
        ))}
      </div>
    </main>
  )
}

function Checkin({ booking, aviones, now, onDone, onTrips }) {
  const win = checkinWindow(booking, now())
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => booking.pax.map((_, i) => i))
  const [seats, setSeats] = useState(() => booking.pax.map((p, i) => p.checkin?.asiento || booking.seats[i] || ''))
  const [bagsByPax, setBagsByPax] = useState(() => booking.pax.map((p) => p.bags || []))
  const [active, setActive] = useState(0)

  const activeIndex = selected.includes(active) ? active : selected[0] ?? 0
  const chosen = selected.map((i) => booking.pax[i])
  const seatsReady =
    selected.length > 0 &&
    selected.every((i) => Boolean(seats[i])) &&
    new Set(selected.map((i) => seats[i])).size === selected.length

  const mapa = seatsForFlight(booking.fl, aviones)
  const maxFila = mapa.reduce((max, seat) => Math.max(max, seat.fila), 0)
  const occupied = taken(booking.fl, maxFila, 'ABCDEF')
  booking.pax.forEach((_, i) => {
    const s = seats[i]
    if (s && i !== activeIndex) occupied.add(s)
  })
  occupied.delete(seats[activeIndex])

  const move = (next) => {
    setError('')
    setStep(next)
  }

  const goFrom = (next) => {
    if (next === 1 && !selected.length) {
      setError('Selecciona al menos un pasajero.')
      return
    }
    move(next)
  }

  const confirm = () => {
    if (!win.open) {
      setError(win.reason)
      return
    }
    onDone(selected.map((i) => ({ index: i, seat: seats[i], bags: bagsByPax[i] })))
  }

  const passengerName = (p) => `${p.n} ${p.a}`

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <Steps current={step} labels={CHECKIN_STEPS} title="Progreso del check-in" />

      <div className="mt-8">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Check-in de tu vuelo</h1>
        <p className="mt-2 text-sm text-slate">
          Reserva {booking.code} · {booking.fl.o} a {booking.fl.d}, {fd(booking.fl.date)} {tm(booking.fl.s)}
        </p>
      </div>

      {!win.open && (
        <p className="mt-6 border border-airmail/30 bg-mist px-4 py-3 text-sm font-semibold text-airmail">{win.reason}</p>
      )}

      {step === 0 && (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 pb-4">
            <h2 className="font-display text-2xl">Selecciona los pasajeros</h2>
            <button
              type="button"
              onClick={() => setSelected(booking.pax.map((_, i) => i))}
              className="text-xs font-semibold text-azure underline decoration-celeste underline-offset-4 hover:text-azure-deep"
            >
              Seleccionar todos
            </button>
          </div>

          <div className="border-t border-rule">
            {booking.pax.map((p, i) => (
              <label key={p.doc + i} className="grid gap-2 border-b border-rule px-2 py-5 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-5">
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={() =>
                    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)))
                  }
                  className="h-4 w-4 accent-azure"
                />
                <span>
                  <span className="block font-display text-xl">{passengerName(p)}</span>
                  <span className="block text-[11px] text-slate">{p.doc}</span>
                </span>
                <span className="text-sm text-slate">Asiento {seats[i] || '—'}</span>
                <span className={`text-[11px] font-semibold ${p.checkin?.hecho ? 'text-azure-deep' : 'text-slate'}`}>
                  {p.checkin?.hecho ? 'Realizado' : 'Pendiente'}
                </span>
              </label>
            ))}
          </div>

          <p role="alert" className="mt-3 min-h-5 text-sm font-semibold text-airmail">{error}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => goFrom(1)} className={BTN_PRI}>Continuar</button>
            <button type="button" onClick={onTrips} className={BTN_SEC}>Volver a mis reservas</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="mt-8 grid gap-10 lg:grid-cols-[auto_330px] lg:items-start lg:justify-center">
          <div>
            <h2 className="font-display text-2xl">Confirma y cambia tu asiento</h2>

            <div className="mt-5 flex flex-wrap gap-2">
              {selected.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`rounded-[2px] border px-3 py-2 text-xs font-semibold transition-colors ${
                    i === activeIndex ? 'border-azure bg-celeste-pale text-azure-deep' : 'border-rule text-slate hover:border-ink hover:text-ink'
                  }`}
                >
                  {passengerName(booking.pax[i])} · {seats[i] || 'Sin asiento'}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <SeatMap
                seats={mapa}
                occupied={occupied}
                selected={seats[activeIndex] ? [seats[activeIndex]] : []}
                onSeat={(id) => setSeats((prev) => prev.map((s, i) => (i === activeIndex ? id : s)))}
              />
            </div>
          </div>

          <aside className="h-max border border-ink/20 p-6 lg:sticky lg:top-28">
            <h2 className="font-display text-2xl">Asignación actual</h2>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate">
              <Legend className="bg-ink" label="Primera" />
              <Legend className="bg-azure/75" label="Business" />
              <Legend className="border border-celeste bg-celeste-pale" label="Económica" />
              <Legend className="bg-rule" label="Ocupado" />
            </div>

            <div className="mt-5 border-t border-rule">
              {chosen.map((p, j) => (
                <div key={p.doc + j} className="flex items-center justify-between gap-3 border-b border-rule py-2.5 text-sm">
                  <span className="min-w-0 truncate">{passengerName(p)}</span>
                  <span className="font-semibold tabular-nums">{seats[selected[j]] || '—'}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate">
              El asiento nuevo debe estar libre y no asignado a otro pasajero de esta reserva.
            </p>
            <p role="alert" className="mt-2 min-h-5 text-sm font-semibold text-airmail">{error}</p>

            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => move(2)} disabled={!seatsReady} className={`${BTN_PRI} w-full`}>
                Continuar
              </button>
              <button type="button" onClick={() => move(0)} className={`${BTN_SEC} w-full`}>Atrás</button>
            </div>
          </aside>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 pb-4">
            <h2 className="font-display text-2xl">Equipaje</h2>
            <button
              type="button"
              onClick={() => move(3)}
              className="text-xs font-semibold text-azure underline decoration-celeste underline-offset-4 hover:text-azure-deep"
            >
              Omitir este paso
            </button>
          </div>
          <p className="mt-3 text-sm text-slate">Registro opcional. Puedes agregar piezas, pagar el exceso e imprimir etiquetas.</p>

          <div className="mt-5 grid gap-5">
            {chosen.map((p, j) => {
              const i = selected[j]
              return (
                <BaggageSection
                  key={p.doc + j}
                  booking={booking}
                  pax={p}
                  seat={seats[i]}
                  aviones={aviones}
                  bags={bagsByPax[i]}
                  onChange={(bags) => setBagsByPax((prev) => prev.map((b, k) => (k === i ? bags : b)))}
                  onPay={(bags) => setBagsByPax((prev) => prev.map((b, k) => (k === i ? bags : b)))}
                />
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => move(3)} className={BTN_PRI}>Continuar</button>
            <button type="button" onClick={() => move(1)} className={BTN_SEC}>Atrás</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8 max-w-[760px]">
          <h2 className="font-display text-2xl">Confirma el check-in</h2>
          <p className="mt-2 text-sm text-slate">Revisa pasajeros, asientos y equipaje antes de emitir los pases.</p>

          <div className="mt-5 border-t border-rule">
            {chosen.map((p, j) => {
              const i = selected[j]
              const cls = seatClassForFlight(booking.fl, seats[i], aviones).claseCabina
              return (
                <div key={p.doc + j} className="grid gap-2 border-b border-rule px-2 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="font-display text-xl">{passengerName(p)}</div>
                    <div className="text-[11px] text-slate">
                      {p.doc} · Asiento {seats[i]} · Grupo {GROUPS[cls]}
                    </div>
                  </div>
                  <div className="text-sm text-slate">
                    {(() => {
                      const t = calcBags(bagsByPax[i], seats[i], booking.fl, aviones)
                      if (!t.registrados) return 'Solo equipaje de mano'
                      return `${t.registrados} / ${t.permitido} kg${t.costo ? ` · Exceso ${COP(t.costo)} ${unpaidBags({ bags: bagsByPax[i] }) ? '(pendiente)' : '(pagado)'}` : ''}`
                    })()}
                  </div>
                </div>
              )
            })}
          </div>

          <p role="alert" className="mt-4 min-h-5 text-sm font-semibold text-airmail">{error || (!win.open ? win.reason : '')}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={confirm} disabled={!win.open} className={BTN_PRI}>
              Confirmar check-in
            </button>
            <button type="button" onClick={() => move(2)} className={BTN_SEC}>Atrás</button>
          </div>
        </div>
      )}

    </main>
  )
}

function Barcode({ value, width = 168, height = 36 }) {
  const rndBar = rnd(value)
  const bars = []
  let x = 0
  while (x < 90) {
    const w = 1 + Math.floor(rndBar() * 3)
    if (rndBar() > 0.4) bars.push(<rect key={x} x={x} y="0" width={w} height={height} />)
    x += w + 1 + Math.floor(rndBar() * 2)
  }

  return (
    <svg viewBox={`0 0 90 ${height}`} width={width} height={height} fill="currentColor" shapeRendering="crispEdges" role="img" aria-label={`Código de barras ${value}`} className="block max-w-full">
      {bars}
    </svg>
  )
}

function BagTag({ booking, pax, bag }) {
  return (
    <article className="bag-tag border border-ink/25 bg-paper">
      <div className="airmail h-1.5" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 text-[10px] text-slate">
          <span>Celeste Air</span>
          <span>{bag.tipo}</span>
        </div>
        <div className="mt-2 font-display text-lg">{bag.codigoBarras}</div>
        <div className="mt-1 text-xs">
          {booking.fl.o} a {booking.fl.d} · {pax.n} {pax.a}
        </div>
        <div className="mt-3 text-ink">
          <Barcode value={bag.codigoBarras} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate">
          <span>{bag.pesoKg} kg</span>
          <span>{booking.code}</span>
        </div>
      </div>
    </article>
  )
}

function BaggageSection({ booking, pax, seat, aviones, bags, onChange, onPay }) {
  const [tipo, setTipo] = useState(BAGGAGE.tipos[0])
  const [peso, setPeso] = useState('')
  const [error, setError] = useState('')
  const [card, setCard] = useState({ cn: '', ce: '', cv: '' })
  const [payError, setPayError] = useState('')

  const totals = calcBags(bags, seat, booking.fl, aviones)
  const pagado = totals.costo > 0 && !unpaidBags({ bags })
  const clase = seatClassForFlight(booking.fl, seat, aviones).claseCabina

  const change = (next) => {
    const reiniciados = next.map((bag) => ({ ...bag, estado: 'Registrado' }))
    onChange(calcBags(reiniciados, seat, booking.fl, aviones).bags)
  }

  const add = () => {
    const value = Number(peso)
    if (!peso.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Ingresa un peso válido entre 1 y 32 kg.')
      return
    }
    if (value > BAGGAGE.maxKgPieza) {
      setError(`Cada pieza puede pesar máximo ${BAGGAGE.maxKgPieza} kg.`)
      return
    }
    if (bags.length >= BAGGAGE.maxPiezas) {
      setError(`Máximo ${BAGGAGE.maxPiezas} piezas por pasajero.`)
      return
    }
    setError('')
    change([...bags, makeBag(tipo, value, pax)])
    setPeso('')
  }

  const pay = () => {
    if (
      card.cn.trim().replace(/\s/g, '').length < 12 ||
      !card.ce.trim() ||
      card.cv.trim().length < 3
    ) {
      setPayError('Revisa los datos de la tarjeta.')
      return
    }
    setPayError('')
    onPay(bags.map((bag) => ({ ...bag, estado: 'Pagado' })))
    setCard({ cn: '', ce: '', cv: '' })
  }

  return (
    <div className="border border-ink/20 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
        <div>
          <h3 className="font-display text-2xl">
            Equipaje de {pax.n} {pax.a}
          </h3>
          <p className="mt-1 text-[11px] text-slate">
            Asiento {seat || '—'} · {clase} · {totals.permitido} kg incluidos
          </p>
        </div>
        {totals.costo > 0 && (
          <span className={`text-[11px] font-semibold ${pagado ? 'text-azure-deep' : 'text-airmail'}`}>
            {pagado ? 'Pagado' : 'Pendiente de pago'}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px_auto] sm:items-end">
        <label className="block text-[11px] font-medium text-slate">
          Tipo de pieza
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${INPUT} pr-8`}>
            {BAGGAGE.tipos.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-medium text-slate">
          Peso (kg)
          <input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="20" className={INPUT} />
        </label>

        <button
          type="button"
          onClick={add}
          disabled={bags.length >= BAGGAGE.maxPiezas}
          className={`${BTN_PRI} px-4 py-2.5 text-[13px]`}
        >
          Agregar pieza
        </button>
      </div>

      <p role="alert" className="mt-2 min-h-5 text-sm font-semibold text-airmail">{error}</p>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-slate">kg registrados / kg permitidos</span>
          <span className="font-semibold tabular-nums">
            {totals.registrados} / {totals.permitido} kg
          </span>
        </div>
        <div className="mt-2 h-2 bg-celeste-pale">
          <div
            className={`h-full ${totals.exceso ? 'bg-airmail' : 'bg-azure'}`}
            style={{ width: `${Math.min(100, (totals.registrados / totals.permitido) * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
          <span className="text-slate">
            Piezas: {bags.length} / {BAGGAGE.maxPiezas}
          </span>
          {totals.exceso > 0 ? (
            <span className="font-semibold text-airmail">
              Exceso {totals.exceso} kg · {COP(totals.costo)}
            </span>
          ) : (
            <span className="text-azure-deep">Sin exceso</span>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-rule">
        {bags.length ? (
          bags.map((bag) => (
            <div key={bag.id} className="grid gap-2 border-b border-rule py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4">
              <div>
                <div className="font-semibold">{bag.tipo}</div>
                <div className="text-[11px] text-slate">{bag.codigoBarras}</div>
              </div>
              <div className="text-sm tabular-nums">{bag.pesoKg} kg</div>
              <div className="text-xs">
                {bag.exceso > 0 ? (
                  <span className="font-semibold text-airmail">+{bag.exceso} kg · {COP(bag.costoExtra)}</span>
                ) : (
                  <span className="text-slate">Sin exceso</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className={`text-[11px] font-semibold ${bag.estado === 'Pagado' ? 'text-azure-deep' : 'text-slate'}`}>
                  {bag.estado}
                </span>
                <button type="button" onClick={() => change(bags.filter((b) => b.id !== bag.id))} className="text-xs font-semibold text-airmail hover:underline">
                  Quitar
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="py-4 text-sm text-slate">No hay piezas registradas. Solo equipaje de mano.</p>
        )}
      </div>

      {totals.costo > 0 && !pagado && (
        <div className="mt-6 border border-ink/20 bg-mist p-5">
          <h4 className="font-display text-xl">Pago por exceso de equipaje</h4>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_auto]">
            <span className="text-slate">
              Exceso: {totals.registrados} kg − {totals.permitido} kg permitidos
            </span>
            <span className="text-right font-semibold tabular-nums">{totals.exceso} kg</span>
            <span className="text-slate">Tarifa: {COP(BAGGAGE.costoKg)} / kg</span>
            <span className="text-right font-semibold tabular-nums">{COP(totals.costo)}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-[11px] font-medium text-slate">
              Número de tarjeta
              <input
                value={card.cn}
                onChange={(e) => setCard((prev) => ({ ...prev, cn: e.target.value }))}
                inputMode="numeric"
                placeholder="4242 4242 4242 4242"
                className={`${INPUT} text-sm`}
              />
            </label>
            <label className="block text-[11px] font-medium text-slate">
              Vence
              <input
                value={card.ce}
                onChange={(e) => setCard((prev) => ({ ...prev, ce: e.target.value }))}
                placeholder="MM/AA"
                className={`${INPUT} text-sm`}
              />
            </label>
            <label className="block text-[11px] font-medium text-slate">
              CVV
              <input
                value={card.cv}
                onChange={(e) => setCard((prev) => ({ ...prev, cv: e.target.value }))}
                inputMode="numeric"
                maxLength={4}
                className={`${INPUT} text-sm`}
              />
            </label>
          </div>

          <p role="alert" className="mt-2 min-h-5 text-sm font-semibold text-airmail">{payError}</p>

          <button type="button" onClick={pay} className={`${BTN_PRI} px-4 py-2.5 text-[13px]`}>
            Pagar {COP(totals.costo)}
          </button>
          <p className="mt-2 text-xs text-slate">Pago seguro Celeste Air · Tu próximo destino te espera.</p>
        </div>
      )}

      {totals.costo > 0 && pagado && (
        <p className="mt-6 border border-azure/20 bg-celeste-pale px-4 py-3 text-sm font-semibold text-azure-deep">
          Exceso de equipaje pagado por {COP(totals.costo)}.
        </p>
      )}

      {bags.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 pb-3">
            <h4 className="font-display text-xl">Etiquetas de equipaje</h4>
            <button type="button" onClick={() => window.print()} className="no-print text-xs font-semibold text-azure underline decoration-celeste underline-offset-4 hover:text-azure-deep">
              Imprimir etiquetas
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {bags.map((bag) => (
              <BagTag key={bag.id} booking={booking} pax={pax} bag={bag} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Luggage({ booking, aviones, onChange, onPay, onTrips }) {
  const [active, setActive] = useState(0)
  const pax = booking.pax[active]
  const seat = seatOf(booking, active)

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="mt-14">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Equipaje</h1>
        <p className="mt-2 text-sm text-slate">
          Reserva {booking.code}. Registra piezas, revisa el exceso e imprime las etiquetas de cada maleta.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {booking.pax.map((p, i) => (
          <button
            key={p.doc + i}
            type="button"
            onClick={() => setActive(i)}
            className={`rounded-[2px] border px-3 py-2 text-xs font-semibold transition-colors ${
              i === active ? 'border-azure bg-celeste-pale text-azure-deep' : 'border-rule text-slate hover:border-ink hover:text-ink'
            }`}
          >
            {p.n} {p.a} · {seatOf(booking, i) || 'Sin asiento'}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <BaggageSection
          booking={booking}
          pax={pax}
          seat={seat}
          aviones={aviones}
          bags={pax.bags || []}
          onChange={(bags) => onChange(active, bags)}
          onPay={(bags) => onPay(active, bags)}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onTrips} className={BTN_PRI}>
          Ver mis reservas
        </button>
      </div>
    </main>
  )
}

function Login({ users, onLogin }) {
  const active = users.filter((u) => u.estado === 'Activo' && ROLE_IDS.includes(u.rol))
  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="mt-14 max-w-[70ch]">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-none">Ingresa a tu cuenta</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-slate">
          Elige un perfil activo para ver cada experiencia. En producción cada rol usa correo y contraseña, y el administrador además verificación en dos pasos.
        </p>
      </div>

      <div className="mt-10 border-t border-ink/20">
        {active.map((u) => {
          const name = [u.nombre, u.apellido].filter(Boolean).join(' ')
          const info = ROLE_INFO[u.rol]
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onLogin(u)}
              className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-b border-rule px-2 py-7 text-left transition-colors hover:bg-mist/60 sm:grid-cols-[260px_1fr_auto]"
            >
              <span className="font-display text-2xl">{name}</span>
              <span className="col-span-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate sm:col-span-1">{info.label}</span>
              <span className="col-span-2 text-sm text-slate sm:col-span-1">{info.description}</span>
              <span className="justify-self-end text-sm font-semibold text-azure group-hover:underline">Entrar</span>
            </button>
          )
        })}
        {!active.length && <p className="border-b border-rule px-2 py-7 text-sm text-slate">No hay perfiles activos. Pide a un administrador que active un usuario.</p>}
      </div>
    </main>
  )
}

function PaymentReceipt({ reserva, pago, reembolso, fecha, titulo }) {
  return (
    <div className="receipt border border-ink/20 bg-paper p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate">Celeste Air</p>
          <h2 className="font-display text-2xl">{titulo}</h2>
        </div>
        <span className="text-sm font-semibold">{reserva}</span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-slate">Código de pago</dt>
          <dd className="font-semibold">{pago.codigoPago}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Referencia</dt>
          <dd className="font-semibold">{pago.referenciaTransaccion}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Fecha de pago</dt>
          <dd className="font-semibold">{fmtWhen(new Date(pago.fechaPago))}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Método y cuotas</dt>
          <dd className="font-semibold">
            {pago.metodoPago} · {pago.numeroCuotas} cuota{pago.numeroCuotas > 1 ? 's' : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Monto pagado</dt>
          <dd className="font-display text-xl tabular-nums">{COP(pago.monto)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Estado del pago</dt>
          <dd className="font-semibold">
            <Status value={pago.estadoPago} />
          </dd>
        </div>
      </dl>

      {reembolso && (
        <div className="mt-4 border-t border-rule pt-4">
          <h3 className="font-display text-lg">Reembolso</h3>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-[11px] text-slate">Código</span>
              <p className="font-semibold">{reembolso.codigoReembolso}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Porcentaje</span>
              <p className="font-semibold">{reembolso.porcentaje}%</p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Fecha</span>
              <p className="font-semibold">{fmtWhen(new Date(reembolso.fecha || fecha))}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Monto</span>
              <p className="font-display text-xl tabular-nums">{COP(reembolso.monto)}</p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 border-t border-rule pt-3 text-[11px] text-slate">Celeste Air · Guarda este comprobante para tu viaje.</p>
    </div>
  )
}

function CancellationDialog({ reserva, pago, datos, error, onClose, onConfirm }) {
  return (
    <Dialog
      title="Cancelar reserva"
      description={`Reserva ${reserva.code} · ${reserva.fl.o} a ${reserva.fl.d}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={`${BTN_SEC} px-4 py-2 text-sm`}>
            Volver
          </button>
          <button type="button" onClick={onConfirm} className={`${BTN_PRI} px-4 py-2 text-sm`}>
            Confirmar cancelación
          </button>
        </>
      }
    >
      <p className="font-display text-2xl">Faltan {datos.horasEnteras} h para tu vuelo.</p>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        Te devolvemos el {datos.porcentaje}%: <span className="font-semibold text-ink">{COP(datos.reembolsar)}</span> de {COP(datos.pagado)}.
      </p>

      <dl className="mt-5 grid gap-3 border-y border-rule py-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-slate">Tramo aplicado</dt>
          <dd className="font-semibold">{datos.tramoTexto}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Porcentaje</dt>
          <dd className="font-semibold">{datos.porcentaje}%</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Monto retenido</dt>
          <dd className="font-semibold tabular-nums">{COP(datos.retenido)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate">Estado del pago</dt>
          <dd className="font-semibold">
            <Status value={estadoPagoPorPorcentaje(datos.porcentaje)} />
          </dd>
        </div>
      </dl>

      {pago && <p className="mt-4 text-xs text-slate">Pago {pago.codigoPago} · {pago.metodoPago} · {pago.numeroCuotas} cuota{pago.numeroCuotas > 1 ? 's' : ''}</p>}
      {datos.porDefecto && <p className="mt-3 text-xs font-semibold text-airmail">Esta reserva usa la política por defecto porque la tarifa no tenía una registrada.</p>}
      {error && <p role="alert" className="mt-4 border border-airmail/30 bg-airmail/5 px-3 py-2 text-sm font-semibold text-airmail">{error}</p>}
    </Dialog>
  )
}

function CancellationReceiptDialog({ recibo, onClose, onPrint }) {
  return (
    <Dialog
      title="Cancelación confirmada"
      description="Guarda o imprime el comprobante de la cancelación."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={`${BTN_SEC} px-4 py-2 text-sm`}>
            Cerrar
          </button>
          <button type="button" onClick={onPrint} className={`${BTN_PRI} px-4 py-2 text-sm no-print`}>
            Imprimir comprobante
          </button>
        </>
      }
    >
      <PaymentReceipt reserva={recibo.reserva} pago={recibo.pago} reembolso={recibo.reembolso} fecha={recibo.fecha} titulo="Comprobante de cancelación" />
    </Dialog>
  )
}

function Payments({ bookings, payments, refunds, onPrint, onTrips }) {
  const [receipt, setReceipt] = useState(null)
  const reservas = new Map(bookings.map((b) => [b.code, b]))

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-14 font-display text-[clamp(2rem,4vw,3rem)] leading-none">Historial de pagos</h1>
          <p className="mt-2 text-sm text-slate">Consulta el estado de tus pagos y reembolsos, e imprime el comprobante.</p>
        </div>
        <button type="button" onClick={onTrips} className={`${BTN_SEC} px-4 py-2 text-[13px]`}>
          Volver a mis reservas
        </button>
      </div>

      <div className="mt-8 overflow-x-auto border border-rule">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-mist/60 text-[11px] uppercase tracking-[0.12em] text-slate">
            <tr>
              <th className="px-3 py-3">Reserva</th>
              <th className="px-3 py-3">Pago</th>
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3">Método</th>
              <th className="px-3 py-3">Monto</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Reembolso</th>
              <th className="px-3 py-3">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((pago) => {
              const reserva = reservas.get(pago.codigoReserva)
              const reembolso = refunds.find((r) => r.codigoPago === pago.codigoPago || r.codigoReserva === pago.codigoReserva)
              return (
                <tr key={pago.codigoPago} className="border-t border-rule">
                  <td className="px-3 py-3 font-semibold">{pago.codigoReserva}</td>
                  <td className="px-3 py-3">{pago.codigoPago}</td>
                  <td className="px-3 py-3 text-slate">{fmtWhen(new Date(pago.fechaPago))}</td>
                  <td className="px-3 py-3">{pago.metodoPago} · {pago.numeroCuotas} cuota{pago.numeroCuotas > 1 ? 's' : ''}</td>
                  <td className="px-3 py-3 tabular-nums">{COP(pago.monto)}</td>
                  <td className="px-3 py-3">
                    <Status value={pago.estadoPago} />
                  </td>
                  <td className="px-3 py-3">
                    {reembolso ? (
                      <span className="font-semibold text-azure-deep">{COP(reembolso.monto)} ({reembolso.porcentaje}%)</span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setReceipt({ reserva: pago.codigoReserva, pago, reembolso })}
                      className="text-xs font-semibold text-airmail hover:underline"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              )
            })}
            {!payments.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate">
                  Todavía no hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receipt && (
        <Dialog
          title="Comprobante"
          description={`Pago ${receipt.pago.codigoPago}`}
          onClose={() => setReceipt(null)}
          footer={
            <>
              <button type="button" onClick={() => setReceipt(null)} className={`${BTN_SEC} px-4 py-2 text-sm`}>
                Cerrar
              </button>
              <button type="button" onClick={onPrint} className={`${BTN_PRI} px-4 py-2 text-sm no-print`}>
                Imprimir
              </button>
            </>
          }
        >
          <PaymentReceipt {...receipt} titulo="Comprobante de pago" />
        </Dialog>
      )}
    </main>
  )
}

const profileDraft = (perfil = {}) => ({
  tipoDocumento: perfil.tipoDocumento || DOCUMENT_TYPES[0],
  numeroDocumento: perfil.numeroDocumento || '',
  fechaExpedicion: perfil.fechaExpedicion || '',
  nombre: perfil.nombre || '',
  apellido: perfil.apellido || '',
  fechaNacimiento: perfil.fechaNacimiento || '',
  sexo: perfil.sexo || SEX_OPTIONS[2],
  celular: perfil.celular || '',
  correo: perfil.correo || '',
  nacionalidad: perfil.nacionalidad || 'Colombiana',
  direccion: perfil.direccion || '',
  ciudad: perfil.ciudad || '',
  pais: perfil.pais || 'Colombia',
  preferencias: {
    ubicacion: perfil.preferencias?.ubicacion || PREFERENCE_NONE,
    zona: perfil.preferencias?.zona || PREFERENCE_NONE,
  },
})

const movementDate = (value) => {
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Profile({ perfil, onSave, onTrips }) {
  const [draft, setDraft] = useState(() => profileDraft(perfil))
  const [status, setStatus] = useState('')
  const errores = validarPerfil(draft)

  useEffect(() => {
    setDraft(profileDraft(perfil))
    setStatus('')
  }, [perfil?.id])

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setStatus('')
  }

  const setPreference = (key, value) => {
    setDraft((prev) => ({ ...prev, preferencias: { ...prev.preferencias, [key]: value } }))
    setStatus('')
  }

  const guardar = () => {
    if (Object.keys(errores).length) {
      setStatus('Revisa los campos marcados antes de guardar.')
      return
    }
    const resultado = onSave(draft)
    setStatus(resultado?.ok ? 'Cambios guardados correctamente.' : resultado?.message || 'No se pudieron guardar los cambios.')
  }

  const renderField = ([key, label]) => {
    const value = draft[key] ?? ''
    const common = { value, onChange: (e) => setField(key, e.target.value), className: INPUT }
    let control
    if (key === 'tipoDocumento') {
      control = (
        <select {...common} className={`${INPUT} pr-8`}>
          {DOCUMENT_TYPES.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
      )
    } else if (key === 'sexo') {
      control = (
        <select {...common} className={`${INPUT} pr-8`}>
          {SEX_OPTIONS.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </select>
      )
    } else if (key === 'fechaExpedicion' || key === 'fechaNacimiento') {
      control = <input type="date" {...common} />
    } else if (key === 'correo') {
      control = <input type="email" {...common} autoComplete="email" />
    } else if (key === 'celular') {
      control = <input inputMode="numeric" {...common} autoComplete="tel" />
    } else {
      control = <input {...common} />
    }
    return (
      <label key={key} className="block">
        <span className="block text-[11px] font-medium text-slate">{label}</span>
        {control}
        {errores[key] && (
          <span role="alert" className="mt-1 block text-[11px] font-semibold text-airmail">
            {errores[key]}
          </span>
        )}
      </label>
    )
  }

  const movimientos = Array.isArray(perfil?.movimientos) ? [...perfil.movimientos].reverse() : []

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-14 font-display text-[clamp(2rem,4vw,3rem)] leading-none">Mi perfil</h1>
          <p className="mt-2 text-sm text-slate">Actualiza tus datos, ajusta tus preferencias y consulta tus millas.</p>
        </div>
        <button type="button" onClick={onTrips} className={`${BTN_SEC} px-4 py-2 text-[13px]`}>
          Volver a mis reservas
        </button>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline gap-3 border-b border-ink/20 pb-3">
          <span className="text-xs font-semibold text-airmail">01</span>
          <h2 className="font-display text-2xl">Datos personales</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{PROFILE_FIELDS.map(renderField)}</div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" onClick={guardar} className={BTN_PRI}>
            Guardar cambios
          </button>
          <span role="status" className="text-sm font-semibold text-azure-deep">
            {status}
          </span>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex items-baseline gap-3 border-b border-ink/20 pb-3">
          <span className="text-xs font-semibold text-airmail">02</span>
          <h2 className="font-display text-2xl">Preferencias de asiento</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
          Marcaremos los asientos que coincidan con tus preferencias en el mapa. La elección final siempre será tuya.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[11px] font-medium text-slate">Ubicación</span>
            <select value={draft.preferencias.ubicacion} onChange={(e) => setPreference('ubicacion', e.target.value)} className={`${INPUT} pr-8`}>
              {LOCATION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-slate">Zona</span>
            <select value={draft.preferencias.zona} onChange={(e) => setPreference('zona', e.target.value)} className={`${INPUT} pr-8`}>
              {ZONE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" onClick={guardar} className={`${BTN_SEC} mt-5`}>
          Guardar preferencias
        </button>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 pb-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-semibold text-airmail">03</span>
            <h2 className="font-display text-2xl">Millas acumuladas</h2>
          </div>
          <div className="font-display text-3xl tabular-nums">
            {formatMiles(perfil?.millasAcumuladas)} <span className="text-sm text-slate">millas</span>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto border border-rule">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="bg-mist/60 text-[11px] uppercase tracking-[0.12em] text-slate">
              <tr>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Vuelo</th>
                <th className="px-3 py-3 text-right">Millas</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((movimiento, index) => (
                <tr key={`${movimiento.clave || movimiento.vuelo}-${index}`} className="border-t border-rule">
                  <td className="px-3 py-3 text-slate">{movementDate(movimiento.fecha)}</td>
                  <td className="px-3 py-3 font-semibold">{movimiento.vuelo}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">+{formatMiles(movimiento.millas)}</td>
                </tr>
              ))}
              {!movimientos.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-slate">
                    Todavía no tienes movimientos de millas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function Trips({ bookings, now, onView, onCancel, onCheckin, onPass, onLuggage, onAnularCheckin, onPayments, onProfile }) {
  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-14 font-display text-[clamp(2rem,4vw,3rem)] leading-none">Mis reservas</h1>
          <p className="mt-2 text-sm text-slate">Consulta, descarga, cancela y haz check-in de tus viajes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onProfile} className={`${BTN_SEC} px-4 py-2 text-[13px]`}>
            Mi perfil
          </button>
          <button type="button" onClick={onPayments} className={`${BTN_SEC} px-4 py-2 text-[13px]`}>
            Historial de pagos
          </button>
        </div>
      </div>

      <div className="mt-8 border-t border-ink/20">
        {bookings.map((b) => {
          const win = checkinWindow(b, now())
          const doneCount = b.pax.filter((p) => p.checkin?.hecho).length

          return (
            <div key={b.code} className="grid gap-5 border-b border-rule py-7 sm:grid-cols-[1.2fr_0.8fr_0.9fr_auto] sm:items-center">
              <div>
                <div className="font-display text-2xl">
                  {b.fl.o} a {b.fl.d}
                </div>
                <div className="text-sm text-slate">
                  {fd(b.fl.date)}, {tm(b.fl.s)}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate">Reserva</div>
                <div className="font-semibold">{b.code}</div>
              </div>

              <div>
                <Status value={b.est} />
                <div className="mt-1 text-sm text-slate">
                  {b.pax.length} pasajero{b.pax.length > 1 ? 's' : ''}, {COP(b.total)}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {b.pax.map((p, i) => (
                    <span key={p.doc + i} className="text-[11px] text-slate">
                      {p.n.split(' ')[0]}:{' '}
                      <span className={p.checkin?.hecho ? 'font-semibold text-azure-deep' : ''}>
                        {p.checkin?.hecho ? 'Realizado' : 'Pendiente'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:max-w-[260px] sm:justify-end">
                <button type="button" onClick={() => onView(b)} className={`${BTN_SEC} px-3 py-2 text-[13px]`}>
                  Ver boletos
                </button>
                <button type="button" onClick={() => onLuggage(b)} className={`${BTN_SEC} px-3 py-2 text-[13px]`}>
                  Equipaje
                </button>
                {doneCount > 0 && (
                  <>
                    <button type="button" onClick={() => onPass(b)} className={`${BTN_SEC} px-3 py-2 text-[13px]`}>
                      Ver pase{doneCount > 1 ? 's' : ''}
                    </button>
                    <button type="button" onClick={() => onAnularCheckin(b)} className={`${BTN_SEC} px-3 py-2 text-[13px]`}>
                      Anular check-in
                    </button>
                  </>
                )}
                {b.est === 'Confirmada' && (
                  <>
                    <div className="w-full">
                      <button
                        type="button"
                        onClick={() => onCheckin(b)}
                        disabled={!win.open}
                        title={win.reason || 'Abrir check-in'}
                        className={`${BTN_PRI} px-3 py-2 text-[13px]`}
                      >
                        Hacer check-in
                      </button>
                      {!win.open && <p className="mt-1 text-[11px] text-slate">{win.reason}</p>}
                    </div>
                    <button type="button" onClick={() => onCancel(b)} className={`${BTN} border-transparent px-3 py-2 text-[13px] text-airmail hover:bg-mist`}>
                      Cancelar reserva
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}

const moneyShort = (value) => {
  const numero = Number(value) || 0
  if (Math.abs(numero) >= 1000000) return `$${(numero / 1000000).toFixed(1)}M`
  if (Math.abs(numero) >= 1000) return `$${Math.round(numero / 1000)}k`
  return COP(numero)
}

const auditValue = (value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const changedFields = (antes, despues) => {
  const a = antes && typeof antes === 'object' ? antes : {}
  const b = despues && typeof despues === 'object' ? despues : {}
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
    .map((key) => [key, auditValue(a[key]), auditValue(b[key])])
}

function HorizontalBars({ items, label, formatValue = (value) => value }) {
  const width = 520
  const row = 32
  const left = 104
  const right = 76
  const chartWidth = width - left - right
  const height = Math.max(row, items.length * row + 8)
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label}>
      {items.length ? (
        items.map((item, index) => {
          const y = index * row + 6
          const barWidth = Math.max(2, ((Number(item.value) || 0) / max) * chartWidth)
          return (
            <g key={`${item.label}-${index}`}>
              <text x="0" y={y + 13} fill="#5b6f80" fontSize="11">
                {item.label}
              </text>
              <rect x={left} y={y} width={chartWidth} height="14" fill="#e6f2f8" />
              <rect x={left} y={y} width={barWidth} height="14" fill="#1d6e9e" />
              <text x={left + chartWidth + 8} y={y + 13} fill="#12293d" fontSize="11" fontWeight="600">
                {formatValue(item.value)}
              </text>
            </g>
          )
        })
      ) : (
        <text x="0" y="18" fill="#5b6f80" fontSize="12">
          Sin datos en este rango.
        </text>
      )}
    </svg>
  )
}

function RevenueLine({ points, label }) {
  const width = 640
  const height = 180
  const padding = { left: 56, right: 16, top: 18, bottom: 32 }
  const safePoints = points.length ? points : [{ label: '', value: 0 }]
  const values = safePoints.map((point) => Number(point.value) || 0)
  const max = Math.max(1, ...values)
  const plotWidth = width - padding.left - padding.right
  const step = safePoints.length > 1 ? plotWidth / (safePoints.length - 1) : 0
  const coords = values.map((value, index) => [
    padding.left + (safePoints.length > 1 ? index * step : plotWidth / 2),
    padding.top + (1 - value / max) * (height - padding.top - padding.bottom),
  ])
  const baseline = height - padding.bottom

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label}>
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={baseline} stroke="#dbe4ea" />
      <line x1={padding.left} y1={baseline} x2={width - padding.right} y2={baseline} stroke="#dbe4ea" />
      <text x="0" y={padding.top + 4} fill="#5b6f80" fontSize="10">
        {moneyShort(max)}
      </text>
      <text x="0" y={baseline} fill="#5b6f80" fontSize="10">
        0
      </text>
      <polyline points={coords.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#bf3b2b" strokeWidth="2" />
      {coords.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="3" fill="#bf3b2b" />
      ))}
      <text x={padding.left} y={height - 8} fill="#5b6f80" fontSize="10">
        {safePoints[0].label}
      </text>
      <text x={padding.left + plotWidth / 2} y={height - 8} fill="#5b6f80" fontSize="10" textAnchor="middle">
        {safePoints[Math.floor(safePoints.length / 2)].label}
      </text>
      <text x={width - padding.right} y={height - 8} fill="#5b6f80" fontSize="10" textAnchor="end">
        {safePoints[safePoints.length - 1].label}
      </text>
    </svg>
  )
}

function KPI({ label, value }) {
  return (
    <div>
      <div className="font-display text-4xl leading-none tabular-nums">{value}</div>
      <div className="mt-2 text-[11px] text-slate">{label}</div>
    </div>
  )
}

function Panel({
  user,
  tab,
  setTab,
  bookings,
  onCancel,
  now,
  operations,
  admFlights,
  onStatus,
  onSaveFlight,
  onSaveCrew,
  onMarkNotificationsRead,
  catalogs,
  audits,
  deviceActivity = [],
  onSaveCatalog,
  onDeleteCatalog,
  onToggleCatalogStatus,
  onRowAction,
}) {
  const [search, setSearch] = useState('')
  const [detailKey, setDetailKey] = useState('')
  const [editor, setEditor] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [weekStart, setWeekStart] = useState(() => {
    const hoy = now()
    return dateKey(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7)))
  })
  const [airportFilter, setAirportFilter] = useState('todos')
  const [planeFilter, setPlaneFilter] = useState('todos')
  const [reportRange, setReportRange] = useState(() => {
    const hoy = dateKey(now())
    return { desde: hoy, hasta: addDays(hoy, 30) }
  })
  const [auditFilters, setAuditFilters] = useState({ entidad: 'todas', accion: 'todas', desde: '', hasta: '' })
  const [auditOpen, setAuditOpen] = useState('')
  const adm = user.role === 'adm'
  const tabs = adm
    ? [
        ['res', 'Resumen'],
        ['vue', 'Vuelos'],
        ['cal', 'Calendario'],
        ['not', `Notificaciones${operations.notifications.filter((n) => !n.leida).length ? ` (${operations.notifications.filter((n) => !n.leida).length})` : ''}`],
        ['aud', 'Auditoría'],
        ['dev', 'Actividad de dispositivos'],
        ...SCHEMAS.map((schema) => [schema.key, schema.plural]),
      ]
    : [['rsv', 'Reservas']]
  const current = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0]

  const q = search.toLowerCase()
  const filtered = bookings.filter((b) => (b.code + b.pax.map((p) => p.n + ' ' + p.a).join(' ')).toLowerCase().includes(q))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const filteredFlights = admFlights.filter(
    (f) =>
      (airportFilter === 'todos' || f.o === airportFilter || f.d === airportFilter) &&
      (planeFilter === 'todos' || flightAirplane(f) === planeFilter),
  )
  const detailFlight = admFlights.find((f) => flightKey(f) === detailKey) || null

  const rangeDays = useMemo(() => {
    const dias = []
    let cursor = reportRange.desde
    for (let i = 0; cursor && cursor <= reportRange.hasta && i < 366; i += 1) {
      dias.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return dias
  }, [reportRange.desde, reportRange.hasta])
  const inRange = (fecha) => Boolean(fecha) && fecha >= reportRange.desde && fecha <= reportRange.hasta
  const bookingsRange = bookings.filter((b) => inRange(b.fl.date))
  const bookingsActivas = bookingsRange.filter((b) => !['Cancelada', 'Vuelo cancelado'].includes(b.est))
  const vuelosRange = admFlights.filter((f) => inRange(f.date))
  const cancelaciones = bookingsRange.filter((b) => ['Cancelada', 'Vuelo cancelado'].includes(b.est)).length
  const ingresos = bookingsActivas.reduce((sum, b) => sum + (Number(b.total) || 0), 0)
  const ocupacionPorVuelo = vuelosRange
    .map((f) => {
      const ocupados = bookingsActivas
        .filter((b) => flightKey(b.fl) === flightKey(f))
        .reduce((sum, b) => sum + b.seats.length, 0)
      const capacidad = seatsForFlight(f, catalogs.aviones || []).length || 1
      return {
        label: flightKey(f),
        ocupados,
        capacidad,
        porcentaje: Math.min(100, Math.round((ocupados / capacidad) * 100)),
      }
    })
    .filter((item) => item.ocupados > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje)
  const ocupacion = ocupacionPorVuelo.length
    ? Math.round(ocupacionPorVuelo.reduce((sum, item) => sum + item.porcentaje, 0) / ocupacionPorVuelo.length)
    : 0
  const routeRevenue = new Map()
  bookingsActivas.forEach((b) => {
    const key = `${b.fl.o}-${b.fl.d}`
    routeRevenue.set(key, (routeRevenue.get(key) || 0) + (Number(b.total) || 0))
  })
  const ingresosPorRuta = [...routeRevenue.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const estadoCounts = bookingsRange.reduce((acc, b) => {
    acc[b.est] = (acc[b.est] || 0) + 1
    return acc
  }, {})
  const reservasPorEstado = Object.entries(estadoCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  const ingresosPorDia = new Map(rangeDays.map((dia) => [dia, 0]))
  bookingsActivas.forEach((b) => {
    if (ingresosPorDia.has(b.fl.date)) ingresosPorDia.set(b.fl.date, ingresosPorDia.get(b.fl.date) + (Number(b.total) || 0))
  })
  const puntosIngresos = rangeDays.map((dia) => ({ label: dia.slice(5), value: Math.round(ingresosPorDia.get(dia)) }))

  const entidadesAuditoria = [...new Set(audits.map((a) => a.entidad))].sort((a, b) => a.localeCompare(b))
  const accionesAuditoria = [...new Set(audits.map((a) => a.accion))].sort((a, b) => a.localeCompare(b))
  const filteredAudits = audits.filter((a) => {
    const fecha = a.fechaHora.slice(0, 10)
    return (
      (auditFilters.entidad === 'todas' || a.entidad === auditFilters.entidad) &&
      (auditFilters.accion === 'todas' || a.accion === auditFilters.accion) &&
      (!auditFilters.desde || fecha >= auditFilters.desde) &&
      (!auditFilters.hasta || fecha <= auditFilters.hasta)
    )
  })

  const applyResult = (result, okText) => {
    if (result && result.ok === false) {
      setFeedback({ type: 'error', text: result.message })
      return false
    }
    setFeedback({ type: 'success', text: okText })
    return true
  }

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-8">
      <h1 className="mt-14 font-display text-[clamp(2rem,4vw,3rem)] leading-none">{adm ? 'Panel de administración' : 'Mostrador de reservas'}</h1>
      {feedback && (
        <p role="status" className={`mt-4 border px-3 py-2 text-sm ${feedback.type === 'error' ? 'border-airmail/30 bg-airmail/5 text-airmail' : 'border-azure/30 bg-celeste-pale text-azure-deep'}`}>
          {feedback.text}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[200px_1fr] lg:gap-12">
        <aside className="flex flex-wrap gap-1 lg:flex-col lg:items-start">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 px-3 py-2 text-left text-sm font-medium transition-colors ${
                current === id ? 'border-azure text-ink' : 'border-transparent text-slate hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </aside>

        <div>
          {current === 'res' && (
            <>
              <div className="flex flex-wrap items-end gap-4 border-y border-rule py-5">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Desde</span>
                  <input type="date" value={reportRange.desde} onChange={(e) => setReportRange((prev) => ({ ...prev, desde: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Hasta</span>
                  <input type="date" value={reportRange.hasta} onChange={(e) => setReportRange((prev) => ({ ...prev, hasta: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm" />
                </label>
                <span className="pb-2 text-xs text-slate">{rangeDays.length} días · {vuelosRange.length} vuelos en el rango</span>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-rule py-6 sm:grid-cols-4">
                <KPI label="Reservas en rango" value={bookingsRange.length} />
                <KPI label="Ocupación media" value={`${ocupacion}%`} />
                <KPI label="Ingresos en rango" value={moneyShort(ingresos)} />
                <KPI label="Cancelaciones" value={cancelaciones} />
              </div>

              <div className="mt-10 grid gap-10 lg:grid-cols-2">
                <section>
                  <h2 className="font-display text-2xl">Ocupación por vuelo (%)</h2>
                  <div className="mt-4">
                    <HorizontalBars
                      items={ocupacionPorVuelo.slice(0, 6).map((item) => ({ label: item.label, value: item.porcentaje }))}
                      label="Ocupación por vuelo en porcentaje"
                      formatValue={(value) => `${value}%`}
                    />
                  </div>
                </section>
                <section>
                  <h2 className="font-display text-2xl">Ingresos por ruta</h2>
                  <div className="mt-4">
                    <HorizontalBars items={ingresosPorRuta} label="Ingresos por ruta" formatValue={moneyShort} />
                  </div>
                </section>
              </div>

              <section className="mt-10">
                <h2 className="font-display text-2xl">Ingresos por día</h2>
                <div className="mt-4 border border-rule p-3">
                  <RevenueLine points={puntosIngresos} label="Línea de ingresos diarios en el rango seleccionado" />
                </div>
              </section>

              <section className="mt-10">
                <h2 className="font-display text-2xl">Reservas por estado</h2>
                <div className="mt-4">
                  <HorizontalBars items={reservasPorEstado} label="Cantidad de reservas por estado" formatValue={(value) => value} />
                </div>
              </section>
            </>
          )}

          {current === 'vue' && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Aeropuerto</span>
                    <select value={airportFilter} onChange={(e) => setAirportFilter(e.target.value)} className="rounded-[2px] border border-rule bg-paper px-2 py-2 text-sm">
                      <option value="todos">Todos</option>
                      {Object.keys(AP).map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Avión</span>
                    <select value={planeFilter} onChange={(e) => setPlaneFilter(e.target.value)} className="rounded-[2px] border border-rule bg-paper px-2 py-2 text-sm">
                      <option value="todos">Todos</option>
                      {catalogs.aviones.map((avion) => (
                        <option key={avion.codigoAvion} value={avion.codigoAvion}>
                          {avion.codigoAvion}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" onClick={() => setEditor({})} className={BTN_PRI}>
                  Nuevo vuelo
                </button>
              </div>

              <div className="mt-4 overflow-x-auto border border-rule">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11px] text-slate">
                      <th className="px-3 py-3 font-medium">Vuelo</th>
                      <th className="px-3 py-3 font-medium">Ruta</th>
                      <th className="px-3 py-3 font-medium">Fecha y salida</th>
                      <th className="px-3 py-3 font-medium">Avión</th>
                      <th className="px-3 py-3 font-medium">Puerta</th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      <th className="px-3 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlights.map((f) => {
                      const transiciones = allowedTransitions(f.st)
                      return (
                        <tr key={flightKey(f)} className="border-b border-rule last:border-0">
                          <td className="px-3 py-3 font-semibold">{flightKey(f)}</td>
                          <td className="px-3 py-3">
                            {f.o} a {f.d}
                          </td>
                          <td className="px-3 py-3 tabular-nums">
                            {fd(f.date)} · {tm(f.s)}
                          </td>
                          <td className="px-3 py-3 text-slate">{f.mod}</td>
                          <td className="px-3 py-3">{f.gate || '—'}</td>
                          <td className="px-3 py-3">
                            <select
                              value={f.st}
                              disabled={!transiciones.length}
                              onChange={(e) => {
                                const resultado = onStatus(flightKey(f), e.target.value)
                                applyResult(resultado, resultado?.message || 'Estado actualizado.')
                              }}
                              aria-label={`Estado del vuelo ${flightKey(f)}`}
                              className="rounded-[2px] border border-rule bg-paper py-1.5 pl-2 pr-8 text-xs disabled:bg-mist"
                            >
                              <option value={f.st}>{f.st}</option>
                              {transiciones.map((state) => (
                                <option key={state} value={state}>
                                  {state}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-3">
                              <button type="button" onClick={() => setEditor(f)} className="text-xs font-semibold text-azure hover:underline">
                                Editar
                              </button>
                              <button type="button" onClick={() => setDetailKey(flightKey(f))} className="text-xs font-semibold text-azure hover:underline">
                                Detalle
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {current === 'cal' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className={BTN_SEC}>
                    ← Semana anterior
                  </button>
                  <span className="font-display text-lg">
                    {fd(weekDays[0])} — {fd(weekDays[6])}
                  </span>
                  <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className={BTN_SEC}>
                    Semana siguiente →
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Aeropuerto</span>
                    <select value={airportFilter} onChange={(e) => setAirportFilter(e.target.value)} className="rounded-[2px] border border-rule bg-paper px-2 py-2 text-sm">
                      <option value="todos">Todos</option>
                      {Object.keys(AP).map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate">Avión</span>
                    <select value={planeFilter} onChange={(e) => setPlaneFilter(e.target.value)} className="rounded-[2px] border border-rule bg-paper px-2 py-2 text-sm">
                      <option value="todos">Todos</option>
                      {catalogs.aviones.map((avion) => (
                        <option key={avion.codigoAvion} value={avion.codigoAvion}>
                          {avion.codigoAvion}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                {weekDays.map((day, index) => {
                  const vuelos = filteredFlights.filter((f) => f.date === day)
                  return (
                    <div key={day} className="min-h-[170px] border border-rule bg-white">
                      <div className="border-b border-rule bg-mist px-2 py-2">
                        <div className="text-[11px] text-slate">{DIAS_SEMANA[index]}</div>
                        <div className="font-semibold tabular-nums">{fd(day)}</div>
                      </div>
                      <div className="space-y-2 p-2">
                        {vuelos.length ? (
                          vuelos.map((f) => (
                            <button
                              key={flightKey(f)}
                              type="button"
                              onClick={() => setDetailKey(flightKey(f))}
                              className={`block w-full rounded-[2px] border px-2 py-1.5 text-left text-[11px] ${CAL_STATE[f.st] || CAL_STATE.Programado}`}
                            >
                              <span className="block font-semibold">{flightKey(f)}</span>
                              <span className="block">
                                {f.o} → {f.d} · {tm(f.s)}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="text-[11px] text-slate">Sin vuelos</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {current === 'not' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Notificaciones</h2>
                <button type="button" onClick={onMarkNotificationsRead} className={BTN_SEC} disabled={!operations.notifications.some((n) => !n.leida)}>
                  Marcar todas como leídas
                </button>
              </div>
              <div className="mt-4 divide-y divide-rule border border-rule bg-white">
                {operations.notifications.length ? (
                  operations.notifications.map((nota) => (
                    <div key={nota.id} className={`flex items-start gap-3 px-4 py-3 ${nota.leida ? 'text-slate' : 'bg-celeste-pale text-ink'}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${nota.leida ? 'bg-rule' : 'bg-azure'}`} />
                      <div>
                        <p className="text-sm">{nota.texto}</p>
                        <p className="mt-1 text-[11px] text-slate">{fd(nota.fecha.slice(0, 10))}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-10 text-center text-sm text-slate">No hay notificaciones.</p>
                )}
              </div>
            </>
          )}

          {current === 'aud' && (
            <>
              <h2 className="font-display text-2xl">Auditoría</h2>
              <p className="mt-2 text-sm text-slate">Últimos {Math.min(audits.length, AUDIT_LIMIT)} registros de creación, edición, eliminación y cambios de estado.</p>
              <div className="mt-5 flex flex-wrap items-end gap-3 border-y border-rule py-5">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Entidad</span>
                  <select value={auditFilters.entidad} onChange={(e) => setAuditFilters((prev) => ({ ...prev, entidad: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm">
                    <option value="todas">Todas</option>
                    {entidadesAuditoria.map((entidad) => (
                      <option key={entidad} value={entidad}>{entidad}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Acción</span>
                  <select value={auditFilters.accion} onChange={(e) => setAuditFilters((prev) => ({ ...prev, accion: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm">
                    <option value="todas">Todas</option>
                    {accionesAuditoria.map((accion) => (
                      <option key={accion} value={accion}>{accion}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Desde</span>
                  <input type="date" value={auditFilters.desde} onChange={(e) => setAuditFilters((prev) => ({ ...prev, desde: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate">Hasta</span>
                  <input type="date" value={auditFilters.hasta} onChange={(e) => setAuditFilters((prev) => ({ ...prev, hasta: e.target.value }))} className="mt-1 rounded-[2px] border border-rule bg-paper px-3 py-2 text-sm" />
                </label>
                <button type="button" onClick={() => setAuditFilters({ entidad: 'todas', accion: 'todas', desde: '', hasta: '' })} className={BTN_SEC}>
                  Limpiar
                </button>
              </div>

              <div className="mt-4 overflow-x-auto border border-rule">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11px] text-slate">
                      <th className="px-3 py-3 font-medium">Fecha</th>
                      <th className="px-3 py-3 font-medium">Usuario</th>
                      <th className="px-3 py-3 font-medium">Rol</th>
                      <th className="px-3 py-3 font-medium">Entidad</th>
                      <th className="px-3 py-3 font-medium">Registro</th>
                      <th className="px-3 py-3 font-medium">Acción</th>
                      <th className="px-3 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudits.length ? (
                      filteredAudits.map((entry, index) => {
                        const clave = `${entry.fechaHora}-${index}`
                        const abierto = auditOpen === clave
                        const cambios = changedFields(entry.antes, entry.despues)
                        return (
                          <Fragment key={clave}>
                            <tr className="border-b border-rule">
                              <td className="px-3 py-3 tabular-nums">{fd(entry.fechaHora.slice(0, 10))} {entry.fechaHora.slice(11, 16)}</td>
                              <td className="px-3 py-3">{entry.usuario}</td>
                              <td className="px-3 py-3">{ROLE_INFO[entry.rol]?.label || entry.rol}</td>
                              <td className="px-3 py-3">{entry.entidad}</td>
                              <td className="px-3 py-3 font-semibold">{entry.idRegistro}</td>
                              <td className="px-3 py-3">{entry.accion}</td>
                              <td className="px-3 py-3">
                                <button type="button" onClick={() => setAuditOpen(abierto ? '' : clave)} className="text-xs font-semibold text-azure hover:underline">
                                  {abierto ? 'Ocultar' : 'Ver detalle'}
                                </button>
                              </td>
                            </tr>
                            {abierto && (
                              <tr className="border-b border-rule bg-mist/60">
                                <td colSpan={7} className="px-4 py-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">Campos modificados</p>
                                  {cambios.length ? (
                                    <ul className="mt-3 grid gap-2 text-sm">
                                      {cambios.map(([campo, antes, despues]) => (
                                        <li key={campo} className="break-words">
                                          <span className="font-semibold">{campo}:</span> <span className="text-airmail">{antes}</span> → <span className="text-azure-deep">{despues}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-2 text-sm text-slate">Sin cambios de campo registrados.</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate">No hay registros de auditoría para esos filtros.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {current === 'dev' && (
            <>
              <h2 className="font-display text-2xl">Actividad de dispositivos</h2>
              <p className="mt-2 text-sm text-slate">Check-ins realizados desde un dispositivo de check-in.</p>
              <div className="mt-5 overflow-x-auto border border-rule">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11px] text-slate">
                      <th className="px-3 py-3 font-medium">Fecha</th>
                      <th className="px-3 py-3 font-medium">Dispositivo</th>
                      <th className="px-3 py-3 font-medium">Aeropuerto</th>
                      <th className="px-3 py-3 font-medium">Pasajero</th>
                      <th className="px-3 py-3 font-medium">Vuelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceActivity.length ? (
                      [...deviceActivity]
                        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
                        .map((entry, index) => (
                          <tr key={`${entry.fecha}-${entry.codigoReserva}-${index}`} className="border-b border-rule">
                            <td className="px-3 py-3 tabular-nums">{fmtWhen(new Date(entry.fecha))}</td>
                            <td className="px-3 py-3 font-semibold">{entry.codigoDispositivo}</td>
                            <td className="px-3 py-3">{airportName(entry.codigoAeropuerto, catalogs)} ({entry.codigoAeropuerto})</td>
                            <td className="px-3 py-3">{entry.pasajero}</td>
                            <td className="px-3 py-3">{entry.vuelo}</td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-slate">Todavía no hay check-ins registrados en dispositivos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {SCHEMAS.map((schema) =>
            current === schema.key ? (
              <CrudManager
                key={schema.key}
                schema={schema}
                catalogs={catalogs}
                onSave={(row, isNew) => onSaveCatalog(schema.key, row, isNew)}
                onDelete={(pk) => onDeleteCatalog(schema.key, pk)}
                onToggleStatus={(row) => onToggleCatalogStatus(schema.key, row)}
                onRowAction={onRowAction}
              />
            ) : null,
          )}

          {current === 'rsv' && (
            <>
              {!adm && (
                <p className="mt-4 border-b border-rule pb-4 text-sm text-slate">
                  Aeropuerto asignado: <span className="font-semibold text-ink">{user.codigoAeropuertoAsignado || '—'}</span> · {admFlights.length} vuelos · {bookings.length} reservas visibles
                </p>
              )}
              <label className="block max-w-[360px]">
                <span className="block text-[11px] font-medium text-slate">Buscar reserva</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o apellido" className={INPUT} />
              </label>

              <div className="mt-4 overflow-x-auto border border-rule">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11px] text-slate">
                      <th className="px-3 py-3 font-medium">Código</th>
                      <th className="px-3 py-3 font-medium">Pasajeros</th>
                      <th className="px-3 py-3 font-medium">Vuelo</th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      <th className="px-3 py-3 font-medium">Total</th>
                      <th className="px-3 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length ? (
                      filtered.map((b) => (
                        <tr key={b.code} className="border-b border-rule last:border-0">
                          <td className="px-3 py-3 font-semibold">{b.code}</td>
                          <td className="px-3 py-3">{b.pax.map((p) => p.n + ' ' + p.a).join(', ')}</td>
                          <td className="px-3 py-3">
                            {b.fl.o} a {b.fl.d}, {fd(b.fl.date)}
                          </td>
                          <td className="px-3 py-3">
                            <Status value={b.est} />
                          </td>
                          <td className="px-3 py-3 tabular-nums">{COP(b.total)}</td>
                          <td className="px-3 py-3">
                            {b.est === 'Confirmada' && (
                              <button type="button" onClick={() => onCancel(b)} className="text-xs font-semibold text-airmail hover:underline">
                                Cancelar reserva
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-slate">
                          No hay reservas que coincidan. Revisa el código o el apellido.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {editor && (
            <FlightEditor
              flight={editor}
              catalogs={catalogs}
              onClose={() => setEditor(null)}
              onSave={(form) => {
                const resultado = onSaveFlight(form, editor.codigoVuelo || '')
                if (applyResult(resultado, 'Vuelo guardado.')) setEditor(null)
              }}
            />
          )}

          {detailFlight && (
            <FlightDetail
              flight={detailFlight}
              operations={operations}
              catalogs={catalogs}
              bookings={bookings}
              onClose={() => setDetailKey('')}
              onSaveCrew={(ids) => applyResult(onSaveCrew(flightKey(detailFlight), ids), 'Tripulación actualizada.')}
              onEdit={() => {
                setEditor(detailFlight)
                setDetailKey('')
              }}
            />
          )}
        </div>
      </div>
    </main>
  )
}

function FlightEditor({ flight, catalogs, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    codigoVuelo: flight.codigoVuelo || '',
    codigoRuta: flight.codigoRuta || '',
    codigoAvion: flight.codigoAvion || '',
    fecha: flight.date || iso(7),
    horaSalida: flight.horaSalida || tm(flight.s || 8 * 60),
    gate: flight.gate || '',
    terminal: flight.term || '',
  }))
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <Dialog
      title={flight.codigoVuelo ? `Editar ${flight.codigoVuelo}` : 'Nuevo vuelo'}
      description="Se validarán solapamientos de avión y tripulación."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SEC}>
            Cancelar
          </button>
          <button type="button" onClick={() => onSave(form)} className={BTN_PRI}>
            Guardar vuelo
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Código de vuelo</span>
          <input value={form.codigoVuelo} onChange={set('codigoVuelo')} className={INPUT} placeholder="CE101" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Ruta</span>
          <select value={form.codigoRuta} onChange={set('codigoRuta')} className={INPUT}>
            <option value="">Selecciona una ruta</option>
            {catalogs.rutas.map((ruta) => (
              <option key={ruta.codigoRuta} value={ruta.codigoRuta}>
                {ruta.origen} → {ruta.destino}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Avión</span>
          <select value={form.codigoAvion} onChange={set('codigoAvion')} className={INPUT}>
            <option value="">Selecciona un avión</option>
            {catalogs.aviones.map((avion) => (
              <option key={avion.codigoAvion} value={avion.codigoAvion}>
                {avion.codigoAvion} · {avion.modelo}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Fecha</span>
          <input type="date" value={form.fecha} onChange={set('fecha')} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Hora de salida</span>
          <input type="time" value={form.horaSalida} onChange={set('horaSalida')} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Puerta</span>
          <input value={form.gate} onChange={set('gate')} className={INPUT} placeholder="A12" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate">Terminal</span>
          <input value={form.terminal} onChange={set('terminal')} className={INPUT} placeholder="1" />
        </label>
      </div>
    </Dialog>
  )
}

function FlightDetail({ flight, operations, catalogs, bookings, onClose, onSaveCrew, onEdit }) {
  const asignados = operations.crewAssignments[flightKey(flight)] || []
  const requeridos = crewCounts(flightKey(flight), operations, catalogs)
  const asientos = seatStateSummary(flightKey(flight), operations)
  const reservas = bookings.filter((b) => flightKey(b.fl) === flightKey(flight))

  const toggle = (id) => (e) => {
    const next = e.target.checked ? [...asignados, id] : asignados.filter((item) => item !== id)
    onSaveCrew(next)
  }

  return (
    <Dialog
      title={`Detalle de ${flightKey(flight)}`}
      description={`${fd(flight.date)} · ${flight.o} → ${flight.d} · ${tm(flight.s)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SEC}>
            Cerrar
          </button>
          <button type="button" onClick={onEdit} className={BTN_PRI}>
            Editar vuelo
          </button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate">Resumen</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate">Avión</dt>
              <dd className="font-medium">{flight.mod}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate">Puerta / terminal</dt>
              <dd className="font-medium">{flight.gate || '—'} / {flight.term || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate">Estado</dt>
              <dd className="font-medium">{flight.st}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate">Reservas</dt>
              <dd className="font-medium">{reservas.length}</dd>
            </div>
          </dl>
          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate">Asientos del vuelo</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {Object.entries(asientos).map(([estado, total]) => (
              <span key={estado} className="border border-rule bg-mist px-2 py-1">
                {estado}: <strong>{total}</strong>
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate">Tripulación asignada</h3>
          <p className="mt-1 text-xs text-slate">
            Piloto {requeridos.Piloto}/1 · Copiloto {requeridos.Copiloto}/1 · Auxiliares {requeridos.Auxiliar}/2
          </p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto border border-rule p-2">
            {catalogs.tripulantes.map((tripulante) => (
              <label key={tripulante.idTripulante} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={asignados.includes(tripulante.idTripulante)} onChange={toggle(tripulante.idTripulante)} />
                <span>
                  {tripulante.nombre} {tripulante.apellido} · {tripulante.tipoTripulante}
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  )
}

function Footer({ onReset, simClock, now, onSimChange, onSimClear }) {
  const current = now()

  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="font-display text-xl">Celeste Air</div>
            <p className="mt-1 max-w-[55ch] text-sm text-slate">Vuela más lejos, llega más cerca. Con Celeste Air, cada milla cuenta.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate">Barranquilla, Colombia</p>
            <button
              type="button"
              onClick={onReset}
              className="mt-2 text-xs text-slate underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
            >
              Reiniciar Celeste Air
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-end gap-5 border-t border-rule pt-5">
          <div>
            <div className="text-[11px] font-medium text-ink">Fecha operativa de hoy</div>
            <p className="mt-1 max-w-[42ch] text-xs text-slate">Ajusta la fecha operativa para consultar la ventana de check-in.</p>
          </div>

          <label className="block text-[11px] text-slate">
            Fecha
            <input
              type="date"
              value={simClock?.date ?? dateValue(current)}
              onChange={(e) => onSimChange('date', e.target.value)}
              className={FOOTER_INPUT}
            />
          </label>

          <label className="block text-[11px] text-slate">
            Hora
            <input
              type="time"
              value={simClock?.time ?? timeValue(current)}
              onChange={(e) => onSimChange('time', e.target.value)}
              className={FOOTER_INPUT}
            />
          </label>

          <button
            type="button"
            onClick={onSimClear}
            disabled={!simClock}
            className="rounded-[2px] border border-rule px-3 py-1.5 text-xs font-semibold text-slate transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Usar fecha real
          </button>
        </div>

        <details className="mt-8 text-xs text-slate">
          <summary className="cursor-pointer select-none">Créditos de las fotografías</summary>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {CREDITS.map((c) => (
              <li key={c.city}>
                {c.city}:{' '}
                <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-2 hover:text-ink">
                  {c.author}
                </a>
                , {c.license}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </footer>
  )
}
