export const CURRENT_YEAR = new Date().getFullYear()

export const CLASS_INDEX = { Primera: 2, Business: 1, 'Económica': 0 }
export const CLASS_FACTOR = { Primera: 3.6, Business: 2.4, 'Económica': 1 }

const LAYOUT = {
  Primera: { columnas: ['A', 'F'], porFila: 2 },
  Business: { columnas: ['A', 'C', 'D', 'F'], porFila: 4 },
  'Económica': { columnas: ['A', 'B', 'C', 'D', 'E', 'F'], porFila: 6 },
}

const PLANE_BY_MODEL = {
  'Airbus A320': 'AV-001',
  'Boeing 737-800': 'AV-002',
  'Embraer E190': 'AV-003',
  'Airbus A321': 'AV-004',
}

const rowCount = (value, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.floor(n)))
}

export const planeForModel = (model) => PLANE_BY_MODEL[model] || 'AV-001'

export function planeCapacity(avion = {}) {
  const primera = rowCount(avion.filasPrimera, 12) * LAYOUT.Primera.porFila
  const business = rowCount(avion.filasBusiness, 16) * LAYOUT.Business.porFila
  const economica = rowCount(avion.filasEconomica, 60) * LAYOUT['Económica'].porFila
  return {
    capacidadPrimera: primera,
    capacidadBusiness: business,
    capacidadEconomica: economica,
    capacidadTotal: primera + business + economica,
  }
}

export function generateSeats(avion = {}) {
  const code = String(avion.codigoAvion || avion.matricula || 'AV-NEW').trim().toUpperCase() || 'AV-NEW'
  const grupos = [
    ['Primera', rowCount(avion.filasPrimera, 12)],
    ['Business', rowCount(avion.filasBusiness, 16)],
    ['Económica', rowCount(avion.filasEconomica, 60)],
  ]
  const seats = []
  let fila = 0

  grupos.forEach(([clase, filas]) => {
    for (let i = 0; i < filas; i += 1) {
      fila += 1
      LAYOUT[clase].columnas.forEach((columna) => {
        const numeroAsiento = `${fila}${columna}`
        const ubicacion = columna === 'A' || columna === 'F' ? 'ventana' : columna === 'C' || columna === 'D' ? 'pasillo' : 'centro'
        seats.push({
          codigoAsiento: `${code}-${numeroAsiento}`,
          numeroAsiento,
          fila,
          columna,
          claseCabina: clase,
          ubicacion,
        })
      })
    }
  })

  return seats
}

export function preparePlane(row = {}) {
  const base = {
    ...row,
    codigoAvion: String(row.codigoAvion || row.matricula || 'AV-NEW').trim().toUpperCase() || 'AV-NEW',
    filasPrimera: rowCount(row.filasPrimera, 12),
    filasBusiness: rowCount(row.filasBusiness, 16),
    filasEconomica: rowCount(row.filasEconomica, 60),
    estado: ['Operativo', 'Mantenimiento', 'Retirado'].includes(row.estado) ? row.estado : 'Operativo',
  }
  delete base.matricula
  return { ...base, ...planeCapacity(base), asientos: generateSeats(base) }
}

export function seatRows(seats = []) {
  const map = new Map()
  seats.forEach((seat) => {
    if (!map.has(seat.fila)) map.set(seat.fila, [])
    map.get(seat.fila).push(seat)
  })
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fila, items]) => ({ fila, items, clase: items[0]?.claseCabina || 'Económica' }))
}

function planeForFlight(flight = {}, aviones = []) {
  return (
    aviones.find((a) => a.codigoAvion === flight.codigoAvion) ||
    aviones.find((a) => a.modelo === flight.mod) ||
    aviones[0] ||
    null
  )
}

export function seatsForFlight(flight, aviones = []) {
  const plane = planeForFlight(flight, aviones)
  if (plane?.asientos?.length) return plane.asientos
  if (plane) return generateSeats(plane)
  return generateSeats({ codigoAvion: flight?.codigoAvion || 'AV-001', filasPrimera: 2, filasBusiness: 3, filasEconomica: 13 })
}

export function seatClassForFlight(flight, seatCode, aviones = []) {
  const match = seatsForFlight(flight, aviones).find((s) => s.codigoAsiento === seatCode || s.numeroAsiento === seatCode)
  if (match) return { ...match, factor: CLASS_FACTOR[match.claseCabina] || 1 }
  const fila = parseInt(String(seatCode || ''), 10) || 1
  const clase = fila <= 2 ? 'Primera' : fila <= 5 ? 'Business' : 'Económica'
  return {
    codigoAsiento: String(seatCode || ''),
    numeroAsiento: String(seatCode || ''),
    fila,
    claseCabina: clase,
    ubicacion: 'centro',
    factor: CLASS_FACTOR[clase],
  }
}

export function seatPrice(flight, seatCode, aviones = []) {
  const { factor } = seatClassForFlight(flight, seatCode, aviones)
  const base = Number(flight?.tarifaBase ?? flight?.price) || 0
  return Math.round(base * factor)
}

export function planesWithBookings(avionCodigo, bookings = []) {
  return bookings.filter((b) => (b.fl?.codigoAvion || planeForModel(b.fl?.mod)) === avionCodigo && b.est !== 'Cancelada')
}
