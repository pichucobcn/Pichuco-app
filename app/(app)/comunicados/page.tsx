import { requireUserPage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAnnouncements, LEVEL_LABEL } from "@/lib/services/announcements";
import { dateOf, relativeDay, timeOf } from "@/lib/dates";
import { PageTitle } from "@/components/PageTitle";
import { MarkRead, NewAnnouncement } from "./Client";

export default async function ComunicadosPage() {
  const user = await requireUserPage();
  const items = await listAnnouncements(user);
  return (
    <main>
      <PageTitle title="Comunicados" />
      {can(user, "comunicados_crear") && <NewAnnouncement />}
      <div className="stack" style={{ marginTop: 12 }}>
        {items.length === 0 && <p className="empty">No hay comunicados.</p>}
        {items.map((a) => (
          <article key={a.id} className={`card announcement ${a.level}`}>
            <div className="row">
              <span className="label">Comunicado · {LEVEL_LABEL[a.level]}</span>
              <span className="spacer" />
              {!a.readByMe && <span className="tag solid-red">Nuevo</span>}
            </div>
            <h3>{a.title}</h3>
            {a.body !== a.title && <p>{a.body}</p>}
            <div className="row small muted" style={{ flexWrap: "wrap" }}>
              <span>
                {a.author} · {relativeDay(dateOf(a.createdAt))} {timeOf(a.createdAt)}
              </span>
              {a.createdByAi && <span className="tag ai">vía Pichuco AI</span>}
              <span className="spacer" />
              <span>
                Leído por {a.readCount}/{a.teamSize}
              </span>
            </div>
            {a.readers && (
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Leído por: {a.readers.map((r) => `${r.name} ${timeOf(r.at)}`).join(" · ")}
              </p>
            )}
            {!a.readByMe && <MarkRead id={a.id} />}
          </article>
        ))}
      </div>
    </main>
  );
}
