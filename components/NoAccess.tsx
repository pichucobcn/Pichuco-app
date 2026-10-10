import { PageTitle } from "./PageTitle";

/** Pantalla para quien no tiene permiso: explica a quién pedírselo. */
export function NoAccess({ title, who, children }: { title: string; who: string; children?: React.ReactNode }) {
  return (
    <main>
      <PageTitle title={title} />
      <div className="card empty">
        <img src="/brand/pichuco-cara.png" alt="" className="ai-face lg" style={{ margin: "0 auto 10px", display: "block" }} />
        <p style={{ margin: 0 }}>Esta sección la gestionan {who}.</p>
        {children ?? (
          <p className="small" style={{ marginBottom: 0 }}>
            Si necesitás algo, decíselo a Pichuco y se lo paso.
          </p>
        )}
      </div>
    </main>
  );
}
