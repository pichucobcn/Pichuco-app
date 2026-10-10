import type { Metadata } from "next";
import { openDays } from "@/lib/services/availability";
import { getSettings } from "@/lib/services/settings";
import { getMenu } from "@/lib/services/takeaway";
import { paymentsMode } from "@/lib/services/payments";
import { todayISO } from "@/lib/dates";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Pedir para llevar · Pichuco" };

export default async function PedirPage() {
  const [days, s, menu] = await Promise.all([openDays(7), getSettings(), getMenu()]);
  return (
    <main>
      <section className="poster public-poster">
        <img src="/brand/pichuco.png" alt="" className="mascot" />
        <h1 className="public-title">Pizza para llevar</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Elegí, reservá la hora y pasá a buscarla calentita.
        </p>
      </section>
      <OrderForm
        days={days}
        today={todayISO()}
        items={menu.items.map((i) => ({ id: i.id, category: i.category, name: i.name, description: i.description, price: i.price, isPizza: i.isPizza }))}
        extras={menu.extras.map((e) => ({ id: e.id, name: e.name, price: e.price }))}
        onlinePayments={s.onlinePayments && paymentsMode() !== "off"}
      />
    </main>
  );
}
