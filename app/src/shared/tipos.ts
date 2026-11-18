// Tipos compartidos entre el proceso principal y la interfaz.
// Los montos van siempre en guaraníes enteros (sin decimales).

export type Rol = 'admin' | 'cajero'

export interface Usuario {
  id: number
  usuario: string
  rol: Rol
  activo: boolean
}

export interface Producto {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  unidad: string
  categoria: string | null
  familia: string | null
  proveedor: string | null
  stock: number
  stockMinimo: number
  precioCompra: number
  precioVenta: number
  vencimiento: string | null // AAAA-MM-DD
  imagen: string | null // archivo en la carpeta de fotos; se ve con <img src={urlFoto(imagen)}>
}

// La foto se guarda aparte, con guardarFoto.
export type ProductoNuevo = Omit<Producto, 'id' | 'imagen'>

// Una fila de la planilla: solo vienen las columnas elegidas. fila es el número en la planilla,
// para los mensajes de error.
export type ProductoImportado = Partial<ProductoNuevo> & { codigo: string; fila: number }

export interface ResultadoImportacion {
  nuevos: number
  actualizados: number
  repetidos: number // ya existían y se dejaron como estaban
  errores: { fila: number; mensaje: string }[]
}

export interface Cliente {
  id: number
  nombre: string
  documento: string | null // CI o RUC
  telefono: string | null
  direccion: string | null
}

export type ClienteNuevo = Omit<Cliente, 'id'>

// Métodos de pago a confirmar con el cliente; se validan en el proceso principal.
export const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'qr'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

// Lo que manda la interfaz: los precios los pone el proceso principal desde la base.
// cuotas: null = contado. En cuotas, metodoPago es el de la entrega inicial.
export interface VentaNueva {
  clienteId: number | null
  items: { productoId: number; cantidad: number }[]
  descuento: number
  metodoPago: MetodoPago
  cuotas: { cantidad: number; entrega: number } | null
}

export type Condicion = 'contado' | 'cuotas'

export interface ItemVenta {
  id: number
  codigo: string
  nombre: string
  cantidad: number
  precio: number
  subtotal: number
  devueltos: number // unidades ya devueltas
}

export interface Venta {
  id: number
  fecha: string // AAAA-MM-DD HH:MM:SS, hora local
  usuario: string
  cliente: string | null
  subtotal: number
  descuento: number
  total: number
  metodoPago: MetodoPago
  condicion: Condicion
  entrega: number // entrega inicial de una venta en cuotas
  devuelto: number // valor de lo devuelto (descontado de cuotas + plata devuelta)
  anulada: boolean
  items: ItemVenta[]
}

export interface Devolucion {
  venta: Venta
  valor: number
  descontado: number // de las cuotas que faltaban pagar
  reintegro: number // plata devuelta al cliente
}

// Respuesta de cada llamada IPC: el preload la desarma y lanza el error con su mensaje.
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

export type TipoMovimiento = 'ingreso' | 'egreso'

export interface CategoriaCaja {
  id: number
  nombre: string
  tipo: TipoMovimiento
  sistema: boolean
  activo: boolean
}

export interface MovimientoNuevo {
  tipo: TipoMovimiento
  categoriaId: number
  descripcion: string | null
  monto: number
  metodoPago: MetodoPago
}

export interface MovimientoCaja {
  id: number
  fecha: string
  usuario: string
  tipo: TipoMovimiento
  categoria: string
  descripcion: string | null
  monto: number
  metodoPago: MetodoPago
  ventaId: number | null // devolución generada al anular esa venta
  corrigeId: number | null // corrección de un movimiento de una caja cerrada
  compraId: number | null // egreso generado por una compra de mercadería
  cobroId: number | null // corrección por anular un pago de cuotas de una caja cerrada
  corregidoEnCaja: number | null // si se anuló después del cierre, caja donde está la corrección
  anulado: boolean
}

// Por método de pago: esperado = inicial + ventas + cobros + ingresos − egresos. contado es null mientras la caja está abierta.
export interface ResumenMetodo {
  metodo: MetodoPago
  inicial: number
  ventas: number
  cobros: number // entregas y pagos de cuotas
  ingresos: number
  egresos: number
  esperado: number
  contado: number | null
}

export interface Caja {
  id: number
  abiertaEn: string
  abiertaPor: string
  montoInicial: number
  cerradaEn: string | null
  cerradaPor: string | null
  observacion: string | null
  cantidadVentas: number
  ciego: boolean // arqueo ciego para este usuario: resumen viene vacío
  resumen: ResumenMetodo[]
  movimientos: MovimientoCaja[]
}

export type EstadoCuota = 'pagada' | 'parcial' | 'pendiente' | 'atrasada'

// numero 0 = entrega inicial.
export interface Cuota {
  id: number
  ventaId: number
  numero: number
  vencimiento: string // AAAA-MM-DD
  monto: number
  pagado: number
  saldo: number
  estado: EstadoCuota
  diasAtraso: number
}

export interface Cobro {
  id: number
  fecha: string
  usuario: string
  monto: number
  metodoPago: MetodoPago
  anulado: boolean
  esEntrega: boolean // se anula anulando la venta
  aplicado: { ventaId: number; numero: number; monto: number }[]
}

export interface ResumenCliente {
  cliente: Cliente
  saldo: number
  vencido: number
  cuotasVencidas: number
  proximoVencimiento: string | null // la cuota impaga más vieja
  diasAtraso: number
}

export interface CuentaCliente {
  cliente: Cliente
  saldo: number
  vencido: number
  ventas: (Venta & { cuotas: Cuota[] })[]
  cobros: Cobro[]
}

export interface Negocio {
  nombre: string
  ruc: string
  direccion: string
  telefono: string
}

export interface Configuracion {
  arqueoCiego: boolean // el cajero cierra sin ver lo esperado; el admin ve todo
}

// metodoPago null = no salió de la caja (lo pagó el dueño aparte o se le debe al proveedor).
export interface CompraNueva {
  proveedor: string | null
  items: { productoId: number; cantidad: number; costo: number }[]
  metodoPago: MetodoPago | null
  observacion: string | null
}

export interface ItemCompra {
  codigo: string
  nombre: string
  cantidad: number
  costo: number
  subtotal: number
}

export interface Compra {
  id: number
  fecha: string
  usuario: string
  proveedor: string | null
  total: number
  metodoPago: MetodoPago | null
  cajaId: number | null // caja de la que salió la plata
  observacion: string | null
  anulada: boolean
  items: ItemCompra[]
}
