import assert from 'node:assert/strict'
const { abrirDb, u, p, v, k } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const prod = (codigo, stock, precio) =>
  p.crearProducto({
    codigo,
    nombre: codigo,
    descripcion: null,
    unidad: 'Unidad',
    categoria: null,
    familia: null,
    proveedor: null,
    stock,
    stockMinimo: 0,
    precioCompra: 0,
    precioVenta: precio,
    vencimiento: null
  })
const r = prod('R1', 10, 60000)
const vender = (metodoPago, cant = 1) =>
  v.registrarVenta({
    clienteId: null,
    items: [{ productoId: r.id, cantidad: cant }],
    descuento: 0,
    metodoPago
  })
const res = (c, m) => c.resumen.find((x) => x.metodo === m)

assert.equal(k.cajaActual(), null)
assert.throws(() => vender('efectivo'), /caja está cerrada/)
let c = k.abrirCaja(100000)
assert.throws(() => k.abrirCaja(0), /Ya hay una caja abierta/)
const v1 = vender('efectivo', 2)
vender('qr')
const cat = k.categoriasCaja()
assert.ok(cat.some((x) => x.sistema && x.nombre === 'Devolución de venta'))
const merc = cat.find((x) => x.nombre === 'Mercadería'),
  otrosIng = cat.find((x) => x.tipo === 'ingreso' && !x.sistema),
  devol = cat.find((x) => x.nombre === 'Devolución de venta')
assert.throws(
  () =>
    k.registrarMovimiento({
      tipo: 'ingreso',
      categoriaId: merc.id,
      descripcion: null,
      monto: 1,
      metodoPago: 'efectivo'
    }),
  /Categoría/
)
assert.throws(
  () =>
    k.registrarMovimiento({
      tipo: 'egreso',
      categoriaId: devol.id,
      descripcion: null,
      monto: 1,
      metodoPago: 'efectivo'
    }),
  /Categoría/
)
assert.throws(
  () =>
    k.registrarMovimiento({
      tipo: 'egreso',
      categoriaId: merc.id,
      descripcion: null,
      monto: 0,
      metodoPago: 'efectivo'
    }),
  /mayor a cero/
)
c = k.registrarMovimiento({
  tipo: 'egreso',
  categoriaId: merc.id,
  descripcion: 'Proveedor X',
  monto: 30000,
  metodoPago: 'efectivo'
})
c = k.registrarMovimiento({
  tipo: 'ingreso',
  categoriaId: otrosIng.id,
  descripcion: null,
  monto: 5000,
  metodoPago: 'efectivo'
})
const malo = k.registrarMovimiento({
  tipo: 'egreso',
  categoriaId: merc.id,
  descripcion: 'error',
  monto: 99999,
  metodoPago: 'efectivo'
}).movimientos[0]
c = k.anularMovimiento(malo.id, 'cargado dos veces')
assert.equal(res(c, 'efectivo').esperado, 100000 + 120000 - 30000 + 5000)
assert.equal(res(c, 'qr').esperado, 60000)
assert.equal(c.cantidadVentas, 2)
// anular venta de la caja abierta: deja de contar
c = (v.anularVenta(v1.id, 'talle'), k.cajaActual())
assert.equal(res(c, 'efectivo').ventas, 0)
assert.equal(c.movimientos.filter((m) => m.ventaId).length, 0)
const v3 = vender('efectivo')
assert.throws(() => k.cerrarCaja({ efectivo: 1 }, null), /Falta el monto contado/)
c = k.cerrarCaja({ efectivo: 130000, transferencia: 0, tarjeta: 0, qr: 60000 }, 'faltan 5.000')
assert.equal(res(c, 'efectivo').esperado, 135000)
assert.equal(res(c, 'efectivo').contado, 130000)
assert.equal(k.cajaActual(), null)
// anular venta de caja cerrada: exige caja abierta y genera devolución; la cerrada no cambia
assert.throws(() => v.anularVenta(v3.id, 'devolvió'), /caja está cerrada/)
assert.equal(
  v.ventasDelDia(v3.fecha.slice(0, 10)).find((x) => x.id === v3.id).anulada,
  false,
  'rollback'
)
k.abrirCaja(50000)
v.anularVenta(v3.id, 'devolvió')
const nueva = k.cajaActual()
assert.equal(res(nueva, 'efectivo').egresos, 60000)
assert.equal(res(nueva, 'efectivo').esperado, -10000)
assert.throws(() => k.anularMovimiento(nueva.movimientos[0].id, 'x'), /anular o devolver una venta/)
const hist = k.listarCajas()
assert.equal(hist.length, 1)
assert.equal(res(hist[0], 'efectivo').esperado, 135000, 'la cerrada no cambia')
assert.equal(p.productoPorCodigo('R1').stock, 9)
u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
assert.throws(() => k.listarCajas(), /administrador/)
assert.throws(() => k.anularMovimiento(1, 'x'), /administrador/)
k.cerrarCaja({ efectivo: 0, transferencia: 0, tarjeta: 0, qr: 0 }, null)
console.log('OK: caja')
