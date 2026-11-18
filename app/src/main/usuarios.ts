import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from './db'
import type { Rol, Usuario } from '../shared/tipos'

// Sesión del único puesto: el usuario que inició sesión en esta ventana.
let actual: Usuario | null = null

export function usuarioActual(): Usuario {
  if (!actual) throw new Error('Sesión no iniciada')
  return actual
}

export function exigirAdmin(): Usuario {
  const u = usuarioActual()
  if (u.rol !== 'admin') throw new Error('Solo un administrador puede hacer esto')
  return u
}

function hashClave(clave: string): string {
  const sal = randomBytes(16)
  return `${sal.toString('hex')}:${scryptSync(clave, sal, 64).toString('hex')}`
}

function claveCorrecta(clave: string, guardado: string): boolean {
  const [sal, hash] = guardado.split(':')
  const calculado = scryptSync(clave, Buffer.from(sal, 'hex'), 64)
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'))
}

function validar(usuario: string, clave: string): void {
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario))
    throw new Error('El usuario debe tener de 3 a 30 letras, números, punto o guion')
  if (clave.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
}

type FilaUsuario = { id: number; usuario: string; rol: Rol; activo: number; clave_hash: string }

const aUsuario = (f: FilaUsuario): Usuario => ({
  id: f.id,
  usuario: f.usuario,
  rol: f.rol,
  activo: f.activo === 1
})

export function hayUsuarios(): boolean {
  return getDb().prepare('SELECT 1 FROM usuarios LIMIT 1').get() !== undefined
}

function insertar(usuario: string, clave: string, rol: Rol): Usuario {
  validar(usuario, clave)
  const db = getDb()
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(usuario))
    throw new Error('Ya existe un usuario con ese nombre')
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (usuario, clave_hash, rol) VALUES (?, ?, ?)')
    .run(usuario, hashClave(clave), rol)
  return { id: Number(lastInsertRowid), usuario, rol, activo: true }
}

// Primer arranque: se crea el administrador y queda con la sesión iniciada.
export function crearPrimerAdmin(usuario: string, clave: string): Usuario {
  if (hayUsuarios()) throw new Error('El sistema ya tiene usuarios')
  actual = insertar(usuario, clave, 'admin')
  auditar('crear', 'usuario', actual.id, usuario)
  return actual
}

export function crearUsuario(usuario: string, clave: string, rol: Rol): Usuario {
  exigirAdmin()
  const u = insertar(usuario, clave, rol)
  auditar('crear', 'usuario', u.id, `${usuario} (${rol})`)
  return u
}

export function iniciarSesion(usuario: string, clave: string): Usuario {
  const fila = getDb().prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario) as
    FilaUsuario | undefined
  if (!fila || !claveCorrecta(clave, fila.clave_hash))
    throw new Error('Usuario o contraseña incorrectos')
  if (!fila.activo) throw new Error('El usuario está desactivado')
  actual = aUsuario(fila)
  auditar('iniciar_sesion', 'usuario', actual.id, null)
  return actual
}

export function cerrarSesion(): void {
  actual = null
}

export function sesion(): Usuario | null {
  return actual
}

export function listarUsuarios(): Usuario[] {
  exigirAdmin()
  const filas = getDb().prepare('SELECT * FROM usuarios ORDER BY usuario').all() as FilaUsuario[]
  return filas.map(aUsuario)
}

// Nadie se desactiva ni se cambia el rol a sí mismo: como quien lo hace es un administrador
// activo, siempre queda al menos uno.
function otroUsuario(id: number): FilaUsuario {
  const yo = exigirAdmin()
  if (id === yo.id) throw new Error('No podés cambiar tu propio usuario desde acá')
  const f = getDb().prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as
    FilaUsuario | undefined
  if (!f) throw new Error('El usuario no existe')
  return f
}

export function cambiarRol(id: number, rol: Rol): Usuario {
  if (rol !== 'admin' && rol !== 'cajero') throw new Error('Rol no válido')
  const f = otroUsuario(id)
  getDb().prepare('UPDATE usuarios SET rol = ? WHERE id = ?').run(rol, id)
  auditar('modificar', 'usuario', id, `${f.usuario}: rol ${rol}`)
  return aUsuario({ ...f, rol })
}

export function activarUsuario(id: number, activo: boolean): Usuario {
  const f = otroUsuario(id)
  getDb()
    .prepare('UPDATE usuarios SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id)
  auditar(activo ? 'activar' : 'desactivar', 'usuario', id, f.usuario)
  return aUsuario({ ...f, activo: activo ? 1 : 0 })
}

// El administrador le pone una contraseña nueva a otro usuario (si se la olvidó).
export function restablecerClave(id: number, clave: string): void {
  const f = otroUsuario(id)
  validar(f.usuario, clave)
  getDb().prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hashClave(clave), id)
  auditar('cambiar_clave', 'usuario', id, `${f.usuario}, por el administrador`)
}

// Cualquier usuario cambia la suya, confirmando la actual.
export function cambiarMiClave(actualClave: string, nueva: string): void {
  const u = usuarioActual()
  const f = getDb().prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id) as FilaUsuario
  if (!claveCorrecta(actualClave, f.clave_hash))
    throw new Error('La contraseña actual no es correcta')
  validar(f.usuario, nueva)
  getDb().prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hashClave(nueva), u.id)
  auditar('cambiar_clave', 'usuario', u.id, f.usuario)
}

export function auditar(
  accion: string,
  entidad: string,
  entidadId: number | null,
  detalle: string | null
): void {
  getDb()
    .prepare(
      'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?)'
    )
    .run(actual?.id ?? null, accion, entidad, entidadId, detalle)
}
