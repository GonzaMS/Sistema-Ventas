# Pendientes

Todo lo que falta, por etapa. Al terminar un punto, borrarlo de acá. El funcionamiento de lo que ya está hecho se explica en `GUIA.md`.

Estado al 2026-11-18: etapas 1 (base), 2 (caja) y 3 (cuotas) hechas, además de Compras. La etapa 5 (informes) no está empezada. La etapa 4 (factura electrónica) quedó fuera de la oferta (2026-11-18).

## Prioridad: antes de instalar en el local

- [ ] **Respaldo diario.** Está prometido en la propuesta y no está hecho: hoy, si la PC se rompe o se la roban, se pierde todo. La idea:
  - una vez por día, y al cerrar la caja, copiar la base con `VACUUM INTO` (la copia sale bien aunque la app esté abierta) a una carpeta sincronizada con Google Drive o OneDrive;
  - guardar los últimos 30 días;
  - avisar en pantalla si el último respaldo tiene más de 2 días;
  - agregar en Administración un botón para restaurar un respaldo.

  Incluir la carpeta `fotos/` que está junto a la base (las fotos de productos).
- [ ] **Instalador para Windows** (`npm run build:win`) y probarlo en una PC con Windows 10 u 11: que la base se cree en `%APPDATA%\Sistema de ventas\` y que arranque sin internet.
- [ ] **Pantalla de datos del negocio** (nombre, RUC, dirección, teléfono). La tabla existe y el cierre y el recibo ya los imprimen, pero solo se cargan con `npm run datos-demo`.

## Etapa 1: base

- [ ] Probar la importación con una planilla real exportada de infoventa. Los `.xls` viejos no se leen: hay que guardarlos como `.xlsx` o `.csv`.
- [ ] Cambio de producto en un solo paso: hoy es una devolución y después una venta nueva. En la caja da lo mismo, pero si se usa mucho se puede dejar lo devuelto como saldo a favor para la venta nueva.
- [ ] Devoluciones: hoy solo las hace el admin, como anular. Si el cajero tiene que hacer cambios solo, habilitárselas.
- [ ] Comprobante impreso de la devolución (hoy se ve en el ticket reimpreso de la venta).

## Etapa 2: caja

- [ ] Probar la impresión del cierre y del ticket de venta (`Ticket.tsx`) en la impresora real del local (hoy usa el diálogo de Windows, en hoja de 72 mm de ancho).
- [ ] Arqueo ciego: el cajero todavía ve el total de cada venta en "Ventas de hoy" y los cobros en Cuotas, así que podría sumarlos a mano. Si hace falta más control, ocultar también esos montos.

## Etapa 3: cuotas

- [ ] Probar el recibo en la impresora real del local (mismo formato de 72 mm que el cierre de caja).
- [ ] Avisos por WhatsApp (sacados el 2026-11-18, quizás a futuro): recordatorio de cuotas y aviso de pago, abriendo `wa.me` con el mensaje armado; lista de vencidos y por vencer con marca de "avisado"; celular obligatorio solo en ventas en cuotas. El envío automático (API de Meta) se cotizaría aparte.

## Compras

- [ ] Compras a crédito: hoy "no sale de la caja" cubre tanto lo que pagó el dueño aparte como lo que se le debe al proveedor. Si el cliente compra seguido a crédito, llevar la deuda por proveedor y registrar los pagos.
- [ ] Al registrar una compra, poder actualizar también el precio de venta, si subió el costo.

## Etapa 4: factura electrónica (SIFEN), fuera de la oferta por ahora

No entra en la oferta de Gs. 3.000.000 (`propuesta/oferta-whatsapp.md`). Si la DNIT obliga a la clienta, se cotiza aparte (referencia: la competencia cobra Gs. 2.000.000 más con factura). Requisitos anotados el 2026-11-19 de memoria, sin verificar: confirmarlos en ekuatia.set.gov.py antes de cotizar.

**Trámites (los hace la clienta, es su RUC).** Conviene que los empiece antes del desarrollo: la habilitación puede tardar semanas.

- [ ] RUC activo y clave de acceso a Marangatu.
- [ ] Certificado digital (firma electrónica) de un prestador habilitado por el MIC. Unos Gs. 500.000 por año, lo paga ella.
- [ ] Solicitar en Marangatu ser facturadora electrónica (si la DNIT no la designó ya como obligada).
- [ ] Pruebas en el ambiente de pruebas de SIFEN: las hacemos nosotros con el sistema.
- [ ] Recibir el timbrado electrónico (establecimiento y punto de expedición) y el CSC (Código de Seguridad del Contribuyente, para el QR).

**En el sistema.** Recomendado: un proveedor intermediario con API (unas 2 semanas de trabajo; ella le paga un abono o por documento). Directo a SIFEN serían 4 a 6 semanas y habría que mantenerlo ante cada cambio del Manual Técnico (en npm hay `facturacionelectronicapy-xmlgen`, `-xmlsign` y `-setapi`).

- [ ] Elegir con la clienta el proveedor intermediario y ver su costo.
- [ ] Datos que faltan: IVA de cada producto (10%, 5% o exento), datos fiscales del negocio (timbrado, establecimiento, punto de expedición, CSC) y RUC o CI en los clientes.
- [ ] Emitir la factura desde la venta (XML con su CDC de 44 dígitos, firmado y enviado; guardar si se aprobó o se rechazó).
- [ ] Imprimir el KuDE (comprobante con QR) en lugar del ticket interno.
- [ ] Anular o cancelar con un evento, y nota de crédito en las devoluciones (`anularVenta`, `devolverItems`).
- [ ] Modo contingencia: facturar sin internet y enviar al volver la conexión, dentro del plazo de transmisión.

## Etapa 5: informes, sin empezar

- [ ] Caja por día y gastos por categoría.
- [ ] Ventas por día y por método de pago, contado y cuotas.
- [ ] Cuotas por cobrar y morosos.
- [ ] Productos más vendidos y más rentables, y valor del stock (ya hay una parte en las tarjetas de Productos).
- [ ] Historial de auditoría (quién hizo qué y cuándo): los datos ya se guardan en la tabla `auditoria`.

## Depende de lo que confirme el cliente

- [ ] **Entrega de la mercadería en cuotas.** Hoy se entrega toda al vender (el stock baja en la venta). Si entrega a medida que paga, hay que registrar lo entregado por ítem y bajar el stock en cada entrega.
- [ ] **Recargo por atraso.** Hoy no hay: solo se muestran los días de atraso. Si cobra recargo, definir si es un monto fijo o un porcentaje, y desde cuántos días.
- [ ] **Métodos de pago.** Hoy son efectivo, transferencia, tarjeta y QR (en `METODOS_PAGO`, `src/shared/tipos.ts`).
- [ ] **Impresora:** térmica de tickets o común en A4.
- [ ] **Carga inicial de productos:** ¿desde una planilla o de cero?
- [ ] **Arqueo ciego:** ¿lo quiere? (Está hecho y apagado.)
- [ ] **Cobro con QR integrado (etapa 6, opcional en la propuesta):** con qué banco o procesadora cobra hoy.

## Propuesta comercial

- [ ] Revisar los precios (los estimó Claude) y mandar la propuesta. El link está en `CLAUDE.md`. Ya incluye el QR; Compras no está en la propuesta.
