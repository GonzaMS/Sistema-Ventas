import { contextBridge, ipcRenderer } from 'electron'

// Único punto de entrada al proceso principal. La interfaz arma la API tipada encima (src/renderer/src/api.ts).
contextBridge.exposeInMainWorld('ipc', {
  invoke: (nombre: string, ...args: unknown[]) => ipcRenderer.invoke(nombre, ...args)
})
