import { fecha, gs, hora, NOMBRE_METODO } from './api'
import Impresion from './Impresion'
import type { Venta } from '../../shared/tipos'

// Ticket de una venta, al cobrar o reimpreso desde la lista. En cuotas, el plan va en el
// recibo de la entrega.
export default function Ticket({
  venta: v,
  onListo
}: {
  venta: Venta
  onListo: () => void
}): React.JSX.Element {
  const unidades = v.items.reduce((s, it) => s + it.cantidad, 0)
  return (
    <Impresion onListo={onListo}>
      <h2>
        Ticket N° {String(v.id).padStart(6, '0')}
        {v.anulada && ' · ANULADA'}
      </h2>
      <p>
        Fecha: {fecha(v.fecha)} {hora(v.fecha)}
        {v.cliente && (
          <>
            <br />
            Cliente: {v.cliente}
          </>
        )}
      </p>
      <table>
        <tbody>
          {v.items.map((it, i) => (
            <tr key={i}>
              <td>
                {it.nombre}
                <br />
                <small>
                  {it.cantidad} × {gs(it.precio)}
                </small>
              </td>
              <td className="num">{gs(it.subtotal)}</td>
            </tr>
          ))}
          {v.descuento > 0 && (
            <>
              <tr>
                <td>Subtotal</td>
                <td className="num">{gs(v.subtotal)}</td>
              </tr>
              <tr>
                <td>Descuento</td>
                <td className="num">−{gs(v.descuento)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {v.devuelto > 0 && (
        <p>
          Devoluciones: −{gs(v.devuelto)}
          <br />
          {v.items
            .filter((it) => it.devueltos > 0)
            .map((it) => `${it.devueltos} × ${it.nombre}`)
            .join(', ')}
        </p>
      )}
      <p className="monto">
        Total {gs(v.total)}
        <br />
        <small>
          {v.condicion === 'cuotas'
            ? `En cuotas${v.entrega ? ` · entrega ${gs(v.entrega)} en ${NOMBRE_METODO[v.metodoPago].toLowerCase()}` : ''}`
            : `Pagado en ${NOMBRE_METODO[v.metodoPago].toLowerCase()}`}
        </small>
      </p>
      <p>
        {unidades} {unidades === 1 ? 'unidad' : 'unidades'} · Atendió: {v.usuario}
      </p>
      <p>
        <small>Comprobante interno, no válido como factura.</small>
        <br />
        ¡Gracias por su compra!
      </p>
    </Impresion>
  )
}
