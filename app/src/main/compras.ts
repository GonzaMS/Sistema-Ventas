import { getDb, transaccion } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import { exigirCajaAbierta, revertirMovimiento } from './caja'
import { METODOS_PAGO, type Compra, type CompraNueva, type ItemCompra } from '../shared/tipos'

type FilaCompra = Omit<Compra, 'anulada' | 'items'> & { anulada: number }

const SELECT_COMPRA = `SELECT c.id, c.fecha, u.usuario, c.proveedor, c.total,
    c.metodo_pago AS metodoPago, c.observacion, c.anulada_en IS NOT NULL AS anulada,
    (SELECT m.caja_id FROM movimientos_caja m WHERE m.compra_id = c.id ORDER BY m.id LIMIT 1)
      AS cajaId
  FROM compras c JOIN usuarios u ON u.id = c.usuario_id`

function conItems(f: FilaCompra): Compra {
  const items = getDb()
    .prepare(
      'SELECT codigo, nombre, cantidad, costo, subtotal FROM compra_items WHERE compra_id = ? ORDER BY id'
    )
    .all(f.id) as unknown as ItemCompra[]
  return { ...f, anulada: f.anulada === 1, items }
}

function obtenerCompra(id: number): Compra {
  const f = getDb().prepare(`${SELECT_COMPRA} WHERE c.id = ?`).get(id) as FilaCompra | undefined
  if (!f) throw new Error('La compra no existe')
  return conItems(f)
}

const entero = (n: number): boolean => Number.isInteger(n) && n >= 0

// Sube el stock y deja el costo como nuevo precio de compra. Si se pagó con plata de la caja,
// el total sale de la caja abierta como egreso "Compra de mercadería".
export function registrarCompra(c: CompraNueva): Compra {
  const u = usuarioActual()
  if (c.metodoPago !== null && !METODOS_PAGO.includes(c.metodoPago))
    throw new Error('Método de pago no válido')
  if (!c.items.length) throw new Error('La compra no tiene productos')
  const vistos = new Set<number>()
  for (const it of c.items) {
    if (!entero(it.cantidad) || it.cantidad === 0)
      throw new Error('Las cantidades tienen que ser números enteros mayores a cero')
    if (!entero(it.costo)) throw new Error('El costo tiene que ser un número entero')
    if (vistos.has(it.productoId)) throw new Error('Hay un producto repetido en la compra')
    vistos.add(it.productoId)
  }
  const proveedor = c.proveedor?.trim() || null
  const db = getDb()

  const id = transaccion(db, () => {
    const renglones = c.items.map((it) => {
      const p = db
        .prepare('SELECT id, codigo, nombre FROM productos WHERE id = ? AND activo = 1')
        .get(it.productoId) as { id: number; codigo: string; nombre: string } | undefined
      if (!p) throw new Error('Uno de los productos ya no existe')
      return { ...p, cantidad: it.cantidad, costo: it.costo, subtotal: it.cantidad * it.costo }
    })
    const total = renglones.reduce((s, r) => s + r.subtotal, 0)
    const cajaId = c.metodoPago === null ? null : exigirCajaAbierta()
    if (cajaId !== null && total === 0)
      throw new Error('La compra suma Gs. 0: poné el costo o elegí "No sale de la caja"')

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO compras (usuario_id, proveedor, total, metodo_pago, observacion)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(u.id, proveedor, total, c.metodoPago, c.observacion?.trim() || null)
    const compraId = Number(lastInsertRowid)

    const insertar = db.prepare(
      `INSERT INTO compra_items (compra_id, producto_id, codigo, nombre, cantidad, costo, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const sumar = db.prepare(
      `UPDATE productos SET stock = stock + ?, precio_compra = ?,
         actualizado_en = datetime('now', 'localtime') WHERE id = ?`
    )
    for (const r of renglones) {
      insertar.run(compraId, r.id, r.codigo, r.nombre, r.cantidad, r.costo, r.subtotal)
      sumar.run(r.cantidad, r.costo, r.id)
    }

    if (cajaId !== null)
      db.prepare(
        `INSERT INTO movimientos_caja
           (caja_id, usuario_id, tipo, categoria_id, descripcion, monto, metodo_pago, compra_id)
         VALUES (?, ?, 'egreso',
           (SELECT id FROM categorias_caja WHERE sistema = 1 AND nombre = 'Compra de mercadería'),
           ?, ?, ?, ?)`
      ).run(
        cajaId,
        u.id,
        `Compra N° ${compraId}${proveedor ? ` a ${proveedor}` : ''}`,
        total,
        c.metodoPago,
        compraId
      )
    auditar(
      'crear',
      'compra',
      compraId,
      `Total ${total}${cajaId === null ? ' (fuera de caja)' : ''}`
    )
    return compraId
  })
  return obtenerCompra(id)
}

export function listarCompras(): Compra[] {
  usuarioActual()
  const filas = getDb()
    .prepare(`${SELECT_COMPRA} ORDER BY c.id DESC LIMIT 100`)
    .all() as unknown as FilaCompra[]
  return filas.map(conItems)
}

// Saca del stock lo que entró y devuelve la plata a la caja (si salió de una caja ya cerrada,
// entra como "Corrección" en la abierta). No se puede si ya se vendió parte de la mercadería.
export function anularCompra(id: number, motivo: string): Compra {
  const u = exigirAdmin()
  if (!motivo.trim()) throw new Error('Indicá el motivo de la anulación')
  const db = getDb()
  transaccion(db, () => {
    const { changes } = db
      .prepare(
        `UPDATE compras SET anulada_en = datetime('now', 'localtime'), anulada_por = ?,
           motivo_anulacion = ? WHERE id = ? AND anulada_en IS NULL`
      )
      .run(u.id, motivo.trim(), id)
    if (!changes) throw new Error('La compra no existe o ya está anulada')

    const items = db
      .prepare(
        `SELECT i.producto_id AS productoId, i.cantidad, p.stock, p.codigo, p.nombre
         FROM compra_items i JOIN productos p ON p.id = i.producto_id WHERE i.compra_id = ?`
      )
      .all(id) as {
      productoId: number
      cantidad: number
      stock: number
      codigo: string
      nombre: string
    }[]
    for (const it of items) {
      if (it.stock < it.cantidad)
        throw new Error(
          `De ${it.codigo} ${it.nombre} entraron ${it.cantidad} y quedan ${it.stock}: ya se vendió parte`
        )
      db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(
        it.cantidad,
        it.productoId
      )
    }

    const mov = db
      .prepare('SELECT id FROM movimientos_caja WHERE compra_id = ? AND anulado_en IS NULL')
      .get(id) as { id: number } | undefined
    if (mov) revertirMovimiento(mov.id, `Anulación de la compra N° ${id}: ${motivo.trim()}`, u.id)
    auditar('anular', 'compra', id, motivo.trim())
  })
  return obtenerCompra(id)
}
