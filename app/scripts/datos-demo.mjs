// Carga datos de demostración en una base nueva.
//   npm run datos-demo                       → base de la app en modo prueba (npm run dev)
//   npm run datos-demo -- --ruta otra.db     → otra base
// Si la base ya existe la guarda como ventas.db.antes-de-demo-<fecha> y empieza de cero.
// La app tiene que estar cerrada.
import { mkdtempSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'rolldown'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Misma carpeta que usa Electron en modo prueba (app.getPath('userData') con el nombre del package).
const carpetaDatos =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config')

const i = process.argv.indexOf('--ruta')
const ruta = resolve(
  i > 0 ? process.argv[i + 1] : join(carpetaDatos, 'sistema-ventas', 'ventas.db')
)

if (existsSync(ruta)) {
  const sello = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  for (const sufijo of ['', '-wal', '-shm'])
    if (existsSync(ruta + sufijo))
      renameSync(ruta + sufijo, `${ruta}.antes-de-demo-${sello}${sufijo}`)
  console.log(`La base anterior quedó como ${ruta}.antes-de-demo-${sello}`)
}
mkdirSync(dirname(ruta), { recursive: true })

// Se empaqueta el código del proceso principal sin Electron (solo se usa app.getPath, que acá no hace falta).
const tmp = mkdtempSync(join(tmpdir(), 'datos-demo-'))
const stub = join(tmp, 'electron.cjs')
writeFileSync(
  stub,
  'module.exports = { app: { getPath: () => { throw new Error("sin electron") } } }'
)
const salida = join(tmp, 'demo.cjs')
await build({
  input: join(raiz, 'scripts', 'demo.ts'),
  platform: 'node',
  resolve: { alias: { electron: stub } },
  external: [/^node:/],
  output: { file: salida, format: 'cjs' },
  logLevel: 'warn'
})
const { cargarDemo } = (await import(pathToFileURL(salida).href)).default
try {
  cargarDemo(ruta)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`Datos de demostración cargados en ${ruta}`)
console.log('Usuarios: admin / admin123 (administrador) · caja / caja123 (cajero)')
