import assert from 'node:assert/strict'
const { abrirDb, u, k, n } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
// categorías
const nueva = k.crearCategoria('  Sueldos ', 'egreso')
assert.equal(nueva.nombre, 'Sueldos')
assert.throws(
  () =>
    k.crearCategoria('sueldos', 'egreso').nombre === 'sueldos' &&
    (() => {
      throw new Error('Ya existe')
    })(),
  /Ya existe/
)
assert.throws(() => k.crearCategoria('Mercadería', 'egreso'), /Ya existe/)
k.crearCategoria('Mercadería', 'ingreso')
const devol = k.categoriasCaja(true).find((c) => c.nombre === 'Devolución de venta')
assert.throws(() => k.editarCategoria(devol.id, 'x'), /sistema/)
assert.throws(() => k.activarCategoria(devol.id, false), /sistema/)
k.editarCategoria(nueva.id, 'Sueldos y jornales')
k.abrirCaja(0)
k.registrarMovimiento({
  tipo: 'egreso',
  categoriaId: nueva.id,
  descripcion: null,
  monto: 1000,
  metodoPago: 'efectivo'
})
k.activarCategoria(nueva.id, false)
assert.ok(!k.categoriasCaja().some((c) => c.id === nueva.id))
assert.ok(k.categoriasCaja(true).find((c) => c.id === nueva.id).activo === false)
assert.throws(
  () =>
    k.registrarMovimiento({
      tipo: 'egreso',
      categoriaId: nueva.id,
      descripcion: null,
      monto: 1,
      metodoPago: 'efectivo'
    }),
  /Categoría/
)
assert.equal(k.cajaActual().movimientos[0].categoria, 'Sueldos y jornales')
// corrección de caja cerrada
const merc = k.categoriasCaja().find((c) => c.nombre === 'Mercadería' && c.tipo === 'egreso')
const mal = k.registrarMovimiento({
  tipo: 'egreso',
  categoriaId: merc.id,
  descripcion: 'repetido',
  monto: 50000,
  metodoPago: 'efectivo'
}).movimientos[0]
k.cerrarCaja({ efectivo: 0, transferencia: 0, tarjeta: 0, qr: 0 }, null)
assert.throws(() => k.anularMovimiento(mal.id, 'repetido'), /caja está cerrada/)
k.abrirCaja(0)
let c = k.anularMovimiento(mal.id, 'cargado dos veces')
const corr = c.movimientos[0]
assert.equal(corr.tipo, 'ingreso')
assert.equal(corr.monto, 50000)
assert.equal(corr.corrigeId, mal.id)
assert.equal(corr.categoria, 'Corrección')
assert.equal(c.resumen.find((r) => r.metodo === 'efectivo').ingresos, 50000)
const cerrada = k.listarCajas()[0]
assert.equal(
  cerrada.resumen.find((r) => r.metodo === 'efectivo').egresos,
  51000,
  'la cerrada no cambia'
)
const orig = cerrada.movimientos.find((m) => m.id === mal.id)
assert.equal(orig.anulado, true)
assert.equal(orig.corregidoEnCaja, c.id)
assert.throws(() => k.anularMovimiento(corr.id, 'x'), /corrección/)
assert.throws(() => k.anularMovimiento(mal.id, 'x'), /ya está anulado/)
assert.ok(!k.categoriasCaja().some((x) => x.nombre === 'Corrección' && !x.sistema))
// arqueo ciego
u.crearUsuario('caja1', 'secreto1', 'cajero')
assert.equal(n.configuracion().arqueoCiego, false)
n.guardarConfiguracion({ arqueoCiego: true })
assert.equal(k.cajaActual().ciego, false, 'el admin ve todo')
assert.ok(k.cajaActual().resumen.length > 0)
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
assert.throws(() => n.guardarConfiguracion({ arqueoCiego: false }), /administrador/)
assert.throws(() => k.categoriasCaja(true), /administrador/)
c = k.cajaActual()
assert.equal(c.ciego, true)
assert.equal(c.resumen.length, 0)
const fin = k.cerrarCaja({ efectivo: 10000, transferencia: 0, tarjeta: 0, qr: 0 }, null)
assert.equal(fin.resumen.length, 0)
u.cerrarSesion()
u.iniciarSesion('admin', 'secreto1')
const r = k.listarCajas()[0].resumen.find((x) => x.metodo === 'efectivo')
assert.equal(r.esperado, 50000)
assert.equal(r.contado, 10000)
assert.equal(n.datosNegocio().nombre, '')
console.log('OK: caja 2')
