import assert from 'node:assert/strict'
const { abrirDb, getDb, u, p, c, v, k, inf } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const prod = (codigo, costo, precio) =>
  p.crearProducto({
    codigo,
    nombre: codigo,
    descripcion: null,
    unidad: 'Unidad',
    categoria: null,
    familia: null,
    proveedor: null,
    stock: 10,
    stockMinimo: 2,
    precioCompra: costo,
    precioVenta: precio
  })
const a = prod('A', 10000, 30000)
const b = prod('B', 5000, 8000)
const ana = c.crearCliente({ nombre: 'Ana', documento: null, telefono: null, direccion: null })
const hoy = new Date().toLocaleDateString('sv-SE')

assert.throws(() => inf.informe('2026-1-1', hoy), /Fecha no válida/)
assert.throws(() => inf.informe('2999-01-01', hoy), /posterior/)

k.abrirCaja(50000)
const v1 = v.registrarVenta({
  clienteId: null,
  items: [{ productoId: a.id, cantidad: 2 }],
  descuento: 6000,
  metodoPago: 'efectivo',
  cuotas: null
})
v.registrarVenta({
  clienteId: null,
  items: [{ productoId: b.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'qr',
  cuotas: null
})
const v3 = v.registrarVenta({
  clienteId: ana.id,
  items: [{ productoId: a.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 3, entrega: 10000 }
})
const anulada = v.registrarVenta({
  clienteId: null,
  items: [{ productoId: b.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: null
})
v.anularVenta(anulada.id, 'prueba')
const cat = k.categoriasCaja()
const merc = cat.find((x) => x.nombre === 'Mercadería')
const otros = cat.find((x) => x.nombre === 'Otros' && x.tipo === 'ingreso')
k.registrarMovimiento({
  tipo: 'egreso',
  categoriaId: merc.id,
  descripcion: null,
  monto: 5000,
  metodoPago: 'efectivo'
})
k.registrarMovimiento({
  tipo: 'ingreso',
  categoriaId: otros.id,
  descripcion: null,
  monto: 1000,
  metodoPago: 'efectivo'
})
// Devuelve 1 de las 2 A: 30000 con su parte del descuento (54000/60000) = 27000.
v.devolverItems(v1.id, [{ itemId: v1.items[0].id, cantidad: 1 }], 'talle', 'efectivo')

let r = inf.informe(hoy, hoy)
assert.deepEqual(r.ventasPorDia, [
  { dia: hoy, cantidad: 3, contado: 62000, cuotas: 30000, devuelto: 27000 }
])
const met = (m) => r.porMetodo.find((x) => x.metodo === m)
assert.deepEqual(met('efectivo'), { metodo: 'efectivo', contado: 54000, cobros: 10000 })
assert.deepEqual(met('qr'), { metodo: 'qr', contado: 8000, cobros: 0 })
assert.deepEqual(
  r.productos.map((x) => [x.codigo, x.unidades, x.importe, x.costo]),
  [
    ['A', 2, 57000, 20000],
    ['B', 1, 8000, 5000]
  ]
)
// El costo queda el del momento de la venta, aunque después cambie el precio de compra.
p.editarProducto(a.id, { ...a, stock: 8, precioCompra: 99000 })
assert.equal(inf.informe(hoy, hoy).productos.find((x) => x.codigo === 'A').costo, 20000)
p.editarProducto(a.id, { ...a, stock: 8 })
assert.deepEqual(
  r.gastos.map((x) => [x.categoria, x.monto]),
  [
    ['Devolución de venta', 27000],
    ['Mercadería', 5000]
  ]
)
assert.deepEqual(
  r.ingresos.map((x) => ({ ...x })),
  [{ categoria: 'Otros', monto: 1000, cantidad: 1 }]
)
assert.equal(r.cajas.length, 1)
assert.deepEqual(
  [r.cajas[0].ventas, r.cajas[0].cobros, r.cajas[0].ingresos, r.cajas[0].egresos],
  [62000, 10000, 1000, 32000]
)
assert.equal(r.cajas[0].esperado, 41000)
assert.equal(r.cajas[0].diferencia, null)
// Stock: A 10-2-1+1 = 8, B 10-1 = 9 (la anulada devolvió el suyo).
assert.deepEqual(
  { ...r.stock },
  {
    productos: 2,
    unidades: 17,
    costo: 8 * 10000 + 9 * 5000,
    venta: 8 * 30000 + 9 * 8000,
    bajoMinimo: 0
  }
)
assert.equal(r.cuotas.saldo, 20000)
assert.equal(r.cuotas.vencido, 0)
assert.equal(r.cuotas.morosos.length, 0)
assert.ok(r.auditoria.some((x) => x.entidad === 'venta' && x.usuario === 'admin'))

// Una cuota vencida hace 45 días.
const vence = new Date(Date.now() - 45 * 86_400_000).toLocaleDateString('sv-SE')
getDb()
  .prepare('UPDATE cuotas SET vencimiento = ? WHERE venta_id = ? AND numero = 1')
  .run(vence, v3.id)
r = inf.informe(hoy, hoy)
assert.equal(r.cuotas.vencido, 6666)
assert.deepEqual(
  r.cuotas.atraso.map((x) => [x.tramo, x.monto, x.cuotas]),
  [
    ['1 a 30 días', 0, 0],
    ['31 a 60 días', 6666, 1],
    ['61 a 90 días', 0, 0],
    ['Más de 90 días', 0, 0]
  ]
)
assert.deepEqual(
  r.cuotas.morosos.map((x) => x.cliente.nombre),
  ['Ana']
)

// Cerrada: queda con los números del cierre. Faltan 1000 en efectivo.
const esperado = k.cajaActual().resumen
k.cerrarCaja(
  Object.fromEntries(
    esperado.map((x) => [x.metodo, x.metodo === 'efectivo' ? x.esperado - 1000 : x.esperado])
  ),
  null
)
r = inf.informe(hoy, hoy)
assert.equal(r.cajas[0].esperado, 41000)
assert.equal(r.cajas[0].diferencia, -1000)
assert.ok(r.cajas[0].cerradaEn)

// Otro período: vacío.
r = inf.informe('2020-01-01', '2020-01-31')
assert.deepEqual([r.ventasPorDia, r.productos, r.cajas, r.gastos], [[], [], [], []])

// El cajero no ve informes.
u.crearUsuario('caja', 'caja123', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja', 'caja123')
assert.throws(() => inf.informe(hoy, hoy), /administrador/)
