import { ipcMain } from 'electron'
import * as usuarios from './usuarios'
import * as productos from './productos'
import * as clientes from './clientes'
import * as ventas from './ventas'
import * as caja from './caja'
import * as cuotas from './cuotas'
import * as negocio from './negocio'
import * as compras from './compras'
import * as informes from './informes'
import type { Resultado } from '../shared/tipos'

// Todo lo que la interfaz puede pedirle al proceso principal.
// Cada función valida la sesión y los permisos por su cuenta.
const handlers = {
  hayUsuarios: usuarios.hayUsuarios,
  sesion: usuarios.sesion,
  crearPrimerAdmin: usuarios.crearPrimerAdmin,
  iniciarSesion: usuarios.iniciarSesion,
  cerrarSesion: usuarios.cerrarSesion,
  listarUsuarios: usuarios.listarUsuarios,
  crearUsuario: usuarios.crearUsuario,
  cambiarRol: usuarios.cambiarRol,
  activarUsuario: usuarios.activarUsuario,
  restablecerClave: usuarios.restablecerClave,
  cambiarMiClave: usuarios.cambiarMiClave,

  buscarProductos: productos.buscarProductos,
  productoPorCodigo: productos.productoPorCodigo,
  crearProducto: productos.crearProducto,
  editarProducto: productos.editarProducto,
  eliminarProducto: productos.eliminarProducto,
  importarProductos: productos.importarProductos,
  guardarFoto: productos.guardarFoto,
  quitarFoto: productos.quitarFoto,

  buscarClientes: clientes.buscarClientes,
  crearCliente: clientes.crearCliente,
  editarCliente: clientes.editarCliente,

  registrarVenta: ventas.registrarVenta,
  ventasDelDia: ventas.ventasDelDia,
  buscarVenta: ventas.buscarVenta,
  proximaVenta: ventas.proximaVenta,
  anularVenta: ventas.anularVenta,
  devolverItems: ventas.devolverItems,

  cajaActual: caja.cajaActual,
  categoriasCaja: caja.categoriasCaja,
  crearCategoria: caja.crearCategoria,
  editarCategoria: caja.editarCategoria,
  activarCategoria: caja.activarCategoria,
  abrirCaja: caja.abrirCaja,
  registrarMovimiento: caja.registrarMovimiento,
  anularMovimiento: caja.anularMovimiento,
  cerrarCaja: caja.cerrarCaja,
  listarCajas: caja.listarCajas,

  clientesConSaldo: cuotas.clientesConSaldo,
  cuentaCliente: cuotas.cuentaCliente,
  cobrarCuotas: cuotas.cobrarCuotas,
  anularCobro: cuotas.anularCobro,

  registrarCompra: compras.registrarCompra,
  listarCompras: compras.listarCompras,
  anularCompra: compras.anularCompra,
  devolverCompra: compras.devolverCompra,

  informe: informes.informe,

  datosNegocio: negocio.datosNegocio,
  configuracion: negocio.configuracion,
  guardarConfiguracion: negocio.guardarConfiguracion
}

type Handlers = typeof handlers
export type Api = {
  [K in keyof Handlers]: (...args: Parameters<Handlers[K]>) => Promise<ReturnType<Handlers[K]>>
}

export function registrarIpc(): void {
  for (const [nombre, fn] of Object.entries(handlers)) {
    ipcMain.handle(nombre, (_e, ...args): Resultado<unknown> => {
      try {
        return { ok: true, data: (fn as (...a: unknown[]) => unknown)(...args) }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
  }
}
