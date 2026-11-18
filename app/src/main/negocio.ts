import { getDb } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import type { Configuracion, Negocio } from '../shared/tipos'

export function datosNegocio(): Negocio {
  usuarioActual()
  return getDb()
    .prepare('SELECT nombre, ruc, direccion, telefono FROM negocio WHERE id = 1')
    .get() as unknown as Negocio
}

export function configuracion(): Configuracion {
  usuarioActual()
  const f = getDb().prepare('SELECT arqueo_ciego FROM negocio WHERE id = 1').get() as {
    arqueo_ciego: number
  }
  return { arqueoCiego: f.arqueo_ciego === 1 }
}

export function guardarConfiguracion(c: Configuracion): Configuracion {
  exigirAdmin()
  getDb()
    .prepare('UPDATE negocio SET arqueo_ciego = ? WHERE id = 1')
    .run(c.arqueoCiego ? 1 : 0)
  auditar('modificar', 'configuracion', 1, `Arqueo ciego: ${c.arqueoCiego ? 'sí' : 'no'}`)
  return configuracion()
}

// El usuario actual cierra la caja sin ver lo esperado.
export function arqueoCiegoParaMi(): boolean {
  return usuarioActual().rol !== 'admin' && configuracion().arqueoCiego
}
