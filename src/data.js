import { planeForModel } from './seats'

export const COP = (n) => '$' + Math.round(n).toLocaleString('es-CO')

const hh = (s) => {
  let x = 0
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0
  return x
}

export const rnd = (k) => {
  let s = hh(k)
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

export const AP = {
  BAQ: { c: 'Barranquilla', n: 'Ernesto Cortissoz', i: 0, t: 'Carnaval, río y Caribe' },
  BOG: { c: 'Bogotá', n: 'El Dorado', i: 0, t: 'Capital a 2.600 metros' },
  MDE: { c: 'Medellín', n: 'José María Córdova', i: 0, t: 'Eterna primavera' },
  CTG: { c: 'Cartagena', n: 'Rafael Núñez', i: 0, t: 'Murallas frente al mar' },
  CLO: { c: 'Cali', n: 'Alfonso Bonilla Aragón', i: 0, t: 'Capital de la salsa' },
  PTY: { c: 'Ciudad de Panamá', n: 'Tocumen', i: 1, t: 'El canal entre océanos' },
  MIA: { c: 'Miami', n: 'Miami Intl', i: 1, t: 'Sol y Art Déco' },
  MAD: { c: 'Madrid', n: 'Barajas', i: 2, t: 'Cielo claro de la meseta' },
}

const MOD = ['Airbus A320', 'Boeing 737-800', 'Embraer E190', 'Airbus A321']

export function flights(o, d, date) {
  const r = rnd(o + d + date)
  const lv = Math.max(AP[o].i, AP[d].i)
  const dur = 55 + (hh([o, d].sort().join()) % 55) + [0, 150, 560][lv]
  const base = 60000 + dur * 1100
  return [6, 9, 12, 15, 19].map((h, i) => {
    const s = h * 60 + Math.floor(r() * 4) * 15
    const mod = MOD[Math.floor(r() * 4)]
    return {
      id: 'CL' + (100 + Math.floor(r() * 800)),
      o,
      d,
      date,
      s,
      e: s + dur,
      dur,
      price: Math.round((base * (0.85 + r() * 0.5)) / 1000) * 1000,
      mod,
      codigoAvion: planeForModel(mod),
      st: i == 3 && r() > 0.4 ? 'Retrasado' : 'Programado',
      gate: 'B' + (1 + Math.floor(r() * 18)),
      term: 1 + Math.floor(r() * 2),
    }
  })
}

export const ROWS = 18
export const COLS = 'ABCDEF'
export const cab = (r) => (r <= 2 ? ['Primera', 3.6] : r <= 5 ? ['Business', 2.4] : ['Económica', 1])
export const sp = (f, id) => Math.round((f.price * cab(parseInt(id))[1]) / 1000) * 1000

export function taken(f, filas = ROWS, columnas = COLS) {
  const r = rnd(f.id + f.date)
  const t = new Set()
  for (let i = 1; i <= filas; i++)
    for (const c of columnas) if (r() < 0.32) t.add(i + c)
  return t
}

export const iso = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function mk(o, d, n, nm, seats, est) {
  const f = flights(o, d, iso(n))[1]
  return {
    code: 'RS' + hh(o + d + n).toString(36).slice(0, 5).toUpperCase(),
    fl: f,
    pax: nm.map((x) => ({ n: x[0], a: x[1], doc: 'CC ' + (1000000 + (hh(x[1]) % 9000000)) })),
    seats,
    total: seats.reduce((a, s) => a + sp(f, s), 0) * 1.08,
    est,
  }
}

export const BOOK = [
  mk('BAQ', 'MDE', 5, [['Laura', 'Gómez']], ['12C'], 'Confirmada'),
  mk('BOG', 'BAQ', -20, [['Laura', 'Gómez'], ['Mateo', 'Gómez']], ['9A', '9B'], 'Finalizada'),
]

export const ADM = [['BAQ', 'BOG'], ['BAQ', 'MDE'], ['BOG', 'MAD'], ['CTG', 'MIA']].flatMap(([o, d]) =>
  flights(o, d, iso(0)).slice(0, 2),
)

export const tm = (t) => {
  t %= 1440
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0')
}
export const du = (m) => Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'
export const fd = (d) =>
  new Date(d + 'T12:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })

export const IMAGES = {
  hero: '/photos/hero.webp',
  BAQ: '/photos/barranquilla.webp',
  BOG: '/photos/bogota.webp',
  MDE: '/photos/medellin.webp',
  CTG: '/photos/cartagena.webp',
  CLO: '/photos/cali.webp',
  PTY: '/photos/panama.webp',
  MIA: '/photos/miami.webp',
  MAD: '/photos/madrid.webp',
}

export const CREDITS = [
  {
    city: 'Portada',
    author: 'Harry Knight',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:In_flight_above_scattered_clouds_(Unsplash).jpg',
  },
  {
    city: 'Barranquilla',
    author: 'Felipe Restrepo Acosta',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:2019_Barranquilla_(Colombia)_-_Fachada_del_Teatro_Col%C3%B3n.jpg',
  },
  {
    city: 'Bogotá',
    author: 'Elviper',
    license: 'dominio público',
    url: 'https://commons.wikimedia.org/wiki/File:Cerros_orientales_Bogota.jpg',
  },
  {
    city: 'Medellín',
    author: 'CONOCER (Wikivoyage)',
    license: 'dominio público',
    url: 'https://commons.wikimedia.org/wiki/File:Valley_of_Medell%C3%ADn-_skyline.jpg',
  },
  {
    city: 'Cartagena',
    author: 'Leon petrosyan',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Cartagena,_view_from_old_city_walls.jpg',
  },
  {
    city: 'Cali',
    author: 'Mario Carvajal',
    license: 'CC BY 2.0',
    url: 'https://commons.wikimedia.org/wiki/File:Cristo_Rey_en_Cali,_Colombia.jpg',
  },
  {
    city: 'Ciudad de Panamá',
    author: 'Dr. Thomas Liptak',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Panama_City_Skyline_1.jpg',
  },
  {
    city: 'Miami',
    author: 'Robbschultz69',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Ocean_Drive_in_the_Miami_Beach_Art_Deco_Historic_District.jpg',
  },
  {
    city: 'Madrid',
    author: 'ajay_suresh',
    license: 'CC BY 2.0',
    url: 'https://commons.wikimedia.org/wiki/File:Gran_Via_-_Madrid_-_52108703031.jpg',
  },
]
