import { useEffect, useRef, useState } from 'react'
import { aEntero, api, cantidad, fecha, gs, hora, NOMBRE_METODO } from '../api'
import { calendarioCuotas, MAX_CUOTAS } from '../../../shared/cuotas'
import { Encabezado, Etiqueta, Visor } from '../componentes'
import BuscadorProductos from '../BuscadorProductos'
import Recibo from '../Recibo'
import Ticket from '../Ticket'
import {
  METODOS_PAGO,
  type Cliente,
  type Cobro,
  type CuentaCliente,
  type Devolucion,
  type MetodoPago,
  type Producto,
  type Venta
} from '../../../shared/tipos'

type Renglon = { producto: Producto; cantidad: number }

// Fecha local de hoy, AAAA-MM-DD (toISOString daría la de UTC).
const hoy = (): string => new Date().toLocaleDateString('sv-SE')

export default function Ventas({ esAdmin }: { esAdmin: boolean }): React.JSX.Element {
  const [carrito, setCarrito] = useState<Renglon[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [descuento, setDescuento] = useState(0)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [enCuotas, setEnCuotas] = useState(false)
  const [cantCuotas, setCantCuotas] = useState(3)
  const [entrega, setEntrega] = useState(0)
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  // Recibo de la entrega de la última venta en cuotas: se ofrece imprimirlo.
  const [entregaHecha, setEntregaHecha] = useState<{ cuenta: CuentaCliente; cobro: Cobro } | null>(
    null
  )
  const [imprimiendo, setImprimiendo] = useState(false)
  // La venta recién cobrada (para ofrecer su ticket) y la que se está imprimiendo.
  const [ultima, setUltima] = useState<Venta | null>(null)
  const [ticket, setTicket] = useState<Venta | null>(null)
  const [delDia, setDelDia] = useState<Venta[]>([])
  // Día que se lista abajo; por número se busca una venta de cualquier día.
  const [dia, setDia] = useState(hoy)
  const [numero, setNumero] = useState('')
  const [aviso, setAviso] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [cajaAbierta, setCajaAbierta] = useState(true)
  const [ocultarTotal, setOcultarTotal] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const [proxima, setProxima] = useState(0)

  const recargarDia = (d = dia): Promise<void> =>
    Promise.all([api.ventasDelDia(d), api.proximaVenta()]).then(([v, n]) => {
      setDelDia(v)
      setProxima(n)
    })
  useEffect(() => {
    recargarDia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia])
  useEffect(() => {
    api.cajaActual().then((c) => setCajaAbierta(c !== null))
    // Con arqueo ciego el cajero no ve el total del día.
    if (!esAdmin) api.configuracion().then((c) => setOcultarTotal(c.arqueoCiego))
  }, [esAdmin])

  const subtotal = carrito.reduce((s, r) => s + r.producto.precioVenta * r.cantidad, 0)
  const total = Math.max(subtotal - descuento, 0)
  const saldo = total - entrega
  const planValido = saldo >= cantCuotas
  const plan = planValido ? calendarioCuotas(hoy(), cantCuotas, saldo) : []

  function agregar(p: Producto): void {
    setCarrito((c) => {
      const i = c.findIndex((r) => r.producto.id === p.id)
      if (i < 0) return [...c, { producto: p, cantidad: 1 }]
      return c.map((r, j) => (j === i ? { ...r, cantidad: r.cantidad + 1 } : r))
    })
    setMensaje(null)
  }

  const cambiarCantidad = (id: number, cantidad: number): void =>
    setCarrito((c) => c.map((r) => (r.producto.id === id ? { ...r, cantidad } : r)))

  const quitar = (id: number): void => setCarrito((c) => c.filter((r) => r.producto.id !== id))

  function nueva(): void {
    setCarrito([])
    setCliente(null)
    setDescuento(0)
    setMetodo('efectivo')
    setEnCuotas(false)
    setCantCuotas(3)
    setEntrega(0)
    entrada.current?.focus()
  }

  async function cobrar(): Promise<void> {
    try {
      const v = await api.registrarVenta({
        clienteId: cliente?.id ?? null,
        items: carrito.map((r) => ({ productoId: r.producto.id, cantidad: r.cantidad })),
        descuento,
        metodoPago: metodo,
        cuotas: enCuotas ? { cantidad: cantCuotas, entrega } : null
      })
      setMensaje({
        error: false,
        texto: enCuotas
          ? `Venta N° ${v.id} en ${cantCuotas} cuotas a ${v.cliente}: ${gs(v.total)}`
          : `Venta N° ${v.id} registrada: ${gs(v.total)}`
      })
      setUltima(v)
      setEntregaHecha(null)
      if (enCuotas && entrega > 0 && cliente) {
        const cuenta = await api.cuentaCliente(cliente.id)
        const cobro = cuenta.cobros.find((c) => c.esEntrega && c.aplicado[0]?.ventaId === v.id)
        if (cobro) setEntregaHecha({ cuenta, cobro })
      }
      nueva()
      if (dia === hoy()) await recargarDia()
      else setDia(hoy())
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function anular(v: Venta): Promise<void> {
    const motivo = prompt(`Motivo para anular la venta N° ${v.id} (${gs(v.total)}):`)
    if (motivo === null) return
    try {
      await api.anularVenta(v.id, motivo)
      setMensaje({
        error: false,
        texto: `Venta N° ${v.id} anulada; la mercadería volvió al stock${
          v.condicion === 'cuotas'
            ? ' y lo que pagó el cliente sale de la caja como devolución'
            : ''
        }`
      })
      await recargarDia()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function buscarNumero(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      const v = await api.buscarVenta(aEntero(numero))
      setNumero('')
      setAbierta(v.id)
      setDia(v.fecha.slice(0, 10))
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  // Neto: sin lo que se devolvió de esas ventas.
  const vendidoHoy = delDia.filter((v) => !v.anulada).reduce((s, v) => s + v.total - v.devuelto, 0)

  function devuelta(d: Devolucion): void {
    const unidades = d.venta.items.reduce((s, it) => s + it.devueltos, 0)
    setAviso(
      `Venta N° ${d.venta.id}: vuelve al stock lo devuelto (${cantidad(unidades, 'unidad devuelta', 'unidades devueltas')} en total).` +
        (d.descontado ? ` Se descontaron ${gs(d.descontado)} de las cuotas.` : '') +
        (d.reintegro ? ` Devolvé ${gs(d.reintegro)} al cliente.` : '')
    )
    recargarDia()
  }
  const unidades = carrito.reduce((s, r) => s + r.cantidad, 0)
  const puedeCobrar =
    cajaAbierta &&
    carrito.length > 0 &&
    !carrito.some((r) => !r.cantidad) &&
    (!enCuotas || (cliente !== null && planValido))

  // F12 cobra desde cualquier lugar de la pantalla, como en infoventa.
  const atajo = useRef<() => void>(() => {})
  useEffect(() => {
    atajo.current = () => {
      if (puedeCobrar) cobrar()
    }
  })
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key !== 'F12') return
      e.preventDefault()
      atajo.current()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  return (
    <div className="pila">
      <Encabezado
        titulo="Nueva venta"
        ayuda="Pasá el lector o escribí el código o parte del nombre del producto."
      >
        <Etiqueta>Próxima venta N° {String(proxima).padStart(6, '0')}</Etiqueta>
      </Encabezado>

      <div className="venta">
        <section className="tarjeta carrito">
          {!cajaAbierta && (
            <p className="aviso">
              La caja está cerrada. Abrila en la pestaña Caja para poder cobrar.
            </p>
          )}
          <BuscadorProductos entrada={entrada} onElegir={agregar} />
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="num">Disponible</th>
                <th className="num">Cantidad</th>
                <th className="num">Precio</th>
                <th className="num">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {carrito.map((r) => (
                <tr key={r.producto.id}>
                  <td>{r.producto.codigo}</td>
                  <td>{r.producto.nombre}</td>
                  <td className={'num' + (r.cantidad > r.producto.stock ? ' bajo' : '')}>
                    {r.producto.stock}
                  </td>
                  <td className="num">
                    <input
                      className={'cantidad' + (r.cantidad > r.producto.stock ? ' excede' : '')}
                      inputMode="numeric"
                      value={r.cantidad || ''}
                      onChange={(e) => cambiarCantidad(r.producto.id, aEntero(e.target.value))}
                    />
                  </td>
                  <td className="num">{gs(r.producto.precioVenta)}</td>
                  <td className="num">
                    <strong>{gs(r.producto.precioVenta * r.cantidad)}</strong>
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="chico peligro"
                      onClick={() => quitar(r.producto.id)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {carrito.length === 0 && (
                <tr>
                  <td colSpan={7} className="vacio">
                    Todavía no hay productos en esta venta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pie">
            <span>
              Productos distintos: <strong>{carrito.length}</strong>
            </span>
            <span>
              Unidades: <strong>{unidades}</strong>
            </span>
          </div>
        </section>

        <aside className="cobro">
          <Visor
            etiqueta={enCuotas ? 'Total de la venta en cuotas' : 'Total a cobrar'}
            valor={gs(total)}
            detalle={
              descuento > 0
                ? `Subtotal ${gs(subtotal)} − descuento ${gs(descuento)}`
                : enCuotas && planValido
                  ? `${cantCuotas} cuotas de ${gs(plan[0].monto)}${entrega ? ` + entrega ${gs(entrega)}` : ''}`
                  : undefined
            }
          />
          <div className="tarjeta pila chica">
            <div className="segmentado">
              <button className={enCuotas ? '' : 'activa'} onClick={() => setEnCuotas(false)}>
                Contado
              </button>
              <button className={enCuotas ? 'activa' : ''} onClick={() => setEnCuotas(true)}>
                En cuotas
              </button>
            </div>
            <ElegirCliente cliente={cliente} obligatorio={enCuotas} onCambio={setCliente} />
            <div className="grilla dos">
              <label>
                {enCuotas ? 'Pago de la entrega' : 'Método de pago'}
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>
                      {NOMBRE_METODO[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descuento (Gs.)
                <input
                  inputMode="numeric"
                  value={descuento ? descuento.toLocaleString('es-PY') : ''}
                  onChange={(e) => setDescuento(aEntero(e.target.value))}
                />
              </label>
            </div>
            {enCuotas && (
              <>
                <div className="grilla dos">
                  <label>
                    Entrega inicial (Gs.)
                    <input
                      inputMode="numeric"
                      value={entrega ? entrega.toLocaleString('es-PY') : ''}
                      onChange={(e) => setEntrega(aEntero(e.target.value))}
                    />
                  </label>
                  <label>
                    Cuotas
                    <select
                      value={cantCuotas}
                      onChange={(e) => setCantCuotas(Number(e.target.value))}
                    >
                      {Array.from({ length: MAX_CUOTAS }, (_, i) => i + 1).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {planValido && (
                  <ul className="plan">
                    {plan.map((c) => (
                      <li key={c.numero}>
                        <span>
                          Cuota {c.numero} · vence el {fecha(c.vencimiento)}
                        </span>
                        <span>{gs(c.monto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
            {ultima && mensaje && !mensaje.error && (
              <div className="acciones sin-margen">
                <button type="button" onClick={() => setTicket(ultima)}>
                  Imprimir ticket
                </button>
                {entregaHecha && (
                  <button type="button" onClick={() => setImprimiendo(true)}>
                    Imprimir recibo de la entrega
                  </button>
                )}
              </div>
            )}
            {entregaHecha && imprimiendo && (
              <Recibo
                cuenta={entregaHecha.cuenta}
                cobro={entregaHecha.cobro}
                onListo={() => setImprimiendo(false)}
              />
            )}
            <button className="exito grande" disabled={!puedeCobrar} onClick={cobrar}>
              {enCuotas
                ? entrega
                  ? `Cobrar entrega ${gs(entrega)}`
                  : 'Registrar venta en cuotas'
                : 'Cobrar'}{' '}
              <kbd>F12</kbd>
            </button>
            <button
              type="button"
              className="cancelar"
              disabled={!carrito.length && !cliente}
              onClick={nueva}
            >
              Cancelar venta
            </button>
          </div>
        </aside>
      </div>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>{dia === hoy() ? 'Ventas de hoy' : `Ventas del ${fecha(dia)}`}</h2>
          <span>
            {cantidad(delDia.filter((v) => !v.anulada).length, 'venta', 'ventas')}
            {!ocultarTotal && ` · ${gs(vendidoHoy)}`}
          </span>
        </div>
        <form className="fila-filtros abajo" onSubmit={buscarNumero}>
          <label>
            Día
            <input
              type="date"
              value={dia}
              max={hoy()}
              onChange={(e) => e.target.value && setDia(e.target.value)}
            />
          </label>
          {dia !== hoy() && (
            <button type="button" className="chico" onClick={() => setDia(hoy())}>
              Volver a hoy
            </button>
          )}
          <label>
            N° de venta (del ticket)
            <input
              inputMode="numeric"
              placeholder="Ej.: 152"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button className="chico" disabled={!numero}>
            Buscar
          </button>
        </form>
        {aviso && (
          <div className="fila-mensaje">
            <p className="ok">{aviso}</p>
            <button className="chico" onClick={() => setAviso('')}>
              Listo
            </button>
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Pago</th>
              <th>Vendedor</th>
              <th className="num">Total</th>
              {esAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {delDia.map((v) => (
              <FilaVenta
                key={v.id}
                venta={v}
                abierta={abierta === v.id}
                onClick={() => setAbierta(abierta === v.id ? null : v.id)}
                onImprimir={() => setTicket(v)}
                onAnular={esAdmin ? () => anular(v) : undefined}
                onDevuelta={esAdmin ? devuelta : undefined}
              />
            ))}
            {delDia.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 7 : 6} className="vacio">
                  {dia === hoy() ? 'Todavía no hay ventas hoy.' : 'No hubo ventas ese día.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {ticket && <Ticket venta={ticket} onListo={() => setTicket(null)} />}
    </div>
  )
}

function FilaVenta({
  venta: v,
  abierta,
  onClick,
  onImprimir,
  onAnular,
  onDevuelta
}: {
  venta: Venta
  abierta: boolean
  onClick: () => void
  onImprimir: () => void
  onAnular?: () => void
  onDevuelta?: (d: Devolucion) => void
}): React.JSX.Element {
  const [devolviendo, setDevolviendo] = useState(false)
  const quedan = v.items.some((it) => it.cantidad > it.devueltos)
  return (
    <>
      <tr
        className={'clic' + (v.anulada ? ' anulada' : '') + (abierta ? ' sel' : '')}
        onClick={onClick}
      >
        <td>{v.id}</td>
        <td>{hora(v.fecha)}</td>
        <td>{v.cliente ?? '—'}</td>
        <td>
          {v.condicion === 'cuotas' ? (
            <Etiqueta tono="azul">
              Cuotas{v.entrega ? ` · entrega ${NOMBRE_METODO[v.metodoPago]}` : ''}
            </Etiqueta>
          ) : (
            NOMBRE_METODO[v.metodoPago]
          )}
        </td>
        <td>{v.usuario}</td>
        <td className="num">
          {v.anulada && <Etiqueta tono="rojo">Anulada</Etiqueta>}
          {v.devuelto > 0 && !v.anulada && (
            <Etiqueta tono="ambar">Devuelto {gs(v.devuelto)}</Etiqueta>
          )}{' '}
          {gs(v.total)}
        </td>
        {onAnular && (
          <td className="num">
            {!v.anulada && !v.devuelto && (
              <button
                type="button"
                className="chico peligro"
                onClick={(e) => {
                  e.stopPropagation()
                  onAnular()
                }}
              >
                Anular
              </button>
            )}
          </td>
        )}
      </tr>
      {abierta && (
        <tr className="detalle">
          <td colSpan={onAnular ? 7 : 6}>
            {v.items.map((it) => (
              <div key={it.id}>
                {it.cantidad} × {it.codigo} {it.nombre} — {gs(it.precio)} = {gs(it.subtotal)}
                {it.devueltos > 0 && <strong> · devueltos {it.devueltos}</strong>}
              </div>
            ))}
            {v.descuento > 0 && <div>Descuento: {gs(v.descuento)}</div>}
            {devolviendo && onDevuelta ? (
              <Devolver
                venta={v}
                onCancelar={() => setDevolviendo(false)}
                onHecha={(d) => {
                  setDevolviendo(false)
                  onDevuelta(d)
                }}
              />
            ) : (
              <div className="acciones">
                <button type="button" className="chico" onClick={onImprimir}>
                  Reimprimir ticket
                </button>
                {onDevuelta && !v.anulada && quedan && (
                  <button type="button" className="chico" onClick={() => setDevolviendo(true)}>
                    Devolver productos…
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Devolución de parte de una venta. El valor tiene en cuenta el descuento de la venta; en cuotas se
// descuenta primero de lo que falta pagar.
function Devolver({
  venta: v,
  onCancelar,
  onHecha
}: {
  venta: Venta
  onCancelar: () => void
  onHecha: (d: Devolucion) => void
}): React.JSX.Element {
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [motivo, setMotivo] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>(v.metodoPago)
  const [error, setError] = useState('')

  const elegidos = v.items.filter((it) => (cantidades[it.id] ?? 0) > 0)
  // Estimado: el proceso principal hace la cuenta exacta (y cierra el redondeo si se devuelve todo).
  const valor = elegidos.reduce(
    (s, it) =>
      s + (v.subtotal ? Math.round((it.precio * cantidades[it.id] * v.total) / v.subtotal) : 0),
    0
  )

  async function devolver(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      onHecha(
        await api.devolverItems(
          v.id,
          elegidos.map((it) => ({ itemId: it.id, cantidad: cantidades[it.id] })),
          motivo,
          metodo
        )
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="producto-rapido" onSubmit={devolver} onClick={(e) => e.stopPropagation()}>
      <strong>Devolver productos de la venta N° {v.id}</strong>
      <table>
        <tbody>
          {v.items
            .filter((it) => it.cantidad > it.devueltos)
            .map((it) => (
              <tr key={it.id}>
                <td>
                  {it.codigo} {it.nombre}
                </td>
                <td className="num">Puede devolver {it.cantidad - it.devueltos}</td>
                <td className="num">
                  <input
                    className={
                      'cantidad' +
                      ((cantidades[it.id] ?? 0) > it.cantidad - it.devueltos ? ' excede' : '')
                    }
                    inputMode="numeric"
                    placeholder="0"
                    value={cantidades[it.id] || ''}
                    onChange={(e) =>
                      setCantidades({ ...cantidades, [it.id]: aEntero(e.target.value) })
                    }
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="grilla">
        <label className="req ancho2">
          Motivo
          <input
            placeholder="Ej.: cambio de talle, falla"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <label>
          {v.condicion === 'cuotas' ? 'Si sobra, se devuelve en' : 'Se devuelve en'}
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {NOMBRE_METODO[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="ayuda">
        {v.condicion === 'cuotas'
          ? 'Lo devuelto se descuenta primero de las últimas cuotas que faltan pagar; si vale más de lo que debe, la diferencia se le devuelve en plata desde la caja.'
          : 'La plata sale de la caja abierta como "Devolución de venta".'}{' '}
        Si es un cambio, después cargá la venta nueva con el producto que se lleva.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="acciones sin-margen">
        <button className="primario" disabled={!elegidos.length || !motivo.trim()}>
          Devolver{valor ? ` (${gs(valor)})` : ''}
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Cliente: opcional al contado, obligatorio en cuotas.
function ElegirCliente({
  cliente,
  obligatorio,
  onCambio
}: {
  cliente: Cliente | null
  obligatorio: boolean
  onCambio: (c: Cliente | null) => void
}): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<Cliente[]>([])
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', documento: '', telefono: '' })
  const [error, setError] = useState('')

  function escribir(t: string): void {
    setTexto(t)
    if (t.trim()) api.buscarClientes(t).then(setLista)
  }

  function elegir(c: Cliente | null): void {
    onCambio(c)
    setTexto('')
    setCreando(false)
    setError('')
  }

  async function crear(): Promise<void> {
    try {
      elegir(await api.crearCliente({ ...nuevo, direccion: null }))
      setNuevo({ nombre: '', documento: '', telefono: '' })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (cliente)
    return (
      <div className="cliente-elegido">
        <span>
          <small>Cliente</small>
          <strong>{cliente.nombre}</strong>
          {cliente.documento && <small>{cliente.documento}</small>}
        </span>
        <button type="button" className="chico" onClick={() => elegir(null)}>
          Cambiar
        </button>
      </div>
    )

  if (creando)
    return (
      <div className="pila chica">
        <strong>Nuevo cliente</strong>
        <input
          placeholder="Nombre y apellido"
          value={nuevo.nombre}
          onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
        />
        <input
          placeholder="CI o RUC"
          value={nuevo.documento}
          onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })}
        />
        <input
          placeholder="Teléfono"
          value={nuevo.telefono}
          onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
        />
        {error && <p className="error">{error}</p>}
        <div className="acciones">
          <button type="button" className="primario" onClick={crear}>
            Guardar
          </button>
          <button type="button" onClick={() => setCreando(false)}>
            Volver
          </button>
        </div>
      </div>
    )

  return (
    <label className={obligatorio ? 'req' : ''}>
      {obligatorio ? 'Cliente (obligatorio en cuotas)' : 'Cliente (opcional)'}
      <input
        placeholder="Buscar por nombre, CI o teléfono…"
        value={texto}
        onChange={(e) => escribir(e.target.value)}
      />
      {texto.trim() && (
        <ul className="opciones">
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => elegir(c)}>
                <span>{c.nombre}</span>
                <span>{c.documento ?? c.telefono ?? ''}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setNuevo({ ...nuevo, nombre: texto.trim() })
                setCreando(true)
              }}
            >
              <span>+ Registrar cliente nuevo</span>
            </button>
          </li>
        </ul>
      )}
    </label>
  )
}
