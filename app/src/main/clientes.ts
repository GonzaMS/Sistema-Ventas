import { getDb } from './db'
import { auditar, usuarioActual } from './usuarios'
import type { Cliente, ClienteNuevo } from '../shared/tipos'

const COLUMNAS = 'id, nombre, documento, telefono, direccion'

export function buscarClientes(texto: string): Cliente[] {
  usuarioActual()
  const patron = `%${texto.trim()}%`
  return getDb()
    .prepare(
      `SELECT ${COLUMNAS} FROM clientes
       WHERE activo = 1 AND (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)
       ORDER BY nombre LIMIT 50`
    )
    .all(patron, patron, patron) as unknown as Cliente[]
}

function limpiar(datos: ClienteNuevo, salvoId = 0): ClienteNuevo {
  const opcional = (s: string | null): string | null => s?.trim() || null
  const c: ClienteNuevo = {
    nombre: datos.nombre.trim(),
    documento: opcional(datos.documento),
    telefono: opcional(datos.telefono),
    direccion: opcional(datos.direccion)
  }
  if (!c.nombre) throw new Error('Falta el nombre del cliente')
  if (
    c.documento &&
    getDb()
      .prepare('SELECT 1 FROM clientes WHERE activo = 1 AND documento = ? AND id <> ?')
      .get(c.documento, salvoId)
  )
    throw new Error(`Ya existe un cliente con el documento ${c.documento}`)
  return c
}

// El cajero también puede dar de alta clientes: se hace en el mostrador, al vender.
export function crearCliente(datos: ClienteNuevo): Cliente {
  usuarioActual()
  const c = limpiar(datos)
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO clientes (nombre, documento, telefono, direccion) VALUES (?, ?, ?, ?)')
    .run(c.nombre, c.documento, c.telefono, c.direccion)
  const id = Number(lastInsertRowid)
  auditar('crear', 'cliente', id, c.nombre)
  return { id, ...c }
}

// También el cajero: el teléfono o la dirección se actualizan en el mostrador.
export function editarCliente(id: number, datos: ClienteNuevo): Cliente {
  usuarioActual()
  const c = limpiar(datos, id)
  const { changes } = getDb()
    .prepare(
      'UPDATE clientes SET nombre = ?, documento = ?, telefono = ?, direccion = ? WHERE id = ? AND activo = 1'
    )
    .run(c.nombre, c.documento, c.telefono, c.direccion, id)
  if (!changes) throw new Error('El cliente no existe')
  auditar('modificar', 'cliente', id, c.nombre)
  return { id, ...c }
}
