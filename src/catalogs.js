import { AP, iso, tm } from './data'
import { CURRENT_YEAR, planeCapacity, preparePlane } from './seats'

export const ROLE_INFO = {
  pas: {
    label: 'Pasajero',
    description: 'Reserva, paga, consulta tus boletos y haz check-in.',
  },
  age: {
    label: 'Agente de reservas',
    description: 'Crea, modifica y cancela reservas de clientes en el mostrador.',
  },
  adm: {
    label: 'Administrador',
    description: 'Gestiona vuelos, aeropuertos y revisa los indicadores.',
  },
}

const ICAO_AIRPORT = {
  BAQ: 'SKBQ',
  BOG: 'SKBO',
  MDE: 'SKMD',
  CTG: 'SKCG',
  CLO: 'SKCL',
  PTY: 'MPTO',
  MIA: 'KMIA',
  MAD: 'MADR',
}

const COUNTRY = {
  BAQ: 'Colombia',
  BOG: 'Colombia',
  MDE: 'Colombia',
  CTG: 'Colombia',
  CLO: 'Colombia',
  PTY: 'Panamá',
  MIA: 'Estados Unidos',
  MAD: 'España',
}

const TIMEZONE = {
  BAQ: 'America/Bogota',
  BOG: 'America/Bogota',
  MDE: 'America/Bogota',
  CTG: 'America/Bogota',
  CLO: 'America/Bogota',
  PTY: 'America/Panama',
  MIA: 'America/New_York',
  MAD: 'Europe/Madrid',
}

const TERMINALS = { BAQ: 1, BOG: 2, MDE: 1, CTG: 1, CLO: 1, PTY: 2, MIA: 3, MAD: 4 }
const ZONE_LABEL = ['Nacional', 'Internacional', 'Intercontinental']

const ROUTE_SEED = [
  ['BAQ', 'BOG', 700, 95, 7],
  ['BAQ', 'MDE', 520, 75, 7],
  ['BOG', 'MAD', 8600, 600, 4],
  ['CTG', 'MIA', 2100, 180, 5],
]

const AIRCRAFT_SEED = [
  ['AV-001', 'Airbus A320', 'Airbus', 2018, 2, 3, 13],
  ['AV-002', 'Boeing 737-800', 'Boeing', 2016, 2, 4, 14],
  ['AV-003', 'Embraer E190', 'Embraer', 2019, 1, 2, 14],
  ['AV-004', 'Airbus A321', 'Airbus', 2021, 2, 4, 18],
]

const CREW_SEED = [
  ['T001', 'Elena', 'Ruiz', 'Piloto', 'LIC-AP-1024', '1985-04-12', '3001112233', 'elena.ruiz@celesteair.example', 7200, 'Activo'],
  ['T002', 'Javier', 'Mena', 'Piloto', 'LIC-AP-2187', '1979-09-03', '3002223344', 'javier.mena@celesteair.example', 9100, 'Activo'],
  ['T003', 'Camila', 'Ortiz', 'Copiloto', 'LIC-CP-3341', '1990-11-21', '3003334455', 'camila.ortiz@celesteair.example', 4100, 'Activo'],
  ['T004', 'Andrés', 'Vidal', 'Copiloto', 'LIC-CP-4478', '1988-02-17', '3004445566', 'andres.vidal@celesteair.example', 3800, 'Activo'],
  ['T005', 'Lucía', 'Castro', 'Auxiliar', 'LIC-AT-5512', '1994-06-08', '3005556677', 'lucia.castro@celesteair.example', 2200, 'Activo'],
  ['T006', 'Mateo', 'Gil', 'Auxiliar', 'LIC-AT-6629', '1992-12-15', '3006667788', 'mateo.gil@celesteair.example', 2600, 'Activo'],
  ['T007', 'Sofía', 'Pardo', 'Auxiliar', 'LIC-AT-7734', '1996-03-27', '3007778899', 'sofia.pardo@celesteair.example', 1800, 'Activo'],
  ['T008', 'Daniela', 'López', 'Auxiliar', 'LIC-AT-8846', '1993-08-19', '3008889900', 'daniela.lopez@celesteair.example', 3100, 'Activo'],
]

const DIAS_LABORABLES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']
const DIAS_FIN_SEMANA = ['sábado', 'domingo']
const TODOS_LOS_DIAS = [...DIAS_LABORABLES, ...DIAS_FIN_SEMANA]

const SCHEDULE_SEED = [
  ['HV001', 'R-BAQ-BOG', 'AV-001', '08:00', TODOS_LOS_DIAS, iso(0), iso(90), 'Todo el año', 'Activo'],
  ['HV002', 'R-BAQ-MDE', 'AV-002', '11:30', TODOS_LOS_DIAS, iso(0), iso(90), 'Todo el año', 'Activo'],
  ['HV003', 'R-BOG-MAD', 'AV-004', '16:00', DIAS_LABORABLES, iso(0), iso(120), 'Alta', 'Activo'],
  ['HV004', 'R-CTG-MIA', 'AV-003', '09:45', DIAS_FIN_SEMANA, iso(0), iso(120), 'Alta', 'Activo'],
]

const DISPOSITIVO_SEED = [
  { codigoDispositivo: 'KIO-001', codigoAeropuerto: 'BAQ', ubicacion: 'Terminal principal · Puerta 4', tipoDispositivo: 'Kiosco', estado: 'Activo' },
  { codigoDispositivo: 'KIO-002', codigoAeropuerto: 'BOG', ubicacion: 'Sala de embarque · Puerta 12', tipoDispositivo: 'Kiosco', estado: 'Activo' },
]

export const createSeedCatalogs = (legacyAirports = {}) => {
  const aeropuertos = Object.entries(AP).map(([code, airport]) => ({
    codigoIATA: code,
    nombreAeropuerto: airport.n,
    ciudad: airport.c,
    pais: COUNTRY[code],
    codigoICAO: ICAO_AIRPORT[code],
    zonaHoraria: TIMEZONE[code],
    numeroTerminales: TERMINALS[code],
    zona: airport.i,
    tagline: airport.t,
    imagen: `/photos/${code.toLowerCase()}.webp`,
    estado: legacyAirports[code] === false ? 'Inactivo' : 'Activo',
  }))

  const rutas = ROUTE_SEED.map(([o, d, distanciaKm, tiempoEstimado, frecuenciaSemanal]) => ({
    codigoRuta: `R-${o}-${d}`,
    aeropuertoOrigen: o,
    aeropuertoDestino: d,
    distanciaKm,
    tiempoEstimado,
    frecuenciaSemanal,
  }))

  const clases = [
    {
      codigoClase: 'ECO',
      nombreClase: 'Económica',
      descripcion: 'Viaje esencial con lo necesario a bordo.',
      factorPrecio: 1,
      equipajePermitidoKg: 23,
      serviciosIncluidos: ['Equipaje de mano', 'Asiento estándar'],
      prioridadEmbarque: 3,
    },
    {
      codigoClase: 'BUS',
      nombreClase: 'Business',
      descripcion: 'Más espacio, equipaje amplio y embarque anticipado.',
      factorPrecio: 2.4,
      equipajePermitidoKg: 32,
      serviciosIncluidos: ['Equipaje en bodega', 'Asiento amplio', 'Embarque prioritario'],
      prioridadEmbarque: 2,
    },
    {
      codigoClase: 'PRE',
      nombreClase: 'Primera',
      descripcion: 'La experiencia completa, del mostrador al asiento.',
      factorPrecio: 3.6,
      equipajePermitidoKg: 40,
      serviciosIncluidos: ['Equipaje en bodega', 'Sala VIP', 'Asiento premium', 'Embarque prioritario'],
      prioridadEmbarque: 1,
    },
  ]

  const temporadas = [
    ['Baja', 0, 60, 0.82],
    ['Media', 61, 150, 1],
    ['Alta', 151, 240, 1.28],
  ]
  const tarifas = rutas.flatMap((ruta) =>
    clases.flatMap((clase) =>
      temporadas.map(([temporada, desde, hasta, factor], i) => ({
        codigoTarifa: `T-${ruta.codigoRuta.slice(2)}-${clase.codigoClase}-${i + 1}`,
        codigoRuta: ruta.codigoRuta,
        codigoClase: clase.codigoClase,
        precioBase: Math.round((ruta.distanciaKm * 92 * factor) / 1000) * 1000,
        moneda: 'COP',
        temporada,
        fechaInicioVigencia: iso(desde),
        fechaFinVigencia: iso(hasta),
        estado: 'Activo',
        restricciones: temporada === 'Alta' ? 'Cambios con cargo. No reembolsable.' : 'Cambios sin cargo hasta 24 h antes.',
        politicaCancelacion: [
          { horasAntes: 72, porcentaje: 100 },
          { horasAntes: 24, porcentaje: 50 },
          { horasAntes: 0, porcentaje: 0 },
        ],
      })),
    ),
  )

  return {
    aerolineas: [
      {
        codigoAerolinea: 'CEL',
        nombreAerolinea: 'Celeste Air',
        paisOrigen: 'Colombia',
        codigoIATA: 'CL',
        codigoICAO: 'CLS',
        sitioWeb: 'https://celesteair.example',
        telefonoContacto: '5718001234',
        correoContacto: 'contacto@celesteair.example',
      },
    ],
    aeropuertos,
    dispositivosCheckIn: DISPOSITIVO_SEED.map((row) => ({ ...row })),
    clases,
    rutas,
    tarifas,
    usuarios: [
      {
        id: 'U001',
        rol: 'pas',
        nombre: 'Laura',
        apellido: 'Gómez',
        correo: 'laura.gomez@example.com',
        celular: '3001234567',
        ciudad: 'Barranquilla',
        pais: 'Colombia',
        estado: 'Activo',
        codigoAeropuertoAsignado: '',
      },
      {
        id: 'U002',
        rol: 'age',
        nombre: 'Andrés',
        apellido: 'Pérez',
        correo: 'andres.perez@celesteair.example',
        celular: '3109876543',
        ciudad: 'Bogotá',
        pais: 'Colombia',
        estado: 'Activo',
        codigoAeropuertoAsignado: 'BOG',
      },
      {
        id: 'U003',
        rol: 'adm',
        nombre: 'Administración',
        apellido: '',
        correo: 'administracion@celesteair.example',
        celular: '6014567890',
        ciudad: 'Bogotá',
        pais: 'Colombia',
        estado: 'Activo',
        codigoAeropuertoAsignado: 'BOG',
      },
    ],
    aviones: AIRCRAFT_SEED.map(([codigoAvion, modelo, fabricante, anioFabricacion, filasPrimera, filasBusiness, filasEconomica]) =>
      preparePlane({
        codigoAvion,
        modelo,
        fabricante,
        anioFabricacion,
        filasPrimera,
        filasBusiness,
        filasEconomica,
        codigoAerolinea: 'CEL',
        estado: 'Operativo',
      }),
    ),
    tripulantes: CREW_SEED.map(([idTripulante, nombre, apellido, tipoTripulante, licencia, fechaNacimiento, celular, correo, horasVuelo, estado]) => ({
      idTripulante,
      nombre,
      apellido,
      tipoTripulante,
      licencia,
      fechaNacimiento,
      celular,
      correo,
      horasVuelo,
      estado,
    })),
    horariosVuelo: SCHEDULE_SEED.map(([codigoHorario, codigoRuta, codigoAvion, horaSalida, diasSemana, fechaInicioVigencia, fechaFinVigencia, temporada, estado]) => ({
      codigoHorario,
      codigoRuta,
      codigoAvion,
      horaSalida,
      diasSemana,
      fechaInicioVigencia,
      fechaFinVigencia,
      temporada,
      estado,
    })),
  }
}

const code = (max, message) => ({
  pattern: new RegExp(`^[A-Z]{${max}}$`),
  patternMessage: message,
  transform: (value) => String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, max),
})

const digits = {
  pattern: /^\d+$/,
  patternMessage: 'Usa solo dígitos.',
  transform: (value) => String(value ?? '').replace(/\D/g, ''),
}

const licenseCode = {
  pattern: /^LIC-[A-Z]{2}-\d{4}$/,
  patternMessage: 'Usa el formato LIC-XX-0000.',
  transform: (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, ''),
}

const scheduleDuration = (row, catalogs) =>
  Number((catalogs?.rutas || []).find((ruta) => String(ruta.codigoRuta) === String(row?.codigoRuta))?.tiempoEstimado) || 0

const scheduleArrival = (row, catalogs) => {
  const [hora, minuto] = String(row?.horaSalida || '').split(':').map(Number)
  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return '—'
  return tm(hora * 60 + minuto + scheduleDuration(row, catalogs))
}

export const SCHEMAS = [
  {
    key: 'aerolineas',
    name: 'Aerolínea',
    plural: 'Aerolíneas',
    article: 'Nueva',
    pk: 'codigoAerolinea',
    deleteNoun: 'aerolínea',
    softDelete: false,
    searchable: ['codigoAerolinea', 'nombreAerolinea', 'codigoIATA', 'codigoICAO', 'paisOrigen'],
    columns: [
      { key: 'codigoAerolinea', label: 'Código' },
      { key: 'codigoIATA', label: 'IATA' },
      { key: 'codigoICAO', label: 'ICAO' },
      { key: 'nombreAerolinea', label: 'Aerolínea' },
      { key: 'paisOrigen', label: 'País' },
    ],
    fields: [
      { key: 'codigoAerolinea', label: 'Código de aerolínea', type: 'text', required: true, unique: true },
      { key: 'nombreAerolinea', label: 'Nombre', type: 'text', required: true },
      { key: 'paisOrigen', label: 'País de origen', type: 'text', required: true },
      { key: 'codigoIATA', label: 'Código IATA', type: 'text', required: true, unique: true, ...code(2, 'El código IATA debe tener 2 letras mayúsculas.') },
      { key: 'codigoICAO', label: 'Código ICAO', type: 'text', required: true, unique: true, ...code(3, 'El código ICAO debe tener 3 letras mayúsculas.') },
      { key: 'sitioWeb', label: 'Sitio web', type: 'text' },
      { key: 'telefonoContacto', label: 'Teléfono de contacto', type: 'text', required: true, ...digits },
      { key: 'correoContacto', label: 'Correo de contacto', type: 'text', required: true, unique: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Escribe un correo válido.', transform: (v) => String(v ?? '').trim().toLowerCase() },
    ],
    custom: {
      sitioWeb: (errors, row) => {
        if (!row.sitioWeb) return
        try {
          const parsed = new URL(row.sitioWeb)
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
        } catch {
          errors.sitioWeb = 'Escribe una URL válida, por ejemplo https://ejemplo.com.'
        }
      },
    },
    referencedBy: [{ key: 'aviones', fields: ['codigoAerolinea'], singular: 'avión', plural: 'aviones' }],
    defaults: (catalogs) => ({ codigoAerolinea: nextCode('AER', catalogs.aerolineas, 'codigoAerolinea'), paisOrigen: 'Colombia' }),
  },
  {
    key: 'aeropuertos',
    name: 'Aeropuerto',
    plural: 'Aeropuertos',
    article: 'Nuevo',
    pk: 'codigoIATA',
    softDelete: 'estado',
    searchable: ['codigoIATA', 'codigoICAO', 'nombreAeropuerto', 'ciudad', 'pais'],
    columns: [
      { key: 'codigoIATA', label: 'IATA' },
      { key: 'codigoICAO', label: 'ICAO' },
      { key: 'nombreAeropuerto', label: 'Aeropuerto' },
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'numeroTerminales', label: 'Terminales' },
      { key: 'estado', label: 'Estado' },
    ],
    fields: [
      { key: 'codigoIATA', label: 'Código IATA', type: 'text', required: true, unique: true, ...code(3, 'El código IATA debe tener 3 letras mayúsculas.') },
      { key: 'codigoICAO', label: 'Código ICAO', type: 'text', required: true, unique: true, ...code(4, 'El código ICAO debe tener 4 letras mayúsculas.') },
      { key: 'nombreAeropuerto', label: 'Nombre', type: 'text', required: true },
      { key: 'ciudad', label: 'Ciudad', type: 'text', required: true },
      { key: 'pais', label: 'País', type: 'text', required: true },
      { key: 'zonaHoraria', label: 'Zona horaria', type: 'text', required: true },
      { key: 'numeroTerminales', label: 'Número de terminales', type: 'number', required: true, min: 1, max: 20 },
      { key: 'zona', label: 'Zona tarifaria', type: 'select', cast: 'number', options: ZONE_LABEL.map((label, value) => ({ value, label })), required: true },
      { key: 'tagline', label: 'Descripción breve', type: 'text' },
      { key: 'imagen', label: 'Imagen', type: 'text' },
    ],
    defaults: () => ({ estado: 'Activo', pais: 'Colombia', numeroTerminales: 1, zona: 0 }),
    referencedBy: [{ key: 'dispositivosCheckIn', fields: ['codigoAeropuerto'], singular: 'dispositivo', plural: 'dispositivos' }],
  },
  {
    key: 'clases',
    name: 'Clase de cabina',
    plural: 'Clases de cabina',
    article: 'Nueva',
    pk: 'codigoClase',
    deleteNoun: 'clase de cabina',
    softDelete: false,
    searchable: ['codigoClase', 'nombreClase', 'descripcion'],
    columns: [
      { key: 'codigoClase', label: 'Código' },
      { key: 'nombreClase', label: 'Clase' },
      { key: 'factorPrecio', label: 'Factor' },
      { key: 'equipajePermitidoKg', label: 'Equipaje' },
      { key: 'prioridadEmbarque', label: 'Grupo' },
    ],
    fields: [
      { key: 'codigoClase', label: 'Código de clase', type: 'text', required: true, unique: true, ...code(3, 'El código debe tener 3 letras mayúsculas.') },
      { key: 'nombreClase', label: 'Nombre', type: 'text', required: true },
      { key: 'descripcion', label: 'Descripción', type: 'text' },
      { key: 'factorPrecio', label: 'Factor de precio', type: 'number', required: true, min: 0.1, step: 0.1 },
      { key: 'equipajePermitidoKg', label: 'Equipaje permitido (kg)', type: 'number', required: true, min: 0, max: 99 },
      { key: 'serviciosIncluidos', label: 'Servicios incluidos', type: 'multiselect', options: ['Equipaje de mano', 'Equipaje en bodega', 'Asiento estándar', 'Asiento amplio', 'Asiento premium', 'Embarque prioritario', 'Sala VIP'] },
      { key: 'prioridadEmbarque', label: 'Prioridad de embarque', type: 'number', required: true, min: 1, max: 9 },
    ],
    referencedBy: [{ key: 'tarifas', fields: ['codigoClase'], singular: 'tarifa', plural: 'tarifas' }],
    defaults: (catalogs) => ({ codigoClase: nextCode('CLA', catalogs.clases, 'codigoClase'), factorPrecio: 1, equipajePermitidoKg: 23, prioridadEmbarque: 3, serviciosIncluidos: [] }),
  },
  {
    key: 'rutas',
    name: 'Ruta',
    plural: 'Rutas',
    article: 'Nueva',
    pk: 'codigoRuta',
    deleteNoun: 'ruta',
    softDelete: false,
    searchable: ['codigoRuta', 'aeropuertoOrigen', 'aeropuertoDestino'],
    columns: [
      { key: 'codigoRuta', label: 'Código' },
      { key: 'aeropuertoOrigen', label: 'Origen' },
      { key: 'aeropuertoDestino', label: 'Destino' },
      { key: 'distanciaKm', label: 'Distancia' },
      { key: 'tiempoEstimado', label: 'Duración' },
      { key: 'frecuenciaSemanal', label: 'Frecuencia' },
    ],
    fields: [
      { key: 'codigoRuta', label: 'Código de ruta', type: 'text', required: true, unique: true },
      { key: 'aeropuertoOrigen', label: 'Aeropuerto de origen', type: 'relation', relation: 'aeropuertos', optionLabel: (r) => `${r.codigoIATA} · ${r.nombreAeropuerto}`, required: true },
      { key: 'aeropuertoDestino', label: 'Aeropuerto de destino', type: 'relation', relation: 'aeropuertos', optionLabel: (r) => `${r.codigoIATA} · ${r.nombreAeropuerto}`, required: true },
      { key: 'distanciaKm', label: 'Distancia (km)', type: 'number', required: true, min: 1 },
      { key: 'tiempoEstimado', label: 'Tiempo estimado (minutos)', type: 'number', required: true, min: 1 },
      { key: 'frecuenciaSemanal', label: 'Frecuencia semanal', type: 'number', required: true, min: 1, max: 7 },
    ],
    custom: {
      aeropuertoDestino: (errors, row, catalogs, editingKey) => {
        if (!row.aeropuertoOrigen || !row.aeropuertoDestino) return
        if (row.aeropuertoOrigen === row.aeropuertoDestino) {
          errors.aeropuertoDestino = 'El origen y el destino deben ser distintos.'
          return
        }
        const duplicate = catalogs.rutas.some(
          (r) => r.codigoRuta !== editingKey && r.aeropuertoOrigen === row.aeropuertoOrigen && r.aeropuertoDestino === row.aeropuertoDestino,
        )
        if (duplicate) errors.aeropuertoDestino = 'Ya existe una ruta con ese origen y destino.'
      },
    },
    referencedBy: [{ key: 'tarifas', fields: ['codigoRuta'], singular: 'tarifa', plural: 'tarifas' }],
    defaults: (catalogs) => ({ codigoRuta: nextCode('RUT', catalogs.rutas, 'codigoRuta'), frecuenciaSemanal: 7 }),
  },
  {
    key: 'tarifas',
    name: 'Tarifa',
    plural: 'Tarifas',
    article: 'Nueva',
    pk: 'codigoTarifa',
    deleteNoun: 'tarifa',
    softDelete: 'estado',
    searchable: ['codigoTarifa', 'codigoRuta', 'codigoClase', 'temporada', 'estado'],
    columns: [
      { key: 'codigoTarifa', label: 'Código' },
      { key: 'codigoRuta', label: 'Ruta' },
      { key: 'codigoClase', label: 'Clase' },
      { key: 'temporada', label: 'Temporada' },
      { key: 'precioBase', label: 'Precio base' },
      { key: 'estado', label: 'Estado' },
      { key: 'fechaFinVigencia', label: 'Vigencia' },
    ],
    fields: [
      { key: 'codigoTarifa', label: 'Código de tarifa', type: 'text', required: true, unique: true },
      { key: 'codigoRuta', label: 'Ruta', type: 'relation', relation: 'rutas', optionLabel: (r) => `${r.codigoRuta} · ${r.aeropuertoOrigen}-${r.aeropuertoDestino}`, required: true },
      { key: 'codigoClase', label: 'Clase', type: 'relation', relation: 'clases', optionLabel: (r) => `${r.codigoClase} · ${r.nombreClase}`, required: true },
      { key: 'precioBase', label: 'Precio base', type: 'number', required: true, min: 1 },
      { key: 'moneda', label: 'Moneda', type: 'select', options: ['COP', 'USD', 'EUR'], required: true },
      { key: 'temporada', label: 'Temporada', type: 'select', options: ['Baja', 'Media', 'Alta'], required: true },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], required: true },
      { key: 'fechaInicioVigencia', label: 'Inicio de vigencia', type: 'date', required: true },
      { key: 'fechaFinVigencia', label: 'Fin de vigencia', type: 'date', required: true },
      { key: 'restricciones', label: 'Restricciones', type: 'text' },
      { key: 'politicaCancelacion', label: 'Política de cancelación', type: 'tramos' },
    ],
    custom: {
      fechaFinVigencia: (errors, row, catalogs, editingKey) => {
        if (!row.fechaInicioVigencia || !row.fechaFinVigencia) return
        if (row.fechaFinVigencia <= row.fechaInicioVigencia) {
          errors.fechaFinVigencia = 'La fecha fin debe ser posterior a la fecha inicio.'
          return
        }
        const overlap = catalogs.tarifas.some(
          (t) =>
            t.codigoTarifa !== editingKey &&
            t.codigoRuta === row.codigoRuta &&
            t.codigoClase === row.codigoClase &&
            t.temporada === row.temporada &&
            row.fechaInicioVigencia <= t.fechaFinVigencia &&
            row.fechaFinVigencia >= t.fechaInicioVigencia,
        )
        if (overlap) errors.fechaFinVigencia = 'Ya existe una tarifa para esa ruta, clase y temporada en ese periodo.'
      },
    },
    defaults: (catalogs) => ({
      codigoTarifa: nextCode('TAR', catalogs.tarifas, 'codigoTarifa'),
      moneda: 'COP',
      temporada: 'Media',
      estado: 'Activo',
      politicaCancelacion: [],
    }),
  },
  {
    key: 'usuarios',
    name: 'Usuario',
    plural: 'Usuarios',
    article: 'Nuevo',
    pk: 'id',
    softDelete: 'estado',
    searchable: ['id', 'nombre', 'apellido', 'correo', 'rol', 'ciudad'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'rol', label: 'Rol' },
      { key: 'correo', label: 'Correo' },
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'estado', label: 'Estado' },
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, unique: true },
      { key: 'rol', label: 'Rol', type: 'select', options: Object.keys(ROLE_INFO).map((value) => ({ value, label: ROLE_INFO[value].label })), required: true },
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'apellido', label: 'Apellido', type: 'text' },
      { key: 'correo', label: 'Correo', type: 'text', required: true, unique: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Escribe un correo válido.', transform: (v) => String(v ?? '').trim().toLowerCase() },
      { key: 'celular', label: 'Celular', type: 'text', required: true, ...digits },
      { key: 'ciudad', label: 'Ciudad', type: 'text', required: true },
      { key: 'pais', label: 'País', type: 'text', required: true },
      { key: 'codigoAeropuertoAsignado', label: 'Aeropuerto asignado (agentes)', type: 'relation', relation: 'aeropuertos', optionLabel: (r) => `${r.codigoIATA} · ${r.nombreAeropuerto}` },
    ],
    defaults: (catalogs) => ({ id: nextCode('U', catalogs.usuarios, 'id'), pais: 'Colombia', estado: 'Activo' }),
  },
  {
    key: 'aviones',
    name: 'Avión',
    plural: 'Aviones',
    article: 'Nuevo',
    pk: 'codigoAvion',
    deleteNoun: 'avión',
    deleteArticle: 'este',
    softDelete: false,
    preview: 'seatMap',
    searchable: ['codigoAvion', 'modelo', 'fabricante', 'codigoAerolinea', 'estado'],
    columns: [
      { key: 'codigoAvion', label: 'Código' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'codigoAerolinea', label: 'Aerolínea' },
      { key: 'anioFabricacion', label: 'Año' },
      { key: 'estado', label: 'Estado' },
      { key: 'capacidadTotal', label: 'Capacidad' },
    ],
    fields: [
      { key: 'codigoAvion', label: 'Código de avión', type: 'text', required: true, unique: true, transform: (v) => String(v ?? '').trim().toUpperCase() },
      { key: 'modelo', label: 'Modelo', type: 'text', required: true },
      { key: 'fabricante', label: 'Fabricante', type: 'text', required: true },
      { key: 'codigoAerolinea', label: 'Aerolínea', type: 'relation', relation: 'aerolineas', optionLabel: (r) => `${r.codigoAerolinea} · ${r.nombreAerolinea}`, required: true },
      { key: 'anioFabricacion', label: 'Año de fabricación', type: 'number', required: true, min: 1990, max: CURRENT_YEAR },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativo', 'Mantenimiento', 'Retirado'], required: true },
      { key: 'filasPrimera', label: 'Filas de Primera (2-2)', type: 'number', required: true, min: 0, max: 12 },
      { key: 'filasBusiness', label: 'Filas de Business (2-2)', type: 'number', required: true, min: 0, max: 16 },
      { key: 'filasEconomica', label: 'Filas de Económica (3-3)', type: 'number', required: true, min: 1, max: 60 },
      { key: 'capacidadPrimera', label: 'Capacidad Primera', type: 'computed', compute: (row) => planeCapacity(row).capacidadPrimera },
      { key: 'capacidadBusiness', label: 'Capacidad Business', type: 'computed', compute: (row) => planeCapacity(row).capacidadBusiness },
      { key: 'capacidadEconomica', label: 'Capacidad Económica', type: 'computed', compute: (row) => planeCapacity(row).capacidadEconomica },
      { key: 'capacidadTotal', label: 'Capacidad total', type: 'computed', compute: (row) => planeCapacity(row).capacidadTotal },
    ],
    referencedBy: [{ key: 'vuelos', fields: ['codigoAvion'], singular: 'vuelo', plural: 'vuelos' }],
    defaults: (catalogs) => ({
      codigoAvion: nextCode('AV', catalogs.aviones, 'codigoAvion'),
      codigoAerolinea: catalogs.aerolineas[0]?.codigoAerolinea || '',
      estado: 'Operativo',
      anioFabricacion: CURRENT_YEAR,
      filasPrimera: 2,
      filasBusiness: 3,
      filasEconomica: 13,
    }),
  },
  {
    key: 'tripulantes',
    name: 'Tripulante',
    plural: 'Tripulantes',
    article: 'Nuevo',
    pk: 'idTripulante',
    deleteNoun: 'tripulante',
    deleteArticle: 'este',
    softDelete: 'estado',
    searchable: ['idTripulante', 'nombre', 'apellido', 'tipoTripulante', 'licencia', 'correo', 'estado'],
    columns: [
      { key: 'idTripulante', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'apellido', label: 'Apellido' },
      { key: 'tipoTripulante', label: 'Rol' },
      { key: 'licencia', label: 'Licencia' },
      { key: 'horasVuelo', label: 'Horas' },
      { key: 'estado', label: 'Estado' },
    ],
    fields: [
      {
        key: 'idTripulante',
        label: 'ID de tripulante',
        type: 'text',
        required: true,
        unique: true,
        pattern: /^T\d{3}$/,
        patternMessage: 'Usa el formato T001.',
        transform: (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4),
      },
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'apellido', label: 'Apellido', type: 'text', required: true },
      { key: 'tipoTripulante', label: 'Tipo de tripulante', type: 'select', options: ['Piloto', 'Copiloto', 'Auxiliar'], required: true },
      { key: 'licencia', label: 'Licencia', type: 'text', required: true, unique: true, ...licenseCode },
      { key: 'fechaNacimiento', label: 'Fecha de nacimiento', type: 'date', required: true },
      { key: 'celular', label: 'Celular', type: 'text', required: true, ...digits },
      {
        key: 'correo',
        label: 'Correo',
        type: 'text',
        required: true,
        unique: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        patternMessage: 'Escribe un correo válido.',
        transform: (value) => String(value ?? '').trim().toLowerCase(),
      },
      { key: 'horasVuelo', label: 'Horas de vuelo', type: 'number', required: true, min: 0, max: 50000 },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], required: true },
    ],
    defaults: (catalogs) => ({
      idTripulante: nextCode('T', catalogs.tripulantes, 'idTripulante'),
      tipoTripulante: 'Auxiliar',
      estado: 'Activo',
      horasVuelo: 0,
    }),
  },
  {
    key: 'horariosVuelo',
    name: 'Horario de vuelo',
    plural: 'Horarios de vuelo',
    article: 'Nuevo',
    pk: 'codigoHorario',
    deleteNoun: 'horario de vuelo',
    deleteArticle: 'este',
    softDelete: 'estado',
    rowActions: [{ id: 'generate', label: 'Generar vuelos', form: 'dateRange' }],
    searchable: ['codigoHorario', 'codigoRuta', 'codigoAvion', 'temporada', 'estado'],
    columns: [
      { key: 'codigoHorario', label: 'Código' },
      { key: 'codigoRuta', label: 'Ruta' },
      { key: 'codigoAvion', label: 'Avión' },
      { key: 'horaSalida', label: 'Salida' },
      { key: 'diasSemana', label: 'Días' },
      { key: 'duracionEstimada', label: 'Duración', compute: (row, catalogs) => `${scheduleDuration(row, catalogs)} min` },
      { key: 'horaLlegada', label: 'Llegada', compute: (row, catalogs) => scheduleArrival(row, catalogs) },
      { key: 'estado', label: 'Estado' },
    ],
    fields: [
      {
        key: 'codigoHorario',
        label: 'Código de horario',
        type: 'text',
        required: true,
        unique: true,
        pattern: /^HV\d{3}$/,
        patternMessage: 'Usa el formato HV001.',
        transform: (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
      },
      { key: 'codigoRuta', label: 'Ruta', type: 'relation', relation: 'rutas', optionLabel: (r) => `${r.aeropuertoOrigen} → ${r.aeropuertoDestino}`, required: true },
      { key: 'codigoAvion', label: 'Avión', type: 'relation', relation: 'aviones', optionLabel: (r) => `${r.codigoAvion} · ${r.modelo}`, required: true },
      {
        key: 'horaSalida',
        label: 'Hora de salida',
        type: 'time',
        required: true,
        pattern: /^([01]\d|2[0-3]):[0-5]\d$/,
        patternMessage: 'Usa el formato 08:30.',
      },
      { key: 'diasSemana', label: 'Días de la semana', type: 'multiselect', options: TODOS_LOS_DIAS, required: true },
      { key: 'fechaInicioVigencia', label: 'Inicio de vigencia', type: 'date', required: true },
      { key: 'fechaFinVigencia', label: 'Fin de vigencia', type: 'date', required: true },
      { key: 'temporada', label: 'Temporada', type: 'select', options: ['Todo el año', 'Alta', 'Baja'], required: true },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'], required: true },
      { key: 'duracionEstimada', label: 'Duración estimada', type: 'computed', compute: (row, catalogs) => `${scheduleDuration(row, catalogs)} min` },
      { key: 'horaLlegada', label: 'Hora de llegada', type: 'computed', compute: (row, catalogs) => scheduleArrival(row, catalogs) },
    ],
    custom: {
      diasSemana: (errors, row) => {
        if (!Array.isArray(row.diasSemana) || !row.diasSemana.length) errors.diasSemana = 'Selecciona al menos un día.'
      },
      fechaFinVigencia: (errors, row) => {
        if (row.fechaInicioVigencia && row.fechaFinVigencia && row.fechaFinVigencia < row.fechaInicioVigencia) {
          errors.fechaFinVigencia = 'El fin de vigencia no puede ser anterior al inicio.'
        }
      },
    },
    defaults: (catalogs) => ({
      codigoHorario: nextCode('HV', catalogs.horariosVuelo, 'codigoHorario'),
      codigoRuta: catalogs.rutas[0]?.codigoRuta || '',
      codigoAvion: catalogs.aviones[0]?.codigoAvion || '',
      horaSalida: '08:00',
      diasSemana: TODOS_LOS_DIAS,
      fechaInicioVigencia: iso(0),
      fechaFinVigencia: iso(90),
      temporada: 'Todo el año',
      estado: 'Activo',
    }),
  },
  {
    key: 'dispositivosCheckIn',
    name: 'Dispositivo de check-in',
    plural: 'Dispositivos de check-in',
    article: 'Nuevo',
    deleteNoun: 'dispositivo de check-in',
    softDelete: 'estado',
    searchable: ['codigoDispositivo', 'codigoAeropuerto', 'ubicacion', 'tipoDispositivo', 'estado'],
    columns: [
      { key: 'codigoDispositivo', label: 'Dispositivo' },
      { key: 'codigoAeropuerto', label: 'Aeropuerto' },
      { key: 'ubicacion', label: 'Ubicación' },
      { key: 'tipoDispositivo', label: 'Tipo' },
      { key: 'estado', label: 'Estado' },
    ],
    fields: [
      {
        key: 'codigoDispositivo',
        label: 'Código de dispositivo',
        type: 'text',
        required: true,
        unique: true,
        pattern: /^[A-Z0-9-]{3,20}$/,
        patternMessage: 'Usa de 3 a 20 caracteres: letras mayúsculas, números o guiones.',
        transform: (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      },
      {
        key: 'codigoAeropuerto',
        label: 'Aeropuerto',
        type: 'relation',
        relation: 'aeropuertos',
        optionLabel: (r) => `${r.codigoIATA} · ${r.nombreAeropuerto || r.ciudad || ''}`.trim(),
        required: true,
      },
      { key: 'ubicacion', label: 'Ubicación', type: 'text', required: true },
      { key: 'tipoDispositivo', label: 'Tipo de dispositivo', type: 'select', options: ['Kiosco', 'Lector'], required: true },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo', 'Fuera de servicio'], required: true },
    ],
    defaults: (catalogs) => ({
      codigoDispositivo: nextCode('KIO', catalogs.dispositivosCheckIn, 'codigoDispositivo'),
      codigoAeropuerto: catalogs.aeropuertos.find((a) => a.estado === 'Activo')?.codigoIATA || catalogs.aeropuertos[0]?.codigoIATA || '',
      tipoDispositivo: 'Kiosco',
      estado: 'Activo',
    }),
  },
]

const ALL_KEYS = SCHEMAS.map((s) => s.key)
const BASE_KEYS = ['aerolineas', 'aeropuertos', 'clases', 'rutas', 'tarifas', 'usuarios', 'aviones']

function nextCode(prefix, rows, key) {
  const used = new Set(rows.map((r) => String(r[key])))
  let n = rows.length + 1
  while (used.has(`${prefix}${String(n).padStart(3, '0')}`)) n += 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

export const isValidCatalogs = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  BASE_KEYS.every((key) => Array.isArray(value[key]))

export const normalizeCatalogs = (value, legacyAirports = {}) => {
  const seed = createSeedCatalogs(legacyAirports)
  if (!isValidCatalogs(value)) return seed
  return ALL_KEYS.reduce((acc, key) => {
    const fallback = seed[key] || []
    const stored = value[key]
    const merged = Array.isArray(stored)
      ? stored.map((row, i) => (row && typeof row === 'object' && !Array.isArray(row) ? { ...(fallback[i] || {}), ...row } : fallback[i] || {}))
      : fallback
    acc[key] = key === 'aviones' ? merged.map((row) => preparePlane(row)) : merged
    return acc
  }, {})
}

export const emptyRow = (schema, catalogs) => {
  const base = {}
  schema.fields.forEach((field) => {
    if (field.type === 'multiselect' || field.type === 'tramos') base[field.key] = []
    else if (field.type === 'number') base[field.key] = field.min ?? 0
    else base[field.key] = ''
  })
  return { ...base, ...(schema.defaults ? schema.defaults(catalogs) : {}) }
}

export function validateCatalogRow(schema, row, catalogs, editingKey = '') {
  const errors = {}
  const blank = (v) => v === '' || v === null || v === undefined

  schema.fields.forEach((field) => {
    if (field.type === 'computed') return
    const value = row[field.key]
    if (field.required && blank(value)) {
      errors[field.key] = `${field.label} es obligatorio.`
      return
    }
    if (blank(value)) return

    if (field.pattern && !field.pattern.test(String(value))) {
      errors[field.key] = field.patternMessage || 'El formato no es válido.'
    }

    if (field.unique && !errors[field.key]) {
      const duplicate = (catalogs[schema.key] || []).some(
        (other) => String(other[schema.pk]) !== String(editingKey) && String(other[field.key]).toLowerCase() === String(value).toLowerCase(),
      )
      if (duplicate) errors[field.key] = `El valor de ${field.label.toLowerCase()} ya está registrado.`
    }

    if (field.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) errors[field.key] = 'Escribe un número válido.'
      else if (field.min !== undefined && n < field.min) errors[field.key] = `El valor mínimo es ${field.min}.`
      else if (field.max !== undefined && n > field.max) errors[field.key] = `El valor máximo es ${field.max}.`
    }

    if (field.type === 'select' && field.options) {
      const allowed = field.options.map((o) => (typeof o === 'object' ? String(o.value) : o))
      if (!allowed.includes(String(value))) errors[field.key] = 'Selecciona una opción válida.'
    }

    if (field.type === 'relation' && !errors[field.key]) {
      const exists = (catalogs[field.relation] || []).some((r) => String(r[catalogKeyFor(field.relation)]) === String(value))
      if (!exists) errors[field.key] = 'Selecciona un registro válido.'
    }
  })

  Object.entries(schema.custom || {}).forEach(([field, validator]) => validator(errors, row, catalogs, editingKey))

  if (schema.softDelete) {
    const stateField = schema.fields.find((field) => field.key === schema.softDelete)
    const allowedStates = (stateField?.options || ['Activo', 'Inactivo']).map((option) =>
      typeof option === 'object' ? String(option.value) : String(option),
    )
    if (!allowedStates.includes(String(row[schema.softDelete]))) errors[schema.softDelete] = 'Selecciona un estado válido.'
  }

  if (Array.isArray(row.politicaCancelacion)) {
    row.politicaCancelacion.forEach((tramo, i) => {
      const horas = Number(tramo?.horasAntes)
      const porcentaje = Number(tramo?.porcentaje)
      if (!Number.isFinite(horas) || horas < 0 || !Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        errors.politicaCancelacion = `Revisa el tramo ${i + 1}.`
      }
    })
  }

  return errors
}

export function referentialBlock(schema, row, catalogs) {
  for (const ref of schema.referencedBy || []) {
    const count = (catalogs[ref.key] || []).filter((item) => ref.fields.some((field) => String(item[field]) === String(row[schema.pk]))).length
    if (count) {
      const noun = count === 1 ? ref.singular : ref.plural
      return `No puedes eliminar ${schema.deleteArticle || 'esta'} ${schema.deleteNoun}: tiene ${count} ${noun} asignados.`
    }
  }
  return ''
}

export const catalogKeyFor = (key) => {
  const schema = SCHEMAS.find((s) => s.key === key)
  return schema ? schema.pk : 'codigoAvion'
}

export const relationOptions = (field, catalogs) =>
  (catalogs[field.relation] || []).map((row) => ({
    value: String(row[catalogKeyFor(field.relation)]),
    label: field.optionLabel ? field.optionLabel(row) : String(row[catalogKeyFor(field.relation)]),
  }))
