import assert from 'node:assert/strict'
const m = await import(process.env.BUNDLE)
const { abrirDb, u } = m.default
abrirDb(':memory:')
const admin = u.crearPrimerAdmin('admin', 'secreto1')
const caja = u.crearUsuario('caja1', 'secreto1', 'cajero')

// Uno mismo no se toca desde la lista: así siempre queda un admin activo.
assert.throws(() => u.activarUsuario(admin.id, false), /propio/)
assert.throws(() => u.cambiarRol(admin.id, 'cajero'), /propio/)
assert.throws(() => u.cambiarRol(caja.id, 'jefe'), /Rol/)
assert.equal(u.cambiarRol(caja.id, 'admin').rol, 'admin')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
// Ahora caja1 es admin: puede bajar a admin, porque queda caja1.
assert.equal(u.cambiarRol(admin.id, 'cajero').rol, 'cajero')
assert.equal(u.cambiarRol(admin.id, 'admin').rol, 'admin')
u.activarUsuario(admin.id, false)
u.cerrarSesion()
assert.throws(() => u.iniciarSesion('admin', 'secreto1'), /desactivado/)
u.iniciarSesion('caja1', 'secreto1')
u.activarUsuario(admin.id, true)
u.cerrarSesion()

// admin baja a caja1 y le pone otra contraseña.
u.iniciarSesion('admin', 'secreto1')
u.cambiarRol(caja.id, 'cajero')
assert.throws(() => u.restablecerClave(caja.id, '123'), /6 caracteres/)
u.restablecerClave(caja.id, 'nueva123')
u.cerrarSesion()
assert.throws(() => u.iniciarSesion('caja1', 'secreto1'), /incorrectos/)
u.iniciarSesion('caja1', 'nueva123')

// El cajero no administra, pero cambia la suya confirmando la actual.
assert.throws(() => u.activarUsuario(admin.id, false), /administrador/)
assert.throws(() => u.cambiarMiClave('mal', 'otra123'), /actual/)
u.cambiarMiClave('nueva123', 'otra123')
u.cerrarSesion()
u.iniciarSesion('caja1', 'otra123')
u.cerrarSesion()
console.log('OK: todas las pruebas pasaron')
