import { Fragment, useEffect, useRef, useState } from 'react'
import { aEntero, api, cantidad, fechaHora, gs, NOMBRE_METODO } from '../api'
import { Encabezado, Etiqueta, Visor } from '../componentes'
import BuscadorProductos from '../BuscadorProductos'
import {
  METODOS_PAGO,
  type Caja,
  type Compra,
  type MetodoPago,
  type Producto
} from '../../../shared/tipos'

type Renglon = { producto: Producto; cantidad: number; costo: number }
type Mensaje = { error: boolean; texto: string } | null
// '' = no salió de la caja.
type Pago = MetodoPago | ''

const miles = (n: number): string => (n ? n.toLocaleString('es-PY') : '')

const textoPago = (c: Compra): string =>
  c.metodoPago === null
    ? 'Fuera de la caja'
    : `${NOMBRE_METODO[c.metodoPago]} · caja N° ${c.cajaId ?? '—'}`

export default function Compras({ esAdmin }: { esAdmin: boolean }): React.JSX.Element {
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [proveedor, setProveedor] = useState('')
  const [pago, setPago] = useState<Pago>('efectivo')
  const [observacion, setObservacion] = useState('')
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [caja, setCaja] = useState<Caja | null>(null)
  const [proveedores, setProveedores] = useState<string[]>([])
  const [historial, setHistorial] = useState<Compra[]>([])
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nuevoProducto, setNuevoProducto] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  const recargar = (): void => {
    api.listarCompras().then(setHistorial)
    api.cajaActual().then(setCaja)
  }
  useEffect(() => {
    recargar()
    api
      .buscarProductos('')
      .then((ps) =>
        setProveedores(
          [...new Set(ps.map((p) => p.proveedor).filter((x): x is string => !!x))].sort()
        )
      )
  }, [])

  const total = renglones.reduce((s, r) => s + r.cantidad * r.costo, 0)
  const unidades = renglones.reduce((s, r) => s + r.cantidad, 0)
  const efectivo = caja?.resumen.find((r) => r.metodo === 'efectivo')?.esperado
  const sinCaja = pago !== '' && !caja

  function agregar(p: Producto): void {
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.id === p.id)
      if (i < 0) return [...rs, { producto: p, cantidad: 1, costo: p.precioCompra }]
      return rs.map((r, j) => (j === i ? { ...r, cantidad: r.cantidad + 1 } : r))
    })
    if (!proveedor && p.proveedor) setProveedor(p.proveedor)
    setMensaje(null)
  }

  const cambiar = (id: number, campo: 'cantidad' | 'costo', valor: number): void =>
    setRenglones((rs) => rs.map((r) => (r.producto.id === id ? { ...r, [campo]: valor } : r)))

  function limpiar(): void {
    setRenglones([])
    setProveedor('')
    setPago('efectivo')
    setObservacion('')
    entrada.current?.focus()
  }

  async function registrar(): Promise<void> {
    try {
      const c = await api.registrarCompra({
        proveedor,
        items: renglones.map((r) => ({
          productoId: r.producto.id,
          cantidad: r.cantidad,
          costo: r.costo
        })),
        metodoPago: pago === '' ? null : pago,
        observacion
      })
      setMensaje({
        error: false,
        texto: `Compra N° ${c.id} registrada: entraron ${unidades} unidades${
          c.metodoPago ? ` y salieron ${gs(c.total)} de la caja` : ''
        }`
      })
      limpiar()
      recargar()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function anular(c: Compra): Promise<void> {
    const motivo = prompt(
      `Anular la compra N° ${c.id} (${gs(c.total)}): se saca del stock lo que entró${
        c.metodoPago ? ' y la plata vuelve a la caja' : ''
      }.\n\nMotivo:`
    )
    if (motivo === null) return
    try {
      await api.anularCompra(c.id, motivo)
      setMensaje({ error: false, texto: `Compra N° ${c.id} anulada` })
      recargar()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  return (
    <div className="pila">
      <Encabezado
        titulo="Compras de mercadería"
        ayuda="Lo que entra al local: suma al stock y, si se pagó con plata de la caja, se descuenta de la caja."
      />

      <div className="venta">
        <section className="tarjeta carrito">
          <BuscadorProductos
            entrada={entrada}
            onElegir={agregar}
            placeholder="Código o nombre del producto que entró (↑ ↓ para elegir, Enter para agregar)"
            sinResultados={(t) =>
              esAdmin && (
                <button type="button" className="chico" onClick={() => setNuevoProducto(t)}>
                  Registrar producto nuevo
                </button>
              )
            }
          />
          {nuevoProducto !== null && (
            <ProductoNuevo
              nombre={nuevoProducto}
              proveedor={proveedor}
              onCreado={(p) => {
                setNuevoProducto(null)
                agregar(p)
              }}
              onCancelar={() => setNuevoProducto(null)}
            />
          )}
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="num">Stock actual</th>
                <th className="num">Cantidad</th>
                <th className="num">Costo unitario (Gs.)</th>
                <th className="num">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r) => (
                <tr key={r.producto.id}>
                  <td>{r.producto.codigo}</td>
                  <td>{r.producto.nombre}</td>
                  <td className="num">
                    {r.producto.stock} → <strong>{r.producto.stock + r.cantidad}</strong>
                  </td>
                  <td className="num">
                    <input
                      className="cantidad"
                      inputMode="numeric"
                      value={r.cantidad || ''}
                      onChange={(e) => cambiar(r.producto.id, 'cantidad', aEntero(e.target.value))}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="cantidad ancho"
                      inputMode="numeric"
                      value={miles(r.costo)}
                      onChange={(e) => cambiar(r.producto.id, 'costo', aEntero(e.target.value))}
                    />
                  </td>
                  <td className="num">
                    <strong>{gs(r.cantidad * r.costo)}</strong>
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="chico peligro"
                      onClick={() =>
                        setRenglones((rs) => rs.filter((x) => x.producto.id !== r.producto.id))
                      }
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {renglones.length === 0 && (
                <tr>
                  <td colSpan={7} className="vacio">
                    Agregá los productos que compraste, con la cantidad y lo que pagaste por cada
                    uno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pie">
            <span>
              Productos distintos: <strong>{renglones.length}</strong>
            </span>
            <span>
              Unidades que entran: <strong>{unidades}</strong>
            </span>
          </div>
        </section>

        <aside className="cobro">
          <Visor
            etiqueta="Total de la compra"
            valor={gs(total)}
            detalle={
              pago === '' ? 'No sale de la caja' : `Sale de la caja en ${NOMBRE_METODO[pago]}`
            }
          />
          <div className="tarjeta pila chica">
            <label>
              Proveedor
              <input
                list="proveedores"
                placeholder="A quién le compraste"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
              />
              <datalist id="proveedores">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label>
              ¿Cómo se pagó?
              <select value={pago} onChange={(e) => setPago(e.target.value as Pago)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m === 'efectivo' ? 'Efectivo de la caja' : `${NOMBRE_METODO[m]} del local`}
                  </option>
                ))}
                <option value="">No sale de la caja (lo pagó el dueño aparte o se debe)</option>
              </select>
            </label>
            {sinCaja && (
              <p className="aviso">
                La caja está cerrada. Abrila para descontar el pago, o elegí &quot;No sale de la
                caja&quot;.
              </p>
            )}
            {pago === 'efectivo' && efectivo !== undefined && caja && !caja.ciego && (
              <p className={'ayuda' + (total > efectivo ? ' negativo' : '')}>
                En la caja debería haber {gs(efectivo)} en efectivo
                {total > efectivo ? ': no alcanza para pagar esta compra.' : '.'}
              </p>
            )}
            <label>
              Observación
              <input
                placeholder="Ej.: factura N° 001-001-0001234"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
              />
            </label>
            {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
            <button
              className="primario grande"
              disabled={!renglones.length || renglones.some((r) => !r.cantidad) || sinCaja}
              onClick={registrar}
            >
              Registrar compra
            </button>
            <button
              type="button"
              className="cancelar"
              disabled={!renglones.length}
              onClick={limpiar}
            >
              Cancelar
            </button>
          </div>
        </aside>
      </div>

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>Últimas compras</h2>
          <span>{cantidad(historial.filter((c) => !c.anulada).length, 'compra', 'compras')}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Pago</th>
              <th>Usuario</th>
              <th className="num">Unidades</th>
              <th className="num">Total</th>
              {esAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {historial.map((c) => (
              <Fragment key={c.id}>
                <tr
                  className={
                    'clic' + (c.anulada ? ' anulada' : '') + (abierta === c.id ? ' sel' : '')
                  }
                  onClick={() => setAbierta(abierta === c.id ? null : c.id)}
                >
                  <td>{c.id}</td>
                  <td>{fechaHora(c.fecha)}</td>
                  <td>{c.proveedor ?? '—'}</td>
                  <td>
                    {c.metodoPago === null ? <Etiqueta>Fuera de la caja</Etiqueta> : textoPago(c)}
                  </td>
                  <td>{c.usuario}</td>
                  <td className="num">{c.items.reduce((s, i) => s + i.cantidad, 0)}</td>
                  <td className="num">
                    {c.anulada && <Etiqueta tono="rojo">Anulada</Etiqueta>} {gs(c.total)}
                  </td>
                  {esAdmin && (
                    <td className="num">
                      {!c.anulada && (
                        <button
                          className="chico peligro"
                          onClick={(e) => {
                            e.stopPropagation()
                            anular(c)
                          }}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {abierta === c.id && (
                  <tr className="detalle">
                    <td colSpan={esAdmin ? 8 : 7}>
                      {c.items.map((it, i) => (
                        <div key={i}>
                          {it.cantidad} × {it.codigo} {it.nombre} a {gs(it.costo)} ={' '}
                          {gs(it.subtotal)}
                        </div>
                      ))}
                      {c.observacion && <div>Observación: {c.observacion}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {historial.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 8 : 7} className="vacio">
                  Todavía no se registró ninguna compra.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

// Alta rápida de un producto que llegó por primera vez (solo admin). Entra con stock 0: la compra lo suma.
function ProductoNuevo({
  nombre: inicial,
  proveedor,
  onCreado,
  onCancelar
}: {
  nombre: string
  proveedor: string
  onCreado: (p: Producto) => void
  onCancelar: () => void
}): React.JSX.Element {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState(inicial)
  const [venta, setVenta] = useState(0)
  const [error, setError] = useState('')

  async function crear(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      onCreado(
        await api.crearProducto({
          codigo,
          nombre,
          descripcion: null,
          unidad: 'Unidad',
          categoria: null,
          familia: null,
          proveedor: proveedor || null,
          stock: 0,
          stockMinimo: 0,
          precioCompra: 0,
          precioVenta: venta,
          vencimiento: null
        })
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="producto-rapido" onSubmit={crear}>
      <strong>Producto nuevo</strong>
      <div className="grilla">
        <label className="req">
          Código
          <input autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </label>
        <label className="req ancho2">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="req">
          Precio de venta (Gs.)
          <input
            inputMode="numeric"
            value={miles(venta)}
            onChange={(e) => setVenta(aEntero(e.target.value))}
          />
        </label>
      </div>
      <p className="ayuda">
        El resto de los datos (familia, stock mínimo, descripción) se completan después en
        Productos.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="acciones sin-margen">
        <button className="primario" disabled={!codigo.trim() || !nombre.trim()}>
          Crear y agregar a la compra
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
