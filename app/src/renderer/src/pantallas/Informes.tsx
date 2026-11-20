import { useEffect, useState } from 'react'
import { api, cantidad, fecha, fechaHora, gs, NOMBRE_METODO } from '../api'
import { Cifra, Encabezado, Etiqueta, Visor } from '../componentes'
import type { Informe, InformeProducto } from '../../../shared/tipos'
import { ACCIONES, ENTIDADES, exportarInforme } from '../exportarInforme'

const PERIODOS = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'semana', nombre: 'Esta semana' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'anterior', nombre: 'Mes pasado' },
  { id: 'otro', nombre: 'Otras fechas' }
] as const
type Periodo = (typeof PERIODOS)[number]['id']

const SECCIONES = [
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'caja', nombre: 'Caja y gastos' },
  { id: 'cuotas', nombre: 'Cuotas por cobrar' },
  { id: 'productos', nombre: 'Productos y stock' },
  { id: 'auditoria', nombre: 'Quién hizo qué' }
] as const
type Seccion = (typeof SECCIONES)[number]['id']

const dia = (d: Date): string => d.toLocaleDateString('sv-SE')

// desde y hasta de cada período, contando desde hoy. La semana empieza el lunes.
function fechasDe(p: Exclude<Periodo, 'otro'>): [string, string] {
  const h = new Date()
  if (p === 'hoy') return [dia(h), dia(h)]
  if (p === 'semana') {
    const lunes = new Date(h)
    lunes.setDate(h.getDate() - ((h.getDay() + 6) % 7))
    return [dia(lunes), dia(h)]
  }
  if (p === 'mes') return [dia(new Date(h.getFullYear(), h.getMonth(), 1)), dia(h)]
  return [
    dia(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
    dia(new Date(h.getFullYear(), h.getMonth(), 0))
  ]
}

// Imprime la pantalla tal como se ve, en hoja A4, sin la barra ni los botones (ver main.css).
function imprimir(): void {
  document.body.classList.add('imprimir-pantalla')
  window.print()
  document.body.classList.remove('imprimir-pantalla')
}

const porciento = (parte: number, total: number): string =>
  total ? `${Math.round((parte * 100) / total)}%` : '—'

export default function Informes(): React.JSX.Element {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [otras, setOtras] = useState(fechasDe('mes'))
  const [seccion, setSeccion] = useState<Seccion>('ventas')
  const [datos, setDatos] = useState<Informe | null>(null)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  const [desde, hasta] = periodo === 'otro' ? otras : fechasDe(periodo)
  useEffect(() => {
    if (!desde || !hasta) return
    api
      .informe(desde, hasta)
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [desde, hasta])

  async function exportar(): Promise<void> {
    if (!datos) return
    setExportando(true)
    try {
      await exportarInforme(datos)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="pila">
      <Encabezado
        titulo={`Informes: ${SECCIONES.find((s) => s.id === seccion)?.nombre.toLowerCase()}`}
        ayuda={
          desde === hasta
            ? `Del ${fecha(desde)}.`
            : `Del ${fecha(desde)} al ${fecha(hasta)}, los dos días incluidos.`
        }
      >
        <div className="acciones sin-margen no-imprimir">
          <button disabled={!datos} onClick={imprimir}>
            Imprimir
          </button>
          <button
            className="primario"
            disabled={!datos || exportando}
            onClick={exportar}
            title="Todas las secciones en un archivo de Excel, una hoja por tabla"
          >
            {exportando ? 'Exportando…' : 'Exportar a Excel'}
          </button>
        </div>
      </Encabezado>

      <section className="tarjeta pila chica no-imprimir">
        <div className="segmentado">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              className={periodo === p.id ? 'activa' : ''}
              onClick={() => {
                if (p.id === 'otro') setOtras([desde, hasta])
                setPeriodo(p.id)
              }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
        {periodo === 'otro' && (
          <div className="fila-filtros abajo">
            <label>
              Desde
              <input
                type="date"
                value={otras[0]}
                onChange={(e) => setOtras([e.target.value, otras[1]])}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={otras[1]}
                onChange={(e) => setOtras([otras[0], e.target.value])}
              />
            </label>
          </div>
        )}
        <div className="segmentado">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              className={seccion === s.id ? 'activa' : ''}
              onClick={() => setSeccion(s.id)}
            >
              {s.nombre}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {datos && seccion === 'ventas' && <Ventas d={datos} />}
      {datos && seccion === 'caja' && <Caja d={datos} />}
      {datos && seccion === 'cuotas' && <Cuotas d={datos} />}
      {datos && seccion === 'productos' && <Productos d={datos} />}
      {datos && seccion === 'auditoria' && <Auditoria d={datos} />}
    </div>
  )
}

function Ventas({ d }: { d: Informe }): React.JSX.Element {
  const t = d.ventasPorDia.reduce(
    (s, x) => ({
      cantidad: s.cantidad + x.cantidad,
      contado: s.contado + x.contado,
      cuotas: s.cuotas + x.cuotas,
      devuelto: s.devuelto + x.devuelto
    }),
    { cantidad: 0, contado: 0, cuotas: 0, devuelto: 0 }
  )
  const neto = t.contado + t.cuotas - t.devuelto
  const entro = d.porMetodo.reduce((s, m) => s + m.contado + m.cobros, 0)

  return (
    <>
      <div className="caja-cifras">
        <Visor
          etiqueta="Ventas del período"
          valor={gs(neto)}
          detalle={`${cantidad(t.cantidad, 'venta', 'ventas')}, sin las anuladas ni lo devuelto`}
        />
        <div className="cifras">
          <Cifra etiqueta="Al contado" valor={gs(t.contado)} />
          <Cifra
            etiqueta="En cuotas"
            valor={gs(t.cuotas)}
            detalle="Lo vendido, con la entrega incluida"
          />
          <Cifra
            etiqueta="Devoluciones"
            valor={gs(t.devuelto)}
            tono={t.devuelto ? 'rojo' : 'neutro'}
          />
          <Cifra
            etiqueta="Venta promedio"
            valor={t.cantidad ? gs(Math.round((t.contado + t.cuotas) / t.cantidad)) : '—'}
          />
        </div>
      </div>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>Por día</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th className="num">Ventas</th>
              <th className="num">Al contado</th>
              <th className="num">En cuotas</th>
              <th className="num">Devoluciones</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {d.ventasPorDia.map((x) => (
              <tr key={x.dia}>
                <td>{fecha(x.dia)}</td>
                <td className="num">{x.cantidad}</td>
                <td className="num">{gs(x.contado)}</td>
                <td className="num">{gs(x.cuotas)}</td>
                <td className="num">{x.devuelto ? `− ${gs(x.devuelto)}` : '—'}</td>
                <td className="num">
                  <strong>{gs(x.contado + x.cuotas - x.devuelto)}</strong>
                </td>
              </tr>
            ))}
            {d.ventasPorDia.length === 0 ? (
              <tr>
                <td colSpan={6} className="vacio">
                  No hubo ventas en estas fechas.
                </td>
              </tr>
            ) : (
              <tr className="total">
                <td>Total</td>
                <td className="num">{t.cantidad}</td>
                <td className="num">{gs(t.contado)}</td>
                <td className="num">{gs(t.cuotas)}</td>
                <td className="num">{t.devuelto ? `− ${gs(t.devuelto)}` : '—'}</td>
                <td className="num">{gs(neto)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>Plata que entró, por método de pago</h2>
          <span>Las cuotas cuentan cuando se cobran, no cuando se vende</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Método</th>
              <th className="num">Ventas al contado</th>
              <th className="num">Cobros de cuotas</th>
              <th className="num">Total</th>
              <th className="num">Parte</th>
            </tr>
          </thead>
          <tbody>
            {d.porMetodo.map((m) => (
              <tr key={m.metodo}>
                <td>{NOMBRE_METODO[m.metodo]}</td>
                <td className="num">{gs(m.contado)}</td>
                <td className="num">{gs(m.cobros)}</td>
                <td className="num">
                  <strong>{gs(m.contado + m.cobros)}</strong>
                </td>
                <td className="num">{porciento(m.contado + m.cobros, entro)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className="num">{gs(d.porMetodo.reduce((s, m) => s + m.contado, 0))}</td>
              <td className="num">{gs(d.porMetodo.reduce((s, m) => s + m.cobros, 0))}</td>
              <td className="num">{gs(entro)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}

function Caja({ d }: { d: Informe }): React.JSX.Element {
  const entro = d.cajas.reduce((s, c) => s + c.ventas + c.cobros + c.ingresos, 0)
  const salio = d.cajas.reduce((s, c) => s + c.egresos, 0)
  const cerradas = d.cajas.filter((c) => c.diferencia !== null)
  const diferencia = cerradas.reduce((s, c) => s + (c.diferencia ?? 0), 0)
  const totalGastos = d.gastos.reduce((s, g) => s + g.monto, 0)

  return (
    <>
      <div className="cifras">
        <Cifra
          etiqueta="Entró a la caja"
          valor={gs(entro)}
          tono="verde"
          detalle="Ventas, cobros de cuotas y otros ingresos"
        />
        <Cifra
          etiqueta="Salió de la caja"
          valor={gs(salio)}
          tono="rojo"
          detalle="Gastos y devoluciones"
        />
        <Cifra etiqueta="Quedó" valor={gs(entro - salio)} detalle="Sin contar el monto inicial" />
        <Cifra
          etiqueta="Diferencias al cerrar"
          valor={gs(diferencia)}
          tono={diferencia < 0 ? 'rojo' : diferencia > 0 ? 'ambar' : 'neutro'}
          detalle={`En ${cantidad(cerradas.length, 'caja cerrada', 'cajas cerradas')}`}
        />
      </div>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>Cajas</h2>
          <span>Con los números de su cierre</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Abierta</th>
              <th>Cerrada</th>
              <th className="num">Ventas</th>
              <th className="num">Cobros cuotas</th>
              <th className="num">Ingresos</th>
              <th className="num">Gastos</th>
              <th className="num">Quedó</th>
              <th className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {d.cajas.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{fechaHora(c.abiertaEn)}</td>
                <td>
                  {c.cerradaEn ? fechaHora(c.cerradaEn) : <Etiqueta tono="verde">Abierta</Etiqueta>}
                </td>
                <td className="num">{gs(c.ventas)}</td>
                <td className="num">{gs(c.cobros)}</td>
                <td className="num">{gs(c.ingresos)}</td>
                <td className="num">{c.egresos ? `− ${gs(c.egresos)}` : '—'}</td>
                <td className="num">
                  <strong>{gs(c.esperado)}</strong>
                </td>
                <td className="num">
                  {c.diferencia === null ? (
                    '—'
                  ) : c.diferencia === 0 ? (
                    <Etiqueta tono="verde">Justo</Etiqueta>
                  ) : (
                    <Etiqueta tono={c.diferencia < 0 ? 'rojo' : 'ambar'}>
                      {c.diferencia < 0 ? 'Faltó ' : 'Sobró '}
                      {gs(Math.abs(c.diferencia))}
                    </Etiqueta>
                  )}
                </td>
              </tr>
            ))}
            {d.cajas.length === 0 && (
              <tr>
                <td colSpan={9} className="vacio">
                  No se abrió la caja en estas fechas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grilla dos">
        <section className="tarjeta">
          <div className="fila-titulo">
            <h2>Gastos por categoría</h2>
          </div>
          <PorCategoria filas={d.gastos} total={totalGastos} vacio="No hubo gastos." />
        </section>
        <section className="tarjeta">
          <div className="fila-titulo">
            <h2>Otros ingresos</h2>
          </div>
          <PorCategoria
            filas={d.ingresos}
            total={d.ingresos.reduce((s, g) => s + g.monto, 0)}
            vacio="No entró plata aparte de las ventas."
          />
        </section>
      </div>
    </>
  )
}

function PorCategoria({
  filas,
  total,
  vacio
}: {
  filas: Informe['gastos']
  total: number
  vacio: string
}): React.JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th>Categoría</th>
          <th className="num">Veces</th>
          <th className="num">Monto</th>
          <th className="num">Parte</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((g) => (
          <tr key={g.categoria}>
            <td>{g.categoria}</td>
            <td className="num">{g.cantidad}</td>
            <td className="num">{gs(g.monto)}</td>
            <td className="num">{porciento(g.monto, total)}</td>
          </tr>
        ))}
        {filas.length === 0 ? (
          <tr>
            <td colSpan={4} className="vacio">
              {vacio}
            </td>
          </tr>
        ) : (
          <tr className="total">
            <td>Total</td>
            <td className="num">{filas.reduce((s, g) => s + g.cantidad, 0)}</td>
            <td className="num">{gs(total)}</td>
            <td />
          </tr>
        )}
      </tbody>
    </table>
  )
}

function Cuotas({ d }: { d: Informe }): React.JSX.Element {
  const q = d.cuotas
  return (
    <>
      <p className="ayuda">Lo que deben los clientes hoy, sin importar las fechas elegidas.</p>
      <div className="caja-cifras">
        <Visor
          etiqueta="Por cobrar"
          valor={gs(q.saldo)}
          detalle={`De ${cantidad(q.clientes, 'cliente', 'clientes')}`}
        />
        <div className="cifras">
          <Cifra
            etiqueta="Vencido"
            valor={gs(q.vencido)}
            tono={q.vencido ? 'rojo' : 'neutro'}
            detalle={porciento(q.vencido, q.saldo) + ' de lo que se debe'}
          />
          <Cifra etiqueta="Por vencer" valor={gs(q.saldo - q.vencido)} />
          <Cifra
            etiqueta="Clientes atrasados"
            valor={q.morosos.length}
            tono={q.morosos.length ? 'ambar' : 'neutro'}
          />
        </div>
      </div>

      <div className="grilla dos">
        <section className="tarjeta">
          <div className="fila-titulo">
            <h2>Vencido, por días de atraso</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Atraso</th>
                <th className="num">Cuotas</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {q.atraso.map((t) => (
                <tr key={t.tramo}>
                  <td>{t.tramo}</td>
                  <td className="num">{t.cuotas}</td>
                  <td className="num">{gs(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="tarjeta">
          <div className="fila-titulo">
            <h2>Clientes atrasados</h2>
            <span>Los más atrasados primero</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th className="num">Días</th>
                <th className="num">Vencido</th>
                <th className="num">Debe en total</th>
              </tr>
            </thead>
            <tbody>
              {q.morosos.map((m) => (
                <tr key={m.cliente.id}>
                  <td>{m.cliente.nombre}</td>
                  <td>{m.cliente.telefono ?? '—'}</td>
                  <td className="num">{m.diasAtraso}</td>
                  <td className="num negativo">{gs(m.vencido)}</td>
                  <td className="num">{gs(m.saldo)}</td>
                </tr>
              ))}
              {q.morosos.length === 0 && (
                <tr>
                  <td colSpan={5} className="vacio">
                    Nadie está atrasado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  )
}

const ganancia = (p: InformeProducto): number => p.importe - p.costo

function Productos({ d }: { d: Informe }): React.JSX.Element {
  const [orden, setOrden] = useState<'unidades' | 'ganancia'>('unidades')
  const s = d.stock
  const lista = [...d.productos]
    .sort((a, b) => (orden === 'unidades' ? b.unidades - a.unidades : ganancia(b) - ganancia(a)))
    .slice(0, 30)
  const importe = d.productos.reduce((t, p) => t + p.importe, 0)
  const costo = d.productos.reduce((t, p) => t + p.costo, 0)

  return (
    <>
      <div className="cifras">
        <Cifra
          etiqueta="Ganancia del período"
          valor={gs(importe - costo)}
          tono="verde"
          detalle={`Vendido ${gs(importe)}, costo ${gs(costo)} (${porciento(importe - costo, importe)} de margen)`}
        />
        <Cifra
          etiqueta="Stock a precio de compra"
          valor={gs(s.costo)}
          detalle={`${s.unidades} unidades de ${cantidad(s.productos, 'producto', 'productos')}`}
        />
        <Cifra etiqueta="Stock a precio de venta" valor={gs(s.venta)} tono="azul" />
        <Cifra
          etiqueta="En el mínimo o menos"
          valor={s.bajoMinimo}
          tono={s.bajoMinimo ? 'ambar' : 'neutro'}
          detalle="Se ven en Productos"
        />
      </div>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>{orden === 'unidades' ? 'Más vendidos' : 'Los que más ganancia dejaron'}</h2>
          <div className="segmentado no-imprimir">
            <button
              className={orden === 'unidades' ? 'activa' : ''}
              onClick={() => setOrden('unidades')}
            >
              Más vendidos
            </button>
            <button
              className={orden === 'ganancia' ? 'activa' : ''}
              onClick={() => setOrden('ganancia')}
            >
              Más ganancia
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th className="num">Unidades</th>
              <th className="num">Vendido</th>
              <th className="num">Costo</th>
              <th className="num">Ganancia</th>
              <th className="num">Margen</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.productoId}>
                <td>{p.codigo}</td>
                <td>{p.nombre}</td>
                <td className="num">{p.unidades}</td>
                <td className="num">{gs(p.importe)}</td>
                <td className="num">{p.costo ? gs(p.costo) : '—'}</td>
                <td className="num">
                  <strong>{gs(ganancia(p))}</strong>
                </td>
                <td className="num">{p.costo ? porciento(ganancia(p), p.importe) : '—'}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="vacio">
                  No se vendió nada en estas fechas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="ayuda">
          El costo es el precio de compra que tenía cada producto al venderse (las ventas de antes
          del 19/11/2026 usan el de ese día). Los que no tienen precio de compra cargado aparecen
          con ganancia igual a lo vendido.
          {d.productos.length > 30 && ` Se muestran 30 de ${d.productos.length}.`}
        </p>
      </section>
    </>
  )
}

function Auditoria({ d }: { d: Informe }): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const t = texto.trim().toLowerCase()
  const filas = d.auditoria.filter(
    (a) =>
      !t ||
      [a.usuario, a.accion, a.entidad, a.detalle, String(a.entidadId)].some((x) =>
        x?.toLowerCase().includes(t)
      )
  )

  return (
    <section className="tarjeta">
      <div className="fila-titulo">
        <h2>Quién hizo qué</h2>
        <span>{cantidad(filas.length, 'acción', 'acciones')}</span>
      </div>
      <div className="fila-filtros abajo no-imprimir">
        <input
          placeholder="Buscar por usuario, acción o detalle (ej.: anular, caja, Ana)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Usuario</th>
            <th>Acción</th>
            <th>Sobre</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.id}>
              <td>{fechaHora(a.fecha)}</td>
              <td>{a.usuario ?? '—'}</td>
              <td>
                <Etiqueta tono={a.accion === 'anular' ? 'rojo' : 'neutro'}>
                  {ACCIONES[a.accion] ?? a.accion}
                </Etiqueta>
              </td>
              <td>
                {ENTIDADES[a.entidad] ?? a.entidad}
                {a.entidadId !== null && ` N° ${a.entidadId}`}
              </td>
              <td>{a.detalle ?? ''}</td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={5} className="vacio">
                No hay acciones registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {d.auditoria.length === 1000 && (
        <p className="ayuda">Se muestran las últimas 1000. Elegí menos días para ver las demás.</p>
      )}
    </section>
  )
}
