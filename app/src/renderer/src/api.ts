import type { Api } from '../../main/ipc'
import type { MetodoPago } from '../../shared/tipos'

// api.buscarProductos('bincha') → Promise<Producto[]>; si el proceso principal falla, lanza Error con su mensaje.
export const api = new Proxy({} as Api, {
  get:
    (_, nombre: string) =>
    async (...args: unknown[]) => {
      const r = await window.ipc.invoke(nombre, ...args)
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
})

const fmt = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })
export const gs = (n: number): string => `Gs. ${fmt.format(n)}`

// "15.000" o "15000" → 15000. Vacío → 0.
export const aEntero = (s: string): number => Number(s.replace(/\D/g, '') || 0)

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  qr: 'QR'
}

export const urlFoto = (archivo: string): string => `foto://p/${archivo}`

// Achica la foto elegida a 600 px como mucho y la pasa a JPEG, para mandarla con guardarFoto.
export async function achicarFoto(archivo: File, lado = 600): Promise<string> {
  const img = await createImageBitmap(archivo)
  const escala = Math.min(1, lado / Math.max(img.width, img.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(img.width * escala)
  lienzo.height = Math.round(img.height * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
  return lienzo.toDataURL('image/jpeg', 0.85)
}

// "2026-11-18 14:05:33" → "14:05"; con fecha: "18/11 14:05".
// cantidad(1, 'venta', 'ventas') → "1 venta".
export const cantidad = (n: number, uno: string, varios: string): string =>
  `${n} ${n === 1 ? uno : varios}`

export const fecha = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
export const hora = (f: string): string => f.slice(11, 16)
export const fechaHora = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)} ${hora(f)}`

// Copia al portapapeles; si el navegador no lo permite, usa el método viejo.
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const t = document.createElement('textarea')
    t.value = texto
    document.body.appendChild(t)
    t.select()
    const ok = document.execCommand('copy')
    t.remove()
    return ok
  }
}
