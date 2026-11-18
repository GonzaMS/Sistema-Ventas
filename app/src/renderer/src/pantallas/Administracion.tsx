import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { Cifra, Encabezado, Etiqueta } from '../componentes'
import type { CategoriaCaja, Rol, TipoMovimiento, Usuario } from '../../../shared/tipos'

export default function Administracion({ yo }: { yo: Usuario }): React.JSX.Element {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [rol, setRol] = useState<Rol>('cajero')
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)
  // Usuario al que se le está poniendo una contraseña nueva.
  const [conClave, setConClave] = useState<number | null>(null)
  const [nuevaClave, setNuevaClave] = useState('')
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null)

  const recargar = (): Promise<void> => api.listarUsuarios().then(setUsuarios)
  useEffect(() => {
    recargar()
  }, [])

  async function accion(fn: () => Promise<unknown>, texto: string): Promise<void> {
    try {
      await fn()
      setAviso({ error: false, texto })
      await recargar()
    } catch (err) {
      setAviso({ error: true, texto: (err as Error).message })
    }
  }

  async function guardarClave(e: React.FormEvent, u: Usuario): Promise<void> {
    e.preventDefault()
    await accion(
      () => api.restablecerClave(u.id, nuevaClave),
      `Contraseña de ${u.usuario} cambiada`
    )
    setConClave(null)
    setNuevaClave('')
  }

  async function crear(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      await api.crearUsuario(usuario, clave, rol)
      setMensaje({ error: false, texto: `Usuario ${usuario} creado` })
      setUsuario('')
      setClave('')
      await recargar()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  return (
    <div className="pila">
      <Encabezado
        titulo="Administración"
        ayuda="Usuarios y permisos, opciones de la caja y categorías de ingresos y egresos."
      />
      <div className="cifras">
        <Cifra etiqueta="Usuarios" valor={usuarios.length} tono="azul" />
        <Cifra etiqueta="Activos" valor={usuarios.filter((u) => u.activo).length} tono="verde" />
        <Cifra
          etiqueta="Administradores"
          valor={usuarios.filter((u) => u.rol === 'admin').length}
          tono="ambar"
        />
      </div>
      <form className="tarjeta" onSubmit={crear}>
        <h2>Crear usuario</h2>
        <div className="grilla">
          <label>
            Usuario
            <input
              placeholder="Ej.: cajero01"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <label>
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="cajero">Cajero</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <div className="acciones abajo">
            <button className="primario">Crear usuario</button>
          </div>
        </div>
        {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
      </form>

      <section className="tarjeta">
        <h2>Usuarios</h2>
        <p className="ayuda">
          Un usuario desactivado no puede entrar, pero sus ventas y movimientos quedan con su
          nombre. Tu propia contraseña se cambia tocando tu nombre, arriba a la derecha.
        </p>
        {aviso && <p className={aviso.error ? 'error' : 'ok'}>{aviso.texto}</p>}
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <Fragment key={u.id}>
                <tr className={u.activo ? '' : 'apagada'}>
                  <td>
                    {u.usuario} {u.id === yo.id && <small>(vos)</small>}
                  </td>
                  <td>
                    {u.id === yo.id ? (
                      <Etiqueta tono={u.rol === 'admin' ? 'azul' : 'neutro'}>
                        {u.rol === 'admin' ? 'Administrador' : 'Cajero'}
                      </Etiqueta>
                    ) : (
                      <select
                        className="angosto"
                        value={u.rol}
                        onChange={(e) =>
                          accion(
                            () => api.cambiarRol(u.id, e.target.value as Rol),
                            `${u.usuario} ahora es ${e.target.value === 'admin' ? 'administrador' : 'cajero'}`
                          )
                        }
                      >
                        <option value="cajero">Cajero</option>
                        <option value="admin">Administrador</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={'punto ' + (u.activo ? 'positivo' : 'negativo')}>
                      {u.activo ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td className="num">
                    {u.id !== yo.id && (
                      <div className="acciones sin-margen fin">
                        <button
                          className="chico"
                          onClick={() => {
                            setConClave(conClave === u.id ? null : u.id)
                            setNuevaClave('')
                          }}
                        >
                          Contraseña nueva…
                        </button>
                        <button
                          className={'chico' + (u.activo ? ' peligro' : '')}
                          onClick={() =>
                            accion(
                              () => api.activarUsuario(u.id, !u.activo),
                              `${u.usuario} ${u.activo ? 'desactivado' : 'activado'}`
                            )
                          }
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {conClave === u.id && (
                  <tr className="detalle">
                    <td colSpan={4}>
                      <form className="fila-filtros" onSubmit={(e) => guardarClave(e, u)}>
                        <input
                          autoFocus
                          type="password"
                          placeholder={`Contraseña nueva para ${u.usuario} (mínimo 6)`}
                          value={nuevaClave}
                          onChange={(e) => setNuevaClave(e.target.value)}
                        />
                        <button className="primario chico" disabled={!nuevaClave}>
                          Guardar
                        </button>
                        <button type="button" className="chico" onClick={() => setConClave(null)}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <Opciones />
      <Categorias />
    </div>
  )
}

function Opciones(): React.JSX.Element {
  const [ciego, setCiego] = useState<boolean | null>(null)

  useEffect(() => {
    api.configuracion().then((c) => setCiego(c.arqueoCiego))
  }, [])

  async function cambiar(valor: boolean): Promise<void> {
    setCiego((await api.guardarConfiguracion({ arqueoCiego: valor })).arqueoCiego)
  }

  return (
    <section className="tarjeta">
      <h2>Caja</h2>
      <label className="check">
        <input
          type="checkbox"
          disabled={ciego === null}
          checked={ciego ?? false}
          onChange={(e) => cambiar(e.target.checked)}
        />
        Arqueo ciego
      </label>
      <p className="ayuda">
        El cajero cierra la caja contando sin ver cuánto debería haber, y tampoco ve el total
        vendido en el día. La diferencia la ve solo el administrador, en el historial de cajas.
      </p>
    </section>
  )
}

function Categorias(): React.JSX.Element {
  const [lista, setLista] = useState<CategoriaCaja[]>([])
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoMovimiento>('egreso')
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null)

  const recargar = (): Promise<void> => api.categoriasCaja(true).then(setLista)
  useEffect(() => {
    recargar()
  }, [])

  async function intentar(fn: () => Promise<unknown>, ok: string): Promise<void> {
    try {
      await fn()
      setMensaje({ error: false, texto: ok })
      await recargar()
    } catch (err) {
      setMensaje({ error: true, texto: (err as Error).message })
    }
  }

  async function crear(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    await intentar(() => api.crearCategoria(nombre, tipo), `Categoría ${nombre.trim()} creada`)
    setNombre('')
  }

  function renombrar(c: CategoriaCaja): void {
    const nuevo = prompt('Nuevo nombre de la categoría:', c.nombre)
    if (nuevo === null || nuevo.trim() === c.nombre) return
    intentar(() => api.editarCategoria(c.id, nuevo), 'Categoría renombrada')
  }

  const editables = lista.filter((c) => !c.sistema)

  return (
    <section className="tarjeta">
      <h2>Categorías de ingresos y egresos</h2>
      <form onSubmit={crear}>
        <div className="grilla">
          <label className="ancho2">
            Nombre
            <input
              placeholder="Ej.: Sueldos, Alquiler, Luz…"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
              <option value="egreso">Egreso</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </label>
          <div className="acciones abajo">
            <button className="primario" disabled={!nombre.trim()}>
              Agregar categoría
            </button>
          </div>
        </div>
      </form>
      {mensaje && <p className={mensaje.error ? 'error' : 'ok'}>{mensaje.texto}</p>}
      <table>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {editables.map((c) => (
            <tr key={c.id} className={c.activo ? '' : 'apagada'}>
              <td>{c.nombre}</td>
              <td>
                <Etiqueta tono={c.tipo === 'egreso' ? 'rojo' : 'verde'}>
                  {c.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}
                </Etiqueta>
              </td>
              <td>
                <span className={'punto ' + (c.activo ? 'positivo' : 'negativo')}>
                  {c.activo ? 'Activa' : 'Desactivada'}
                </span>
              </td>
              <td className="num">
                <div className="acciones sin-margen fin">
                  <button className="chico" onClick={() => renombrar(c)}>
                    Renombrar
                  </button>
                  <button
                    className={'chico' + (c.activo ? ' peligro' : '')}
                    onClick={() =>
                      intentar(
                        () => api.activarCategoria(c.id, !c.activo),
                        c.activo ? 'Categoría desactivada' : 'Categoría activada'
                      )
                    }
                  >
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ayuda">
        Desactivar la saca de la lista al cargar movimientos; los movimientos viejos la siguen
        mostrando. Renombrar cambia el nombre también en los movimientos viejos.
      </p>
    </section>
  )
}
