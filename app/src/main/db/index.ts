import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { app } from 'electron'
import { migraciones } from './migraciones'

let db: DatabaseSync | null = null
let fotos = ''

export function abrirDb(ruta = join(app.getPath('userData'), 'ventas.db')): DatabaseSync {
  db = new DatabaseSync(ruta)
  // Las fotos de productos van en una carpeta junto a la base (en las pruebas, una temporal).
  fotos =
    ruta === ':memory:'
      ? join(tmpdir(), `ventas-fotos-${process.pid}`)
      : join(dirname(ruta), 'fotos')
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrar(db)
  return db
}

export function carpetaFotos(): string {
  if (!fotos) throw new Error('La base de datos no está abierta')
  mkdirSync(fotos, { recursive: true })
  return fotos
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('La base de datos no está abierta')
  return db
}

function migrar(db: DatabaseSync): void {
  const { user_version: actual } = db.prepare('PRAGMA user_version').get() as {
    user_version: number
  }
  for (let v = actual; v < migraciones.length; v++) {
    transaccion(db, () => {
      db.exec(migraciones[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

export function transaccion<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
