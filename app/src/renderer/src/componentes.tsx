// Piezas visuales que comparten las pantallas.

export function Encabezado({
  titulo,
  ayuda,
  children
}: {
  titulo: string
  ayuda: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="encabezado">
      <div>
        <h1>{titulo}</h1>
        <p>{ayuda}</p>
      </div>
      {children && <div className="encabezado-extra">{children}</div>}
    </header>
  )
}

// El visor de caja registradora: el número que importa en cada pantalla.
export function Visor({
  etiqueta,
  valor,
  detalle
}: {
  etiqueta: string
  valor: string
  detalle?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="visor">
      <span>{etiqueta}</span>
      <strong>{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  )
}

export type Tono = 'neutro' | 'verde' | 'rojo' | 'ambar' | 'azul'

export function Cifra({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro'
}: {
  etiqueta: string
  valor: React.ReactNode
  detalle?: React.ReactNode
  tono?: Tono
}): React.JSX.Element {
  return (
    <div className={`cifra ${tono}`}>
      <span>{etiqueta}</span>
      <strong>{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  )
}

export function Etiqueta({
  tono = 'neutro',
  children
}: {
  tono?: Tono
  children: React.ReactNode
}): React.JSX.Element {
  return <span className={`etiqueta ${tono}`}>{children}</span>
}
