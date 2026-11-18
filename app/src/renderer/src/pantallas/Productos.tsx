import { useEffect, useRef, useState } from 'react'
import { achicarFoto, aEntero, api, gs, urlFoto } from '../api'
import { Cifra, Encabezado, Etiqueta } from '../componentes'
import Importar from '../Importar'
import type { Producto, ProductoNuevo } from '../../../shared/tipos'

const UNIDADES = ['Unidad', 'Par', 'Juego', 'Docena']

const VACIO: ProductoNuevo = {
  codigo: '',
  nombre: '',
  descripcion: '',
  unidad: 'Unidad',
  categoria: '',
  familia: '',
  proveedor: '',
  stock: 0,
  stockMinimo: 0,
  precioCompra: 0,
  precioVenta: 0,
  vencimiento: ''
}

export default function Productos({ esAdmin }: { esAdmin: boolean }): React.JSX.Element {
  const [lista, setLista] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState<ProductoNuevo>(VACIO)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  const [familia, setFamilia] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [stock, setStock] = useState<'todo' | 'bajo' | 'sin'>('todo')
  const [importando, setImportando] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  // Foto del producto en edición: la guardada, y la elegida o quitada (se guarda al guardar).
  const [fotoGuardada, setFotoGuardada] = useState<string | null>(null)
  const [fotoNueva, setFotoNueva] = useState<string | null>(null)
  const [sinFoto, setSinFoto] = useState(false)

  const recargar = (texto = busqueda): Promise<void> => api.buscarProductos(texto).then(setLista)

  useEffect(() => {
    recargar(busqueda)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const campo =
    <K extends keyof ProductoNuevo>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({
        ...form,
        [k]: typeof VACIO[k] === 'number' ? aEntero(e.target.value) : e.target.value
      })

  function limpiar(): void {
    setForm(VACIO)
    setEditandoId(null)
    setFotoGuardada(null)
    setFotoNueva(null)
    setSinFoto(false)
  }

  async function elegirFoto(archivo: File | undefined): Promise<void> {
    if (!archivo) return
    try {
      setFotoNueva(await achicarFoto(archivo))
      setSinFoto(false)
    } catch {
      setMensaje({ error: true, texto: 'No se pudo abrir esa imagen' })
    }
  }

  async function guardar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      const p = editandoId
        ? await api.editarProducto(editandoId, form)
        : await api.crearProducto(form)
      if (fotoNueva) await api.guardarFoto(p.id, fotoNueva)
      else if (sinFoto && p.imagen) await api.quitarFoto(p.id)
      setMensaje({ error: false, texto: editandoId ? 'Producto actualizado' : 'Producto guardado' })
      limpiar()
      await recargar()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function eliminar(): Promise<void> {
    if (!editandoId || !confirm(`¿Eliminar el producto ${form.codigo} ${form.nombre}?`)) return
    await api.eliminarProducto(editandoId)
    setMensaje({ error: false, texto: 'Producto eliminado' })
    limpiar()
    await recargar()
  }

  function editar(p: Producto): void {
    const { id, imagen, ...resto } = p
    setFotoGuardada(imagen)
    setFotoNueva(null)
    setSinFoto(false)
    setForm({
      ...resto,
      descripcion: p.descripcion ?? '',
      categoria: p.categoria ?? '',
      familia: p.familia ?? '',
      proveedor: p.proveedor ?? '',
      vencimiento: p.vencimiento ?? ''
    })
    setEditandoId(id)
    setMensaje(null)
    // Al elegir un producto de la lista, subir al formulario donde se cargaron sus datos.
    formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const miles = (n: number): string => (n ? n.toLocaleString('es-PY') : '')

  const opcionesDe = (f: (p: Producto) => string | null): string[] =>
    [...new Set(lista.map(f).filter((x): x is string => !!x))].sort()
  const filtrados = lista.filter(
    (p) =>
      (!familia || p.familia === familia) &&
      (!proveedor || p.proveedor === proveedor) &&
      (stock === 'todo' ||
        (stock === 'bajo' && p.stock <= p.stockMinimo) ||
        (stock === 'sin' && p.stock === 0))
  )
  const conFiltros = !!(familia || proveedor || stock !== 'todo')
  const bajos = lista.filter((p) => p.stock <= p.stockMinimo).length
  const valor = (f: (p: Producto) => number): number =>
    lista.reduce((s, p) => s + f(p) * p.stock, 0)

  return (
    <div className="pila">
      <Encabezado
        titulo="Productos"
        ayuda="Inventario del local: precios, stock y aviso cuando queda poco."
      >
        {esAdmin && !importando && (
          <button onClick={() => setImportando(true)}>Importar planilla…</button>
        )}
      </Encabezado>
      {importando && (
        <Importar
          onListo={() => {
            setImportando(false)
            recargar()
          }}
        />
      )}
      {!busqueda && (
        <div className="cifras">
          <Cifra etiqueta="Productos" valor={lista.length} tono="azul" />
          <Cifra
            etiqueta="Con stock bajo"
            valor={bajos}
            detalle={bajos ? 'En el mínimo o por debajo' : 'Todo con stock suficiente'}
            tono={bajos ? 'rojo' : 'verde'}
          />
          {esAdmin && (
            <Cifra
              etiqueta="Stock al costo"
              valor={gs(valor((p) => p.precioCompra))}
              detalle="Según precios de compra"
            />
          )}
          <Cifra
            etiqueta="Stock a precio de venta"
            valor={gs(valor((p) => p.precioVenta))}
            detalle={
              esAdmin
                ? `Ganancia posible ${gs(valor((p) => p.precioVenta - p.precioCompra))}`
                : undefined
            }
            tono="verde"
          />
        </div>
      )}
      {esAdmin && (
        <form ref={formulario} className="tarjeta" onSubmit={guardar}>
          <h2>{editandoId ? `Editar producto ${form.codigo}` : 'Registrar producto'}</h2>
          <div className="grilla">
            <label className="req">
              Código
              <input value={form.codigo} onChange={campo('codigo')} />
            </label>
            <label className="req ancho2">
              Nombre
              <input value={form.nombre} onChange={campo('nombre')} />
            </label>
            <label>
              Unidad
              <select value={form.unidad} onChange={campo('unidad')}>
                {UNIDADES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="req">
              Cantidad disponible
              <input inputMode="numeric" value={miles(form.stock)} onChange={campo('stock')} />
            </label>
            <label>
              Cantidad mínima
              <input
                inputMode="numeric"
                value={miles(form.stockMinimo)}
                onChange={campo('stockMinimo')}
              />
            </label>
            <label>
              Precio de compra (Gs.)
              <input
                inputMode="numeric"
                value={miles(form.precioCompra)}
                onChange={campo('precioCompra')}
              />
            </label>
            <label className="req">
              Precio de venta (Gs.)
              <input
                inputMode="numeric"
                value={miles(form.precioVenta)}
                onChange={campo('precioVenta')}
              />
            </label>
            <label>
              Categoría
              <input value={form.categoria ?? ''} onChange={campo('categoria')} />
            </label>
            <label>
              Familia
              <input
                placeholder="Ej.: Accesorios"
                value={form.familia ?? ''}
                onChange={campo('familia')}
              />
            </label>
            <label>
              Proveedor
              <input value={form.proveedor ?? ''} onChange={campo('proveedor')} />
            </label>
            <label>
              Vencimiento
              <input type="date" value={form.vencimiento ?? ''} onChange={campo('vencimiento')} />
            </label>
            <label className="ancho3">
              Descripción
              <textarea rows={2} value={form.descripcion ?? ''} onChange={campo('descripcion')} />
            </label>
            <div className="foto-campo">
              {fotoNueva || (fotoGuardada && !sinFoto) ? (
                <img src={fotoNueva ?? urlFoto(fotoGuardada as string)} alt="" />
              ) : (
                <span className="foto-vacia">Sin foto</span>
              )}
              <div className="pila chica">
                <label className="boton chico">
                  {fotoNueva || (fotoGuardada && !sinFoto) ? 'Cambiar foto…' : 'Elegir foto…'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      elegirFoto(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {(fotoNueva || (fotoGuardada && !sinFoto)) && (
                  <button
                    type="button"
                    className="chico"
                    onClick={() => {
                      setFotoNueva(null)
                      setSinFoto(true)
                    }}
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
          </div>
          {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
          <div className="acciones">
            <button className="primario">
              {editandoId ? 'Guardar cambios' : 'Guardar producto'}
            </button>
            <button type="button" onClick={limpiar}>
              {editandoId ? 'Cancelar' : 'Limpiar'}
            </button>
            {editandoId && (
              <button type="button" className="peligro" onClick={eliminar}>
                Eliminar
              </button>
            )}
          </div>
        </form>
      )}

      <section className="tarjeta">
        <div className="fila-titulo">
          <h2>Lista de productos</h2>
          <span>
            {filtrados.length} {lista.length === 500 ? 'de los primeros 500' : 'productos'}
          </span>
        </div>
        <div className="fila-filtros">
          <input
            placeholder="Buscar por código, nombre, familia o proveedor…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select value={familia} onChange={(e) => setFamilia(e.target.value)}>
            <option value="">Todas las familias</option>
            {opcionesDe((p) => p.familia).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {opcionesDe((p) => p.proveedor).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select value={stock} onChange={(e) => setStock(e.target.value as typeof stock)}>
            <option value="todo">Todo el stock</option>
            <option value="bajo">Stock bajo</option>
            <option value="sin">Sin stock</option>
          </select>
          {conFiltros && (
            <button
              className="chico"
              onClick={() => {
                setFamilia('')
                setProveedor('')
                setStock('todo')
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="miniatura" />
              <th>Código</th>
              <th>Nombre</th>
              <th>Familia</th>
              <th>Unidad</th>
              <th className="num">Disponible</th>
              <th className="num">Mínimo</th>
              <th className="num">Compra</th>
              <th className="num">Venta</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr
                key={p.id}
                className={(esAdmin ? 'clic ' : '') + (p.id === editandoId ? 'sel' : '')}
                onClick={esAdmin ? () => editar(p) : undefined}
              >
                <td className="miniatura">
                  {p.imagen && <img src={urlFoto(p.imagen)} alt="" loading="lazy" />}
                </td>
                <td>{p.codigo}</td>
                <td>{p.nombre}</td>
                <td>{p.familia ?? '—'}</td>
                <td>{p.unidad}</td>
                <td className="num">
                  {p.stock <= p.stockMinimo && (
                    <Etiqueta tono={p.stock === 0 ? 'rojo' : 'ambar'}>
                      {p.stock === 0 ? 'Sin stock' : 'Bajo'}
                    </Etiqueta>
                  )}{' '}
                  {p.stock}
                </td>
                <td className="num">{p.stockMinimo}</td>
                <td className="num">{gs(p.precioCompra)}</td>
                <td className="num">{gs(p.precioVenta)}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="vacio">
                  No hay productos{busqueda || conFiltros ? ' que coincidan' : ' cargados'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
