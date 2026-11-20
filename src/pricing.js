import { addDays } from './operations'

const NO_VENDER = ['Cancelado', 'Finalizado']
const redondear = (valor) => Math.round(Number(valor) || 0)

export function routeForFlight(flight = {}, catalogs = {}) {
  const rutas = catalogs.rutas || []
  return (
    rutas.find((ruta) => ruta.codigoRuta === flight.codigoRuta) ||
    rutas.find((ruta) => ruta.aeropuertoOrigen === flight.o && ruta.aeropuertoDestino === flight.d) ||
    null
  )
}

export function ofertasParaVuelo(flight = {}, catalogs = {}, fecha = flight.date) {
  const ruta = routeForFlight(flight, catalogs)
  if (!ruta) return []
  const clases = catalogs.clases || []
  return (catalogs.tarifas || [])
    .filter(
      (tarifa) =>
        tarifa.codigoRuta === ruta.codigoRuta &&
        (tarifa.estado || 'Activo') !== 'Inactivo' &&
        tarifa.fechaInicioVigencia <= fecha &&
        fecha <= tarifa.fechaFinVigencia,
    )
    .map((tarifa) => {
      const clase = clases.find((item) => item.codigoClase === tarifa.codigoClase)
      const factor = Number(clase?.factorPrecio) || 1
      const tarifaBase = redondear(tarifa.precioBase)
      return {
        tarifa,
        clase,
        factor,
        tarifaBase,
        precio: redondear(tarifaBase * factor),
      }
    })
    .sort((a, b) => a.precio - b.precio)
}

export function vueloVendible(flight = {}, catalogs = {}) {
  if (!flight || NO_VENDER.includes(flight.st)) return null
  const oferta = ofertasParaVuelo(flight, catalogs, flight.date)[0]
  if (!oferta || oferta.precio <= 0) return null
  return {
    ...flight,
    id: flight.codigoVuelo || flight.id,
    codigoVuelo: flight.codigoVuelo || flight.id,
    price: oferta.precio,
    tarifaBase: oferta.tarifaBase,
    codigoTarifa: oferta.tarifa.codigoTarifa,
    claseTarifa: oferta.clase?.codigoClase || oferta.tarifa.codigoClase,
    temporadaTarifa: oferta.tarifa.temporada,
    politicaCancelacion: oferta.tarifa.politicaCancelacion,
    moneda: oferta.tarifa.moneda || 'COP',
  }
}

export function sellableFlights(query = {}, catalogs = {}, operations = {}) {
  return (operations.flights || [])
    .filter((flight) => flight.o === query.o && flight.d === query.d && flight.date === query.f)
    .map((flight) => vueloVendible(flight, catalogs))
    .filter(Boolean)
}

export function precioMinimoDestino(catalogs = {}, operations = {}, origen, destino, fecha) {
  const precios = sellableFlights({ o: origen, d: destino, f: fecha }, catalogs, operations).map((f) => f.price)
  return precios.length ? Math.min(...precios) : null
}

export function fechasConVuelos(query = {}, catalogs = {}, operations = {}, dias = 14, limite = 3) {
  const fechas = []
  let cursor = addDays(query.f, 1)
  for (let i = 0; i < dias && fechas.length < limite; i += 1) {
    if (sellableFlights({ ...query, f: cursor }, catalogs, operations).length) fechas.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return fechas
}
