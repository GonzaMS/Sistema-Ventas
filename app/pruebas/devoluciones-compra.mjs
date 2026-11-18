import assert from 'node:assert/strict'
const { abrirDb, u, p, v, k, co } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const prod = p.crearProducto({
  codigo: 'M1',
  nombre: 'Media',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: null,
  proveedor: null,
  stock: 0,
  stockMinimo: 0,
  precioCompra: 0,
  precioVenta: 20000,
  vencimiento: null
})
const stock = () => p.productoPorCodigo('M1').stock
const ef = () => k.cajaActual().resumen.find((r) => r.metodo === 'efectivo')
k.abrirCaja(100000)

// Compré 10 a 8.000 con plata de la caja (80.000): devuelvo 1 y el proveedor me da 8.000.
const compra = co.registrarCompra({
  proveedor: 'Prov X',
  items: [{ productoId: prod.id, cantidad: 10, costo: 8000 }],
  metodoPago: 'efectivo',
  observacion: null
})
assert.equal(ef().esperado, 20000)
const item = compra.items[0]
assert.throws(
  () => co.devolverCompra(compra.id, [{ itemId: item.id, cantidad: 11 }], 'x', 'efectivo'),
  /se pueden devolver 10/
)
assert.throws(
  () => co.devolverCompra(compra.id, [{ itemId: item.id, cantidad: 1 }], ' ', 'efectivo'),
  /motivo/
)
let c = co.devolverCompra(compra.id, [{ itemId: item.id, cantidad: 1 }], 'Vino fallada', 'efectivo')
assert.equal(c.devuelto, 8000)
assert.equal(c.items[0].devueltos, 1)
assert.equal(c.cajaId, k.cajaActual().id, 'la caja de la compra sigue siendo la del egreso')
assert.equal(stock(), 9)
assert.equal(ef().esperado, 28000, 'entraron los 8.000')
const mov = k.cajaActual().movimientos.find((m) => m.categoria === 'Devolución de compra')
assert.equal(mov.tipo, 'ingreso')
assert.throws(() => k.anularMovimiento(mov.id, 'x'), /Compras/)
assert.throws(() => co.anularCompra(compra.id, 'x'), /devoluciones/)

// Sin plata: queda a favor con el proveedor, la caja no cambia.
c = co.devolverCompra(compra.id, [{ itemId: item.id, cantidad: 2 }], 'Crédito', null)
assert.equal(c.devuelto, 24000)
assert.equal(stock(), 7)
assert.equal(ef().esperado, 28000)

// No se puede devolver lo que ya se vendió.
v.registrarVenta({
  clienteId: null,
  items: [{ productoId: prod.id, cantidad: 6 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: null
})
assert.throws(
  () => co.devolverCompra(compra.id, [{ itemId: item.id, cantidad: 2 }], 'x', null),
  /quedan 1/
)

// Una compra fuera de caja sigue figurando fuera de caja aunque el proveedor devuelva plata.
const fuera = co.registrarCompra({
  proveedor: null,
  items: [{ productoId: prod.id, cantidad: 4, costo: 5000 }],
  metodoPago: null,
  observacion: null
})
c = co.devolverCompra(fuera.id, [{ itemId: fuera.items[0].id, cantidad: 1 }], 'x', 'efectivo')
assert.equal(c.cajaId, null)
assert.equal(c.metodoPago, null)

u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
assert.throws(
  () => co.devolverCompra(fuera.id, [{ itemId: fuera.items[0].id, cantidad: 1 }], 'x', null),
  /administrador/
)
console.log('OK: todas las pruebas pasaron')
