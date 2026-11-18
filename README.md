# Sistema de ventas, caja y cuotas

Pedido recibido por WhatsApp el 2026-11-18. Es un proyecto aparte de Govly. Contexto para Claude en `CLAUDE.md`.

- **Propuesta**: https://claude.ai/artifact/92dBdMkcEdgdQn5VcHHFpW (se exporta a Word o PDF desde el menú del documento).
- **Material del cliente**: `material del cliente/` (2 audios, 8 capturas del sistema "infoventa" de la suegra y la transcripción).

## Lo que pide

- Prioridad: **control de caja** (qué entró, qué salió y en qué se gastó: mercadería, encomiendas, bolsitas de regalo).
- **Ventas en cuotas mensuales**: si sacó el 18, paga el 18 de cada mes. Pagos parciales y saldo por cliente.
- Lo que ya tiene "infoventa": ventas por código, inventario (535 productos), productos con foto, usuarios, informes y datos del negocio.

## Decidido

- Un solo local, aplicación de escritorio, solo en la PC.
- Factura electrónica (SIFEN): fuera de la oferta por ahora (2026-11-18), se cotiza aparte si hace falta.
- Propuesta técnica: Electron + React + SQLite local, respaldo diario a la nube, SIFEN por un proveedor intermediario.
- Propuesta comercial: 5 etapas, unas 11 semanas, Gs. 13.500.000 y mantenimiento opcional de Gs. 250.000 por mes (estimados, revisar antes de mandar).

## A confirmar con el cliente

- ¿Entrega toda la mercadería al vender en cuotas o a medida que paga?
- ¿Recargo por atraso?
- ¿Impresora de tickets o A4?
- ¿Carga inicial de productos desde planilla?
- ¿Métodos de pago (efectivo, transferencia, tarjeta)?
