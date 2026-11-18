import { fecha, gs, hora, NOMBRE_METODO } from './api'
import Impresion from './Impresion'
import type { Cobro, CuentaCliente } from '../../shared/tipos'

// Recibo de un pago de cuotas o de la entrega de una venta en cuotas.
export default function Recibo({
  cuenta,
  cobro,
  onListo
}: {
  cuenta: CuentaCliente
  cobro: Cobro
  onListo: () => void
}): React.JSX.Element {
  const { cliente } = cuenta
  const ventaEntrega = cobro.esEntrega
    ? cuenta.ventas.find((v) => v.id === cobro.aplicado[0]?.ventaId)
    : undefined
  // En la entrega, el plan completo de esa venta; en un pago, las próximas 3 cuotas impagas.
  const proximas = ventaEntrega
    ? ventaEntrega.cuotas.filter((q) => q.numero > 0)
    : cuenta.ventas
        .flatMap((v) => v.cuotas)
        .filter((q) => q.saldo > 0)
        .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
        .slice(0, 3)

  return (
    <Impresion onListo={onListo}>
      <h2>
        {cobro.esEntrega
          ? `Recibo de entrega · Venta N° ${ventaEntrega?.id ?? ''}`
          : 'Recibo de pago'}{' '}
        N° {cobro.id}
      </h2>
      <p>
        Fecha: {fecha(cobro.fecha)} {hora(cobro.fecha)}
        <br />
        Cliente: {cliente.nombre}
        {cliente.documento && (
          <>
            <br />
            CI/RUC: {cliente.documento}
          </>
        )}
      </p>
      <p className="monto">
        Recibimos {gs(cobro.monto)}
        <br />
        <small>en {NOMBRE_METODO[cobro.metodoPago].toLowerCase()}</small>
      </p>
      <table>
        <tbody>
          {cobro.aplicado.map((a, i) => (
            <tr key={i}>
              <td>
                Venta N° {a.ventaId} · {a.numero === 0 ? 'entrega' : `cuota ${a.numero}`}
              </td>
              <td className="num">{gs(a.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ventaEntrega && (
        <p>
          Total de la compra: {gs(ventaEntrega.total)}
          <br />
          {ventaEntrega.items.map((it) => `${it.cantidad} × ${it.nombre}`).join(', ')}
        </p>
      )}
      {proximas.length > 0 && (
        <>
          <h3>{ventaEntrega ? 'Cuotas' : 'Cuotas pendientes'}</h3>
          <table>
            <tbody>
              {proximas.map((q) => (
                <tr key={q.id}>
                  <td>
                    Cuota {q.numero} · {q.diasAtraso > 0 ? 'venció' : 'vence'} el{' '}
                    {fecha(q.vencimiento)}
                  </td>
                  <td className="num">{gs(q.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p>
        <strong>Saldo pendiente: {gs(cuenta.saldo)}</strong>
        <br />
        <small>Al {fecha(new Date().toLocaleDateString('sv-SE'))}</small>
        <br />
        Atendió: {cobro.usuario}
      </p>
      <p className="firma">Firma: ______________________</p>
    </Impresion>
  )
}
