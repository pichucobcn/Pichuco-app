import { notFound } from "next/navigation";
import { getReservationByCode, RES_STATUS_LABEL } from "@/lib/services/reservations";
import { fromDbDate, prettyDate } from "@/lib/dates";
import { CancelButton } from "@/components/public/CancelButton";

export default async function ReservaPage({ params }: { params: Promise<{ code: string }> }) {
  const r = await getReservationByCode((await params).code);
  if (!r) notFound();
  const cancelled = r.status === "CANCELADA";
  return (
    <main>
      <section className="poster public-poster">
        <img src="/brand/pichuco.png" alt="" className="mascot" style={{ width: 150 }} />
        <h1 className="public-title">{cancelled ? "Reserva cancelada" : `¡Te esperamos, ${r.customer.name.split(" ")[0]}!`}</h1>
        <div className="confirm-box">
          <div>
            <span className="eyebrow">Día</span>
            <b>{prettyDate(fromDbDate(r.date))}</b>
          </div>
          <div>
            <span className="eyebrow">Hora</span>
            <b>{r.time}</b>
          </div>
          <div>
            <span className="eyebrow">Personas</span>
            <b>{r.people}</b>
          </div>
        </div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Estado: <b>{RES_STATUS_LABEL[r.status]}</b> · Código <b>{r.code}</b>
        </p>
        <p className="small muted" style={{ margin: "4px 0 0" }}>Guardá esta página para consultar o cancelar tu reserva.</p>
      </section>
      {r.status === "CONFIRMADA" && <CancelButton url={`/api/public/reservations/${r.code}/cancel`} label="Cancelar reserva" confirm="¿Seguro que querés cancelar la reserva?" />}
    </main>
  );
}
