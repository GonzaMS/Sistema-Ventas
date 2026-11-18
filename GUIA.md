# Cómo funciona el sistema

Guía del flujo del sistema de ventas, caja y cuotas tal como está hoy (2026-11-18). Lo que falta está en `PENDIENTES.md`.

## La idea en una frase

Todo lo que mueve plata pasa por **la caja del día**. La caja sabe en cada momento cuánto debería haber por método de pago (efectivo, transferencia, tarjeta, QR) y al cerrar se compara con lo que se contó.

```
                         ┌────────────────────────────┐
  Venta al contado ────► │                            │
  Entrega y pagos de     │   CAJA DEL DÍA (abierta)   │ ──► Cierre con arqueo:
  cuotas ──────────────► │                            │     debería haber vs. contado
  Otros ingresos ──────► │  inicial + entradas        │
                         │          − salidas         │
  Compras de mercadería ◄│                            │
  Gastos (encomiendas,  ◄│                            │
  bolsitas, alquiler…)   └────────────────────────────┘
  Devoluciones ◄
```

## Usuarios

| | Administrador | Cajero |
|---|---|---|
| Vender, cobrar cuotas, cargar gastos, registrar compras | Sí | Sí |
| Abrir y cerrar la caja | Sí | Sí |
| Dar de alta y editar clientes | Sí | Sí |
| Crear o editar productos | Sí | No (los ve) |
| Anular ventas, pagos, movimientos y compras | Sí | No |
| Devolver productos de una venta | Sí | No |
| Importar productos de una planilla, cargar fotos | Sí | No |
| Cambiar su propia contraseña (tocando su nombre, arriba a la derecha) | Sí | Sí |
| Ver el historial de cajas cerradas | Sí | No |
| Usuarios, categorías y opciones (Administración) | Sí | No |

El primer arranque pide crear el administrador. Todo lo que se hace queda en la auditoría, con quién lo hizo y cuándo.

En Administración, el admin cambia el rol de cada usuario, lo desactiva o activa y le pone una contraseña nueva si se la olvidó. Un usuario desactivado no entra, pero sus ventas quedan con su nombre. Nadie se puede desactivar ni cambiar el rol a sí mismo: así siempre queda al menos un administrador activo.

## El día en el local

### 1. Abrir la caja (pestaña Caja)

Se cuenta el efectivo con el que arranca el cajón (el cambio) y se carga como **monto inicial**. Puede haber una sola caja abierta, y **sin caja abierta no se puede vender ni cobrar**. Arriba a la derecha siempre se ve si la caja está abierta o cerrada.

### 2. Vender (pestaña Ventas)

1. Pasás el lector o escribís el código o parte del nombre ("jean negro"). Aparecen sugerencias; con ↑ ↓ y Enter, o con un clic, el producto se agrega al carrito.
2. Ajustás las cantidades. Si no alcanza el stock, el número se pone en rojo y el sistema no deja cobrar.
3. Elegís **Contado** o **En cuotas**, el método de pago y, si hay, un descuento.
4. **Cobrar (F12).** En el mismo momento se guarda la venta, baja el stock y entra a la caja.
5. **Imprimir ticket** aparece después de cobrar. Lleva los productos, el descuento, el total, el método de pago y quién atendió, y dice "Comprobante interno, no válido como factura" hasta que esté la factura electrónica. Se puede reimprimir desde la lista de ventas: clic en la venta → **Reimprimir ticket**. Si la venta está anulada o tuvo devoluciones, el ticket lo dice.
6. La lista de abajo muestra las ventas de hoy. Con **Día** se ven las de otro día, y con **N° de venta** (el del ticket) se encuentra una venta de cualquier fecha. El total del día es neto, sin lo devuelto.

Los precios los pone el sistema desde Productos, no la pantalla. Cada venta guarda el precio que tenía el producto en ese momento.

### 3. Vender en cuotas

En Ventas, con **En cuotas**:

- El **cliente es obligatorio**. Se busca por nombre, CI o teléfono, o se da de alta ahí mismo.
- **Entrega inicial** (opcional) y **cantidad de cuotas** (1 a 36). Se ve el calendario antes de confirmar.
- Las cuotas vencen **el mismo día del mes de la compra**. Si ese mes no tiene ese día, vencen el último día del mes (una compra del 31/01 vence el 28/02, el 31/03, el 30/04…). Las cuotas son iguales y lo que sobra de la división va en la última.
- **La mercadería se entrega toda al vender** (el stock baja en la venta). Esto todavía está por confirmar con el cliente.
- **A la caja entra solo la plata que se cobra**: la entrega, y después cada pago. La venta en cuotas no suma completa en el arqueo.
- Si hubo entrega, se puede imprimir su recibo con el plan de cuotas.

### 4. Cobrar cuotas (pestaña Cuotas)

- Arriba se ve el **total a cobrar**, lo **vencido** y cuántos clientes están **atrasados**. La lista muestra primero a los más atrasados.
- Tocando un cliente se abre su **cuenta**: cada compra con sus cuotas (Pagada, Pago parcial, Pendiente, Atrasada · N días) y la lista de pagos.
- **Registrar pago:** el cliente paga lo que trae. **El pago se aplica primero a la cuota impaga más vieja**, aunque sea de otra compra, y puede ser parcial. El monto sugerido es lo vencido o, si está al día, la próxima cuota.
- Cada pago entra a la caja en la columna "Cobros cuotas" y tiene su **recibo** para imprimir.
- **Recordatorio por WhatsApp:** arma un mensaje con lo vencido, que se puede editar, y abre el chat del cliente o copia el texto.
- **Editar datos** del cliente (nombre, CI, teléfono, dirección). Con "Incluir clientes sin deuda" se ven también los que están al día.
- Por ahora no hay recargo por atraso; solo se muestran los días.

### 5. Comprar mercadería (pestaña Compras)

Para lo que entra al local:

1. Agregás los productos que llegaron, con **cantidad** y **costo unitario**. Si el producto es nuevo, el admin lo crea ahí mismo.
2. Ponés el **proveedor** y **cómo se pagó**:

| Cómo se pagó | Stock | Caja |
|---|---|---|
| Efectivo de la caja | Sube | Se descuenta del efectivo |
| Transferencia, tarjeta o QR del local | Sube | Se descuenta de ese método |
| No sale de la caja (lo pagó el dueño aparte, o se le debe al proveedor) | Sube | No se toca |

3. Al registrar, el costo queda como nuevo **precio de compra** del producto.

Para mercadería conviene usar siempre Compras y no un gasto manual de "Mercadería": el gasto manual baja la caja pero **no suma stock**.

**Devolver al proveedor una parte** (solo el admin): clic en la compra → **Devolver al proveedor…** → cantidad de cada producto, motivo y si el proveedor devuelve la plata.

- Lo devuelto **sale del stock**. Si esas unidades ya se vendieron (no alcanza el stock), no se puede.
- Vale lo que costó en esa compra (cantidad × costo).
- Si el proveedor devuelve la plata, entra a la caja abierta como ingreso **"Devolución de compra"**, en el método que elijas. Si deja el monto a favor, o la compra no se pagó con la caja, se elige **"No entra plata a la caja"**.
- Una compra con devoluciones ya no se anula entera: se devuelve lo que queda.

### 6. Otros ingresos y gastos (pestaña Caja)

En "Registrar ingreso o egreso" se cargan las salidas de plata que no son compras de mercadería: encomiendas, bolsitas de regalo, alquiler, luz… y las entradas que no son ventas. Cada una lleva categoría, monto, método y una descripción. Las categorías se agregan, renombran o desactivan en Administración.

### 7. Cerrar la caja

1. **Cerrar caja…** (arriba a la derecha) y contar:
   - **efectivo:** lo que hay en el cajón, contado desde cero;
   - **transferencia, tarjeta y QR:** vienen cargados con lo esperado; se revisan contra el banco o el POS.
2. El sistema muestra la **diferencia** por método (sobrante o faltante) antes de confirmar.
3. Se puede agregar una observación ("faltante por un vuelto mal dado") e **imprimir el cierre**.

Al cerrar, los números de esa caja **quedan fijos**: aunque después se anule algo, la caja cerrada no cambia, y el ajuste va a la caja abierta.

**Arqueo ciego** (opción en Administración, apagada de entrada): el cajero cierra contando sin ver cuánto debería haber, y la diferencia la ve solo el admin en el historial.

## Cómo se calcula lo que debería haber

Por cada método de pago:

```
debería haber = monto inicial (solo efectivo)
              + ventas al contado
              + cobros de cuotas (entregas y pagos)
              + otros ingresos
              − egresos (gastos, compras pagadas con la caja, devoluciones, correcciones)
```

## Anular y corregir

Nada se borra. Lo anulado queda marcado, con quién lo anuló, cuándo y por qué, y se sigue viendo tachado. Solo el admin anula. Siempre se pide el motivo.

| Qué se anula | Si es de la caja abierta | Si es de una caja ya cerrada |
|---|---|---|
| Venta al contado | La mercadería vuelve al stock y la venta deja de contar en la caja | Vuelve al stock; la plata sale de la caja abierta como "Devolución de venta" |
| Venta en cuotas | Vuelve al stock; lo que el cliente pagó de esa venta se le devuelve | Igual, y la devolución sale de la caja abierta |
| Pago de cuotas | La deuda vuelve a las cuotas y el pago deja de contar | La deuda vuelve; la plata sale de la caja abierta como "Corrección" |
| Ingreso o egreso manual | Deja de contar | Se carga el movimiento inverso como "Corrección" en la caja abierta |
| Compra | Sale del stock lo que entró y vuelve la plata | Igual; la plata vuelve como "Corrección" en la caja abierta |

### Devolver parte de una venta (o hacer un cambio)

Solo el admin. Clic en la venta → **Devolver productos…** → cantidad de cada producto, motivo y cómo se devuelve la plata.

- Lo devuelto **vuelve al stock**.
- Su valor es proporcional: si la venta tuvo descuento, se devuelve con el mismo descuento (una remera de 60.000 en una venta con 10 % de descuento vale 54.000).
- **Al contado:** la plata sale de la caja abierta como "Devolución de venta", por defecto en el mismo método en que se pagó.
- **En cuotas:** primero se descuenta de las **últimas cuotas** que faltan pagar. Si lo devuelto vale más de lo que debe, la diferencia se le devuelve en plata.
- **Un cambio** se hace devolviendo la prenda y cargando la venta nueva. En la caja queda la devolución y la venta, y el arqueo da igual.
- Una venta con devoluciones **ya no se anula entera**: se devuelve lo que queda.

Algunos casos no se pueden anular:
- **Una compra cuya mercadería ya se vendió en parte.**
- **Un movimiento generado por el sistema** (una devolución, una corrección, el pago de una compra). Esos se anulan desde donde se originaron.
- Cualquier anulación que tenga que mover plata **necesita una caja abierta**.

## Productos

- Código, nombre, familia, proveedor, unidad, stock, stock mínimo, precio de compra y de venta.
- Las tarjetas de arriba muestran cuántos productos hay, cuántos tienen el **stock bajo** (en el mínimo o por debajo) y el valor del stock al costo y a precio de venta. Las cifras de costo y ganancia las ve solo el admin.
- La lista se filtra por familia, proveedor y stock. La búsqueda es por palabras sueltas, en cualquier orden.
- El stock sube con las compras y baja con las ventas. A mano solo lo cambia el admin, editando el producto.
- Eliminar un producto lo desactiva: las ventas viejas lo siguen mostrando.
- **Foto:** en el formulario del producto, **Elegir foto…**. Se achica sola (600 px como mucho) y se ve en la lista y en las sugerencias al vender. Se guarda en la carpeta `fotos/`, al lado de la base.

### Importar productos de una planilla

Para la carga inicial (por ejemplo, la lista de infoventa). Productos → **Importar planilla…** (solo el admin).

1. Elegir el archivo: Excel `.xlsx` o `.csv`, con los títulos en la primera fila. Los `.xls` viejos no se leen: hay que abrirlos en Excel y guardarlos como `.xlsx`.
2. Elegir qué columna es cada dato. El sistema adivina por el título, y se ve cómo quedan las primeras filas. Código, nombre y precio de venta son obligatorios.
3. **Revisar la planilla:** dice cuántos productos se crean y cuántos ya existían. Si hay errores (código repetido, falta el precio, un número negativo), muestra la fila y **no importa nada** hasta que se corrija.
4. **Importar.**

Los productos se reconocen por el código. Los que ya existen quedan como están, salvo que se marque **actualizar**: entonces se pisan solo las columnas elegidas (incluido el stock, si se eligió). Los montos se leen con o sin puntos y con "Gs.".

## Dónde quedan los datos

Todo está en un solo archivo SQLite, en la PC:

| Equipo | Archivo |
|---|---|
| Mac, en modo prueba | `~/Library/Application Support/sistema-ventas/ventas.db` |
| PC del local (Windows, instalado) | `%APPDATA%\Sistema de ventas\ventas.db` |

Las fotos de productos van en la carpeta `fotos/`, al lado del archivo.

- No necesita internet ni servidor.
- Al lado aparecen `ventas.db-wal` y `ventas.db-shm`, que son parte de la base: no hay que borrarlos.
- Los montos se guardan en guaraníes enteros.
- Las contraseñas se guardan cifradas, sin forma de recuperarlas.
- **Todavía no hay respaldo automático.** Es lo primero de `PENDIENTES.md`.
- Cuando se agrega algo nuevo al sistema, la base se actualiza sola al abrir la app (migraciones). Los datos se conservan.

## Para el desarrollo

Desde la carpeta `app/` (antes: `export PATH=~/.nvm/versions/node/v26.13.0/bin:$PATH`):

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la app en modo prueba |
| `npm run datos-demo` | Con la app cerrada, reemplaza la base de prueba por un local de ejemplo con 2 meses de historia (la anterior queda guardada al lado). Usuarios `admin` / `admin123` y `caja` / `caja123` |
| `npm run pruebas` | Corre las pruebas de ventas, caja, cuotas y compras contra una base en memoria |
| `npm run typecheck` y `npm run lint` | Revisan el código antes de cerrar |

Atajos: **F12** cobra en Ventas. **Ctrl+Shift+I** abre las herramientas de desarrollo, solo en modo prueba.

Cómo está armado el código:
- `src/main/`: la lógica y la base (ventas, caja, cuotas, compras, productos, clientes, usuarios).
- `src/renderer/`: las pantallas.
- Toda llamada de una pantalla pasa por `src/main/ipc.ts`, y cada función revisa la sesión y el rol.
