import type { Metadata } from "next";
import { openDays } from "@/lib/services/availability";
import { getSettings } from "@/lib/services/settings";
import { ReservationForm } from "./ReservationForm";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Reservar mesa · Pichuco" };

export default async function ReservarPage() {
  const [days, s] = await Promise.all([openDays(14), getSettings()]);
  return (
    <main>
      <section className="poster public-poster">
        <img src="/brand/pichuco.png" alt="" className="mascot" />
        <h1 className="public-title">Reservá tu mesa</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Te confirmamos al instante. Para más de {s.maxPartyOnline} personas, llamanos.
        </p>
      </section>
      <ReservationForm days={days} maxParty={s.maxPartyOnline} phone={s.phone} today={todayISO()} />
    </main>
  );
}
