import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Negocio } from '../../shared/tipos'

// Hoja angosta con los datos del negocio arriba: sale bien en impresora de tickets (80 mm) y en
// A4. Abre el diálogo de impresión del sistema una sola vez y avisa con onListo.
export default function Impresion({
  onListo,
  children
}: {
  onListo: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const [negocio, setNegocio] = useState<Negocio | null>(null)
  const impreso = useRef(false)

  useEffect(() => {
    api.datosNegocio().then(setNegocio)
  }, [])

  useEffect(() => {
    if (!negocio || impreso.current) return
    impreso.current = true
    // Esperar a que se pinte la hoja antes de abrir el diálogo.
    requestAnimationFrame(() => {
      window.print()
      onListo()
    })
  }, [negocio, onListo])

  return (
    <div className="impresion">
      {negocio?.nombre && <h1>{negocio.nombre}</h1>}
      {(negocio?.ruc || negocio?.telefono) && (
        <p>
          {negocio.ruc && `RUC ${negocio.ruc}`}
          {negocio.ruc && negocio.telefono && ' · '}
          {negocio.telefono && `Tel. ${negocio.telefono}`}
        </p>
      )}
      {negocio?.direccion && <p>{negocio.direccion}</p>}
      {children}
    </div>
  )
}
