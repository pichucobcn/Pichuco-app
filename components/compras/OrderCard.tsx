import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { fromDbDate, relativeDay } from "@/lib/dates";

export const STATUS_TONE: Record<OrderStatus, string> = {
  BORRADOR: "brown",
  PENDIENTE_APROBACION: "amber",
  APROBADO: "red",
  ENVIADO: "brown",
  CONFIRMADO: "green",
  ENTREGADO: "green",
  CANCELADO: "brown",
};

export function OrderCard({
  o,
}: {
  o: {
    number: number;
    status: OrderStatus;
    statusLabel: string;
    supplier: string;
    total: string;
    items: string;
    deliveryDate: Date | null;
    deliveryTime: string | null;
    deliveryTimeTo?: string | null;
    createdBy: string;
    createdByAi: boolean;
  };
}) {
  return (
    <Link href={`/compras/${o.number}`} className="card order-card">
      <div className="row">
        <span className="order-num">#{o.number}</span>
        <b style={{ flex: 1, minWidth: 0 }}>{o.supplier}</b>
        <b className="order-total">{o.total}</b>
      </div>
      <div className="small muted" style={{ margin: "4px 0 8px" }}>
        {o.items}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 5 }}>
        <span className={`tag ${STATUS_TONE[o.status]}`}>{o.statusLabel}</span>
        {o.deliveryDate && !["ENTREGADO", "CANCELADO"].includes(o.status) && (
          <span className="tag brown">
            Entrega {relativeDay(fromDbDate(o.deliveryDate))}
            {o.deliveryTime ? ` ${o.deliveryTimeTo ? `${o.deliveryTime}–${o.deliveryTimeTo}` : o.deliveryTime}` : ""}
          </span>
        )}
        <span className="tag brown">{o.createdBy}</span>
        {o.createdByAi && <span className="tag ai">Pichuco AI</span>}
      </div>
    </Link>
  );
}
