import writeExcelFile, { type Cell, type Sheet } from 'write-excel-file/browser'
import { fecha, hora, NOMBRE_METODO } from './api'
import type { Informe } from '../../shared/tipos'

// Todo el informe en un .xlsx, una hoja por tabla. Los montos van como números (se pueden sumar
// en Excel). Electron pregunta dónde guardarlo.

export const ACCIONES: Record<string, string> = {
  crear: 'Creó',
  modificar: 'Modificó',
  eliminar: 'Eliminó',
  anular: 'Anuló',
  devolver: 'Devolvió',
  abrir: 'Abrió',
  cerrar: 'Cerró',
  activar: 'Activó',
  desactivar: 'Desactivó',
  importar: 'Importó',
  cambiar_clave: 'Cambió la contraseña',
  iniciar_sesion: 'Entró al sistema'
}

export const ENTIDADES: Record<string, string> = {
  movimiento_caja: 'movimiento de caja',
  categoria_caja: 'categoría de caja',
  cobro: 'pago de cuotas',
  configuracion: 'configuración'
}

type Columna = { titulo: string; ancho: number }
type Valor = string | number | null

const celda = (v: Valor, negrita = false): Cell =>
  typeof v === 'number'
    ? { value: v, type: Number, format: '#,##0', fontWeight: negrita ? 'bold' : undefined }
    : { value: v ?? '', type: String, fontWeight: negrita ? 'bold' : undefined }

function hoja(nombre: string, columnas: Columna[], filas: Valor[][], total?: Valor[]): Sheet<Blob> {
  return {
    sheet: nombre,
    columns: columnas.map((c) => ({ width: c.ancho })),
    stickyRowsCount: 1,
    data: [
      columnas.map((c) => celda(c.titulo, true)),
      ...filas.map((f) => f.map((v) => celda(v))),
      ...(total && filas.length ? [total.map((v) => celda(v, true))] : [])
    ]
  }
}

const fechaHora = (f: string): string => `${fecha(f)} ${hora(f)}`

const suma = <T>(xs: T[], f: (x: T) => number): number => xs.reduce((s, x) => s + f(x), 0)

export async function exportarInforme(d: Informe): Promise<void> {
  const col = (titulo: string, ancho = 14): Columna => ({ titulo, ancho })
  const v = d.ventasPorDia
  const movimientos = (nombre: string, filas: Informe['gastos']): Sheet<Blob> =>
    hoja(
      nombre,
      [col('Categoría', 28), col('Veces', 8), col('Monto')],
      filas.map((g) => [g.categoria, g.cantidad, g.monto]),
      ['Total', suma(filas, (g) => g.cantidad), suma(filas, (g) => g.monto)]
    )

  const hojas = [
    hoja(
      'Ventas por día',
      [
        col('Día', 12),
        col('Ventas', 8),
        col('Al contado'),
        col('En cuotas'),
        col('Devoluciones'),
        col('Total')
      ],
      v.map((x) => [
        fecha(x.dia),
        x.cantidad,
        x.contado,
        x.cuotas,
        x.devuelto,
        x.contado + x.cuotas - x.devuelto
      ]),
      [
        'Total',
        suma(v, (x) => x.cantidad),
        suma(v, (x) => x.contado),
        suma(v, (x) => x.cuotas),
        suma(v, (x) => x.devuelto),
        suma(v, (x) => x.contado + x.cuotas - x.devuelto)
      ]
    ),
    hoja(
      'Por método de pago',
      [col('Método', 16), col('Ventas al contado', 18), col('Cobros de cuotas', 18), col('Total')],
      d.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], m.contado, m.cobros, m.contado + m.cobros]),
      [
        'Total',
        suma(d.porMetodo, (m) => m.contado),
        suma(d.porMetodo, (m) => m.cobros),
        suma(d.porMetodo, (m) => m.contado + m.cobros)
      ]
    ),
    hoja(
      'Cajas',
      [
        col('N°', 6),
        col('Abierta', 16),
        col('Cerrada', 16),
        col('Ventas'),
        col('Cobros cuotas'),
        col('Ingresos'),
        col('Gastos'),
        col('Quedó'),
        col('Diferencia')
      ],
      d.cajas.map((c) => [
        c.id,
        fechaHora(c.abiertaEn),
        c.cerradaEn ? fechaHora(c.cerradaEn) : 'Abierta',
        c.ventas,
        c.cobros,
        c.ingresos,
        c.egresos,
        c.esperado,
        c.diferencia
      ])
    ),
    movimientos('Gastos', d.gastos),
    movimientos('Otros ingresos', d.ingresos),
    hoja(
      'Productos vendidos',
      [
        col('Código', 12),
        col('Producto', 32),
        col('Unidades', 9),
        col('Vendido'),
        col('Costo'),
        col('Ganancia')
      ],
      d.productos.map((p) => [
        p.codigo,
        p.nombre,
        p.unidades,
        p.importe,
        p.costo,
        p.importe - p.costo
      ]),
      [
        'Total',
        null,
        suma(d.productos, (p) => p.unidades),
        suma(d.productos, (p) => p.importe),
        suma(d.productos, (p) => p.costo),
        suma(d.productos, (p) => p.importe - p.costo)
      ]
    ),
    hoja(
      'Stock hoy',
      [col('Dato', 28), col('Valor', 16)],
      [
        ['Productos', d.stock.productos],
        ['Unidades', d.stock.unidades],
        ['Valor a precio de compra', d.stock.costo],
        ['Valor a precio de venta', d.stock.venta],
        ['En el mínimo o menos', d.stock.bajoMinimo]
      ]
    ),
    hoja(
      'Clientes atrasados',
      [
        col('Cliente', 28),
        col('Teléfono', 16),
        col('Días de atraso', 14),
        col('Vencido'),
        col('Debe en total', 16)
      ],
      d.cuotas.morosos.map((m) => [
        m.cliente.nombre,
        m.cliente.telefono,
        m.diasAtraso,
        m.vencido,
        m.saldo
      ]),
      [
        'Total',
        null,
        null,
        suma(d.cuotas.morosos, (m) => m.vencido),
        suma(d.cuotas.morosos, (m) => m.saldo)
      ]
    ),
    hoja(
      'Vencido por atraso',
      [col('Atraso', 16), col('Cuotas', 8), col('Monto')],
      d.cuotas.atraso.map((t) => [t.tramo, t.cuotas, t.monto]),
      ['Total', suma(d.cuotas.atraso, (t) => t.cuotas), suma(d.cuotas.atraso, (t) => t.monto)]
    ),
    hoja(
      'Quién hizo qué',
      [
        col('Fecha', 16),
        col('Usuario', 12),
        col('Acción', 14),
        col('Sobre', 20),
        col('N°', 8),
        col('Detalle', 40)
      ],
      d.auditoria.map((a) => [
        fechaHora(a.fecha),
        a.usuario,
        ACCIONES[a.accion] ?? a.accion,
        ENTIDADES[a.entidad] ?? a.entidad,
        a.entidadId,
        a.detalle
      ])
    )
  ]
  await writeExcelFile(hojas, { fontFamily: 'Calibri' }).toFile(
    `informe ${d.desde} al ${d.hasta}.xlsx`
  )
}
