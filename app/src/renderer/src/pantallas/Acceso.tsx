import { useState } from 'react'
import { api } from '../api'
import type { Usuario } from '../../../shared/tipos'

// Login, o creación del administrador si es el primer arranque.
export default function Acceso({
  primerUso,
  onIngreso
}: {
  primerUso: boolean
  onIngreso: (u: Usuario) => void
}): React.JSX.Element {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (primerUso && clave !== repetir) return setError('Las contraseñas no coinciden')
    setEnviando(true)
    try {
      onIngreso(
        primerUso
          ? await api.crearPrimerAdmin(usuario, clave)
          : await api.iniciarSesion(usuario, clave)
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="centrado">
      <div className="acceso">
        <div className="acceso-cabecera">
          <span className="logo grande">V</span>
          <h1>Sistema de ventas</h1>
          <p>Ventas, caja y cuotas</p>
        </div>
        <form onSubmit={enviar}>
          <div>
            <h2>{primerUso ? 'Crear administrador' : 'Iniciar sesión'}</h2>
            <p className="ayuda">
              {primerUso
                ? 'Es la primera vez que se abre el sistema. Creá el usuario administrador.'
                : 'Ingresá con tu usuario y contraseña.'}
            </p>
          </div>
          <label>
            Usuario
            <input autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label>
            Contraseña
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          {primerUso && (
            <label>
              Repetir contraseña
              <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primario" disabled={enviando}>
            {primerUso ? 'Crear e ingresar' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
