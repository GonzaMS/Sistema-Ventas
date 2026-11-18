import assert from 'node:assert/strict'
const { abrirDb, u, p, v, k, co } = (await import(process.env.BUNDLE)).default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
const nuevo = (codigo, stock, compra) =>
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
    precioCompra: compra,
    precioVenta: 50000,
    vencimiento: null
  })
const a = nuevo('A', 2, 10000),
  b = nuevo('B', 0, 0)
const compra = (items, metodoPago = 'efectivo', proveedor = 'Prov X') =>
  co.registrarCompra({ proveedor, items, metodoPago, observacion: null })
const ef = () => k.cajaActual().resumen.find((r) => r.metodo === 'efectivo')
// sin caja abierta: solo "fuera de caja"
assert.throws(() => compra([{ productoId: a.id, cantidad: 1, costo: 1 }]), /caja está cerrada/)
const fuera = compra([{ productoId: a.id, cantidad: 3, costo: 12000 }], null)
assert.equal(fuera.metodoPago, null)
assert.equal(fuera.cajaId, null)
assert.equal(fuera.total, 36000)
assert.equal(p.productoPorCodigo('A').stock, 5)
assert.equal(p.productoPorCodigo('A').precioCompra, 12000)
// validaciones
k.abrirCaja(500000)
assert.throws(() => compra([]), /no tiene productos/)
assert.throws(() => compra([{ productoId: a.id, cantidad: 0, costo: 1 }]), /mayores a cero/)
assert.throws(
  () =>
    compra([
      { productoId: a.id, cantidad: 1, costo: 1 },
      { productoId: a.id, cantidad: 1, costo: 1 }
    ]),
  /repetido/
)
assert.throws(() => compra([{ productoId: b.id, cantidad: 1, costo: 0 }]), /Gs. 0/)
// con caja: efectivo
const c1 = compra([
  { productoId: a.id, cantidad: 2, costo: 15000 },
  { productoId: b.id, cantidad: 10, costo: 8000 }
])
assert.equal(c1.total, 110000)
assert.equal(c1.cajaId, k.cajaActual().id)
assert.equal(p.productoPorCodigo('B').stock, 10)
assert.equal(ef().egresos, 110000)
assert.equal(ef().esperado, 390000)
const mov = k.cajaActual().movimientos[0]
assert.equal(mov.categoria, 'Compra de mercadería')
assert.equal(mov.compraId, c1.id)
assert.throws(() => k.anularMovimiento(mov.id, 'x'), /se corrige desde Compras/)
assert.ok(!k.categoriasCaja().some((c) => c.nombre === 'Compra de mercadería' && !c.sistema))
// transferencia
compra([{ productoId: a.id, cantidad: 1, costo: 20000 }], 'transferencia')
assert.equal(k.cajaActual().resumen.find((r) => r.metodo === 'transferencia').egresos, 20000)
// anular en la misma caja: stock vuelve, egreso deja de contar
co.anularCompra(c1.id, 'mal cargada')
assert.equal(p.productoPorCodigo('B').stock, 0)
assert.equal(ef().egresos, 0)
assert.throws(() => co.anularCompra(c1.id, 'x'), /ya está anulada/)
// anular después de vender parte: bloqueado
const c3 = compra([{ productoId: b.id, cantidad: 2, costo: 8000 }])
v.registrarVenta({
  clienteId: null,
  items: [{ productoId: b.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: null
})
assert.throws(() => co.anularCompra(c3.id, 'x'), /ya se vendió parte/)
assert.equal(co.listarCompras().find((x) => x.id === c3.id).anulada, false, 'rollback')
// anular con la caja ya cerrada: corrección en la abierta, la cerrada no cambia
const c4 = compra([{ productoId: a.id, cantidad: 1, costo: 30000 }])
const esperadoCierre = ef().esperado
k.cerrarCaja({ efectivo: esperadoCierre, transferencia: 0, tarjeta: 0, qr: 0 }, null)
assert.throws(() => co.anularCompra(c4.id, 'x'), /caja está cerrada/)
k.abrirCaja(0)
co.anularCompra(c4.id, 'devuelta al proveedor')
assert.equal(ef().ingresos, 30000)
assert.equal(k.cajaActual().movimientos[0].categoria, 'Corrección')
assert.equal(
  k.listarCajas()[0].resumen.find((r) => r.metodo === 'efectivo').esperado,
  esperadoCierre
)
// fuera de caja se anula sin tocar caja
co.anularCompra(fuera.id, 'x')
assert.equal(ef().ingresos, 30000)
// cajero puede comprar, no anular
u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
const c5 = compra([{ productoId: a.id, cantidad: 1, costo: 1000 }])
assert.throws(() => co.anularCompra(c5.id, 'x'), /administrador/)
console.log('OK: compras')
