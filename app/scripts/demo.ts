// Datos de demostración: un local de ropa con unos 2 meses de historia.
// Usa las mismas funciones que la app, así stock, caja, cuotas y auditoría quedan coherentes.
// Cada "día" se carga hoy y después se corre hacia atrás en el tiempo.
import { abrirDb, getDb } from '../src/main/db'
import * as usuarios from '../src/main/usuarios'
import * as productos from '../src/main/productos'
import * as clientes from '../src/main/clientes'
import * as ventas from '../src/main/ventas'
import * as caja from '../src/main/caja'
import * as cuotas from '../src/main/cuotas'
import * as compras from '../src/main/compras'
import { sumarMeses } from '../src/shared/cuotas'
import { METODOS_PAGO, type MetodoPago, type Producto } from '../src/shared/tipos'

const PRODUCTOS: [string, string, string, number, number, number][] = [
  // código, nombre, familia, stock, compra, venta
  ['REM-001', 'Remera básica algodón blanca', 'Remeras', 24, 35000, 65000],
  ['REM-002', 'Remera básica algodón negra', 'Remeras', 18, 35000, 65000],
  ['REM-003', 'Remera estampada oversize', 'Remeras', 12, 50000, 95000],
  ['BLU-001', 'Blusa de lino manga corta', 'Blusas', 10, 70000, 135000],
  ['BLU-002', 'Blusa de seda estampada', 'Blusas', 6, 110000, 210000],
  ['JEA-001', 'Jean mom fit celeste', 'Jeans', 14, 120000, 230000],
  ['JEA-002', 'Jean recto azul oscuro', 'Jeans', 9, 130000, 245000],
  ['JEA-003', 'Jean wide leg negro', 'Jeans', 3, 140000, 260000],
  ['VES-001', 'Vestido largo floreado', 'Vestidos', 7, 150000, 290000],
  ['VES-002', 'Vestido corto de fiesta', 'Vestidos', 4, 220000, 420000],
  ['POL-001', 'Pollera plisada', 'Polleras', 8, 80000, 155000],
  ['CAM-001', 'Campera de jean', 'Abrigos', 5, 190000, 360000],
  ['CAM-002', 'Campera inflable', 'Abrigos', 2, 260000, 480000],
  ['BUZ-001', 'Buzo canguro con capucha', 'Abrigos', 11, 110000, 210000],
  ['BIN-001', 'Bincha de pana', 'Accesorios', 30, 8000, 25000],
  ['BIN-002', 'Bincha con perlas', 'Accesorios', 15, 15000, 40000],
  ['ARO-001', 'Aros argolla dorados', 'Accesorios', 25, 12000, 35000],
  ['ARO-002', 'Aros perla', 'Accesorios', 20, 10000, 30000],
  ['COL-001', 'Collar cadena fina', 'Accesorios', 12, 20000, 55000],
  ['CIN-001', 'Cinto de cuero', 'Accesorios', 10, 40000, 85000],
  ['CAR-001', 'Cartera bandolera', 'Carteras', 6, 120000, 240000],
  ['CAR-002', 'Mochila urbana', 'Carteras', 4, 100000, 195000],
  ['MED-001', 'Medias pack x3', 'Accesorios', 40, 12000, 30000],
  ['PAN-001', 'Pañuelo de seda', 'Accesorios', 1, 25000, 60000],
  ['GOR-001', 'Gorra bordada', 'Accesorios', 9, 30000, 70000]
]

const CLIENTES: [string, string, string][] = [
  ['María González', '3456789', '0981 123 456'],
  ['Lucía Benítez', '4123987', '0972 554 210'],
  ['Andrea Martínez', '2987654', '0985 778 990'],
  ['Carla Giménez', '5012345', '0961 330 145'],
  ['Rocío Ayala', '4567123', '0991 245 876'],
  ['Fátima Villalba', '3890456', '0983 667 012'],
  ['Natalia Cáceres', '5234678', '0975 909 321'],
  ['Sofía Ramírez', '4789012', '0982 112 334']
]

let prod: Record<string, Producto> = {}
const cli: Record<string, number> = {}

const max = (tabla: string): number =>
  (getDb().prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${tabla}`).get() as { m: number }).m

function vender(
  items: [string, number][],
  metodo: MetodoPago = 'efectivo',
  extra: { cliente?: string; descuento?: number; cuotas?: [number, number] } = {}
): void {
  ventas.registrarVenta({
    clienteId: extra.cliente ? cli[extra.cliente] : null,
    items: items.map(([codigo, cantidad]) => ({ productoId: prod[codigo].id, cantidad })),
    descuento: extra.descuento ?? 0,
    metodoPago: metodo,
    cuotas: extra.cuotas ? { cantidad: extra.cuotas[0], entrega: extra.cuotas[1] } : null
  })
}

function gasto(categoria: string, monto: number, descripcion: string, tipo = 'egreso'): void {
  const c = caja.categoriasCaja().find((x) => x.nombre === categoria && x.tipo === tipo)
  if (!c) throw new Error(`Falta la categoría ${categoria}`)
  caja.registrarMovimiento({
    tipo: c.tipo,
    categoriaId: c.id,
    descripcion,
    monto,
    metodoPago: 'efectivo'
  })
}

const pagar = (cliente: string, monto: number, metodo: MetodoPago = 'efectivo'): unknown =>
  cuotas.cobrarCuotas(cli[cliente], monto, metodo)

// Abre la caja, carga el día y la cierra con lo contado (efectivo con la diferencia indicada).
// Después corre todo lo cargado `atras` días hacia el pasado, con horarios del día.
function dia(atras: number, cargar: () => void, faltante = 0, inicial = 200000): void {
  const antes = Object.fromEntries(
    ['cajas', 'ventas', 'movimientos_caja', 'cobros', 'auditoria'].map((t) => [t, max(t)])
  )
  caja.abrirCaja(inicial)
  cargar()
  if (atras > 0) {
    const r = caja.cajaActual()?.resumen ?? []
    const contado = Object.fromEntries(
      METODOS_PAGO.map((m) => {
        const e = r.find((x) => x.metodo === m)?.esperado ?? 0
        return [m, m === 'efectivo' ? Math.max(e - faltante, 0) : e]
      })
    )
    caja.cerrarCaja(contado, faltante ? 'Faltante en el cambio' : null)
  }
  if (atras === 0) return

  const db = getDb()
  const corrida = `'-${atras} days'`
  const fecha = (col: string, hhmm: string): string =>
    `${col} = date(${col}, ${corrida}) || ' ${hhmm}:00'`
  db.prepare(
    `UPDATE cajas SET ${fecha('abierta_en', '08:30')},
       cerrada_en = date(cerrada_en, ${corrida}) || ' 19:30:00' WHERE id > ?`
  ).run(antes.cajas)
  // Ventas, movimientos y cobros se reparten de 9:00 en adelante, en el orden en que se cargaron.
  const filas = (['ventas', 'movimientos_caja', 'cobros'] as const).flatMap((t) =>
    (
      db.prepare(`SELECT id FROM ${t} WHERE id > ? ORDER BY id`).all(antes[t]) as { id: number }[]
    ).map((f) => ({ t, id: f.id }))
  )
  filas.forEach((f, i) => {
    const min = 9 * 60 + Math.round((i * 9.5 * 60) / Math.max(filas.length, 1))
    const hhmm = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    db.prepare(`UPDATE ${f.t} SET ${fecha('fecha', hhmm)} WHERE id = ?`).run(f.id)
  })
  db.prepare(`UPDATE auditoria SET fecha = datetime(fecha, ${corrida}) WHERE id > ?`).run(
    antes.auditoria
  )
  // Las cuotas vencen el mismo día del mes de la venta ya corrida.
  const nuevas = db
    .prepare(`SELECT id, fecha FROM ventas WHERE id > ? AND condicion = 'cuotas'`)
    .all(antes.ventas) as { id: number; fecha: string }[]
  for (const v of nuevas) {
    const qs = db.prepare('SELECT id, numero FROM cuotas WHERE venta_id = ?').all(v.id) as {
      id: number
      numero: number
    }[]
    for (const q of qs)
      db.prepare('UPDATE cuotas SET vencimiento = ? WHERE id = ?').run(
        q.numero === 0 ? v.fecha.slice(0, 10) : sumarMeses(v.fecha, q.numero),
        q.id
      )
  }
}

export function cargarDemo(ruta: string): void {
  abrirDb(ruta)
  if (usuarios.hayUsuarios()) throw new Error('La base ya tiene datos: usá una base nueva')
  const db = getDb()

  usuarios.crearPrimerAdmin('admin', 'admin123')
  usuarios.crearUsuario('caja', 'caja123', 'cajero')
  db.prepare(
    `UPDATE negocio SET nombre = 'Tienda Demo', ruc = '80000000-0',
       direccion = 'Av. Mariscal López 1234, Asunción', telefono = '0981 000 000' WHERE id = 1`
  ).run()

  for (const [codigo, nombre, familia, stock, compra, venta] of PRODUCTOS)
    productos.crearProducto({
      codigo,
      nombre,
      descripcion: null,
      unidad: codigo.startsWith('MED') ? 'Juego' : 'Unidad',
      categoria: familia === 'Accesorios' || familia === 'Carteras' ? 'Accesorios' : 'Ropa',
      familia,
      proveedor: familia === 'Accesorios' ? 'Importadora Central' : 'Confecciones del Este',
      stock,
      stockMinimo: stock > 20 ? 10 : 3,
      precioCompra: compra,
      precioVenta: venta,
      vencimiento: null
    })
  prod = Object.fromEntries(productos.buscarProductos('').map((p) => [p.codigo, p])) as Record<
    string,
    Producto
  >

  for (const [nombre, documento, telefono] of CLIENTES)
    cli[nombre.split(' ')[0]] = clientes.crearCliente({
      nombre,
      documento,
      telefono,
      direccion: null
    }).id
  caja.crearCategoria('Alquiler', 'egreso')
  caja.crearCategoria('Luz y agua', 'egreso')

  // Las cuotas (con hoy = 18/11/2026): María 650.000 − 50.000 en 4 de 150.000 (pagó parte de la
  // primera: atrasada); Lucía 330.000 − 100.000 en 3; Natalia 210.000 en 2 de 105.000 (no pagó:
  // atrasada); Andrea 420.000 − 120.000 en 3 de 100.000; Carla 470.000 en 6; Rocío 480.000 −
  // 80.000 en 2 de 200.000; Fátima 195.000 − 45.000 en 3 de 50.000.
  dia(62, () => {
    vender([
      ['REM-001', 2],
      ['BIN-001', 1]
    ])
    vender(
      [
        ['CAM-001', 1],
        ['VES-001', 1]
      ],
      'efectivo',
      { cliente: 'María', cuotas: [4, 50000] }
    )
    vender([['JEA-001', 1]], 'transferencia')
    gasto('Encomiendas', 25000, 'Envío a Ciudad del Este')
  })
  dia(55, () => {
    vender(
      [
        ['ARO-001', 2],
        ['COL-001', 1]
      ],
      'qr'
    )
    vender(
      [
        ['JEA-002', 1],
        ['CIN-001', 1]
      ],
      'efectivo',
      { cliente: 'Lucía', cuotas: [3, 100000] }
    )
    vender([['MED-001', 3]])
    vender([['BLU-002', 1]], 'efectivo', { cliente: 'Natalia', cuotas: [2, 0] })
    compras.registrarCompra({
      proveedor: 'Confecciones del Este',
      items: [
        { productoId: prod['REM-001'].id, cantidad: 6, costo: 25000 },
        { productoId: prod['REM-002'].id, cantidad: 4, costo: 25000 }
      ],
      metodoPago: 'efectivo',
      observacion: 'Factura 001-001-0004521'
    })
  })
  dia(
    40,
    () => {
      vender([['BLU-001', 1]], 'tarjeta')
      vender([['VES-002', 1]], 'transferencia', { cliente: 'Andrea', cuotas: [3, 120000] })
      vender(
        [
          ['BIN-002', 2],
          ['ARO-002', 1]
        ],
        'efectivo',
        { descuento: 10000 }
      )
      gasto('Bolsitas de regalo', 45000, '100 bolsitas kraft')
      gasto('Alquiler', 1500000, 'Alquiler del mes')
    },
    5000,
    1700000 // la caja arranca con la plata del alquiler
  )
  dia(31, () => {
    pagar('María', 100000) // parte de la cuota 1
    pagar('Lucía', 76666, 'transferencia') // cuota 1
    vender(
      [
        ['REM-003', 1],
        ['GOR-001', 1]
      ],
      'qr'
    )
    vender(
      [
        ['JEA-003', 1],
        ['BUZ-001', 1]
      ],
      'efectivo',
      { cliente: 'Carla', cuotas: [6, 0] }
    )
    vender([['CAR-001', 1]])
  })
  dia(20, () => {
    vender([['REM-002', 2]])
    vender(
      [
        ['POL-001', 1],
        ['BLU-002', 1]
      ],
      'tarjeta'
    )
    vender([['CAM-002', 1]], 'efectivo', { cliente: 'Rocío', cuotas: [2, 80000] })
    pagar('Andrea', 100000, 'transferencia') // cuota 1
    gasto('Luz y agua', 230000, 'ANDE y ESSAP')
  })
  dia(
    10,
    () => {
      pagar('Carla', 80000) // cuota 1 de 6 y un poco de la 2
      pagar('Lucía', 40000) // pago parcial de la cuota 2
      vender(
        [
          ['ARO-001', 1],
          ['BIN-001', 2]
        ],
        'qr'
      )
      vender([['CAR-002', 1]], 'efectivo', { cliente: 'Fátima', cuotas: [3, 45000] })
      vender(
        [
          ['REM-001', 3],
          ['MED-001', 2]
        ],
        'efectivo',
        { descuento: 15000 }
      )
      gasto('Encomiendas', 30000, 'Envío a Encarnación')
    },
    10000
  )
  dia(3, () => {
    vender(
      [
        ['JEA-001', 1],
        ['REM-002', 1]
      ],
      'transferencia'
    )
    vender([['VES-001', 1]], 'efectivo', { cliente: 'Natalia' })
    pagar('Rocío', 200000) // cuota 1
    gasto('Otros', 20000, 'Artículos de limpieza')
  })
  dia(1, () => {
    vender([['BUZ-001', 1]], 'tarjeta')
    vender([
      ['COL-001', 1],
      ['ARO-002', 2]
    ])
    pagar('Fátima', 50000, 'qr') // cuota 1
  })
  // Hoy: caja abierta con algunas ventas.
  dia(0, () => {
    vender([
      ['REM-001', 1],
      ['BIN-002', 1]
    ])
    vender([['JEA-002', 1]], 'qr', { cliente: 'Sofía' })
    gasto('Bolsitas de regalo', 15000, 'Cinta y papel de regalo')
  })

  usuarios.cerrarSesion()
}
