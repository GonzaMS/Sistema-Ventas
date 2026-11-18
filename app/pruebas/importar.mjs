import assert from 'node:assert/strict'
const m = await import(process.env.BUNDLE)
const { abrirDb, u, p } = m.default
abrirDb(':memory:')
u.crearPrimerAdmin('admin', 'secreto1')
p.crearProducto({
  codigo: 'R1',
  nombre: 'Remera',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: 'Remeras',
  proveedor: null,
  stock: 5,
  stockMinimo: 1,
  precioCompra: 30000,
  precioVenta: 60000,
  vencimiento: null
})
const filas = [
  { fila: 2, codigo: 'r1', nombre: 'Remera lisa', precioVenta: 65000 },
  { fila: 3, codigo: 'J1', nombre: 'Jean', precioVenta: 150000, stock: 4, familia: 'Jeans' },
  { fila: 4, codigo: 'B1', nombre: 'Bincha', precioVenta: 15000 }
]
const opc = { actualizar: false, soloRevisar: true }

// Revisar no guarda nada; el código se reconoce sin importar mayúsculas.
let r = p.importarProductos(filas, opc)
assert.deepEqual(r, { nuevos: 2, actualizados: 0, repetidos: 1, errores: [] })
assert.equal(p.productoPorCodigo('J1'), null)

// Con un error no se guarda ninguna fila.
r = p.importarProductos(
  [
    ...filas,
    { fila: 5, codigo: 'J1', nombre: 'Otro', precioVenta: 1 },
    { fila: 6, codigo: 'X', nombre: 'Sin precio' },
    { fila: 7, codigo: 'N', nombre: 'Negativo', precioVenta: 10, stock: -1 }
  ],
  { ...opc, soloRevisar: false }
)
assert.equal(r.errores.length, 3)
assert.match(r.errores[0].mensaje, /fila 3/)
assert.match(r.errores[1].mensaje, /precio de venta/)
assert.match(r.errores[2].mensaje, /entero/)
assert.equal(p.productoPorCodigo('J1'), null)

// Sin actualizar: los existentes quedan como estaban.
r = p.importarProductos(filas, { ...opc, soloRevisar: false })
assert.equal(r.nuevos, 2)
assert.equal(p.productoPorCodigo('R1').nombre, 'Remera')
const jean = p.productoPorCodigo('J1')
assert.equal(jean.stock, 4)
assert.equal(jean.precioCompra, 0)
assert.equal(jean.unidad, 'Unidad')

// Actualizando: solo cambian las columnas que vienen; el resto se conserva.
r = p.importarProductos(filas.slice(0, 1), { actualizar: true, soloRevisar: false })
assert.equal(r.actualizados, 1)
const remera = p.productoPorCodigo('R1')
assert.equal(remera.nombre, 'Remera lisa')
assert.equal(remera.precioVenta, 65000)
assert.equal(remera.stock, 5)
assert.equal(remera.familia, 'Remeras')
assert.equal(remera.codigo, 'R1', 'el código se queda como estaba')

u.crearUsuario('caja1', 'secreto1', 'cajero')
u.cerrarSesion()
u.iniciarSesion('caja1', 'secreto1')
assert.throws(() => p.importarProductos(filas, opc), /administrador/)
console.log('OK: todas las pruebas pasaron')
