// Cada migración se aplica una sola vez, en orden. PRAGMA user_version guarda la última aplicada.
// Nunca editar una migración ya publicada: agregar una nueva al final.

export const migraciones: string[] = [
  // 1. Base: usuarios, datos del negocio, productos y auditoría.
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    clave_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'cajero')),
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE negocio (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT NOT NULL DEFAULT '',
    ruc TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO negocio (id) VALUES (1);

  CREATE TABLE productos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL COLLATE NOCASE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    unidad TEXT NOT NULL DEFAULT 'Unidad',
    categoria TEXT,
    familia TEXT,
    proveedor TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 0,
    precio_compra INTEGER NOT NULL DEFAULT 0 CHECK (precio_compra >= 0),
    precio_venta INTEGER NOT NULL CHECK (precio_venta >= 0),
    vencimiento TEXT,
    imagen TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE UNIQUE INDEX productos_codigo ON productos (codigo) WHERE activo = 1;
  CREATE INDEX productos_nombre ON productos (nombre);

  CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    usuario_id INTEGER REFERENCES usuarios (id),
    accion TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id INTEGER,
    detalle TEXT
  );
  CREATE INDEX auditoria_fecha ON auditoria (fecha);
  `,

  // 2. Clientes y ventas. Cada ítem guarda código, nombre y precio del momento de la venta.
  `
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    documento TEXT COLLATE NOCASE,
    telefono TEXT,
    direccion TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE UNIQUE INDEX clientes_documento ON clientes (documento)
    WHERE documento IS NOT NULL AND activo = 1;
  CREATE INDEX clientes_nombre ON clientes (nombre);

  CREATE TABLE ventas (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    cliente_id INTEGER REFERENCES clientes (id),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento BETWEEN 0 AND subtotal),
    total INTEGER NOT NULL CHECK (total = subtotal - descuento),
    metodo_pago TEXT NOT NULL,
    anulada_en TEXT,
    anulada_por INTEGER REFERENCES usuarios (id),
    motivo_anulacion TEXT
  );
  CREATE INDEX ventas_fecha ON ventas (fecha);
  CREATE INDEX ventas_cliente ON ventas (cliente_id);

  CREATE TABLE venta_items (
    id INTEGER PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas (id),
    producto_id INTEGER NOT NULL REFERENCES productos (id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio INTEGER NOT NULL CHECK (precio >= 0),
    subtotal INTEGER NOT NULL CHECK (subtotal = cantidad * precio)
  );
  CREATE INDEX venta_items_venta ON venta_items (venta_id);
  `,

  // 3. Caja: una abierta a la vez, movimientos por categoría y arqueo por método al cerrar.
  // El arqueo guarda los números del cierre: una caja cerrada no cambia aunque después se anule una venta.
  `
  CREATE TABLE cajas (
    id INTEGER PRIMARY KEY,
    abierta_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    abierta_por INTEGER NOT NULL REFERENCES usuarios (id),
    monto_inicial INTEGER NOT NULL CHECK (monto_inicial >= 0),
    cerrada_en TEXT,
    cerrada_por INTEGER REFERENCES usuarios (id),
    observacion TEXT
  );
  CREATE UNIQUE INDEX cajas_una_abierta ON cajas ((cerrada_en IS NULL)) WHERE cerrada_en IS NULL;

  CREATE TABLE caja_arqueo (
    caja_id INTEGER NOT NULL REFERENCES cajas (id),
    metodo_pago TEXT NOT NULL,
    inicial INTEGER NOT NULL,
    ventas INTEGER NOT NULL,
    ingresos INTEGER NOT NULL,
    egresos INTEGER NOT NULL,
    esperado INTEGER NOT NULL,
    contado INTEGER NOT NULL CHECK (contado >= 0),
    PRIMARY KEY (caja_id, metodo_pago)
  );

  -- sistema = 1: la usa el propio sistema (devoluciones), no se elige a mano.
  CREATE TABLE categorias_caja (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    sistema INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    UNIQUE (nombre, tipo)
  );
  INSERT INTO categorias_caja (nombre, tipo, sistema) VALUES
    ('Mercadería', 'egreso', 0),
    ('Encomiendas', 'egreso', 0),
    ('Bolsitas de regalo', 'egreso', 0),
    ('Otros', 'egreso', 0),
    ('Otros', 'ingreso', 0),
    ('Devolución de venta', 'egreso', 1);

  CREATE TABLE movimientos_caja (
    id INTEGER PRIMARY KEY,
    caja_id INTEGER NOT NULL REFERENCES cajas (id),
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    categoria_id INTEGER NOT NULL REFERENCES categorias_caja (id),
    descripcion TEXT,
    monto INTEGER NOT NULL CHECK (monto > 0),
    metodo_pago TEXT NOT NULL,
    venta_id INTEGER REFERENCES ventas (id),
    anulado_en TEXT,
    anulado_por INTEGER REFERENCES usuarios (id),
    motivo_anulacion TEXT
  );
  CREATE INDEX movimientos_caja_caja ON movimientos_caja (caja_id);

  ALTER TABLE ventas ADD COLUMN caja_id INTEGER REFERENCES cajas (id);
  CREATE INDEX ventas_caja ON ventas (caja_id);
  `,

  // 4. Ventas en cuotas. La cuota 0 es la entrega inicial. Un cobro entra a la caja y se reparte
  // entre cuotas (cobro_cuotas); lo pagado de cada cuota se calcula desde los cobros no anulados.
  `
  ALTER TABLE ventas ADD COLUMN condicion TEXT NOT NULL DEFAULT 'contado'
    CHECK (condicion IN ('contado', 'cuotas'));

  CREATE TABLE cuotas (
    id INTEGER PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas (id),
    numero INTEGER NOT NULL CHECK (numero >= 0),
    vencimiento TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto > 0),
    UNIQUE (venta_id, numero)
  );
  CREATE INDEX cuotas_vencimiento ON cuotas (vencimiento);

  CREATE TABLE cobros (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    caja_id INTEGER NOT NULL REFERENCES cajas (id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    cliente_id INTEGER NOT NULL REFERENCES clientes (id),
    monto INTEGER NOT NULL CHECK (monto > 0),
    metodo_pago TEXT NOT NULL,
    anulado_en TEXT,
    anulado_por INTEGER REFERENCES usuarios (id),
    motivo_anulacion TEXT
  );
  CREATE INDEX cobros_cliente ON cobros (cliente_id);
  CREATE INDEX cobros_caja ON cobros (caja_id);

  CREATE TABLE cobro_cuotas (
    cobro_id INTEGER NOT NULL REFERENCES cobros (id),
    cuota_id INTEGER NOT NULL REFERENCES cuotas (id),
    monto INTEGER NOT NULL CHECK (monto > 0),
    PRIMARY KEY (cobro_id, cuota_id)
  );
  CREATE INDEX cobro_cuotas_cuota ON cobro_cuotas (cuota_id);

  ALTER TABLE caja_arqueo ADD COLUMN cobros INTEGER NOT NULL DEFAULT 0;
  `,

  // 5. Arqueo ciego (opción del negocio) y correcciones: anular un movimiento de una caja cerrada
  // genera el movimiento inverso en la caja abierta (corrige_id apunta al original).
  `
  ALTER TABLE negocio ADD COLUMN arqueo_ciego INTEGER NOT NULL DEFAULT 0;
  INSERT INTO categorias_caja (nombre, tipo, sistema) VALUES
    ('Corrección', 'ingreso', 1),
    ('Corrección', 'egreso', 1);
  ALTER TABLE movimientos_caja ADD COLUMN corrige_id INTEGER REFERENCES movimientos_caja (id);
  `,

  // 6. Compras de mercadería: suben el stock y, si se pagaron con plata de la caja, generan el
  // egreso "Compra de mercadería" (movimientos_caja.compra_id). metodo_pago NULL = no salió de la caja.
  `
  CREATE TABLE compras (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    proveedor TEXT,
    total INTEGER NOT NULL CHECK (total >= 0),
    metodo_pago TEXT,
    observacion TEXT,
    anulada_en TEXT,
    anulada_por INTEGER REFERENCES usuarios (id),
    motivo_anulacion TEXT
  );
  CREATE INDEX compras_fecha ON compras (fecha);

  CREATE TABLE compra_items (
    id INTEGER PRIMARY KEY,
    compra_id INTEGER NOT NULL REFERENCES compras (id),
    producto_id INTEGER NOT NULL REFERENCES productos (id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    costo INTEGER NOT NULL CHECK (costo >= 0),
    subtotal INTEGER NOT NULL CHECK (subtotal = cantidad * costo)
  );
  CREATE INDEX compra_items_compra ON compra_items (compra_id);

  ALTER TABLE movimientos_caja ADD COLUMN compra_id INTEGER REFERENCES compras (id);
  INSERT INTO categorias_caja (nombre, tipo, sistema) VALUES ('Compra de mercadería', 'egreso', 1);
  `,

  // 7. Anular un pago de cuotas de una caja ya cerrada: la plata sale de la caja abierta como
  // "Corrección" y el movimiento queda atado al pago (cobro_id).
  `
  ALTER TABLE movimientos_caja ADD COLUMN cobro_id INTEGER REFERENCES cobros (id);
  `,

  // 8. Devolución de parte de una venta: vuelve el stock de lo devuelto. En cuotas, su valor se
  // descuenta de las cuotas impagas (cuotas.descontado) y lo que sobra se devuelve en plata; al
  // contado se devuelve todo en plata. La plata sale de la caja abierta (movimientos_caja.devolucion_id).
  `
  CREATE TABLE devoluciones (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    venta_id INTEGER NOT NULL REFERENCES ventas (id),
    caja_id INTEGER NOT NULL REFERENCES cajas (id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    valor INTEGER NOT NULL CHECK (valor >= 0),
    descontado INTEGER NOT NULL DEFAULT 0 CHECK (descontado >= 0),
    reintegro INTEGER NOT NULL DEFAULT 0 CHECK (reintegro >= 0),
    metodo_pago TEXT,
    motivo TEXT NOT NULL,
    CHECK (valor = descontado + reintegro)
  );
  CREATE INDEX devoluciones_venta ON devoluciones (venta_id);

  CREATE TABLE devolucion_items (
    devolucion_id INTEGER NOT NULL REFERENCES devoluciones (id),
    venta_item_id INTEGER NOT NULL REFERENCES venta_items (id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    valor INTEGER NOT NULL CHECK (valor >= 0),
    PRIMARY KEY (devolucion_id, venta_item_id)
  );
  CREATE INDEX devolucion_items_item ON devolucion_items (venta_item_id);

  ALTER TABLE cuotas ADD COLUMN descontado INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE movimientos_caja ADD COLUMN devolucion_id INTEGER REFERENCES devoluciones (id);
  `,

  // 9. Devolución de parte de una compra al proveedor: baja el stock y, si el proveedor devuelve
  // la plata, entra a la caja abierta como "Devolución de compra" (el movimiento lleva compra_id y
  // devolucion_compra_id). metodo_pago NULL = no entró plata (crédito con el proveedor).
  `
  CREATE TABLE devoluciones_compra (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    compra_id INTEGER NOT NULL REFERENCES compras (id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    valor INTEGER NOT NULL CHECK (valor >= 0),
    metodo_pago TEXT,
    motivo TEXT NOT NULL
  );
  CREATE INDEX devoluciones_compra_compra ON devoluciones_compra (compra_id);

  CREATE TABLE devolucion_compra_items (
    devolucion_id INTEGER NOT NULL REFERENCES devoluciones_compra (id),
    compra_item_id INTEGER NOT NULL REFERENCES compra_items (id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    valor INTEGER NOT NULL CHECK (valor >= 0),
    PRIMARY KEY (devolucion_id, compra_item_id)
  );
  CREATE INDEX devolucion_compra_items_item ON devolucion_compra_items (compra_item_id);

  ALTER TABLE movimientos_caja ADD COLUMN devolucion_compra_id INTEGER REFERENCES devoluciones_compra (id);
  INSERT INTO categorias_caja (nombre, tipo, sistema) VALUES ('Devolución de compra', 'ingreso', 1);
  `,

  // 10. Costo de cada renglón de venta (el precio de compra del producto al vender), para que la
  // ganancia de los informes no cambie cuando cambia el costo. Las ventas viejas toman el precio de
  // compra que tenía el producto al aplicar esta migración.
  `
  ALTER TABLE venta_items ADD COLUMN costo INTEGER NOT NULL DEFAULT 0 CHECK (costo >= 0);
  UPDATE venta_items
    SET costo = (SELECT precio_compra FROM productos p WHERE p.id = venta_items.producto_id);
  `
]
