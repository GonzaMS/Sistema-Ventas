import { getDb, transaccion } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import { exigirCajaAbierta, insertarCobro } from './caja'
import { obtenerVenta } from './ventas'
import { diasEntre } from '../shared/cuotas'
import {
  METODOS_PAGO,
  type Cliente,
  type Cobro,
  type CuentaCliente,
  type Cuota,
  type MetodoPago,
  type ResumenCliente
} from '../shared/tipos'

// Fecha local de hoy, AAAA-MM-DD.
const hoy = (): string => new Date().toLocaleDateString('sv-SE')

// Cuotas de ventas no anuladas, con lo pagado según los cobros no anulados. El monto ya tiene
// restado lo que se descontó por devoluciones; la cuota que quedó en cero no aparece.
const SELECT_CUOTAS = `SELECT q.id, q.venta_id AS ventaId, q.numero, q.vencimiento,
    q.monto - q.descontado AS monto,
    COALESCE((SELECT SUM(cc.monto) FROM cobro_cuotas cc JOIN cobros b ON b.id = cc.cobro_id
              WHERE cc.cuota_id = q.id AND b.anulado_en IS NULL), 0) AS pagado
  FROM cuotas q JOIN ventas v ON v.id = q.venta_id
  WHERE v.anulada_en IS NULL AND v.cliente_id = ? AND q.monto > q.descontado
  ORDER BY q.vencimiento, q.venta_id, q.numero`

function cuotasDeCliente(clienteId: number): Cuota[] {
  const h = hoy()
  const filas = getDb().prepare(SELECT_CUOTAS).all(clienteId) as unknown as Omit<
    Cuota,
    'saldo' | 'estado' | 'diasAtraso'
  >[]
  return filas.map((f) => {
    const saldo = f.monto - f.pagado
    const atraso = saldo > 0 ? Math.max(diasEntre(f.vencimiento, h), 0) : 0
    const estado =
      saldo === 0 ? 'pagada' : atraso > 0 ? 'atrasada' : f.pagado > 0 ? 'parcial' : 'pendiente'
    return { ...f, saldo, estado, diasAtraso: atraso }
  })
}

function cliente(id: number): Cliente {
  const c = getDb()
    .prepare('SELECT id, nombre, documento, telefono, direccion FROM clientes WHERE id = ?')
    .get(id) as Cliente | undefined
  if (!c) throw new Error('El cliente no existe')
  return c
}

// Clientes que deben algo, los más atrasados primero.
// incluirSinSaldo: también los clientes que no deben nada (para ver su historial o editarlos).
export function clientesConSaldo(
  texto: string,
  soloAtrasados: boolean,
  incluirSinSaldo = false
): ResumenCliente[] {
  usuarioActual()
  const patron = `%${texto.trim()}%`
  const ids = getDb()
    .prepare(
      incluirSinSaldo
        ? `SELECT id FROM clientes
           WHERE activo = 1 AND (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)`
        : `SELECT DISTINCT c.id FROM clientes c JOIN ventas v ON v.cliente_id = c.id
           WHERE v.condicion = 'cuotas' AND v.anulada_en IS NULL
             AND (c.nombre LIKE ? OR c.documento LIKE ? OR c.telefono LIKE ?)`
    )
    .all(patron, patron, patron) as { id: number }[]

  return ids
    .map(({ id }) => {
      const pendientes = cuotasDeCliente(id).filter((q) => q.saldo > 0)
      const vencidas = pendientes.filter((q) => q.diasAtraso > 0)
      return {
        cliente: cliente(id),
        saldo: pendientes.reduce((s, q) => s + q.saldo, 0),
        vencido: vencidas.reduce((s, q) => s + q.saldo, 0),
        cuotasVencidas: vencidas.length,
        proximoVencimiento: pendientes[0]?.vencimiento ?? null,
        diasAtraso: pendientes[0]?.diasAtraso ?? 0
      }
    })
    .filter((r) => (incluirSinSaldo || r.saldo > 0) && (!soloAtrasados || r.vencido > 0))
    .sort((a, b) => b.diasAtraso - a.diasAtraso || a.cliente.nombre.localeCompare(b.cliente.nombre))
}

function cobrosDeCliente(clienteId: number): Cobro[] {
  const db = getDb()
  const filas = db
    .prepare(
      `SELECT b.id, b.fecha, u.usuario, b.monto, b.metodo_pago AS metodoPago,
         b.anulado_en IS NOT NULL AS anulado
       FROM cobros b JOIN usuarios u ON u.id = b.usuario_id
       WHERE b.cliente_id = ? ORDER BY b.id DESC`
    )
    .all(clienteId) as unknown as (Omit<Cobro, 'anulado' | 'esEntrega' | 'aplicado'> & {
    anulado: number
  })[]
  const aplicado = db.prepare(
    `SELECT q.venta_id AS ventaId, q.numero, cc.monto FROM cobro_cuotas cc
     JOIN cuotas q ON q.id = cc.cuota_id WHERE cc.cobro_id = ? ORDER BY q.vencimiento, q.numero`
  )
  return filas.map((f) => {
    const a = aplicado.all(f.id) as Cobro['aplicado']
    return { ...f, anulado: f.anulado === 1, esEntrega: a.some((x) => x.numero === 0), aplicado: a }
  })
}

export function cuentaCliente(clienteId: number): CuentaCliente {
  usuarioActual()
  const cuotas = cuotasDeCliente(clienteId)
  const ventaIds = [...new Set(cuotas.map((q) => q.ventaId))].sort((a, b) => b - a)
  const pendientes = cuotas.filter((q) => q.saldo > 0)
  return {
    cliente: cliente(clienteId),
    saldo: pendientes.reduce((s, q) => s + q.saldo, 0),
    vencido: pendientes.filter((q) => q.diasAtraso > 0).reduce((s, q) => s + q.saldo, 0),
    ventas: ventaIds.map((id) => ({
      ...obtenerVenta(id),
      cuotas: cuotas.filter((q) => q.ventaId === id).sort((a, b) => a.numero - b.numero)
    })),
    cobros: cobrosDeCliente(clienteId)
  }
}

// El pago se aplica a las cuotas impagas más viejas primero (de cualquier venta del cliente).
export function cobrarCuotas(clienteId: number, monto: number, metodo: MetodoPago): Cobro {
  usuarioActual()
  if (!METODOS_PAGO.includes(metodo)) throw new Error('Método de pago no válido')
  if (!Number.isInteger(monto) || monto <= 0)
    throw new Error('El monto tiene que ser un número entero mayor a cero')
  const db = getDb()
  const id = transaccion(db, () => {
    const pendientes = cuotasDeCliente(clienteId).filter((q) => q.saldo > 0)
    const saldo = pendientes.reduce((s, q) => s + q.saldo, 0)
    if (!saldo) throw new Error('El cliente no tiene saldo pendiente')
    if (monto > saldo)
      throw new Error(`El pago supera lo que debe (Gs. ${saldo.toLocaleString('es-PY')})`)
    const aplicaciones: { cuotaId: number; monto: number }[] = []
    let resto = monto
    for (const q of pendientes) {
      if (!resto) break
      const m = Math.min(resto, q.saldo)
      aplicaciones.push({ cuotaId: q.id, monto: m })
      resto -= m
    }
    const cobroId = insertarCobro(clienteId, metodo, aplicaciones)
    auditar('crear', 'cobro', cobroId, `Cliente ${clienteId}: ${monto}`)
    return cobroId
  })
  const cobro = cobrosDeCliente(clienteId).find((c) => c.id === id)
  if (!cobro) throw new Error('No se encontró el cobro')
  return cobro
}

// Si el pago es de la caja abierta, deja de contar en su arqueo. Si es de una caja cerrada (que
// no cambia), la plata sale de la caja abierta como "Corrección". La deuda vuelve a las cuotas.
export function anularCobro(id: number, motivo: string): void {
  const u = exigirAdmin()
  if (!motivo.trim()) throw new Error('Indicá el motivo de la anulación')
  const db = getDb()
  const c = db
    .prepare(
      `SELECT b.caja_id AS cajaId, b.monto, b.metodo_pago AS metodo,
         b.anulado_en IS NOT NULL AS anulado,
         EXISTS (SELECT 1 FROM cobro_cuotas cc JOIN cuotas q ON q.id = cc.cuota_id
                 WHERE cc.cobro_id = b.id AND q.numero = 0) AS esEntrega
       FROM cobros b WHERE b.id = ?`
    )
    .get(id) as
    | { cajaId: number; monto: number; metodo: MetodoPago; anulado: number; esEntrega: number }
    | undefined
  if (!c) throw new Error('El cobro no existe')
  if (c.anulado) throw new Error('El cobro ya está anulado')
  if (c.esEntrega) throw new Error('Es la entrega de una venta: se anula anulando la venta')
  const abierta = exigirCajaAbierta()
  transaccion(db, () => {
    db.prepare(
      `UPDATE cobros SET anulado_en = datetime('now', 'localtime'), anulado_por = ?,
         motivo_anulacion = ? WHERE id = ?`
    ).run(u.id, motivo.trim(), id)
    if (c.cajaId !== abierta)
      db.prepare(
        `INSERT INTO movimientos_caja
           (caja_id, usuario_id, tipo, categoria_id, descripcion, monto, metodo_pago, cobro_id)
         VALUES (?, ?, 'egreso',
           (SELECT id FROM categorias_caja WHERE sistema = 1 AND nombre = 'Corrección' AND tipo = 'egreso'),
           ?, ?, ?, ?)`
      ).run(
        abierta,
        u.id,
        `Anula el pago de cuotas N° ${id} de la caja N° ${c.cajaId}: ${motivo.trim()}`,
        c.monto,
        c.metodo,
        id
      )
    auditar('anular', 'cobro', id, motivo.trim())
  })
}
