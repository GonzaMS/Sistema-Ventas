// npm run pruebas: empaqueta el proceso principal sin Electron y corre cada prueba contra una base
// en memoria. Cada archivo falla con el primer assert que no se cumple.
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build } from 'rolldown'

const aca = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'pruebas-'))
const stub = join(tmp, 'electron.cjs')
writeFileSync(
  stub,
  'module.exports = { app: { getPath: () => { throw new Error("sin electron") } } }'
)
const bundle = join(tmp, 'bundle.cjs')
await build({
  input: join(aca, 'entrada.ts'),
  platform: 'node',
  resolve: { alias: { electron: stub } },
  external: [/^node:/],
  output: { file: bundle, format: 'cjs' },
  logLevel: 'warn'
})

let fallas = 0
for (const f of readdirSync(aca)
  .filter((f) => f.endsWith('.mjs') && f !== 'correr.mjs')
  .sort()) {
  const r = spawnSync(process.execPath, [join(aca, f)], {
    env: { ...process.env, BUNDLE: pathToFileURL(bundle).href },
    encoding: 'utf8'
  })
  if (r.status === 0) console.log(`ok     ${f}`)
  else {
    fallas++
    console.log(`FALLA  ${f}\n${r.stderr}`)
  }
}
rmSync(tmp, { recursive: true, force: true })
process.exit(fallas ? 1 : 0)
