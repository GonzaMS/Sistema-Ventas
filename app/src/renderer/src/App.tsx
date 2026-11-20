import { useEffect, useState } from 'react'
import { api } from './api'
import type { Caja as TCaja, Usuario } from '../../shared/tipos'
import Acceso from './pantallas/Acceso'
import Ventas from './pantallas/Ventas'
import Caja from './pantallas/Caja'
import Cuotas from './pantallas/Cuotas'
import Compras from './pantallas/Compras'
import Productos from './pantallas/Productos'
import Administracion from './pantallas/Administracion'
import Informes from './pantallas/Informes'
import MiClave from './MiClave'

const PESTANAS = [
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'caja', nombre: 'Caja' },
  { id: 'cuotas', nombre: 'Cuotas' },
  { id: 'compras', nombre: 'Compras' },
  { id: 'productos', nombre: 'Productos' },
  { id: 'informes', nombre: 'Informes', soloAdmin: true },
  { id: 'admin', nombre: 'Administración', soloAdmin: true }
] as const

type Pestana = (typeof PESTANAS)[number]

function App(): React.JSX.Element {
  const [cargando, setCargando] = useState(true)
  const [primerUso, setPrimerUso] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [pestana, setPestana] = useState<Pestana['id']>('ventas')
  // Estado de la caja y nombre del negocio para la barra: se refrescan al cambiar de pestaña.
  const [caja, setCaja] = useState<TCaja | null | undefined>(undefined)
  const [negocio, setNegocio] = useState('')
  const [cambiandoClave, setCambiandoClave] = useState(false)

  useEffect(() => {
    Promise.all([api.hayUsuarios(), api.sesion()]).then(([hay, u]) => {
      setPrimerUso(!hay)
      setUsuario(u)
      setCargando(false)
    })
  }, [])

  const recargarCaja = (): void => {
    api.cajaActual().then(setCaja)
  }
  useEffect(() => {
    if (!usuario) return
    window.scrollTo(0, 0)
    api.cajaActual().then(setCaja)
    api.datosNegocio().then((n) => setNegocio(n.nombre))
  }, [usuario, pestana])

  if (cargando) return <div className="centrado">Cargando…</div>
  if (!usuario)
    return (
      <Acceso
        primerUso={primerUso}
        onIngreso={(u) => {
          setPrimerUso(false)
          setUsuario(u)
        }}
      />
    )

  const visibles = PESTANAS.filter((p) => !('soloAdmin' in p) || usuario.rol === 'admin')
  const actual = visibles.find((p) => p.id === pestana) ?? visibles[0]

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <span className="logo">{(negocio || 'V').charAt(0).toUpperCase()}</span>
          <div>
            <strong>{negocio || 'Sistema de ventas'}</strong>
            <small>Ventas, caja y cuotas</small>
          </div>
        </div>
        <nav className="pestanas">
          {visibles.map((p) => (
            <button
              key={p.id}
              className={p.id === actual.id ? 'activa' : ''}
              onClick={() => setPestana(p.id)}
            >
              {p.nombre}
            </button>
          ))}
        </nav>
        <div className="sesion">
          {caja !== undefined && (
            <button
              className={'estado-caja' + (caja ? '' : ' cerrada')}
              title="Ir a Caja"
              onClick={() => setPestana('caja')}
            >
              {caja ? `Caja N° ${caja.id} abierta` : 'Caja cerrada'}
            </button>
          )}
          <button
            className="usuario"
            title="Cambiar mi contraseña"
            onClick={() => setCambiandoClave(true)}
          >
            <strong>{usuario.usuario}</strong>
            <small>{usuario.rol === 'admin' ? 'Administrador' : 'Cajero'}</small>
          </button>
          <button
            className="salir"
            onClick={async () => {
              await api.cerrarSesion()
              setCambiandoClave(false)
              setUsuario(null)
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="contenido">
        {cambiandoClave && (
          <div className="pila aparte">
            <MiClave onListo={() => setCambiandoClave(false)} />
          </div>
        )}
        {actual.id === 'ventas' && <Ventas esAdmin={usuario.rol === 'admin'} />}
        {actual.id === 'caja' && (
          <Caja esAdmin={usuario.rol === 'admin'} onCambioCaja={recargarCaja} />
        )}
        {actual.id === 'cuotas' && <Cuotas esAdmin={usuario.rol === 'admin'} />}
        {actual.id === 'compras' && <Compras esAdmin={usuario.rol === 'admin'} />}
        {actual.id === 'productos' && <Productos esAdmin={usuario.rol === 'admin'} />}
        {actual.id === 'informes' && <Informes />}
        {actual.id === 'admin' && <Administracion yo={usuario} />}
      </main>
    </div>
  )
}

export default App
