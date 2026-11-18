// Calendario de cuotas: lo usan el proceso principal al guardar y la interfaz para la vista previa.

// "2026-01-31" + 1 mes → "2026-02-28". Cada mes sale del día original, no del mes anterior:
// 31/01 → 28/02 → 31/03.
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const total = m - 1 + meses
  const anio = a + Math.floor(total / 12)
  const mes = total % 12
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  const dos = (n: number): string => String(n).padStart(2, '0')
  return `${anio}-${dos(mes + 1)}-${dos(Math.min(d, ultimo))}`
}

// Cuotas iguales; lo que sobra de la división va en la última.
export function calendarioCuotas(
  fecha: string,
  cantidad: number,
  saldo: number
): { numero: number; vencimiento: string; monto: number }[] {
  const base = Math.floor(saldo / cantidad)
  return Array.from({ length: cantidad }, (_, i) => ({
    numero: i + 1,
    vencimiento: sumarMeses(fecha, i + 1),
    monto: i === cantidad - 1 ? saldo - base * (cantidad - 1) : base
  }))
}

// Días entre dos fechas AAAA-MM-DD (b − a).
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000)
}

export const MAX_CUOTAS = 36
