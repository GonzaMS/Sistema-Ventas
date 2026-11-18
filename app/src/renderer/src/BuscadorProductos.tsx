import { useRef, useState } from 'react'
import { api, gs, urlFoto } from './api'
import type { Producto } from '../../shared/tipos'

// Buscador con sugerencias mientras se escribe (Ventas y Compras). Enter: la sugerencia elegida con
// las flechas; si no, el código exacto (lector de códigos de barras) y, si no hay, la primera.
export default function BuscadorProductos({
  onElegir,
  entrada,
  placeholder = 'Código o nombre del producto (↑ ↓ para elegir, Enter para agregar)',
  sinResultados
}: {
  onElegir: (p: Producto) => void
  entrada?: React.RefObject<HTMLInputElement | null>
  placeholder?: string
  sinResultados?: (texto: string) => React.ReactNode
}): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<Producto[]>([])
  const [elegida, setElegida] = useState(0)
  const [vacio, setVacio] = useState('')
  // Cada búsqueda lleva un número: si llega una respuesta vieja (se siguió escribiendo o ya se
  // eligió el producto), se descarta.
  const consulta = useRef(0)
  const propia = useRef<HTMLInputElement>(null)
  const input = entrada ?? propia

  function elegir(p: Producto): void {
    consulta.current++
    setTexto('')
    setOpciones([])
    setVacio('')
    onElegir(p)
    input.current?.focus()
  }

  function escribir(t: string): void {
    setTexto(t)
    setVacio('')
    const n = ++consulta.current
    if (!t.trim()) {
      setOpciones([])
      return
    }
    api.buscarProductos(t).then((r) => {
      if (n !== consulta.current) return
      setOpciones(r.slice(0, 20))
      setElegida(0)
    })
  }

  async function enter(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    if (elegida > 0 && opciones[elegida]) return elegir(opciones[elegida])
    const n = ++consulta.current
    const exacto = await api.productoPorCodigo(t)
    if (exacto) return elegir(exacto)
    const encontrados = await api.buscarProductos(t)
    if (n !== consulta.current) return
    if (encontrados.length) return elegir(encontrados[0])
    setOpciones([])
    setVacio(t)
  }

  function teclas(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown' && opciones.length) {
      e.preventDefault()
      setElegida((i) => Math.min(i + 1, opciones.length - 1))
    } else if (e.key === 'ArrowUp' && opciones.length) {
      e.preventDefault()
      setElegida((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      consulta.current++
      setOpciones([])
    }
  }

  return (
    <form onSubmit={enter} className="buscador">
      <input
        ref={input}
        autoFocus
        placeholder={placeholder}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={teclas}
      />
      {opciones.length > 0 && (
        <ul className="opciones">
          {opciones.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={i === elegida ? 'sel' : ''}
                onMouseEnter={() => setElegida(i)}
                onClick={() => elegir(p)}
              >
                <span className="con-foto">
                  {p.imagen ? (
                    <img src={urlFoto(p.imagen)} alt="" />
                  ) : (
                    <span className="foto-vacia" />
                  )}
                  <span>
                    <strong>{p.codigo}</strong> {p.nombre}
                  </span>
                </span>
                <span>
                  {gs(p.precioVenta)} · {p.stock > 0 ? `quedan ${p.stock}` : 'sin stock'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {vacio && (
        <div className="error">
          No hay productos con &quot;{vacio}&quot;. {sinResultados?.(vacio)}
        </div>
      )}
    </form>
  )
}
