import { requireUserPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiMode } from "@/lib/ai/agent";
import { PageTitle } from "@/components/PageTitle";
import { PichucoChat, type ChatAction, type ChatMessage } from "@/components/PichucoChat";

export default async function PichucoPage() {
  const user = await requireUserPage();
  const rows = await db.aiMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 });
  const initial: ChatMessage[] = rows.reverse().map((m) => ({
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    text: m.text,
    actions: (m.actions as ChatAction[] | null) ?? null,
  }));
  return (
    <main>
      <PageTitle title="Pichuco AI" />
      <section className="ai-hero chat-page">
        <div className="row" style={{ marginBottom: 8 }}>
          <img src="/brand/pichuco-cara.png" alt="" className="ai-face lg" />
          <p className="small muted" style={{ margin: 0 }}>
            Tu asistente operativo. Contale lo que pasa y él lo convierte en tareas, avisos y agenda.
            {aiMode() === "demo" && " (Modo demo: sin API de Claude configurada, entiendo frases sencillas.)"}
          </p>
        </div>
        <PichucoChat
          initial={initial}
          greeting={initial.length ? undefined : `¡Hola, ${user.shortName}! ¿En qué te doy una mano?`}
        />
      </section>
    </main>
  );
}
