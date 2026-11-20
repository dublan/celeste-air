import { useEffect, useState } from 'react'

const PREFIX = 'celeste.'

export const KEYS = {
  bookings: PREFIX + 'bookings.v1',
  adminFlights: PREFIX + 'flights.v1',
  airports: PREFIX + 'airports.v1',
  catalogs: PREFIX + 'catalogs.v1',
  operations: PREFIX + 'operations.v1',
  audit: PREFIX + 'audit.v1',
  user: PREFIX + 'user.v1',
  ticket: PREFIX + 'ticket.v1',
  query: PREFIX + 'query.v1',
  clock: PREFIX + 'clock.v1',
  checkin: PREFIX + 'checkin.v1',
  pass: PREFIX + 'pass.v1',
  luggage: PREFIX + 'luggage.v1',
  payments: PREFIX + 'payments.v1',
  refunds: PREFIX + 'refunds.v1',
  deviceActivity: PREFIX + 'deviceActivity.v1',
  passengerProfiles: PREFIX + 'passengerProfiles.v1',
  seatHold: PREFIX + 'seatHold.v1',
}

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento disponible: la app sigue funcionando en memoria.
  }
}

export function clearPersisted() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key))
  } catch {
    // Sin almacenamiento disponible: no hay nada que borrar.
  }
}

export function usePersistedState(key, initial, isValid = () => true, normalize = (value) => value) {
  const [value, setValue] = useState(() => {
    const stored = read(key)
    if (stored !== undefined && isValid(stored)) return normalize(stored)
    return normalize(typeof initial === 'function' ? initial() : initial)
  })

  useEffect(() => {
    write(key, value)
  }, [key, value])

  return [value, setValue]
}
