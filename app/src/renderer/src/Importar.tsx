import { useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { api, gs } from './api'
import type { ProductoImportado, ResultadoImportacion } from '../../shared/tipos'

type Celda = string | number | boolean | Date | null
type Campo = keyof Omit<ProductoImportado, 'fila'>

// Lo que se puede traer de la planilla, y cómo suele llamarse la columna (para elegirla sola).
const CAMPOS: { campo: Campo; nombre: string; numero?: boolean; req?: boolean; busca: RegExp }[] = [
  { campo: 'codigo', nombre: 'Código', req: true, busca: /c[oó]d|^code|barra/i },
  { campo: 'nombre', nombre: 'Nombre', req: true, busca: /nombre|producto|art[ií]culo/i },
  {
    campo: 'precioVenta',
    nombre: 'Precio de venta',
    numero: true,
    req: true,
    busca: /venta|^precio$|^p\.?\s*v/i
  },
  {
    campo: 'precioCompra',
    nombre: 'Precio de compra',
    numero: true,
    busca: /compra|costo|^p\.?\s*c/i
  },
  { campo: 'stock', nombre: 'Stock', numero: true, busca: /stock|existencia|cantidad|disp/i },
  { campo: 'stockMinimo', nombre: 'Stock mínimo', numero: true, busca: /m[ií]n/i },
  { campo: 'unidad', nombre: 'Unidad', busca: /unidad|medida/i },
  { campo: 'familia', nombre: 'Familia', busca: /familia|rubro/i },
  { campo: 'categoria', nombre: 'Categoría', busca: /categor/i },
  { campo: 'proveedor', nombre: 'Proveedor', busca: /proveedor|marca/i },
  { campo: 'descripcion', nombre: 'Descripción', busca: /descrip|detalle/i }
]

// Columnas elegidas: el número de columna de la planilla, o -1 si no se importa.
type Mapa = Record<Campo, number>

// Importar productos desde Excel (.xlsx) o CSV. La primera fila tiene que ser la de los títulos.
export default function Importar({ onListo }: { onListo: () => void }): React.JSX.Element {
  const [archivo, setArchivo] = useState('')
  const [titulos, setTitulos] = useState<string[]>([])
  const [datos, setDatos] = useState<Celda[][]>([])
  const [mapa, setMapa] = useState<Mapa | null>(null)
  const [actualizar, setActualizar] = useState(false)
  const [revision, setRevision] = useState<ResultadoImportacion | null>(null)
  const [hecho, setHecho] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')

  async function leer(f: File): Promise<void> {
    setError('')
    setRevision(null)
    try {
      const filas = /\.(csv|txt)$/i.test(f.name)
        ? leerCsv(await f.arrayBuffer())
        : ((await readSheet(f)) as Celda[][])
      const [cabecera, ...resto] = filas.filter((r) => r.some((c) => texto(c) !== ''))
      if (!cabecera || !resto.length) throw new Error('La planilla está vacía')
      const t = cabecera.map((c, i) => texto(c) || `Columna ${i + 1}`)
      setArchivo(f.name)
      setTitulos(t)
      setDatos(resto)
      setMapa(adivinar(t))
    } catch (err) {
      setError(
        /\.xls$/i.test(f.name)
          ? 'Los archivos .xls viejos no se pueden leer: abrilo en Excel y guardalo como .xlsx o .csv'
          : `No se pudo leer la planilla: ${(err as Error).message}`
      )
    }
  }

  const filas = (): ProductoImportado[] =>
    datos.map((r, i) => {
      const p: ProductoImportado = { codigo: '', fila: i + 2 }
      for (const { campo, numero } of CAMPOS) {
        const col = mapa?.[campo] ?? -1
        if (col < 0) continue
        const valor = numero ? aNumero(r[col]) : texto(r[col]) || undefined
        if (valor !== undefined) (p as Record<string, unknown>)[campo] = valor
      }
      return p
    })

  async function revisar(): Promise<void> {
    setError('')
    try {
      setRevision(await api.importarProductos(filas(), { actualizar, soloRevisar: true }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function importar(): Promise<void> {
    try {
      const r = await api.importarProductos(filas(), { actualizar, soloRevisar: false })
      if (r.errores.length) setRevision(r)
      else setHecho(r)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const elegir = (campo: Campo, col: number): void => {
    if (mapa) setMapa({ ...mapa, [campo]: col })
    setRevision(null)
  }

  const faltan = CAMPOS.filter((c) => c.req && (mapa?.[c.campo] ?? -1) < 0)

  if (hecho)
    return (
      <section className="tarjeta">
        <div className="fila-titulo">
          <p className="ok">
            Listo: {hecho.nuevos} productos nuevos
            {hecho.actualizados > 0 && `, ${hecho.actualizados} actualizados`}
            {hecho.repetidos > 0 && `, ${hecho.repetidos} que ya estaban quedaron sin cambios`}.
          </p>
          <button className="chico" onClick={onListo}>
            Cerrar
          </button>
        </div>
      </section>
    )

  return (
    <section className="tarjeta">
      <div className="fila-titulo">
        <h2>Importar productos desde una planilla</h2>
        <button className="chico" onClick={onListo}>
          Cancelar
        </button>
      </div>
      <p className="ayuda">
        Excel (.xlsx) o CSV, con los títulos de las columnas en la primera fila. Se lee la primera
        hoja. Los productos se reconocen por el código.
      </p>
      <label className="archivo">
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])}
        />
      </label>

      {mapa && (
        <>
          <h3>
            {archivo}: {datos.length} filas. ¿Qué columna es cada dato?
          </h3>
          <div className="grilla">
            {CAMPOS.map(({ campo, nombre, req }) => (
              <label key={campo} className={req ? 'req' : ''}>
                {nombre}
                <select value={mapa[campo]} onChange={(e) => elegir(campo, Number(e.target.value))}>
                  <option value={-1}>{req ? 'Elegir…' : '— no importar'}</option>
                  {titulos.map((t, i) => (
                    <option key={i} value={i}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <h3>Así quedan las primeras filas</h3>
          <table>
            <thead>
              <tr>
                {CAMPOS.filter((c) => mapa[c.campo] >= 0).map((c) => (
                  <th key={c.campo} className={c.numero ? 'num' : ''}>
                    {c.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas()
                .slice(0, 5)
                .map((p) => (
                  <tr key={p.fila}>
                    {CAMPOS.filter((c) => mapa[c.campo] >= 0).map(({ campo, numero }) => {
                      const v = p[campo]
                      return (
                        <td key={campo} className={numero ? 'num' : ''}>
                          {v === undefined
                            ? '—'
                            : numero && campo.startsWith('precio')
                              ? gs(v as number)
                              : String(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
            </tbody>
          </table>

          <label className="check">
            <input
              type="checkbox"
              checked={actualizar}
              onChange={(e) => {
                setActualizar(e.target.checked)
                setRevision(null)
              }}
            />
            Si el código ya existe, actualizarlo con los datos de la planilla (incluido el stock, si
            se eligió esa columna). Si no se marca, los que ya existen quedan como están.
          </label>

          {revision && <Revision r={revision} />}
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            {revision && !revision.errores.length ? (
              <button
                className="exito"
                disabled={!revision.nuevos && !revision.actualizados}
                onClick={importar}
              >
                Importar {revision.nuevos + revision.actualizados} productos
              </button>
            ) : (
              <button className="primario" disabled={faltan.length > 0} onClick={revisar}>
                {faltan.length
                  ? `Falta elegir: ${faltan.map((c) => c.nombre).join(', ')}`
                  : 'Revisar la planilla'}
              </button>
            )}
          </div>
        </>
      )}
      {!mapa && error && <p className="error">{error}</p>}
    </section>
  )
}

function Revision({ r }: { r: ResultadoImportacion }): React.JSX.Element {
  if (r.errores.length)
    return (
      <div className="aviso">
        <strong>
          Hay {r.errores.length} {r.errores.length === 1 ? 'fila con error' : 'filas con errores'}.
          Corregilas en la planilla y volvé a elegirla; no se importó nada.
        </strong>
        <ul>
          {r.errores.slice(0, 15).map((e) => (
            <li key={e.fila}>
              Fila {e.fila}: {e.mensaje}
            </li>
          ))}
          {r.errores.length > 15 && <li>…y {r.errores.length - 15} más.</li>}
        </ul>
      </div>
    )
  return (
    <p className="ok">
      Todo bien: {r.nuevos} productos nuevos
      {r.actualizados > 0 && `, ${r.actualizados} se actualizan`}
      {r.repetidos > 0 && `, ${r.repetidos} ya existen y quedan como están`}.
    </p>
  )
}

function adivinar(titulos: string[]): Mapa {
  const mapa = {} as Mapa
  const usadas = new Set<number>()
  for (const { campo, busca } of CAMPOS) {
    const i = titulos.findIndex((t, j) => !usadas.has(j) && busca.test(t))
    mapa[campo] = i
    if (i >= 0) usadas.add(i)
  }
  // En muchos sistemas el nombre del producto es la columna "Descripción".
  if (mapa.nombre < 0 && mapa.descripcion >= 0) {
    mapa.nombre = mapa.descripcion
    mapa.descripcion = -1
  }
  return mapa
}

function texto(c: Celda | undefined): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).trim()
}

// "150.000", "Gs. 150.000", "150000,00" o 150000 → 150000. Vacío → undefined (no se toca).
function aNumero(c: Celda | undefined): number | undefined {
  if (typeof c === 'number') return Math.round(c)
  const t = texto(c).replace(/,\d{1,2}$/, '')
  if (!t) return undefined
  const n = Number(t.replace(/\D/g, ''))
  return t.trim().startsWith('-') ? -n : n
}

// CSV con coma, punto y coma o tabulación (Excel en español usa punto y coma), con comillas.
// Si no es UTF-8, se lee como Windows-1252, que es como lo guarda Excel en Windows.
function leerCsv(buffer: ArrayBuffer): Celda[][] {
  let t = new TextDecoder('utf-8').decode(buffer)
  if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(buffer)
  t = t.replace(/^\uFEFF/, '')
  const primera = t.split(/\r?\n/, 1)[0]
  const sep = [';', '\t', ','].reduce((a, b) =>
    primera.split(b).length > primera.split(a).length ? b : a
  )
  const filas: Celda[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"'
        i++
      } else if (ch === '"') comillas = false
      else celda += ch
    } else if (ch === '"') comillas = true
    else if (ch === sep) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += ch
  }
  if (celda || fila.length) filas.push([...fila, celda])
  return filas
}
