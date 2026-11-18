import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { carpetaFotos, getDb, transaccion } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import type {
  Producto,
  ProductoImportado,
  ProductoNuevo,
  ResultadoImportacion
} from '../shared/tipos'

const COLUMNAS = `id, codigo, nombre, descripcion, unidad, categoria, familia, proveedor,
  stock, stock_minimo AS stockMinimo, precio_compra AS precioCompra,
  precio_venta AS precioVenta, vencimiento, imagen`

// Cada palabra tiene que aparecer (en cualquier orden) en el código, nombre, familia o proveedor:
// "jean negro" encuentra "Jean wide leg negro". Primero los que empiezan con el código buscado.
export function buscarProductos(texto: string): Producto[] {
  usuarioActual()
  const palabras = texto.trim().split(/\s+/).filter(Boolean).slice(0, 8)
  const condicion = palabras
    .map(
      () =>
        `(codigo LIKE ? OR nombre LIKE ? OR IFNULL(familia, '') LIKE ? OR IFNULL(proveedor, '') LIKE ?)`
    )
    .join(' AND ')
  const valores = palabras.flatMap((p) => Array(4).fill(`%${p}%`))
  return getDb()
    .prepare(
      `SELECT ${COLUMNAS} FROM productos
       WHERE activo = 1 ${condicion ? `AND ${condicion}` : ''}
       ORDER BY codigo LIKE ? DESC, nombre LIMIT 500`
    )
    .all(...valores, `${palabras[0] ?? ''}%`) as unknown as Producto[]
}

export function productoPorCodigo(codigo: string): Producto | null {
  usuarioActual()
  const p = getDb()
    .prepare(`SELECT ${COLUMNAS} FROM productos WHERE activo = 1 AND codigo = ?`)
    .get(codigo.trim())
  return (p as unknown as Producto) ?? null
}

function limpiar(p: ProductoNuevo): ProductoNuevo {
  const opcional = (s: string | null): string | null => s?.trim() || null
  const entero = (n: number, campo: string): number => {
    if (!Number.isInteger(n) || n < 0) throw new Error(`${campo}: tiene que ser un número entero`)
    return n
  }
  const codigo = p.codigo.trim()
  const nombre = p.nombre.trim()
  if (!codigo) throw new Error('Falta el código del producto')
  if (!nombre) throw new Error('Falta el nombre del producto')
  return {
    codigo,
    nombre,
    descripcion: opcional(p.descripcion),
    unidad: p.unidad.trim() || 'Unidad',
    categoria: opcional(p.categoria),
    familia: opcional(p.familia),
    proveedor: opcional(p.proveedor),
    stock: entero(p.stock, 'Cantidad disponible'),
    stockMinimo: entero(p.stockMinimo, 'Cantidad mínima'),
    precioCompra: entero(p.precioCompra, 'Precio de compra'),
    precioVenta: entero(p.precioVenta, 'Precio de venta'),
    vencimiento: opcional(p.vencimiento)
  }
}

function valores(p: ProductoNuevo): (string | number | null)[] {
  return [
    p.codigo,
    p.nombre,
    p.descripcion,
    p.unidad,
    p.categoria,
    p.familia,
    p.proveedor,
    p.stock,
    p.stockMinimo,
    p.precioCompra,
    p.precioVenta,
    p.vencimiento
  ]
}

function codigoLibre(codigo: string, salvoId = 0): void {
  if (
    getDb()
      .prepare('SELECT 1 FROM productos WHERE activo = 1 AND codigo = ? AND id <> ?')
      .get(codigo, salvoId)
  )
    throw new Error(`Ya existe un producto con el código ${codigo}`)
}

export function crearProducto(datos: ProductoNuevo): Producto {
  exigirAdmin()
  const p = limpiar(datos)
  codigoLibre(p.codigo)
  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO productos (codigo, nombre, descripcion, unidad, categoria, familia, proveedor,
         stock, stock_minimo, precio_compra, precio_venta, vencimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(...valores(p))
  const id = Number(lastInsertRowid)
  auditar('crear', 'producto', id, `${p.codigo} ${p.nombre}`)
  return { id, ...p, imagen: null }
}

export function editarProducto(id: number, datos: ProductoNuevo): Producto {
  exigirAdmin()
  const p = limpiar(datos)
  codigoLibre(p.codigo, id)
  const { changes } = getDb()
    .prepare(
      `UPDATE productos SET codigo = ?, nombre = ?, descripcion = ?, unidad = ?, categoria = ?,
         familia = ?, proveedor = ?, stock = ?, stock_minimo = ?, precio_compra = ?,
         precio_venta = ?, vencimiento = ?, actualizado_en = datetime('now', 'localtime')
       WHERE id = ? AND activo = 1`
    )
    .run(...valores(p), id)
  if (!changes) throw new Error('El producto no existe')
  auditar('modificar', 'producto', id, `${p.codigo} ${p.nombre}`)
  return productoPorId(id)
}

// Baja lógica: las ventas viejas siguen apuntando al producto.
export function eliminarProducto(id: number): void {
  exigirAdmin()
  const { changes } = getDb()
    .prepare('UPDATE productos SET activo = 0 WHERE id = ? AND activo = 1')
    .run(id)
  if (!changes) throw new Error('El producto no existe')
  auditar('eliminar', 'producto', id, null)
}

// Carga inicial desde una planilla. Los productos se buscan por código: los nuevos se crean con lo
// que trae la planilla (lo que falta queda en cero); los que ya existen se actualizan solo en las
// columnas elegidas, si actualizar es true. Con un error en cualquier fila no se guarda nada, y con
// soloRevisar tampoco: sirve para mostrar el resumen antes de confirmar.
export function importarProductos(
  filas: ProductoImportado[],
  opciones: { actualizar: boolean; soloRevisar: boolean }
): ResultadoImportacion {
  exigirAdmin()
  const db = getDb()
  const r: ResultadoImportacion = { nuevos: 0, actualizados: 0, repetidos: 0, errores: [] }
  const vistos = new Map<string, number>()
  const buscar = db.prepare(`SELECT ${COLUMNAS} FROM productos WHERE activo = 1 AND codigo = ?`)
  const aGuardar: { id: number | null; p: ProductoNuevo }[] = []

  for (const f of filas) {
    try {
      const { fila, ...datos } = f
      const codigo = String(datos.codigo ?? '').trim()
      const clave = codigo.toLowerCase()
      if (codigo && vistos.has(clave))
        throw new Error(`El código ${codigo} ya aparece en la fila ${vistos.get(clave)}`)
      vistos.set(clave, fila)
      const existe = codigo ? (buscar.get(codigo) as unknown as Producto | undefined) : undefined
      if (existe && !opciones.actualizar) {
        r.repetidos++
        continue
      }
      const base: ProductoNuevo = existe ?? { ...VACIO, codigo, nombre: '' }
      const definidos = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined))
      const p = limpiar({
        ...base,
        ...definidos,
        codigo: existe?.codigo ?? codigo
      } as ProductoNuevo)
      if (!existe && !p.precioVenta) throw new Error(`Falta el precio de venta de ${codigo}`)
      aGuardar.push({ id: existe?.id ?? null, p })
      if (existe) r.actualizados++
      else r.nuevos++
    } catch (e) {
      r.errores.push({ fila: f.fila, mensaje: (e as Error).message })
    }
  }
  if (r.errores.length || opciones.soloRevisar) return r

  transaccion(db, () => {
    const insertar = db.prepare(
      `INSERT INTO productos (codigo, nombre, descripcion, unidad, categoria, familia, proveedor,
         stock, stock_minimo, precio_compra, precio_venta, vencimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const actualizar = db.prepare(
      `UPDATE productos SET codigo = ?, nombre = ?, descripcion = ?, unidad = ?, categoria = ?,
         familia = ?, proveedor = ?, stock = ?, stock_minimo = ?, precio_compra = ?,
         precio_venta = ?, vencimiento = ?, actualizado_en = datetime('now', 'localtime')
       WHERE id = ?`
    )
    for (const { id, p } of aGuardar) {
      if (id === null) insertar.run(...valores(p))
      else actualizar.run(...valores(p), id)
    }
    auditar(
      'importar',
      'producto',
      null,
      `${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.repetidos} sin tocar`
    )
  })
  return r
}

function productoPorId(id: number): Producto {
  const p = getDb().prepare(`SELECT ${COLUMNAS} FROM productos WHERE id = ? AND activo = 1`).get(id)
  if (!p) throw new Error('El producto no existe')
  return p as unknown as Producto
}

// Nombre del archivo: el id y la hora, para que al cambiar la foto no se vea la vieja guardada.
export const NOMBRE_FOTO = /^\d+-\d+\.jpg$/

// La interfaz la achica antes de mandarla (JPEG de 600 px como mucho), así que llega liviana.
export function guardarFoto(id: number, dataUrl: string): Producto {
  exigirAdmin()
  const anterior = productoPorId(id).imagen
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new Error('La foto tiene que ser una imagen JPEG')
  const datos = Buffer.from(m[1], 'base64')
  if (datos.length > 2_000_000) throw new Error('La foto es demasiado grande')
  const archivo = `${id}-${Date.now()}.jpg`
  writeFileSync(join(carpetaFotos(), archivo), datos)
  getDb().prepare('UPDATE productos SET imagen = ? WHERE id = ?').run(archivo, id)
  if (anterior) borrarFoto(anterior)
  auditar('modificar', 'producto', id, 'foto')
  return productoPorId(id)
}

export function quitarFoto(id: number): Producto {
  exigirAdmin()
  const anterior = productoPorId(id).imagen
  getDb().prepare('UPDATE productos SET imagen = NULL WHERE id = ?').run(id)
  if (anterior) borrarFoto(anterior)
  auditar('modificar', 'producto', id, 'quitar foto')
  return productoPorId(id)
}

function borrarFoto(archivo: string): void {
  if (NOMBRE_FOTO.test(archivo)) rmSync(join(carpetaFotos(), archivo), { force: true })
}

const VACIO: ProductoNuevo = {
  codigo: '',
  nombre: '',
  descripcion: null,
  unidad: 'Unidad',
  categoria: null,
  familia: null,
  proveedor: null,
  stock: 0,
  stockMinimo: 0,
  precioCompra: 0,
  precioVenta: 0,
  vencimiento: null
}
