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
- [ ] Recordatorio: hoy se manda de a uno desde la cuenta del cliente. Si hay muchos atrasados, armar una lista para mandarlos seguidos.

## Compras

- [ ] Compras a crédito: hoy "no sale de la caja" cubre tanto lo que pagó el dueño aparte como lo que se le debe al proveedor. Si el cliente compra seguido a crédito, llevar la deuda por proveedor y registrar los pagos.
- [ ] Al registrar una compra, poder actualizar también el precio de venta, si subió el costo.

## Etapa 4: factura electrónica (SIFEN), fuera de la oferta por ahora

No entra en la oferta de Gs. 3.000.000 (`propuesta/oferta-whatsapp.md`). Si la DNIT obliga a la clienta, se cotiza aparte. Además de lo de abajo, falta agregar el IVA de cada producto (10%, 5% o exento), los datos fiscales del negocio (timbrado, establecimiento, punto de expedición) y distinguir RUC de CI en los clientes.


- [ ] Elegir con el cliente el proveedor intermediario (con API) y ver su costo.
- [ ] Trámites del local: RUC al día, alta como facturador electrónico ante la DNIT con timbrado y certificado de firma digital.
- [ ] Emitir la factura y la nota de crédito desde la venta, e imprimir el comprobante con su QR.
- [ ] Modo contingencia: facturar sin internet y enviar al volver la conexión.
- [ ] Pruebas con la DNIT en el ambiente de pruebas antes de pasar a producción.

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
