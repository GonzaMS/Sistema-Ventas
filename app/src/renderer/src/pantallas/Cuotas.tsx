import { useEffect, useState } from 'react'
import { aEntero, api, fecha, fechaHora, gs, NOMBRE_METODO } from '../api'
import Recibo from '../Recibo'
import { Cifra, Encabezado, Etiqueta, Visor, type Tono } from '../componentes'
import {
  METODOS_PAGO,
  type Cliente,
  type Cobro,
  type CuentaCliente,
  type Cuota,
  type MetodoPago,
  type ResumenCliente
} from '../../../shared/tipos'

type Mensaje = { error: boolean; texto: string } | null

const ESTADO: Record<Cuota['estado'], [string, Tono]> = {
  pagada: ['Pagada', 'verde'],
  parcial: ['Pago parcial', 'ambar'],
  pendiente: ['Pendiente', 'neutro'],
  atrasada: ['Atrasada', 'rojo']
}

const dias = (n: number): string => (n === 1 ? '1 día' : `${n} días`)

export default function Cuotas({ esAdmin }: { esAdmin: boolean }): React.JSX.Element {
  const [lista, setLista] = useState<ResumenCliente[]>([])
  const [texto, setTexto] = useState('')
  const [soloAtrasados, setSoloAtrasados] = useState(false)
  const [todos, setTodos] = useState(false)
  const [elegido, setElegido] = useState<number | null>(null)

  const recargar = (): Promise<void> =>
    api.clientesConSaldo(texto, soloAtrasados, todos).then(setLista)
  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, soloAtrasados, todos])

  const totalSaldo = lista.reduce((s, r) => s + r.saldo, 0)
  const totalVencido = lista.reduce((s, r) => s + r.vencido, 0)

  const atrasados = lista.filter((r) => r.vencido > 0).length

  return (
    <div className="pila">
      <Encabezado
        titulo="Cuotas"
        ayuda="Clientes que compraron en cuotas: lo que deben, lo vencido y sus pagos."
      />
      {!texto && !soloAtrasados && !todos && (
        <div className="caja-cifras">
          <Visor
            etiqueta="Total a cobrar"
            valor={gs(totalSaldo)}
            detalle={`${lista.length} clientes con saldo`}
          />
          <div className="cifras">
            <Cifra
              etiqueta="Vencido sin pagar"
              valor={gs(totalVencido)}
              tono={totalVencido ? 'rojo' : 'verde'}
            />
            <Cifra
              etiqueta="Clientes atrasados"
              valor={atrasados}
              detalle={atrasados ? 'Tocá uno para registrar el pago' : 'Todos al día'}
              tono={atrasados ? 'rojo' : 'verde'}
            />
          </div>
        </div>
      )}
      {elegido !== null && (
        <Cuenta
          key={elegido}
          clienteId={elegido}
          esAdmin={esAdmin}
          onCerrar={() => setElegido(null)}
          onCambio={recargar}
        />
      )}

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>{todos ? 'Clientes' : 'Clientes con saldo'}</h2>
          <span>
            {lista.length} {lista.length === 1 ? 'cliente' : 'clientes'} · deben {gs(totalSaldo)}
            {totalVencido > 0 && <> · vencido {gs(totalVencido)}</>}
          </span>
        </div>
        <div className="fila-filtros">
          <input
            placeholder="Buscar por nombre, CI o teléfono…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={soloAtrasados}
              onChange={(e) => setSoloAtrasados(e.target.checked)}
            />
            Solo atrasados
          </label>
          <label className="check">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Incluir clientes sin deuda
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>CI / RUC</th>
              <th>Teléfono</th>
              <th>Próxima cuota</th>
              <th className="num">Vencido</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr
                key={r.cliente.id}
                className={'clic' + (r.cliente.id === elegido ? ' sel' : '')}
                onClick={() => setElegido(r.cliente.id)}
              >
                <td>{r.cliente.nombre}</td>
                <td>{r.cliente.documento ?? '—'}</td>
                <td>{r.cliente.telefono ?? '—'}</td>
                <td>
                  {r.proximoVencimiento && fecha(r.proximoVencimiento)}{' '}
                  {r.diasAtraso > 0 && (
                    <Etiqueta tono="rojo">{dias(r.diasAtraso)} de atraso</Etiqueta>
                  )}
                </td>
                <td className={'num' + (r.vencido ? ' negativo' : '')}>
                  {r.vencido ? gs(r.vencido) : '—'}
                </td>
                <td className="num">
                  {r.saldo ? gs(r.saldo) : <Etiqueta tono="verde">Al día</Etiqueta>}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="vacio">
                  {soloAtrasados
                    ? 'Nadie está atrasado.'
                    : todos
                      ? 'No hay clientes que coincidan.'
                      : 'No hay clientes con saldo pendiente.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Cuenta({
  clienteId,
  esAdmin,
  onCerrar,
  onCambio
}: {
  clienteId: number
  esAdmin: boolean
  onCerrar: () => void
  onCambio: () => void
}): React.JSX.Element {
  const [cuenta, setCuenta] = useState<CuentaCliente | null>(null)
  const [monto, setMonto] = useState(0)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [ultimo, setUltimo] = useState<Cobro | null>(null)
  const [aImprimir, setAImprimir] = useState<Cobro | null>(null)
  const [panel, setPanel] = useState<'editar' | null>(null)

  // El monto sugerido es lo vencido o, si está al día, la próxima cuota.
  const cargar = (): Promise<void> =>
    api.cuentaCliente(clienteId).then((c) => {
      setCuenta(c)
      const proxima = c.ventas
        .flatMap((v) => v.cuotas)
        .filter((q) => q.saldo > 0)
        .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0]
      setMonto(c.vencido || proxima?.saldo || 0)
    })
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cobrar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      const c = await api.cobrarCuotas(clienteId, monto, metodo)
      const detalle = c.aplicado
        .map((a) => `venta ${a.ventaId} cuota ${a.numero} (${gs(a.monto)})`)
        .join(', ')
      setMensaje({ error: false, texto: `Pago N° ${c.id} de ${gs(c.monto)} aplicado a ${detalle}` })
      setUltimo(c)
      await cargar()
      onCambio()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function anular(id: number): Promise<void> {
    const motivo = prompt(
      `Anular el pago N° ${id}: la deuda vuelve a las cuotas. Si el pago es de una caja ya cerrada, la plata sale de la caja abierta.\n\nMotivo:`
    )
    if (motivo === null) return
    try {
      await api.anularCobro(id, motivo)
      setUltimo(null)
      setMensaje({ error: false, texto: `Pago N° ${id} anulado` })
      await cargar()
      onCambio()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function anularVenta(id: number, pagado: number): Promise<void> {
    const motivo = prompt(
      `Anular la venta N° ${id}: la mercadería vuelve al stock${
        pagado ? ` y se le devuelven ${gs(pagado)} al cliente desde la caja abierta` : ''
      }.\n\nMotivo:`
    )
    if (motivo === null) return
    try {
      await api.anularVenta(id, motivo)
      setMensaje({
        error: false,
        texto: `Venta N° ${id} anulada${pagado ? `: devolvé ${gs(pagado)} al cliente` : ''}`
      })
      await cargar()
      onCambio()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  if (!cuenta) return <section className="tarjeta">Cargando…</section>
  const { cliente } = cuenta

  return (
    <section className="tarjeta pila">
      <div className="fila-titulo">
        <h2>
          {cliente.nombre}
          {cliente.documento && <small> · CI/RUC {cliente.documento}</small>}
          {cliente.telefono && <small> · Tel. {cliente.telefono}</small>}
        </h2>
        <div className="acciones sin-margen">
          <button className="chico" onClick={() => setPanel(panel === 'editar' ? null : 'editar')}>
            Editar datos
          </button>
          <button className="chico" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
      {cliente.direccion && <p className="ayuda">Dirección: {cliente.direccion}</p>}
      {panel === 'editar' && (
        <EditarCliente
          cliente={cliente}
          onGuardado={() => {
            setPanel(null)
            setMensaje({ error: false, texto: 'Datos del cliente actualizados' })
            cargar()
            onCambio()
          }}
          onCancelar={() => setPanel(null)}
        />
      )}

      <div className="cifras">
        <Cifra etiqueta="Debe en total" valor={gs(cuenta.saldo)} tono="azul" />
        <Cifra
          etiqueta="Vencido"
          valor={gs(cuenta.vencido)}
          tono={cuenta.vencido ? 'rojo' : 'verde'}
        />
        <Cifra
          etiqueta="Compras en cuotas"
          valor={cuenta.ventas.length}
          detalle={`${cuenta.cobros.filter((c) => !c.anulado).length} pagos registrados`}
        />
      </div>

      {cuenta.saldo > 0 && (
        <form onSubmit={cobrar}>
          <div className="grilla">
            <label className="req">
              Monto que paga (Gs.)
              <input
                autoFocus
                inputMode="numeric"
                value={monto ? monto.toLocaleString('es-PY') : ''}
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
            <div className="acciones abajo ancho2">
              <button className="exito" disabled={!monto}>
                Registrar pago
              </button>
              <button type="button" onClick={() => setMonto(cuenta.saldo)}>
                Paga todo ({gs(cuenta.saldo)})
              </button>
            </div>
          </div>
          <p className="ayuda">Se aplica a las cuotas más viejas primero.</p>
        </form>
      )}
      {mensaje && (
        <div className="fila-mensaje">
          <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>
          {ultimo && !mensaje.error && (
            <button className="chico" onClick={() => setAImprimir(ultimo)}>
              Imprimir recibo
            </button>
          )}
        </div>
      )}

      {cuenta.ventas.map((v) => (
        <div key={v.id}>
          <div className="fila-titulo">
            <h3>
              Venta N° {v.id} · {fecha(v.fecha)} · {gs(v.total)}
              {v.entrega > 0 && <small> · entrega {gs(v.entrega)}</small>}
            </h3>
            {esAdmin && (
              <button
                className="chico peligro"
                onClick={() =>
                  anularVenta(
                    v.id,
                    v.cuotas.reduce((s, q) => s + q.pagado, 0)
                  )
                }
              >
                Anular venta
              </button>
            )}
          </div>
          <p className="ayuda">{v.items.map((it) => `${it.cantidad} × ${it.nombre}`).join(', ')}</p>
          <table>
            <thead>
              <tr>
                <th>Cuota</th>
                <th>Vence</th>
                <th>Estado</th>
                <th className="num">Monto</th>
                <th className="num">Pagado</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {v.cuotas.map((q) => (
                <tr key={q.id} className={q.estado === 'pagada' ? 'apagada' : ''}>
                  <td>{q.numero === 0 ? 'Entrega' : q.numero}</td>
                  <td>{fecha(q.vencimiento)}</td>
                  <td>
                    <Etiqueta tono={ESTADO[q.estado][1]}>
                      {ESTADO[q.estado][0]}
                      {q.diasAtraso > 0 && ` · ${dias(q.diasAtraso)}`}
                    </Etiqueta>
                  </td>
                  <td className="num">{gs(q.monto)}</td>
                  <td className="num">{gs(q.pagado)}</td>
                  <td className="num">{gs(q.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div>
        <h3>Pagos</h3>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Pago</th>
              <th>Usuario</th>
              <th>Aplicado a</th>
              <th className="num">Monto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cuenta.cobros.map((c) => (
              <tr key={c.id} className={c.anulado ? 'anulada' : ''}>
                <td>{c.id}</td>
                <td>{fechaHora(c.fecha)}</td>
                <td>{NOMBRE_METODO[c.metodoPago]}</td>
                <td>{c.usuario}</td>
                <td>
                  {c.aplicado
                    .map((a) => `V${a.ventaId} ${a.numero === 0 ? 'entrega' : `c${a.numero}`}`)
                    .join(', ')}
                </td>
                <td className="num">
                  {c.anulado && <Etiqueta tono="rojo">Anulado</Etiqueta>} {gs(c.monto)}
                </td>
                <td className="num">
                  {!c.anulado && (
                    <div className="acciones sin-margen fin">
                      <button className="chico" onClick={() => setAImprimir(c)}>
                        Recibo
                      </button>
                      {esAdmin && !c.esEntrega && (
                        <button className="chico peligro" onClick={() => anular(c.id)}>
                          Anular
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {cuenta.cobros.length === 0 && (
              <tr>
                <td colSpan={7} className="vacio">
                  Todavía no pagó nada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {aImprimir && <Recibo cuenta={cuenta} cobro={aImprimir} onListo={() => setAImprimir(null)} />}
    </section>
  )
}

function EditarCliente({
  cliente,
  onGuardado,
  onCancelar
}: {
  cliente: Cliente
  onGuardado: () => void
  onCancelar: () => void
}): React.JSX.Element {
  const [datos, setDatos] = useState({
    nombre: cliente.nombre,
    documento: cliente.documento ?? '',
    telefono: cliente.telefono ?? '',
    direccion: cliente.direccion ?? ''
  })
  const [error, setError] = useState('')
  const campo =
    (k: keyof typeof datos) =>
    (e: React.ChangeEvent<HTMLInputElement>): void =>
      setDatos({ ...datos, [k]: e.target.value })

  async function guardar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      await api.editarCliente(cliente.id, datos)
      onGuardado()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="producto-rapido" onSubmit={guardar}>
      <strong>Datos del cliente</strong>
      <div className="grilla">
        <label className="req">
          Nombre y apellido
          <input autoFocus value={datos.nombre} onChange={campo('nombre')} />
        </label>
        <label>
          CI o RUC
          <input value={datos.documento} onChange={campo('documento')} />
        </label>
        <label>
          Teléfono
          <input
            placeholder="Ej.: 0981 123 456"
            value={datos.telefono}
            onChange={campo('telefono')}
          />
        </label>
        <label>
          Dirección
          <input value={datos.direccion} onChange={campo('direccion')} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="acciones sin-margen">
        <button className="primario">Guardar cambios</button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
