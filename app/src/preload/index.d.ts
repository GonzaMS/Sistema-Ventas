import type { Resultado } from '../shared/tipos'

declare global {
  interface Window {
    ipc: { invoke: (nombre: string, ...args: unknown[]) => Promise<Resultado<unknown>> }
  }
}
