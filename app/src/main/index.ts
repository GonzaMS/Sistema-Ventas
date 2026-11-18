import { app, net, protocol, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { abrirDb, carpetaFotos } from './db'
import { registrarIpc } from './ipc'
import { NOMBRE_FOTO } from './productos'

// Fotos de productos: <img src="foto://p/12-1731960000.jpg"> lee de la carpeta de fotos.
protocol.registerSchemesAsPrivileged([
  { scheme: 'foto', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Sistema de ventas',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Un solo puesto: si se abre dos veces, se enfoca la ventana que ya está.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    if (w.isMinimized()) w.restore()
    w.focus()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.nexora.ventas')

  // F12 es "Cobrar" en Ventas. DevTools: Ctrl+Shift+I, solo en desarrollo. En producción no se
  // puede recargar la ventana (Ctrl+R / F5), para no perder una venta a medio cargar.
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = input.control || input.meta
      if (is.dev && ctrl && input.shift && input.code === 'KeyI') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      } else if (!is.dev && ((ctrl && input.code === 'KeyR') || input.code === 'F5')) {
        event.preventDefault()
      }
    })
  })

  abrirDb()
  registrarIpc()
  protocol.handle('foto', (req) => {
    const archivo = new URL(req.url).pathname.slice(1)
    if (!NOMBRE_FOTO.test(archivo)) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(join(carpetaFotos(), archivo)).href)
  })
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
