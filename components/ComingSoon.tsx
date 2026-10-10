import { PageTitle } from "./PageTitle";

export function ComingSoon({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <main>
      <PageTitle title={title} />
      <div className="card empty">
        <img src="/brand/pichuco.svg" alt="" style={{ width: 120 }} />
        <h2 style={{ color: "var(--burgundy)", margin: "8px 0", fontFamily: "var(--font-display)", fontSize: 24 }}>Se viene en la {phase}</h2>
        <div style={{ textAlign: "left" }}>{children}</div>
      </div>
    </main>
  );
}
