import { getDb, transaccion } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import { cajaAbiertaId, exigirCajaAbierta, insertarCobro, registrarDevolucion } from './caja'
import { calendarioCuotas, MAX_CUOTAS } from '../shared/cuotas'
import {
  METODOS_PAGO,
  type Devolucion,
  type ItemVenta,
  type MetodoPago,
  type Venta,
  type VentaNueva
} from '../shared/tipos'

type FilaVenta = Omit<Venta, 'anulada' | 'items'> & { anulada: number }

const SELECT_VENTA = `SELECT v.id, v.fecha, u.usuario, c.nombre AS cliente, v.subtotal,
    v.descuento, v.total, v.metodo_pago AS metodoPago, v.condicion,
    COALESCE((SELECT monto FROM cuotas WHERE venta_id = v.id AND numero = 0), 0) AS entrega,
    COALESCE((SELECT SUM(valor) FROM devoluciones WHERE venta_id = v.id), 0) AS devuelto,
    v.anulada_en IS NOT NULL AS anulada
  FROM ventas v
  JOIN usuarios u ON u.id = v.usuario_id
  LEFT JOIN clientes c ON c.id = v.cliente_id`

function conItems(f: FilaVenta): Venta {
  const items = getDb()
    .prepare(
      `SELECT vi.id, codigo, nombre, vi.cantidad, precio, subtotal,
         COALESCE((SELECT SUM(di.cantidad) FROM devolucion_items di
                   WHERE di.venta_item_id = vi.id), 0) AS devueltos
       FROM venta_items vi WHERE venta_id = ? ORDER BY vi.id`
    )
    .all(f.id) as unknown as ItemVenta[]
  return { ...f, anulada: f.anulada === 1, items }
}

export function obtenerVenta(id: number): Venta {
  const f = getDb().prepare(`${SELECT_VENTA} WHERE v.id = ?`).get(id) as FilaVenta | undefined
  if (!f) throw new Error('La venta no existe')
  return conItems(f)
}

const entero = (n: number): boolean => Number.isInteger(n) && n >= 0

export function registrarVenta(v: VentaNueva): Venta {
  const u = usuarioActual()
  if (!METODOS_PAGO.includes(v.metodoPago)) throw new Error('Método de pago no válido')
  if (!entero(v.descuento)) throw new Error('El descuento tiene que ser un número entero')
  if (!v.items.length) throw new Error('La venta no tiene productos')
  if (v.cuotas) {
    if (v.clienteId === null) throw new Error('Para vender en cuotas hay que elegir el cliente')
    if (
      !Number.isInteger(v.cuotas.cantidad) ||
      v.cuotas.cantidad < 1 ||
      v.cuotas.cantidad > MAX_CUOTAS
    )
      throw new Error(`La cantidad de cuotas tiene que ser de 1 a ${MAX_CUOTAS}`)
    if (!entero(v.cuotas.entrega)) throw new Error('La entrega tiene que ser un número entero')
  }

  // Si el mismo producto vino en dos renglones, se suman.
  const cantidades = new Map<number, number>()
  for (const it of v.items) {
    if (!entero(it.cantidad) || it.cantidad === 0)
      throw new Error('Las cantidades tienen que ser números enteros mayores a cero')
    cantidades.set(it.productoId, (cantidades.get(it.productoId) ?? 0) + it.cantidad)
  }

  const db = getDb()
  const id = transaccion(db, () => {
    const cajaId = exigirCajaAbierta()
    if (
      v.clienteId !== null &&
      !db.prepare('SELECT 1 FROM clientes WHERE id = ? AND activo = 1').get(v.clienteId)
    )
      throw new Error('El cliente no existe')

    const renglones = [...cantidades].map(([productoId, cantidad]) => {
      const p = db
        .prepare(
          'SELECT id, codigo, nombre, stock, precio_venta AS precio, precio_compra AS costo FROM productos WHERE id = ? AND activo = 1'
        )
        .get(productoId) as
        | {
            id: number
            codigo: string
            nombre: string
            stock: number
            precio: number
            costo: number
          }
        | undefined
      if (!p) throw new Error('Uno de los productos ya no existe')
      if (p.stock < cantidad)
        throw new Error(`No alcanza el stock de ${p.codigo} ${p.nombre}: quedan ${p.stock}`)
      return { ...p, cantidad, subtotal: p.precio * cantidad }
    })

    const subtotal = renglones.reduce((s, r) => s + r.subtotal, 0)
    if (v.descuento > subtotal) throw new Error('El descuento no puede superar el total')
    const total = subtotal - v.descuento
    if (v.cuotas && total - v.cuotas.entrega < v.cuotas.cantidad)
      throw new Error('La entrega cubre todo: registrala de contado')

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO ventas (usuario_id, caja_id, cliente_id, subtotal, descuento, total, metodo_pago, condicion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        u.id,
        cajaId,
        v.clienteId,
        subtotal,
        v.descuento,
        total,
        v.metodoPago,
        v.cuotas ? 'cuotas' : 'contado'
      )
    const ventaId = Number(lastInsertRowid)

    const insertarItem = db.prepare(
      `INSERT INTO venta_items (venta_id, producto_id, codigo, nombre, cantidad, precio, subtotal, costo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const descontar = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?')
    for (const r of renglones) {
      insertarItem.run(ventaId, r.id, r.codigo, r.nombre, r.cantidad, r.precio, r.subtotal, r.costo)
      descontar.run(r.cantidad, r.id)
    }
    if (v.cuotas) crearCuotas(ventaId, v.clienteId as number, total, v.cuotas, v.metodoPago)
    auditar(
      'crear',
      'venta',
      ventaId,
      `Total ${total}${v.cuotas ? ` en ${v.cuotas.cantidad} cuotas` : ''}`
    )
    return ventaId
  })
  return obtenerVenta(id)
}

// La entrega es la cuota 0, ya cobrada; el resto vence el mismo día de los meses siguientes.
function crearCuotas(
  ventaId: number,
  clienteId: number,
  total: number,
  plan: { cantidad: number; entrega: number },
  metodo: MetodoPago
): void {
  const db = getDb()
  const { fecha } = db.prepare('SELECT fecha FROM ventas WHERE id = ?').get(ventaId) as {
    fecha: string
  }
  const insertar = db.prepare(
    'INSERT INTO cuotas (venta_id, numero, vencimiento, monto) VALUES (?, ?, ?, ?)'
  )
  if (plan.entrega > 0) {
    const { lastInsertRowid } = insertar.run(ventaId, 0, fecha.slice(0, 10), plan.entrega)
    insertarCobro(clienteId, metodo, [{ cuotaId: Number(lastInsertRowid), monto: plan.entrega }])
  }
  for (const c of calendarioCuotas(fecha, plan.cantidad, total - plan.entrega))
    insertar.run(ventaId, c.numero, c.vencimiento, c.monto)
}

// Para reimprimir o devolver una venta de cualquier día a partir del número del ticket.
export function buscarVenta(id: number): Venta {
  usuarioActual()
  if (!Number.isInteger(id) || id < 1) throw new Error('Número de venta no válido')
  return obtenerVenta(id)
}

export function proximaVenta(): number {
  usuarioActual()
  const f = getDb().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM ventas').get() as {
    n: number
  }
  return f.n
}

// fecha: AAAA-MM-DD. Incluye las anuladas, marcadas.
export function ventasDelDia(fecha: string): Venta[] {
  usuarioActual()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha no válida')
  const filas = getDb()
    .prepare(`${SELECT_VENTA} WHERE date(v.fecha) = ? ORDER BY v.id DESC`)
    .all(fecha) as unknown as FilaVenta[]
  return filas.map(conItems)
}

// Anular devuelve la mercadería al stock. La venta queda registrada, marcada como anulada.
// Si es de la caja abierta, deja de contar en su arqueo; si es de una caja ya cerrada, la plata
// devuelta sale de la caja abierta como egreso (la cerrada no se toca).
// En cuotas: se le devuelve al cliente lo que pagó de esa venta (ver devolverPagos).
export function anularVenta(id: number, motivo: string): Venta {
  const u = exigirAdmin()
  if (!motivo.trim()) throw new Error('Indicá el motivo de la anulación')
  const db = getDb()
  transaccion(db, () => {
    const venta = db
      .prepare(
        'SELECT caja_id AS cajaId, total, metodo_pago AS metodo, condicion FROM ventas WHERE id = ?'
      )
      .get(id) as
      { cajaId: number | null; total: number; metodo: MetodoPago; condicion: string } | undefined
    const { changes } = db
      .prepare(
        `UPDATE ventas SET anulada_en = datetime('now', 'localtime'), anulada_por = ?,
           motivo_anulacion = ? WHERE id = ? AND anulada_en IS NULL`
      )
      .run(u.id, motivo.trim(), id)
    if (!venta || !changes) throw new Error('La venta no existe o ya está anulada')
    if (db.prepare('SELECT 1 FROM devoluciones WHERE venta_id = ?').get(id))
      throw new Error('La venta ya tiene devoluciones: devolvé lo que queda en vez de anularla')
    if (venta.condicion === 'cuotas') devolverPagos(id, u.id)
    else if (venta.cajaId !== null && venta.cajaId !== cajaAbiertaId())
      registrarDevolucion(id, venta.total, venta.metodo)
    db.prepare(
      `UPDATE productos SET stock = stock + (
         SELECT SUM(cantidad) FROM venta_items WHERE venta_id = ? AND producto_id = productos.id)
       WHERE id IN (SELECT producto_id FROM venta_items WHERE venta_id = ?)`
    ).run(id, id)
    auditar('anular', 'venta', id, motivo.trim())
  })
  return obtenerVenta(id)
}

// Lo que el cliente pagó de esta venta (entrega y cuotas) se le devuelve. Un pago de la caja
// abierta que era solo de esta venta se anula; si no (caja cerrada, o el pago cubrió también otra
// venta), la parte de esta venta sale de la caja abierta como "Devolución de venta".
function devolverPagos(ventaId: number, usuarioId: number): void {
  const db = getDb()
  const partes = db
    .prepare(
      `SELECT b.id AS cobroId, b.caja_id AS cajaId, b.metodo_pago AS metodo, cc.monto,
         q.venta_id AS ventaId
       FROM cobros b
       JOIN cobro_cuotas cc ON cc.cobro_id = b.id
       JOIN cuotas q ON q.id = cc.cuota_id
       WHERE b.anulado_en IS NULL AND b.id IN (
         SELECT cc2.cobro_id FROM cobro_cuotas cc2 JOIN cuotas q2 ON q2.id = cc2.cuota_id
         WHERE q2.venta_id = ?)`
    )
    .all(ventaId) as {
    cobroId: number
    cajaId: number
    metodo: MetodoPago
    monto: number
    ventaId: number
  }[]
  const abierta = cajaAbiertaId()
  const aDevolver = new Map<MetodoPago, number>()
  for (const cobroId of new Set(partes.map((p) => p.cobroId))) {
    const delCobro = partes.filter((p) => p.cobroId === cobroId)
    const deEsta = delCobro.filter((p) => p.ventaId === ventaId)
    if (delCobro[0].cajaId === abierta && deEsta.length === delCobro.length) {
      db.prepare(
        `UPDATE cobros SET anulado_en = datetime('now', 'localtime'), anulado_por = ?,
           motivo_anulacion = ? WHERE id = ?`
      ).run(usuarioId, `Anulación de la venta N° ${ventaId}`, cobroId)
    } else {
      const m = delCobro[0].metodo
      aDevolver.set(m, (aDevolver.get(m) ?? 0) + deEsta.reduce((s, p) => s + p.monto, 0))
    }
  }
  for (const [metodo, monto] of aDevolver)
    if (monto > 0)
      registrarDevolucion(
        ventaId,
        monto,
        metodo,
        `Anulación de la venta en cuotas N° ${ventaId}: se devuelve lo pagado`
      )
}

// Devolver parte de una venta (o todo lo que queda). Vuelve el stock de lo devuelto, y su valor
// (con el descuento de la venta repartido en proporción) se le devuelve al cliente: al contado, en
// plata desde la caja abierta; en cuotas, primero se descuenta de las últimas cuotas impagas y solo
// lo que sobra sale en plata. metodo: cómo se le devuelve la plata.
export function devolverItems(
  ventaId: number,
  items: { itemId: number; cantidad: number }[],
  motivo: string,
  metodo: MetodoPago
): Devolucion {
  const u = exigirAdmin()
  if (!motivo.trim()) throw new Error('Indicá el motivo de la devolución')
  if (!METODOS_PAGO.includes(metodo)) throw new Error('Método de pago no válido')
  const pedidos = items.filter((it) => it.cantidad !== 0)
  if (!pedidos.length) throw new Error('Elegí qué productos se devuelven')
  const db = getDb()
  const r = transaccion(db, () => {
    const cajaId = exigirCajaAbierta()
    const venta = obtenerVenta(ventaId)
    if (venta.anulada) throw new Error('La venta está anulada')

    const renglones = pedidos.map((p) => {
      const it = venta.items.find((i) => i.id === p.itemId)
      if (!it) throw new Error('Ese producto no es de esta venta')
      if (!entero(p.cantidad))
        throw new Error('Las cantidades tienen que ser números enteros mayores a cero')
      if (p.cantidad > it.cantidad - it.devueltos)
        throw new Error(`De ${it.nombre} se pueden devolver ${it.cantidad - it.devueltos}`)
      const valor = venta.subtotal
        ? Math.round((it.precio * p.cantidad * venta.total) / venta.subtotal)
        : 0
      return { it, cantidad: p.cantidad, valor }
    })
    // Si con esta se devuelve todo, el valor es exactamente lo que faltaba (sin redondeos).
    const quedan = venta.items.reduce((s, i) => s + i.cantidad - i.devueltos, 0)
    const devuelve = renglones.reduce((s, x) => s + x.cantidad, 0)
    let valor = renglones.reduce((s, x) => s + x.valor, 0)
    if (devuelve === quedan) {
      const ajuste = venta.total - venta.devuelto - valor
      renglones[renglones.length - 1].valor += ajuste
      valor += ajuste
    }

    // En cuotas: se descuenta de las últimas cuotas, hasta lo que falta pagar de cada una.
    let descontado = 0
    if (venta.condicion === 'cuotas') {
      const cuotas = db
        .prepare(
          `SELECT q.id, q.monto - q.descontado - COALESCE((SELECT SUM(cc.monto) FROM cobro_cuotas cc
             JOIN cobros b ON b.id = cc.cobro_id WHERE cc.cuota_id = q.id AND b.anulado_en IS NULL), 0) AS saldo
           FROM cuotas q WHERE q.venta_id = ? ORDER BY q.numero DESC`
        )
        .all(ventaId) as { id: number; saldo: number }[]
      const descontar = db.prepare('UPDATE cuotas SET descontado = descontado + ? WHERE id = ?')
      for (const q of cuotas) {
        const m = Math.min(q.saldo, valor - descontado)
        if (m <= 0) continue
        descontar.run(m, q.id)
        descontado += m
      }
    }
    const reintegro = valor - descontado

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO devoluciones (venta_id, caja_id, usuario_id, valor, descontado, reintegro, metodo_pago, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ventaId,
        cajaId,
        u.id,
        valor,
        descontado,
        reintegro,
        reintegro ? metodo : null,
        motivo.trim()
      )
    const devolucionId = Number(lastInsertRowid)
    const insertarItem = db.prepare(
      'INSERT INTO devolucion_items (devolucion_id, venta_item_id, cantidad, valor) VALUES (?, ?, ?, ?)'
    )
    const reponer = db.prepare(
      'UPDATE productos SET stock = stock + ? WHERE id = (SELECT producto_id FROM venta_items WHERE id = ?)'
    )
    for (const x of renglones) {
      insertarItem.run(devolucionId, x.it.id, x.cantidad, x.valor)
      reponer.run(x.cantidad, x.it.id)
    }
    if (reintegro)
      registrarDevolucion(
        ventaId,
        reintegro,
        metodo,
        `Devolución de productos de la venta N° ${ventaId}`,
        devolucionId
      )
    auditar('devolver', 'venta', ventaId, `${motivo.trim()} (valor ${valor})`)
    return { valor, descontado, reintegro }
  })
  return { venta: obtenerVenta(ventaId), ...r }
}
