import { useState } from 'react'
import { api } from './api'

// Cada usuario cambia su propia contraseña (se abre tocando el nombre en la barra).
export default function MiClave({ onListo }: { onListo: () => void }): React.JSX.Element {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)

  async function guardar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (nueva !== repetir) return setError('Las contraseñas nuevas no coinciden')
    try {
      await api.cambiarMiClave(actual, nueva)
      setHecho(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (hecho)
    return (
      <section className="tarjeta">
        <div className="fila-titulo">
          <p className="ok">Contraseña cambiada. La próxima vez entrá con la nueva.</p>
          <button className="chico" onClick={onListo}>
            Listo
          </button>
        </div>
      </section>
    )

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <h2>Cambiar mi contraseña</h2>
      <div className="grilla">
        <label className="req">
          Contraseña actual
          <input
            autoFocus
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </label>
        <label className="req">
          Contraseña nueva
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </label>
        <label className="req">
          Repetir la nueva
          <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </label>
        <div className="acciones abajo">
          <button className="primario" disabled={!actual || !nueva}>
            Guardar
          </button>
          <button type="button" onClick={onListo}>
            Cancelar
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
