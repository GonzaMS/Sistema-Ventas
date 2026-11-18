import { getDb, transaccion } from './db'
import { auditar, exigirAdmin, usuarioActual } from './usuarios'
import { arqueoCiegoParaMi } from './negocio'
import {
  METODOS_PAGO,
  type Caja,
  type CategoriaCaja,
  type MetodoPago,
  type MovimientoCaja,
  type MovimientoNuevo,
  type ResumenMetodo,
  type TipoMovimiento
} from '../shared/tipos'

const entero = (n: number): boolean => Number.isInteger(n) && n >= 0

export function cajaAbiertaId(): number | null {
  const f = getDb().prepare('SELECT id FROM cajas WHERE cerrada_en IS NULL').get() as
    { id: number } | undefined
  return f?.id ?? null
}

export function exigirCajaAbierta(): number {
  const id = cajaAbiertaId()
  if (id === null) throw new Error('La caja está cerrada. Abrila en la pestaña Caja')
  return id
}

// Para elegir al cargar un movimiento: solo las activas. El admin puede pedir todas para editarlas.
export function categoriasCaja(incluirInactivas = false): CategoriaCaja[] {
  if (incluirInactivas) exigirAdmin()
  else usuarioActual()
  const filas = getDb()
    .prepare(
      `SELECT id, nombre, tipo, sistema, activo FROM categorias_caja
       ${incluirInactivas ? '' : 'WHERE activo = 1'} ORDER BY tipo, nombre`
    )
    .all() as unknown as (Omit<CategoriaCaja, 'sistema' | 'activo'> & {
    sistema: number
    activo: number
  })[]
  return filas.map((f) => ({ ...f, sistema: f.sistema === 1, activo: f.activo === 1 }))
}

function categoriaEditable(id: number): { tipo: TipoMovimiento } {
  const c = getDb().prepare('SELECT tipo, sistema FROM categorias_caja WHERE id = ?').get(id) as
    { tipo: TipoMovimiento; sistema: number } | undefined
  if (!c) throw new Error('La categoría no existe')
  if (c.sistema) throw new Error('Esta categoría la usa el sistema y no se puede cambiar')
  return c
}

function nombreLibre(nombre: string, tipo: TipoMovimiento, salvoId = 0): string {
  const n = nombre.trim()
  if (!n) throw new Error('Falta el nombre de la categoría')
  if (
    getDb()
      .prepare('SELECT 1 FROM categorias_caja WHERE nombre = ? AND tipo = ? AND id <> ?')
      .get(n, tipo, salvoId)
  )
    throw new Error(`Ya existe la categoría ${n}`)
  return n
}

export function crearCategoria(nombre: string, tipo: TipoMovimiento): CategoriaCaja {
  exigirAdmin()
  if (tipo !== 'ingreso' && tipo !== 'egreso') throw new Error('Tipo no válido')
  const n = nombreLibre(nombre, tipo)
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO categorias_caja (nombre, tipo) VALUES (?, ?)')
    .run(n, tipo)
  const id = Number(lastInsertRowid)
  auditar('crear', 'categoria_caja', id, `${tipo} ${n}`)
  return { id, nombre: n, tipo, sistema: false, activo: true }
}

// Renombrar cambia el nombre también en los movimientos viejos (apuntan a la categoría).
export function editarCategoria(id: number, nombre: string): void {
  exigirAdmin()
  const { tipo } = categoriaEditable(id)
  const n = nombreLibre(nombre, tipo, id)
  getDb().prepare('UPDATE categorias_caja SET nombre = ? WHERE id = ?').run(n, id)
  auditar('modificar', 'categoria_caja', id, n)
}

// Desactivada no aparece para cargar movimientos; los viejos la siguen mostrando.
export function activarCategoria(id: number, activo: boolean): void {
  exigirAdmin()
  categoriaEditable(id)
  getDb()
    .prepare('UPDATE categorias_caja SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id)
  auditar(activo ? 'activar' : 'desactivar', 'categoria_caja', id, null)
}

// Lo que debería haber en una caja abierta, calculado desde las ventas y los movimientos.
function calcularResumen(cajaId: number, montoInicial: number): ResumenMetodo[] {
  const db = getDb()
  const ventas = db
    .prepare(
      `SELECT metodo_pago AS metodo, SUM(total) AS monto FROM ventas
       WHERE caja_id = ? AND anulada_en IS NULL AND condicion = 'contado' GROUP BY metodo_pago`
    )
    .all(cajaId) as { metodo: MetodoPago; monto: number }[]
  const cobros = db
    .prepare(
      `SELECT metodo_pago AS metodo, SUM(monto) AS monto FROM cobros
       WHERE caja_id = ? AND anulado_en IS NULL GROUP BY metodo_pago`
    )
    .all(cajaId) as { metodo: MetodoPago; monto: number }[]
  const movs = db
    .prepare(
      `SELECT metodo_pago AS metodo, tipo, SUM(monto) AS monto FROM movimientos_caja
       WHERE caja_id = ? AND anulado_en IS NULL GROUP BY metodo_pago, tipo`
    )
    .all(cajaId) as { metodo: MetodoPago; tipo: string; monto: number }[]

  return METODOS_PAGO.map((metodo) => {
    const inicial = metodo === 'efectivo' ? montoInicial : 0
    const v = ventas.find((f) => f.metodo === metodo)?.monto ?? 0
    const cob = cobros.find((f) => f.metodo === metodo)?.monto ?? 0
    const ing = movs.find((f) => f.metodo === metodo && f.tipo === 'ingreso')?.monto ?? 0
    const egr = movs.find((f) => f.metodo === metodo && f.tipo === 'egreso')?.monto ?? 0
    return {
      metodo,
      inicial,
      ventas: v,
      cobros: cob,
      ingresos: ing,
      egresos: egr,
      esperado: inicial + v + cob + ing - egr,
      contado: null
    }
  })
}

type FilaCaja = Omit<Caja, 'resumen' | 'movimientos'>

function obtenerCaja(id: number): Caja {
  const db = getDb()
  const c = db
    .prepare(
      `SELECT c.id, c.abierta_en AS abiertaEn, a.usuario AS abiertaPor,
         c.monto_inicial AS montoInicial, c.cerrada_en AS cerradaEn, z.usuario AS cerradaPor,
         c.observacion,
         (SELECT COUNT(*) FROM ventas v WHERE v.caja_id = c.id AND v.anulada_en IS NULL)
           AS cantidadVentas
       FROM cajas c
       JOIN usuarios a ON a.id = c.abierta_por
       LEFT JOIN usuarios z ON z.id = c.cerrada_por
       WHERE c.id = ?`
    )
    .get(id) as FilaCaja | undefined
  if (!c) throw new Error('La caja no existe')

  const movimientos = (
    db
      .prepare(
        `SELECT m.id, m.fecha, u.usuario, m.tipo, k.nombre AS categoria, m.descripcion, m.monto,
           m.metodo_pago AS metodoPago, m.venta_id AS ventaId, m.corrige_id AS corrigeId, m.compra_id AS compraId, m.cobro_id AS cobroId,
           (SELECT x.caja_id FROM movimientos_caja x WHERE x.corrige_id = m.id) AS corregidoEnCaja,
           m.anulado_en IS NOT NULL AS anulado
         FROM movimientos_caja m
         JOIN usuarios u ON u.id = m.usuario_id
         JOIN categorias_caja k ON k.id = m.categoria_id
         WHERE m.caja_id = ? ORDER BY m.id DESC`
      )
      .all(id) as unknown as (Omit<MovimientoCaja, 'anulado'> & { anulado: number })[]
  ).map((m) => ({ ...m, anulado: m.anulado === 1 }))

  const ciego = arqueoCiegoParaMi()
  const resumen = ciego
    ? []
    : c.cerradaEn
      ? (db
          .prepare(
            `SELECT metodo_pago AS metodo, inicial, ventas, cobros, ingresos, egresos, esperado, contado
           FROM caja_arqueo WHERE caja_id = ?`
          )
          .all(id) as unknown as ResumenMetodo[])
      : calcularResumen(id, c.montoInicial)

  return { ...c, ciego, resumen, movimientos }
}

export function cajaActual(): Caja | null {
  usuarioActual()
  const id = cajaAbiertaId()
  return id === null ? null : obtenerCaja(id)
}

export function abrirCaja(montoInicial: number): Caja {
  const u = usuarioActual()
  if (!entero(montoInicial)) throw new Error('El monto inicial tiene que ser un número entero')
  if (cajaAbiertaId() !== null) throw new Error('Ya hay una caja abierta')
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO cajas (abierta_por, monto_inicial) VALUES (?, ?)')
    .run(u.id, montoInicial)
  const id = Number(lastInsertRowid)
  auditar('abrir', 'caja', id, `Monto inicial ${montoInicial}`)
  return obtenerCaja(id)
}

export function registrarMovimiento(m: MovimientoNuevo): Caja {
  const u = usuarioActual()
  const cajaId = exigirCajaAbierta()
  if (m.tipo !== 'ingreso' && m.tipo !== 'egreso') throw new Error('Tipo de movimiento no válido')
  if (!METODOS_PAGO.includes(m.metodoPago)) throw new Error('Método de pago no válido')
  if (!entero(m.monto) || m.monto === 0)
    throw new Error('El monto tiene que ser un número entero mayor a cero')
  const cat = getDb()
    .prepare('SELECT tipo, sistema FROM categorias_caja WHERE id = ? AND activo = 1')
    .get(m.categoriaId) as { tipo: string; sistema: number } | undefined
  if (!cat || cat.tipo !== m.tipo || cat.sistema) throw new Error('Categoría no válida')

  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO movimientos_caja (caja_id, usuario_id, tipo, categoria_id, descripcion, monto, metodo_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cajaId, u.id, m.tipo, m.categoriaId, m.descripcion?.trim() || null, m.monto, m.metodoPago)
  auditar('crear', 'movimiento_caja', Number(lastInsertRowid), `${m.tipo} ${m.monto}`)
  return obtenerCaja(cajaId)
}

// Al anular una venta de una caja ya cerrada, la plata sale de la caja abierta. Se llama dentro de la transacción de la anulación.
export function registrarDevolucion(
  ventaId: number,
  monto: number,
  metodo: MetodoPago,
  descripcion = `Anulación de la venta N° ${ventaId}`,
  devolucionId: number | null = null
): void {
  const u = usuarioActual()
  const cajaId = exigirCajaAbierta()
  getDb()
    .prepare(
      `INSERT INTO movimientos_caja (caja_id, usuario_id, tipo, categoria_id, descripcion, monto, metodo_pago, venta_id, devolucion_id)
       VALUES (?, ?, 'egreso',
         (SELECT id FROM categorias_caja WHERE sistema = 1 AND nombre = 'Devolución de venta'),
         ?, ?, ?, ?, ?)`
    )
    .run(cajaId, u.id, descripcion, monto, metodo, ventaId, devolucionId)
}

// Entrega o pago de cuotas: entra a la caja abierta y se reparte entre las cuotas indicadas.
// Se llama dentro de una transacción; devuelve el id del cobro.
export function insertarCobro(
  clienteId: number,
  metodo: MetodoPago,
  aplicaciones: { cuotaId: number; monto: number }[]
): number {
  const u = usuarioActual()
  const cajaId = exigirCajaAbierta()
  const db = getDb()
  const total = aplicaciones.reduce((s, a) => s + a.monto, 0)
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO cobros (caja_id, usuario_id, cliente_id, monto, metodo_pago) VALUES (?, ?, ?, ?, ?)'
    )
    .run(cajaId, u.id, clienteId, total, metodo)
  const cobroId = Number(lastInsertRowid)
  const aplicar = db.prepare(
    'INSERT INTO cobro_cuotas (cobro_id, cuota_id, monto) VALUES (?, ?, ?)'
  )
  for (const a of aplicaciones) aplicar.run(cobroId, a.cuotaId, a.monto)
  return cobroId
}

// En la caja abierta se marca anulado. En una caja cerrada (que no cambia), además se carga el
// movimiento inverso, una "Corrección", en la caja abierta.
export function anularMovimiento(id: number, motivo: string): Caja {
  const u = exigirAdmin()
  if (!motivo.trim()) throw new Error('Indicá el motivo de la anulación')
  const m = getDb()
    .prepare(
      `SELECT venta_id AS ventaId, corrige_id AS corrigeId, compra_id AS compraId,
         cobro_id AS cobroId
       FROM movimientos_caja WHERE id = ?`
    )
    .get(id) as
    | {
        ventaId: number | null
        corrigeId: number | null
        compraId: number | null
        cobroId: number | null
      }
    | undefined
  if (!m) throw new Error('El movimiento no existe')
  if (m.ventaId !== null)
    throw new Error('Este egreso salió de anular o devolver una venta; no se puede anular aparte')
  if (m.corrigeId !== null || m.cobroId !== null)
    throw new Error('Es una corrección de otro movimiento; no se anula')
  if (m.compraId !== null)
    throw new Error(`Salió de la compra N° ${m.compraId}: se corrige desde Compras`)
  const abierta = exigirCajaAbierta()
  transaccion(getDb(), () => {
    revertirMovimiento(id, motivo.trim(), u.id)
    auditar('anular', 'movimiento_caja', id, motivo.trim())
  })
  return obtenerCaja(abierta)
}

// Marca anulado el movimiento y, si su caja ya cerró, carga el inverso en la caja abierta.
// Se llama dentro de una transacción; lo usan la anulación de movimientos y la de compras.
export function revertirMovimiento(id: number, motivo: string, usuarioId: number): void {
  const db = getDb()
  const m = db
    .prepare(
      `SELECT caja_id AS cajaId, tipo, monto, metodo_pago AS metodo,
         anulado_en IS NOT NULL AS anulado
       FROM movimientos_caja WHERE id = ?`
    )
    .get(id) as
    | { cajaId: number; tipo: TipoMovimiento; monto: number; metodo: MetodoPago; anulado: number }
    | undefined
  if (!m) throw new Error('El movimiento no existe')
  if (m.anulado) throw new Error('El movimiento ya está anulado')
  const abierta = exigirCajaAbierta()
  db.prepare(
    `UPDATE movimientos_caja SET anulado_en = datetime('now', 'localtime'), anulado_por = ?,
       motivo_anulacion = ? WHERE id = ?`
  ).run(usuarioId, motivo, id)
  if (m.cajaId === abierta) return
  const inverso: TipoMovimiento = m.tipo === 'egreso' ? 'ingreso' : 'egreso'
  db.prepare(
    `INSERT INTO movimientos_caja
       (caja_id, usuario_id, tipo, categoria_id, descripcion, monto, metodo_pago, corrige_id)
     VALUES (?, ?, ?,
       (SELECT id FROM categorias_caja WHERE sistema = 1 AND nombre = 'Corrección' AND tipo = ?),
       ?, ?, ?, ?)`
  ).run(
    abierta,
    usuarioId,
    inverso,
    inverso,
    `Anula el movimiento N° ${id} de la caja N° ${m.cajaId}: ${motivo}`,
    m.monto,
    m.metodo,
    id
  )
}

// contado: lo que se contó por método (efectivo en el cajón; el resto, lo que muestra el banco o el POS).
export function cerrarCaja(
  contado: Partial<Record<MetodoPago, number>>,
  observacion: string | null
): Caja {
  const u = usuarioActual()
  const cajaId = exigirCajaAbierta()
  for (const metodo of METODOS_PAGO) {
    const n = contado[metodo]
    if (n === undefined || !entero(n)) throw new Error(`Falta el monto contado de ${metodo}`)
  }
  const db = getDb()
  transaccion(db, () => {
    const { montoInicial } = db
      .prepare('SELECT monto_inicial AS montoInicial FROM cajas WHERE id = ?')
      .get(cajaId) as { montoInicial: number }
    const guardar = db.prepare(
      `INSERT INTO caja_arqueo (caja_id, metodo_pago, inicial, ventas, cobros, ingresos, egresos, esperado, contado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    let diferencia = 0
    for (const r of calcularResumen(cajaId, montoInicial)) {
      const c = contado[r.metodo] as number
      guardar.run(
        cajaId,
        r.metodo,
        r.inicial,
        r.ventas,
        r.cobros,
        r.ingresos,
        r.egresos,
        r.esperado,
        c
      )
      diferencia += c - r.esperado
    }
    db.prepare(
      `UPDATE cajas SET cerrada_en = datetime('now', 'localtime'), cerrada_por = ?, observacion = ?
       WHERE id = ?`
    ).run(u.id, observacion?.trim() || null, cajaId)
    auditar('cerrar', 'caja', cajaId, `Diferencia ${diferencia}`)
  })
  return obtenerCaja(cajaId)
}

// Historial para el administrador: las últimas cajas cerradas, la más nueva primero.
export function listarCajas(): Caja[] {
  exigirAdmin()
  const ids = getDb()
    .prepare('SELECT id FROM cajas WHERE cerrada_en IS NOT NULL ORDER BY id DESC LIMIT 60')
    .all() as { id: number }[]
  return ids.map((f) => obtenerCaja(f.id))
}
