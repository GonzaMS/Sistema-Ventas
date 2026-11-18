import { Fragment, useEffect, useState } from 'react'
import { aEntero, api, fechaHora, gs, hora, NOMBRE_METODO } from '../api'
import { Cifra, Encabezado, Etiqueta, Visor } from '../componentes'
import Impresion from '../Impresion'
import {
  METODOS_PAGO,
  type Caja as TCaja,
  type CategoriaCaja,
  type MetodoPago,
  type MovimientoCaja,
  type ResumenMetodo,
  type TipoMovimiento
} from '../../../shared/tipos'

type Mensaje = { error: boolean; texto: string } | null

const miles = (n: number): string => (n ? n.toLocaleString('es-PY') : '')
const signo = (n: number): string => (n > 0 ? '+' : '') + gs(n)
const diferencia = (resumen: ResumenMetodo[]): number =>
  resumen.reduce((s, r) => s + (r.contado ?? 0) - r.esperado, 0)

export default function Caja({
  esAdmin,
  onCambioCaja
}: {
  esAdmin: boolean
  onCambioCaja: () => void
}): React.JSX.Element {
  // undefined: cargando; null: no hay caja abierta.
  const [caja, setCaja] = useState<TCaja | null | undefined>(undefined)
  const [cerrada, setCerrada] = useState<TCaja | null>(null)
  const [categorias, setCategorias] = useState<CategoriaCaja[]>([])
  const [historial, setHistorial] = useState<TCaja[]>([])
  const [aImprimir, setAImprimir] = useState<TCaja | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const recargarHistorial = (): void => {
    if (esAdmin) api.listarCajas().then(setHistorial)
  }
  useEffect(() => {
    api.cajaActual().then(setCaja)
    api.categoriasCaja().then(setCategorias)
    recargarHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (caja === undefined) return <p>Cargando…</p>

  return (
    <div className="pila">
      <Encabezado
        titulo="Caja"
        ayuda="Apertura, ingresos y egresos del día, y cierre con arqueo por método de pago."
      >
        {caja && !cerrando && (
          <button className="primario" onClick={() => setCerrando(true)}>
            Cerrar caja…
          </button>
        )}
      </Encabezado>
      {cerrada && (
        <section className="tarjeta">
          <div className="fila-titulo">
            <h2>Caja N° {cerrada.id} cerrada</h2>
            <div className="acciones sin-margen">
              {!cerrada.ciego && (
                <button className="chico" onClick={() => setAImprimir(cerrada)}>
                  Imprimir
                </button>
              )}
              <button className="chico" onClick={() => setCerrada(null)}>
                Listo
              </button>
            </div>
          </div>
          {cerrada.ciego ? (
            <p className="ayuda">Lo contado quedó registrado. El administrador revisa el arqueo.</p>
          ) : (
            <TablaResumen resumen={cerrada.resumen} />
          )}
          {cerrada.observacion && <p className="ayuda">Observación: {cerrada.observacion}</p>}
        </section>
      )}

      {caja ? (
        <CajaAbierta
          caja={caja}
          categorias={categorias}
          esAdmin={esAdmin}
          cerrando={cerrando}
          onCancelarCierre={() => setCerrando(false)}
          onCambio={setCaja}
          onCerrada={(c) => {
            setCerrando(false)
            setCaja(null)
            setCerrada(c)
            recargarHistorial()
            onCambioCaja()
          }}
        />
      ) : (
        <AbrirCaja
          onAbierta={(c) => {
            setCerrada(null)
            setCaja(c)
            onCambioCaja()
          }}
        />
      )}

      {esAdmin && (
        <Historial
          cajas={historial}
          onImprimir={setAImprimir}
          onCorregido={(abierta) => {
            setCaja(abierta)
            recargarHistorial()
          }}
        />
      )}

      {aImprimir && <ImprimirCierre caja={aImprimir} onListo={() => setAImprimir(null)} />}
    </div>
  )
}

// Lo que debería haber por método: el efectivo en el visor, el resto en cifras.
function CifrasCaja({ caja }: { caja: TCaja }): React.JSX.Element {
  const r = (m: MetodoPago): ResumenMetodo | undefined => caja.resumen.find((x) => x.metodo === m)
  const ef = r('efectivo')
  return (
    <div className="caja-cifras">
      <Visor
        etiqueta="Debería haber en efectivo"
        valor={gs(ef?.esperado ?? 0)}
        detalle={`Inicial ${gs(ef?.inicial ?? 0)} · ventas ${gs(ef?.ventas ?? 0)} · cobros ${gs(ef?.cobros ?? 0)}`}
      />
      <div className="cifras">
        {(['transferencia', 'tarjeta', 'qr'] as const).map((m) => (
          <Cifra key={m} etiqueta={NOMBRE_METODO[m]} valor={gs(r(m)?.esperado ?? 0)} tono="azul" />
        ))}
        <Cifra
          etiqueta="Egresos del día"
          valor={gs(caja.resumen.reduce((s, x) => s + x.egresos, 0))}
          tono="rojo"
        />
      </div>
    </div>
  )
}

function AbrirCaja({ onAbierta }: { onAbierta: (c: TCaja) => void }): React.JSX.Element {
  const [monto, setMonto] = useState(0)
  const [error, setError] = useState('')

  async function abrir(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      onAbierta(await api.abrirCaja(monto))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="tarjeta" onSubmit={abrir}>
      <h2>Abrir caja</h2>
      <p className="ayuda">Contá el efectivo con el que arranca el día (el cambio en el cajón).</p>
      <div className="grilla">
        <label className="req">
          Monto inicial en efectivo (Gs.)
          <input
            autoFocus
            inputMode="numeric"
            value={miles(monto)}
            onChange={(e) => setMonto(aEntero(e.target.value))}
          />
        </label>
        <div className="acciones abajo">
          <button className="primario">Abrir caja</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function CajaAbierta({
  caja,
  categorias,
  esAdmin,
  cerrando,
  onCancelarCierre,
  onCambio,
  onCerrada
}: {
  caja: TCaja
  categorias: CategoriaCaja[]
  esAdmin: boolean
  cerrando: boolean
  onCancelarCierre: () => void
  onCambio: (c: TCaja) => void
  onCerrada: (c: TCaja) => void
}): React.JSX.Element {
  const [mensaje, setMensaje] = useState<Mensaje>(null)

  async function anular(id: number): Promise<void> {
    const motivo = prompt('Motivo para anular el movimiento:')
    if (motivo === null) return
    try {
      onCambio(await api.anularMovimiento(id, motivo))
      setMensaje({ error: false, texto: 'Movimiento anulado' })
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  return (
    <>
      {cerrando && <CerrarCaja caja={caja} onCancelar={onCancelarCierre} onCerrada={onCerrada} />}
      {!caja.ciego && <CifrasCaja caja={caja} />}
      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>
            Caja N° {caja.id} <Etiqueta tono="verde">Abierta</Etiqueta>
          </h2>
          <span>
            Desde el {fechaHora(caja.abiertaEn)} por {caja.abiertaPor} · {caja.cantidadVentas}{' '}
            ventas
          </span>
        </div>
        {caja.ciego ? (
          <p className="ayuda">Arqueo ciego: al cerrar, contá todo sin ver lo esperado.</p>
        ) : (
          <TablaResumen resumen={caja.resumen} />
        )}
      </section>

      <NuevoMovimiento categorias={categorias} onGuardado={onCambio} />

      <section className="tarjeta">
        <h2>Movimientos</h2>
        {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Pago</th>
              <th>Usuario</th>
              <th className="num">Monto</th>
              {esAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {caja.movimientos.map((m) => (
              <tr key={m.id} className={m.anulado ? 'anulada' : ''}>
                <td>{hora(m.fecha)}</td>
                <td>{m.categoria}</td>
                <td>{m.descripcion ?? '—'}</td>
                <td>{NOMBRE_METODO[m.metodoPago]}</td>
                <td>{m.usuario}</td>
                <td className={'num ' + (m.tipo === 'egreso' ? 'negativo' : 'positivo')}>
                  {m.anulado && <Etiqueta tono="rojo">Anulado</Etiqueta>}{' '}
                  {m.tipo === 'egreso' ? '−' : '+'}
                  {gs(m.monto)}
                </td>
                {esAdmin && (
                  <td className="num">
                    {anulable(m) && (
                      <button className="chico peligro" onClick={() => anular(m.id)}>
                        Anular
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {caja.movimientos.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 7 : 6} className="vacio">
                  Sin ingresos ni egresos todavía. Las ventas se suman solas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  )
}

// Las devoluciones, las correcciones y los pagos de compras se anulan desde su origen.
const anulable = (m: MovimientoCaja): boolean =>
  !m.anulado && m.ventaId === null && m.corrigeId === null && m.compraId === null

function NuevoMovimiento({
  categorias,
  onGuardado
}: {
  categorias: CategoriaCaja[]
  onGuardado: (c: TCaja) => void
}): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoMovimiento>('egreso')
  const [categoriaId, setCategoriaId] = useState(0)
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState(0)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [mensaje, setMensaje] = useState<Mensaje>(null)

  const opciones = categorias.filter((c) => c.tipo === tipo && !c.sistema)
  const elegida = opciones.find((c) => c.id === categoriaId) ?? opciones[0]

  async function guardar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!elegida) return
    try {
      onGuardado(
        await api.registrarMovimiento({
          tipo,
          categoriaId: elegida.id,
          descripcion,
          monto,
          metodoPago: metodo
        })
      )
      setMensaje({ error: false, texto: `${tipo === 'egreso' ? 'Egreso' : 'Ingreso'} registrado` })
      setDescripcion('')
      setMonto(0)
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <h2>Registrar ingreso o egreso</h2>
      <div className="grilla">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
            <option value="egreso">Egreso (sale plata)</option>
            <option value="ingreso">Ingreso (entra plata)</option>
          </select>
        </label>
        <label>
          Categoría
          <select
            value={elegida?.id ?? ''}
            onChange={(e) => setCategoriaId(Number(e.target.value))}
          >
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="req">
          Monto (Gs.)
          <input
            inputMode="numeric"
            value={miles(monto)}
            onChange={(e) => setMonto(aEntero(e.target.value))}
          />
        </label>
        <label>
          Pago
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {NOMBRE_METODO[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="ancho3">
          Descripción
          <input
            placeholder="Ej.: encomienda a Encarnación, compra a proveedor…"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        <div className="acciones abajo">
          <button className="primario" disabled={!monto || !elegida}>
            Guardar
          </button>
        </div>
      </div>
      {elegida?.nombre === 'Mercadería' && (
        <p className="ayuda">
          Este egreso no suma al stock. Si compraste productos para vender, registralos en Compras:
          ahí suma al stock y descuenta de la caja en un solo paso.
        </p>
      )}
      {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
    </form>
  )
}

function CerrarCaja({
  caja,
  onCancelar,
  onCerrada
}: {
  caja: TCaja
  onCancelar: () => void
  onCerrada: (c: TCaja) => void
}): React.JSX.Element {
  // El efectivo se cuenta desde cero; el resto arranca con lo esperado para revisarlo contra el
  // banco o el POS. En arqueo ciego todo arranca vacío.
  const esperado = (m: MetodoPago): number | undefined =>
    caja.resumen.find((r) => r.metodo === m)?.esperado
  const [contado, setContado] = useState<Record<MetodoPago, string>>(
    () =>
      Object.fromEntries(
        METODOS_PAGO.map((m) => [m, m === 'efectivo' ? '' : String(esperado(m) ?? '')])
      ) as Record<MetodoPago, string>
  )
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')

  const completo = METODOS_PAGO.every((m) => contado[m] !== '')
  const resumen: ResumenMetodo[] = caja.resumen.map((r) => ({
    ...r,
    contado: contado[r.metodo] === '' ? null : aEntero(contado[r.metodo])
  }))
  const dif = diferencia(resumen)

  async function cerrar(): Promise<void> {
    const aviso =
      !caja.ciego && dif
        ? `Hay una diferencia de ${signo(dif)}. ¿Cerrar la caja igual?`
        : '¿Cerrar la caja?'
    if (!confirm(aviso)) return
    try {
      const montos = Object.fromEntries(METODOS_PAGO.map((m) => [m, aEntero(contado[m])]))
      onCerrada(await api.cerrarCaja(montos, observacion))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section className="tarjeta">
      <h2>Cerrar caja: arqueo</h2>
      <p className="ayuda">
        Contá el efectivo del cajón. En transferencia, tarjeta y QR revisá lo que muestra el banco o
        el POS{caja.ciego ? ' (si no hubo, poné 0)' : ''}.
      </p>
      <div className="grilla">
        {METODOS_PAGO.map((m) => (
          <label key={m} className={m === 'efectivo' || caja.ciego ? 'req' : ''}>
            {NOMBRE_METODO[m]} contado (Gs.)
            <input
              autoFocus={m === 'efectivo'}
              inputMode="numeric"
              value={contado[m] === '' ? '' : aEntero(contado[m]).toLocaleString('es-PY')}
              onChange={(e) => setContado({ ...contado, [m]: e.target.value.replace(/\D/g, '') })}
            />
          </label>
        ))}
        <label className="ancho4">
          Observación
          <input
            placeholder="Ej.: faltante por un vuelto mal dado"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </label>
      </div>
      {!caja.ciego && <TablaResumen resumen={resumen} />}
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="primario" disabled={!completo} onClick={cerrar}>
          Cerrar caja{!caja.ciego && completo && dif ? ` (diferencia ${signo(dif)})` : ''}
        </button>
        <button onClick={onCancelar}>Volver</button>
      </div>
    </section>
  )
}

function TablaResumen({ resumen }: { resumen: ResumenMetodo[] }): React.JSX.Element {
  const conArqueo = resumen.some((r) => r.contado !== null)
  const suma = (f: (r: ResumenMetodo) => number): number => resumen.reduce((s, r) => s + f(r), 0)
  const dif = (r: ResumenMetodo): number | null =>
    r.contado === null ? null : r.contado - r.esperado
  const celdaDif = (d: number | null): React.JSX.Element => (
    <td className={'num ' + (d ? (d > 0 ? 'positivo' : 'negativo') : '')}>
      {d === null ? '—' : signo(d)}
    </td>
  )
  const total: ResumenMetodo = {
    metodo: 'efectivo',
    inicial: suma((r) => r.inicial),
    ventas: suma((r) => r.ventas),
    cobros: suma((r) => r.cobros),
    ingresos: suma((r) => r.ingresos),
    egresos: suma((r) => r.egresos),
    esperado: suma((r) => r.esperado),
    contado: resumen.every((r) => r.contado !== null) ? suma((r) => r.contado ?? 0) : null
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Método</th>
          <th className="num">Inicial</th>
          <th className="num">Ventas contado</th>
          <th className="num">Cobros cuotas</th>
          <th className="num">Ingresos</th>
          <th className="num">Egresos</th>
          <th className="num">Debería haber</th>
          {conArqueo && <th className="num">Contado</th>}
          {conArqueo && <th className="num">Diferencia</th>}
        </tr>
      </thead>
      <tbody>
        {[...resumen, total].map((r, i) => (
          <tr key={i} className={i === resumen.length ? 'total' : ''}>
            <td>{i === resumen.length ? 'Total' : NOMBRE_METODO[r.metodo]}</td>
            <td className="num">{gs(r.inicial)}</td>
            <td className="num">{gs(r.ventas)}</td>
            <td className="num">{gs(r.cobros)}</td>
            <td className="num">{gs(r.ingresos)}</td>
            <td className="num">{gs(r.egresos)}</td>
            <td className="num">
              <strong>{gs(r.esperado)}</strong>
            </td>
            {conArqueo && <td className="num">{r.contado === null ? '—' : gs(r.contado)}</td>}
            {conArqueo && celdaDif(dif(r))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Historial({
  cajas,
  onImprimir,
  onCorregido
}: {
  cajas: TCaja[]
  onImprimir: (c: TCaja) => void
  onCorregido: (abierta: TCaja) => void
}): React.JSX.Element {
  const [abierta, setAbierta] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje>(null)

  async function anular(m: MovimientoCaja, cajaId: number): Promise<void> {
    const motivo = prompt(
      `La caja N° ${cajaId} ya está cerrada: se va a cargar el movimiento inverso en la caja abierta.\n\nMotivo para anular el movimiento N° ${m.id} (${gs(m.monto)}):`
    )
    if (motivo === null) return
    try {
      onCorregido(await api.anularMovimiento(m.id, motivo))
      setMensaje({ error: false, texto: `Movimiento N° ${m.id} anulado; corrección cargada` })
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  return (
    <section className="tarjeta">
      <h2>Cajas cerradas</h2>
      {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Apertura</th>
            <th>Cierre</th>
            <th>Cerró</th>
            <th className="num">Ventas</th>
            <th className="num">Debería haber</th>
            <th className="num">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {cajas.map((c) => {
            const d = diferencia(c.resumen)
            const esta = abierta === c.id
            return (
              <Fragment key={c.id}>
                <tr
                  className={'clic' + (esta ? ' sel' : '')}
                  onClick={() => setAbierta(esta ? null : c.id)}
                >
                  <td>{c.id}</td>
                  <td>
                    {fechaHora(c.abiertaEn)} · {c.abiertaPor}
                  </td>
                  <td>{c.cerradaEn && fechaHora(c.cerradaEn)}</td>
                  <td>{c.cerradaPor}</td>
                  <td className="num">{c.cantidadVentas}</td>
                  <td className="num">{gs(c.resumen.reduce((s, r) => s + r.esperado, 0))}</td>
                  <td className="num">
                    {d === 0 ? (
                      <Etiqueta tono="verde">Sin diferencia</Etiqueta>
                    ) : (
                      <Etiqueta tono={d > 0 ? 'ambar' : 'rojo'}>
                        {d > 0 ? 'Sobrante' : 'Faltante'} {signo(d)}
                      </Etiqueta>
                    )}
                  </td>
                </tr>
                {esta && (
                  <tr className="detalle">
                    <td colSpan={7}>
                      <div className="acciones sin-margen">
                        <button className="chico" onClick={() => onImprimir(c)}>
                          Imprimir cierre
                        </button>
                      </div>
                      <TablaResumen resumen={c.resumen} />
                      {c.observacion && <p>Observación: {c.observacion}</p>}
                      <table>
                        <tbody>
                          {c.movimientos.map((m) => (
                            <tr key={m.id} className={m.anulado ? 'anulada' : ''}>
                              <td>{hora(m.fecha)}</td>
                              <td>{m.categoria}</td>
                              <td>{m.descripcion ?? '—'}</td>
                              <td>{NOMBRE_METODO[m.metodoPago]}</td>
                              <td>{m.usuario}</td>
                              <td className="num">
                                {m.tipo === 'egreso' ? '−' : '+'}
                                {gs(m.monto)}
                              </td>
                              <td className="num">
                                {m.corregidoEnCaja !== null ? (
                                  <small>Corregido en caja N° {m.corregidoEnCaja}</small>
                                ) : (
                                  anulable(m) && (
                                    <button
                                      className="chico peligro"
                                      onClick={() => anular(m, c.id)}
                                    >
                                      Anular
                                    </button>
                                  )
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {cajas.length === 0 && (
            <tr>
              <td colSpan={7} className="vacio">
                Todavía no se cerró ninguna caja.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

function ImprimirCierre({
  caja: c,
  onListo
}: {
  caja: TCaja
  onListo: () => void
}): React.JSX.Element {
  const suma = (f: (r: ResumenMetodo) => number): number => c.resumen.reduce((s, r) => s + f(r), 0)
  const dif = diferencia(c.resumen)

  return (
    <Impresion onListo={onListo}>
      <h2>Cierre de caja N° {c.id}</h2>
      <p>
        Apertura: {c.abiertaEn.slice(0, 16)} ({c.abiertaPor})
        <br />
        Cierre: {c.cerradaEn?.slice(0, 16)} ({c.cerradaPor})
        <br />
        Ventas: {c.cantidadVentas}
      </p>
      <table>
        <thead>
          <tr>
            <th>Método</th>
            <th className="num">Esperado</th>
            <th className="num">Contado</th>
            <th className="num">Dif.</th>
          </tr>
        </thead>
        <tbody>
          {c.resumen.map((r) => (
            <tr key={r.metodo}>
              <td>{NOMBRE_METODO[r.metodo]}</td>
              <td className="num">{gs(r.esperado)}</td>
              <td className="num">{gs(r.contado ?? 0)}</td>
              <td className="num">{signo((r.contado ?? 0) - r.esperado)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td className="num">{gs(suma((r) => r.esperado))}</td>
            <td className="num">{gs(suma((r) => r.contado ?? 0))}</td>
            <td className="num">{signo(dif)}</td>
          </tr>
        </tbody>
      </table>
      <h3>Cómo se llega a lo esperado</h3>
      <table>
        <tbody>
          <tr>
            <td>Monto inicial</td>
            <td className="num">{gs(suma((r) => r.inicial))}</td>
          </tr>
          <tr>
            <td>Ventas al contado</td>
            <td className="num">{gs(suma((r) => r.ventas))}</td>
          </tr>
          <tr>
            <td>Cobros de cuotas</td>
            <td className="num">{gs(suma((r) => r.cobros))}</td>
          </tr>
          <tr>
            <td>Otros ingresos</td>
            <td className="num">{gs(suma((r) => r.ingresos))}</td>
          </tr>
          <tr>
            <td>Egresos</td>
            <td className="num">−{gs(suma((r) => r.egresos))}</td>
          </tr>
        </tbody>
      </table>
      {c.movimientos.length > 0 && (
        <>
          <h3>Movimientos</h3>
          <table>
            <tbody>
              {c.movimientos.map((m) => (
                <tr key={m.id}>
                  <td>
                    {hora(m.fecha)} {m.categoria}
                    {m.descripcion ? ` · ${m.descripcion}` : ''}
                    {m.anulado ? ' (anulado)' : ''}
                  </td>
                  <td className="num">
                    {m.tipo === 'egreso' ? '−' : '+'}
                    {gs(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {c.observacion && <p>Observación: {c.observacion}</p>}
      <p className="firma">Firma: ______________________</p>
    </Impresion>
  )
}
