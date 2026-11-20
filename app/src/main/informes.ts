import { getDb } from './db'
import { exigirAdmin } from './usuarios'
import { cajaAbiertaId, calcularResumen } from './caja'
import { clientesConSaldo } from './cuotas'
import { diasEntre } from '../shared/cuotas'
import {
  METODOS_PAGO,
  type Informe,
  type InformeAuditoria,
  type InformeCaja,
  type InformeProducto,
  type InformeVentasDia,
  type MetodoPago
} from '../shared/tipos'

const hoy = (): string => new Date().toLocaleDateString('sv-SE')
const esFecha = (f: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(f)

// Todo el informe de un período (desde y hasta incluidos). Ventas, caja, productos y auditoría son
// del período; stock y cuotas, de hoy.
export function informe(desde: string, hasta: string): Informe {
  exigirAdmin()
  if (!esFecha(desde) || !esFecha(hasta)) throw new Error('Fecha no válida')
  if (desde > hasta) throw new Error('La fecha "desde" es posterior a "hasta"')
  // Las fechas se guardan como "AAAA-MM-DD HH:MM:SS": así se usa el índice de cada fecha.
  const rango = [desde, `${hasta} 23:59:59`] as const
  return {
    desde,
    hasta,
    ventasPorDia: ventasPorDia(rango),
    porMetodo: porMetodo(rango),
    cajas: cajas(rango),
    gastos: movimientos(rango, 'egreso'),
    ingresos: movimientos(rango, 'ingreso'),
    productos: productos(rango),
    stock: stock(),
    cuotas: cuotas(),
    auditoria: auditoria(rango)
  }
}

type Rango = readonly [string, string]

function ventasPorDia(rango: Rango): InformeVentasDia[] {
  const db = getDb()
  const ventas = db
    .prepare(
      `SELECT substr(fecha, 1, 10) AS dia, COUNT(*) AS cantidad,
         SUM(CASE WHEN condicion = 'contado' THEN total ELSE 0 END) AS contado,
         SUM(CASE WHEN condicion = 'cuotas' THEN total ELSE 0 END) AS cuotas
       FROM ventas WHERE anulada_en IS NULL AND fecha BETWEEN ? AND ?
       GROUP BY dia`
    )
    .all(...rango) as unknown as Omit<InformeVentasDia, 'devuelto'>[]
  // Las devoluciones van el día que se hicieron, aunque la venta sea de otro día.
  const devoluciones = db
    .prepare(
      `SELECT substr(fecha, 1, 10) AS dia, SUM(valor) AS devuelto FROM devoluciones
       WHERE fecha BETWEEN ? AND ? GROUP BY dia`
    )
    .all(...rango) as { dia: string; devuelto: number }[]
  const dias = new Map<string, InformeVentasDia>()
  for (const v of ventas) dias.set(v.dia, { ...v, devuelto: 0 })
  for (const d of devoluciones)
    dias.set(d.dia, {
      ...(dias.get(d.dia) ?? { dia: d.dia, cantidad: 0, contado: 0, cuotas: 0 }),
      devuelto: d.devuelto
    })
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia))
}

// La plata que entró por ventas: contado por método de la venta, y cobros de cuotas por el suyo.
function porMetodo(rango: Rango): Informe['porMetodo'] {
  const db = getDb()
  const contado = db
    .prepare(
      `SELECT metodo_pago AS metodo, SUM(total) AS monto FROM ventas
       WHERE anulada_en IS NULL AND condicion = 'contado' AND fecha BETWEEN ? AND ?
       GROUP BY metodo_pago`
    )
    .all(...rango) as { metodo: MetodoPago; monto: number }[]
  const cobros = db
    .prepare(
      `SELECT metodo_pago AS metodo, SUM(monto) AS monto FROM cobros
       WHERE anulado_en IS NULL AND fecha BETWEEN ? AND ? GROUP BY metodo_pago`
    )
    .all(...rango) as { metodo: MetodoPago; monto: number }[]
  return METODOS_PAGO.map((metodo) => ({
    metodo,
    contado: contado.find((f) => f.metodo === metodo)?.monto ?? 0,
    cobros: cobros.find((f) => f.metodo === metodo)?.monto ?? 0
  }))
}

// Cada caja con los números de su cierre, que no cambian; la abierta, con los de ahora.
function cajas(rango: Rango): InformeCaja[] {
  const db = getDb()
  const filas = db
    .prepare(
      `SELECT c.id, c.abierta_en AS abiertaEn, c.cerrada_en AS cerradaEn, c.monto_inicial AS inicial,
         SUM(a.ventas) AS ventas, SUM(a.cobros) AS cobros, SUM(a.ingresos) AS ingresos,
         SUM(a.egresos) AS egresos, SUM(a.esperado) AS esperado, SUM(a.contado) AS contado
       FROM cajas c LEFT JOIN caja_arqueo a ON a.caja_id = c.id
       WHERE c.abierta_en BETWEEN ? AND ? GROUP BY c.id ORDER BY c.id`
    )
    .all(...rango) as unknown as (Omit<InformeCaja, 'diferencia'> & {
    inicial: number
    contado: number | null
  })[]
  const abierta = cajaAbiertaId()
  return filas.map(({ inicial, contado, ...c }) => {
    if (c.id !== abierta)
      return {
        ...c,
        esperado: c.esperado - inicial,
        diferencia: contado === null ? null : contado - c.esperado
      }
    const r = calcularResumen(c.id, inicial)
    const suma = (k: 'ventas' | 'cobros' | 'ingresos' | 'egresos'): number =>
      r.reduce((s, x) => s + x[k], 0)
    const [ventas, cobros, ingresos, egresos] = [
      suma('ventas'),
      suma('cobros'),
      suma('ingresos'),
      suma('egresos')
    ]
    return {
      ...c,
      ventas,
      cobros,
      ingresos,
      egresos,
      esperado: ventas + cobros + ingresos - egresos,
      diferencia: null
    }
  })
}

// Por categoría, sin las "Corrección": deshacen otro movimiento que ya no se cuenta (anulado).
function movimientos(rango: Rango, tipo: 'ingreso' | 'egreso'): Informe['gastos'] {
  return getDb()
    .prepare(
      `SELECT k.nombre AS categoria, SUM(m.monto) AS monto, COUNT(*) AS cantidad
       FROM movimientos_caja m JOIN categorias_caja k ON k.id = m.categoria_id
       WHERE m.tipo = ? AND m.anulado_en IS NULL AND m.fecha BETWEEN ? AND ?
         AND NOT (k.sistema = 1 AND k.nombre = 'Corrección')
       GROUP BY k.id ORDER BY monto DESC`
    )
    .all(tipo, ...rango) as Informe['gastos']
}

// El importe de cada renglón lleva su parte del descuento de la venta (como en las devoluciones);
// el costo es el que tenía el producto al venderse.
function productos(rango: Rango): InformeProducto[] {
  return getDb()
    .prepare(
      `SELECT vi.producto_id AS productoId, p.codigo, p.nombre,
         SUM(vi.cantidad - COALESCE(d.cantidad, 0)) AS unidades,
         SUM(CASE WHEN v.subtotal = 0 THEN 0
               ELSE CAST(ROUND(vi.subtotal * 1.0 * v.total / v.subtotal) AS INTEGER) END
             - COALESCE(d.valor, 0)) AS importe,
         SUM((vi.cantidad - COALESCE(d.cantidad, 0)) * vi.costo) AS costo
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       JOIN productos p ON p.id = vi.producto_id
       LEFT JOIN (SELECT venta_item_id, SUM(cantidad) AS cantidad, SUM(valor) AS valor
                  FROM devolucion_items GROUP BY venta_item_id) d ON d.venta_item_id = vi.id
       WHERE v.anulada_en IS NULL AND v.fecha BETWEEN ? AND ?
       GROUP BY vi.producto_id HAVING unidades > 0
       ORDER BY unidades DESC, importe DESC`
    )
    .all(...rango) as unknown as InformeProducto[]
}

function stock(): Informe['stock'] {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS productos, COALESCE(SUM(stock), 0) AS unidades,
         COALESCE(SUM(stock * precio_compra), 0) AS costo,
         COALESCE(SUM(stock * precio_venta), 0) AS venta,
         COALESCE(SUM(stock <= stock_minimo), 0) AS bajoMinimo
       FROM productos WHERE activo = 1`
    )
    .get() as Informe['stock']
}

const TRAMOS = [
  { tramo: '1 a 30 días', hasta: 30 },
  { tramo: '31 a 60 días', hasta: 60 },
  { tramo: '61 a 90 días', hasta: 90 },
  { tramo: 'Más de 90 días', hasta: Infinity }
]

function cuotas(): Informe['cuotas'] {
  const clientes = clientesConSaldo('', false)
  const h = hoy()
  const vencidas = getDb()
    .prepare(
      `SELECT q.vencimiento, q.monto - q.descontado
         - COALESCE((SELECT SUM(cc.monto) FROM cobro_cuotas cc JOIN cobros b ON b.id = cc.cobro_id
                     WHERE cc.cuota_id = q.id AND b.anulado_en IS NULL), 0) AS saldo
       FROM cuotas q JOIN ventas v ON v.id = q.venta_id
       WHERE v.anulada_en IS NULL AND q.vencimiento < ?`
    )
    .all(h) as { vencimiento: string; saldo: number }[]
  const atraso = TRAMOS.map((t) => ({ tramo: t.tramo, monto: 0, cuotas: 0 }))
  for (const q of vencidas) {
    if (q.saldo <= 0) continue
    const dias = diasEntre(q.vencimiento, h)
    const i = TRAMOS.findIndex((t) => dias <= t.hasta)
    atraso[i].monto += q.saldo
    atraso[i].cuotas++
  }
  return {
    saldo: clientes.reduce((s, c) => s + c.saldo, 0),
    vencido: clientes.reduce((s, c) => s + c.vencido, 0),
    clientes: clientes.length,
    atraso,
    morosos: clientes.filter((c) => c.vencido > 0)
  }
}

// Las últimas 1000 acciones del período, la más nueva primero.
function auditoria(rango: Rango): InformeAuditoria[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.fecha, u.usuario, a.accion, a.entidad, a.entidad_id AS entidadId, a.detalle
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.fecha BETWEEN ? AND ? ORDER BY a.id DESC LIMIT 1000`
    )
    .all(...rango) as unknown as InformeAuditoria[]
}
