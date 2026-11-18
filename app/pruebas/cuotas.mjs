import assert from 'node:assert/strict'
const { abrirDb, getDb, u, p, c, v, k, q, cal } = (await import(process.env.BUNDLE)).default
// calendario
assert.deepEqual(
  ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'].map((_, i) =>
    cal.sumarMeses('2026-01-31', i)
  ),
  ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
)
assert.equal(cal.sumarMeses('2026-11-18', 3), '2027-02-18')
assert.equal(cal.sumarMeses('2027-12-29', 2), '2028-02-29')
assert.deepEqual(
  cal.calendarioCuotas('2026-11-18', 3, 100000).map((x) => x.monto),
  [33333, 33333, 33334]
)

abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const r = p.crearProducto({
  codigo: 'R1',
  nombre: 'Campera',
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
const ana = c.crearCliente({ nombre: 'Ana', documento: '111', telefono: null, direccion: null })
k.abrirCaja(0)
const venderCuotas = (cantidad, entrega, clienteId = ana.id, metodoPago = 'efectivo') =>
  v.registrarVenta({
    clienteId,
    items: [{ productoId: r.id, cantidad: 1 }],
    descuento: 0,
    metodoPago,
    cuotas: { cantidad, entrega }
  })
assert.throws(() => venderCuotas(3, 0, null), /elegir el cliente/)
assert.throws(() => venderCuotas(0, 0), /de 1 a 36/)
assert.throws(() => venderCuotas(3, 300000), /registrala de contado/)
const v1 = venderCuotas(3, 60000) // saldo 240000 → 3 x 80000
assert.equal(v1.condicion, 'cuotas')
assert.equal(v1.entrega, 60000)
let cta = q.cuentaCliente(ana.id)
assert.equal(cta.saldo, 240000)
assert.deepEqual(
  cta.ventas[0].cuotas.map((x) => [x.numero, x.monto, x.estado]),
  [
    [0, 60000, 'pagada'],
    [1, 80000, 'pendiente'],
    [2, 80000, 'pendiente'],
    [3, 80000, 'pendiente']
  ]
)
let res = k.cajaActual().resumen.find((x) => x.metodo === 'efectivo')
assert.equal(res.ventas, 0)
assert.equal(res.cobros, 60000)
assert.equal(res.esperado, 60000)
assert.equal(p.productoPorCodigo('R1').stock, 9, 'se entrega al vender')
// segunda venta sin entrega; la cuota 1 de v1 vencida hace 10 días
// deja otra venta pendiente para que el saldo no sea 0
venderCuotas(2, 0) // 2 x 150000
getDb()
  .prepare(
    "UPDATE cuotas SET vencimiento = date('now', 'localtime', '-10 days') WHERE venta_id = ? AND numero = 1"
  )
  .run(v1.id)
let lista = q.clientesConSaldo('', true)
assert.equal(lista.length, 1)
assert.equal(lista[0].saldo, 540000)
assert.equal(lista[0].vencido, 80000)
assert.equal(lista[0].diasAtraso, 10)
assert.equal(
  q.cuentaCliente(ana.id).ventas.find((x) => x.id === v1.id).cuotas[1].estado,
  'atrasada'
)
// pago parcial FIFO: 100000 → cuota1 v1 completa (80000) + 20000 a la siguiente más vieja
assert.throws(() => q.cobrarCuotas(ana.id, 999999, 'efectivo'), /supera/)
const cob = q.cobrarCuotas(ana.id, 100000, 'transferencia')
assert.equal(cob.aplicado.length, 2)
assert.equal(cob.aplicado[0].ventaId, v1.id)
assert.equal(cob.aplicado[0].monto, 80000)
assert.equal(cob.aplicado[1].monto, 20000)
cta = q.cuentaCliente(ana.id)
assert.equal(cta.saldo, 440000)
assert.equal(cta.vencido, 0)
assert.equal(q.clientesConSaldo('', true).length, 0)
assert.equal(k.cajaActual().resumen.find((x) => x.metodo === 'transferencia').cobros, 100000)
// anulación de venta con cuotas pagadas: bloqueada
assert.throws(() => q.anularCobro(cta.cobros.find((x) => x.esEntrega).id, 'x'), /anulando la venta/)
q.anularCobro(cob.id, 'error de monto')
assert.equal(q.cuentaCliente(ana.id).saldo, 540000)
assert.equal(k.cajaActual().resumen.find((x) => x.metodo === 'transferencia').cobros, 0)
// anular v1 en la misma caja: la entrega deja de contar, no hay devolución
v.anularVenta(v1.id, 'se arrepintió')
res = k.cajaActual().resumen.find((x) => x.metodo === 'efectivo')
assert.equal(res.cobros, 0)
assert.equal(res.egresos, 0)
assert.equal(q.cuentaCliente(ana.id).saldo, 300000)
// venta con entrega, cierre de caja, anulación en otra caja → devolución de la entrega
const v3 = venderCuotas(2, 50000)
k.cerrarCaja({ efectivo: 50000, transferencia: 0, tarjeta: 0, qr: 0 }, null)
assert.equal(k.listarCajas()[0].resumen.find((x) => x.metodo === 'efectivo').cobros, 50000)
k.abrirCaja(0)
v.anularVenta(v3.id, 'devolución')
res = k.cajaActual().resumen.find((x) => x.metodo === 'efectivo')
assert.equal(res.egresos, 50000)
assert.equal(
  k.listarCajas()[0].resumen.find((x) => x.metodo === 'efectivo').cobros,
  50000,
  'la cerrada no cambia'
)
// cobro de caja cerrada no se anula
const cob2 = q.cobrarCuotas(ana.id, 1000, 'efectivo')
k.cerrarCaja({ efectivo: 0, transferencia: 0, tarjeta: 0, qr: 0 }, null)
k.abrirCaja(0)
q.anularCobro(cob2.id, 'x') // ahora sí: sale como corrección de la caja abierta
assert.equal(p.productoPorCodigo('R1').stock, 9, 'v1 y v3 anuladas devolvieron stock; queda v2')
console.log('OK: cuotas')
