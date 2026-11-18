import assert from 'node:assert/strict'
const { abrirDb, u, p, c, v, k, q } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const r = p.crearProducto({
  codigo: 'R',
  nombre: 'R',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: null,
  proveedor: null,
  stock: 10,
  stockMinimo: 0,
  precioCompra: 0,
  precioVenta: 300000,
  vencimiento: null
})
const ana = c.crearCliente({
  nombre: 'Ana',
  documento: '111',
  telefono: '0981 123 456',
  direccion: null
})
const beto = c.crearCliente({ nombre: 'Beto', documento: '222', telefono: null, direccion: null })
// editar cliente
assert.throws(
  () =>
    c.editarCliente(ana.id, { nombre: 'Ana', documento: '222', telefono: null, direccion: null }),
  /Ya existe/
)
c.editarCliente(ana.id, {
  nombre: ' Ana López ',
  documento: '111',
  telefono: '0991 000 111',
  direccion: 'Luque'
})
assert.equal(c.buscarClientes('López')[0].direccion, 'Luque')
assert.throws(
  () => c.editarCliente(ana.id, { nombre: ' ', documento: null, telefono: null, direccion: null }),
  /nombre/
)
// clientes sin saldo
assert.equal(q.clientesConSaldo('', false).length, 0)
assert.equal(q.clientesConSaldo('', false, true).length, 2)
const ef = () => k.cajaActual().resumen.find((x) => x.metodo === 'efectivo')
const tr = () => k.cajaActual().resumen.find((x) => x.metodo === 'transferencia')
// venta en cuotas con entrega y pagos en una caja que después cierra
k.abrirCaja(0)
const v1 = v.registrarVenta({
  clienteId: ana.id,
  items: [{ productoId: r.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 3, entrega: 60000 }
}) // 3 x 80000
q.cobrarCuotas(ana.id, 80000, 'transferencia')
k.cerrarCaja({ efectivo: 60000, transferencia: 80000, tarjeta: 0, qr: 0 }, null)
k.abrirCaja(0)
const v2 = v.registrarVenta({
  clienteId: ana.id,
  items: [{ productoId: r.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 2, entrega: 0 }
}) // 2 x 150000
// pago que cubre v2 cuota 1 (vence 18/12, antes) y parte de v1 cuota 2 (vence 18/01)
const mixto = q.cobrarCuotas(ana.id, 170000, 'efectivo')
assert.deepEqual(
  mixto.aplicado.map((a) => [a.ventaId, a.monto]),
  [
    [v2.id, 150000],
    [v1.id, 20000]
  ]
)
// anular v1: se devuelve lo pagado de v1 = entrega 60000 (caja cerrada, efectivo) + 80000 (cerrada, transferencia) + 20000 (mixto, abierta, efectivo)
v.anularVenta(v1.id, 'devolvió la prenda')
assert.equal(ef().egresos, 80000)
assert.equal(tr().egresos, 80000)
assert.equal(
  k.listarCajas()[0].resumen.find((x) => x.metodo === 'efectivo').esperado,
  60000,
  'la cerrada no cambia'
)
assert.equal(q.cuentaCliente(ana.id).saldo, 150000, 'solo queda v2 menos su cuota 1')
assert.equal(p.productoPorCodigo('R').stock, 9)
// pago solo de v2 en la caja abierta: al anular v2 se anula el pago (sin egreso)
const solo = q.cobrarCuotas(ana.id, 50000, 'qr')
v.anularVenta(v2.id, 'otra')
assert.equal(q.cuentaCliente(ana.id).cobros.find((x) => x.id === solo.id).anulado, true)
assert.equal(k.cajaActual().resumen.find((x) => x.metodo === 'qr').cobros, 0)
assert.equal(ef().egresos, 80000 + 150000, 'la parte de v2 del pago mixto se devuelve como egreso')
assert.equal(q.cuentaCliente(ana.id).saldo, 0)
// anular pago de una caja cerrada
const v3 = v.registrarVenta({
  clienteId: beto.id,
  items: [{ productoId: r.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 2, entrega: 0 }
})
const pb = q.cobrarCuotas(beto.id, 150000, 'tarjeta')
const e = k.cajaActual().resumen
k.cerrarCaja(Object.fromEntries(e.map((x) => [x.metodo, Math.max(x.esperado, 0)])), null)
assert.throws(() => q.anularCobro(pb.id, 'x'), /caja está cerrada/)
k.abrirCaja(0)
q.anularCobro(pb.id, 'cobrado dos veces')
const corr = k.cajaActual().movimientos[0]
assert.equal(corr.categoria, 'Corrección')
assert.equal(corr.cobroId, pb.id)
assert.equal(corr.metodoPago, 'tarjeta')
assert.throws(() => k.anularMovimiento(corr.id, 'x'), /corrección/)
assert.equal(q.cuentaCliente(beto.id).saldo, 300000)
assert.throws(() => q.anularCobro(pb.id, 'x'), /ya está anulado/)
console.log('OK: cuotas 2', v3.id > 0)
