import assert from 'node:assert/strict'
const m = await import(process.env.BUNDLE)
const { abrirDb, u, p, c, v, k } = m.default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
k.abrirCaja(0)
const remera = p.crearProducto({
  codigo: 'R1',
  nombre: 'Remera',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: null,
  proveedor: null,
  stock: 5,
  stockMinimo: 1,
  precioCompra: 30000,
  precioVenta: 60000,
  vencimiento: null
})
const bincha = p.crearProducto({
  codigo: 'B1',
  nombre: 'Bincha',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: null,
  proveedor: null,
  stock: 2,
  stockMinimo: 0,
  precioCompra: 5000,
  precioVenta: 15000,
  vencimiento: null
})
const cli = c.crearCliente({ nombre: 'Ana', documento: '1234567', telefono: null, direccion: null })
assert.throws(
  () => c.crearCliente({ nombre: 'Otra', documento: '1234567', telefono: null, direccion: null }),
  /documento/
)
const venta = v.registrarVenta({
  clienteId: cli.id,
  items: [
    { productoId: remera.id, cantidad: 2 },
    { productoId: bincha.id, cantidad: 1 },
    { productoId: remera.id, cantidad: 1 }
  ],
  descuento: 5000,
  metodoPago: 'efectivo'
})
assert.equal(venta.subtotal, 195000)
assert.equal(venta.total, 190000)
assert.equal(venta.items.length, 2)
assert.equal(venta.cliente, 'Ana')
assert.equal(p.productoPorCodigo('R1').stock, 2)
assert.throws(
  () =>
    v.registrarVenta({
      clienteId: null,
      items: [{ productoId: bincha.id, cantidad: 5 }],
      descuento: 0,
      metodoPago: 'efectivo'
    }),
  /No alcanza el stock/
)
assert.equal(p.productoPorCodigo('B1').stock, 1, 'rollback del stock')
assert.throws(
  () =>
    v.registrarVenta({
      clienteId: null,
      items: [{ productoId: bincha.id, cantidad: 1 }],
      descuento: 99999,
      metodoPago: 'efectivo'
    }),
  /descuento/
)
assert.throws(
  () =>
    v.registrarVenta({
      clienteId: null,
      items: [{ productoId: bincha.id, cantidad: 1 }],
      descuento: 0,
      metodoPago: 'bitcoin'
    }),
  /Método/
)
const fecha = venta.fecha.slice(0, 10)
assert.equal(v.ventasDelDia(fecha).length, 1)
assert.throws(() => v.anularVenta(venta.id, ' '), /motivo/)
const anulada = v.anularVenta(venta.id, 'Se equivocó de talle')
assert.equal(anulada.anulada, true)
assert.equal(p.productoPorCodigo('R1').stock, 5)
assert.equal(p.productoPorCodigo('B1').stock, 2)
assert.throws(() => v.anularVenta(venta.id, 'otra vez'), /ya está anulada/)
u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
const v2 = v.registrarVenta({
  clienteId: null,
  items: [{ productoId: bincha.id, cantidad: 1 }],
  descuento: 0,
  metodoPago: 'transferencia'
})
assert.throws(() => v.anularVenta(v2.id, 'x'), /administrador/)
assert.equal(v.buscarVenta(venta.id).anulada, true)
assert.throws(() => v.buscarVenta(9999), /no existe/)
u.cerrarSesion()
assert.throws(() => v.ventasDelDia(fecha), /Sesión/)
console.log('OK: todas las pruebas pasaron')
