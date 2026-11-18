import assert from 'node:assert/strict'
const m = await import(process.env.BUNDLE)
const { abrirDb, u, p, c, v, k, q } = m.default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
k.abrirCaja(0)
const nuevo = (codigo, precio, stock) =>
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
    precioCompra: 1,
    precioVenta: precio,
    vencimiento: null
  })
const remera = nuevo('R1', 60000, 10)
const jean = nuevo('J1', 150000, 10)
const egresos = () => k.cajaActual().movimientos.filter((x) => x.tipo === 'egreso' && !x.anulado)

// Contado con descuento: 2 remeras + 1 jean = 270.000 − 27.000 = 243.000 (10 % menos).
const venta = v.registrarVenta({
  clienteId: null,
  items: [
    { productoId: remera.id, cantidad: 2 },
    { productoId: jean.id, cantidad: 1 }
  ],
  descuento: 27000,
  metodoPago: 'efectivo',
  cuotas: null
})
const [itR, itJ] = venta.items
assert.throws(
  () => v.devolverItems(venta.id, [{ itemId: itR.id, cantidad: 3 }], 'x', 'efectivo'),
  /se pueden devolver 2/
)
assert.throws(
  () => v.devolverItems(venta.id, [{ itemId: itR.id, cantidad: 1 }], ' ', 'efectivo'),
  /motivo/
)
let d = v.devolverItems(venta.id, [{ itemId: itR.id, cantidad: 1 }], 'No le quedó', 'efectivo')
assert.equal(d.valor, 54000, 'una remera con el 10 % de descuento')
assert.equal(d.reintegro, 54000)
assert.equal(d.venta.devuelto, 54000)
assert.equal(d.venta.items[0].devueltos, 1)
assert.equal(p.productoPorCodigo('R1').stock, 9)
assert.equal(egresos().length, 1)
assert.equal(egresos()[0].monto, 54000)
assert.throws(() => k.anularMovimiento(egresos()[0].id, 'x'), /devolver/)
assert.throws(() => v.anularVenta(venta.id, 'x'), /devoluciones/)

// Devolver todo lo que queda: el valor cierra exacto con el total.
d = v.devolverItems(
  venta.id,
  [
    { itemId: itR.id, cantidad: 1 },
    { itemId: itJ.id, cantidad: 1 }
  ],
  'Se arrepintió',
  'transferencia'
)
assert.equal(d.venta.devuelto, 243000)
assert.equal(egresos().find((x) => x.metodoPago === 'transferencia').monto, 189000)
assert.throws(
  () => v.devolverItems(venta.id, [{ itemId: itJ.id, cantidad: 1 }], 'x', 'efectivo'),
  /se pueden devolver 0/
)
assert.equal(p.productoPorCodigo('J1').stock, 10)

// Cuotas: 2 jeans = 300.000, entrega 60.000, 3 cuotas de 80.000.
const ana = c.crearCliente({ nombre: 'Ana', documento: null, telefono: null, direccion: null })
const vc = v.registrarVenta({
  clienteId: ana.id,
  items: [{ productoId: jean.id, cantidad: 2 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 3, entrega: 60000 }
})
q.cobrarCuotas(ana.id, 100000, 'efectivo') // cuota 1 entera y 20.000 de la 2
const antes = egresos().length
d = v.devolverItems(vc.id, [{ itemId: vc.items[0].id, cantidad: 1 }], 'Talle', 'efectivo')
assert.equal(d.valor, 150000)
assert.equal(d.descontado, 140000, 'la cuota 3 entera y 60.000 de la 2')
assert.equal(d.reintegro, 10000)
assert.equal(egresos().length, antes + 1)
let cuenta = q.cuentaCliente(ana.id)
assert.equal(cuenta.saldo, 0)
assert.deepEqual(
  cuenta.ventas[0].cuotas.map((x) => [x.numero, x.monto, x.saldo]),
  [
    [0, 60000, 0],
    [1, 80000, 0],
    [2, 20000, 0]
  ]
)

// Con saldo de sobra: solo se descuenta, no sale plata.
const vc2 = v.registrarVenta({
  clienteId: ana.id,
  items: [{ productoId: remera.id, cantidad: 3 }],
  descuento: 0,
  metodoPago: 'efectivo',
  cuotas: { cantidad: 3, entrega: 0 }
})
d = v.devolverItems(vc2.id, [{ itemId: vc2.items[0].id, cantidad: 1 }], 'Falla', 'efectivo')
assert.equal(d.reintegro, 0)
assert.equal(q.cuentaCliente(ana.id).saldo, 120000)
assert.equal(egresos().length, antes + 1)

u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
assert.throws(
  () => v.devolverItems(vc2.id, [{ itemId: vc2.items[0].id, cantidad: 1 }], 'x', 'efectivo'),
  /administrador/
)
console.log('OK: todas las pruebas pasaron')
