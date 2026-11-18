import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const m = await import(process.env.BUNDLE)
const { abrirDb, u, p } = m.default
abrirDb(':memory:')
const carpeta = join(tmpdir(), `ventas-fotos-${process.pid}`)
u.crearPrimerAdmin('admin', 'secreto1')
const prod = p.crearProducto({
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
assert.equal(prod.imagen, null)
const jpeg = 'data:image/jpeg;base64,' + Buffer.from('foto de prueba').toString('base64')
assert.throws(() => p.guardarFoto(prod.id, 'data:image/png;base64,AAAA'), /JPEG/)
const con = p.guardarFoto(prod.id, jpeg)
assert.match(con.imagen, /^\d+-\d+\.jpg$/)
assert.ok(existsSync(join(carpeta, con.imagen)))
assert.equal(p.productoPorCodigo('R1').imagen, con.imagen)

// Editar el producto no toca la foto; cambiarla borra el archivo viejo.
const { id, imagen, ...datos } = con
assert.equal(p.editarProducto(id, { ...datos, nombre: 'Remera lisa' }).imagen, imagen)
await new Promise((r) => setTimeout(r, 5))
const otra = p.guardarFoto(prod.id, jpeg)
assert.notEqual(otra.imagen, imagen)
assert.ok(!existsSync(join(carpeta, imagen)))
assert.equal(p.quitarFoto(prod.id).imagen, null)
assert.ok(!existsSync(join(carpeta, otra.imagen)))
console.log('OK: todas las pruebas pasaron')
