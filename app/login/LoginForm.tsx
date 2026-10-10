"use client";
import { useState } from "react";
import { api } from "@/components/api";

const DEMO_USERS = [
  { email: "martin@pichuco.es", name: "Martín", role: "Jefe" },
  { email: "gian@pichuco.es", name: "Gian", role: "Jefe de cocina" },
  { email: "juanpablo@pichuco.es", name: "Juan Pablo", role: "Cocinero" },
  { email: "eva@pichuco.es", name: "Eva", role: "Camarera" },
];

export function LoginForm({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [demoCode, setDemoCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function requestCode(e?: string) {
    const target = (e ?? email).trim();
    if (!target) return;
    setEmail(target);
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ demoCode?: string }>("/api/auth/request", { email: target });
      setDemoCode(r.demoCode);
      if (r.demoCode) setCode(r.demoCode);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/verify", { email, code });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ textAlign: "left", paddingTop: 26 }}>
      {step === "email" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            requestCode();
          }}
        >
          <div className="field">
            <label htmlFor="email">Tu email</label>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@pichuco.es" required />
          </div>
          <button className="btn block" disabled={busy}>
            Recibir código de acceso
          </button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="small muted" style={{ margin: 0 }}>
            Te mandamos un código de 6 dígitos a <b>{email}</b>.
          </p>
          {demoCode && (
            <p className="small" style={{ margin: 0 }}>
              <span className="tag amber">Demo</span> Tu código es <b>{demoCode}</b>
            </p>
          )}
          <div className="field">
            <label htmlFor="code">Código</label>
            <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }} />
          </div>
          <button className="btn block" disabled={busy || code.length !== 6}>
            Entrar
          </button>
          <button type="button" className="btn secondary small" onClick={() => setStep("email")}>
            Usar otro email
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {demo && step === "email" && (
        <>
          <div className="divider">o entrá como (datos de prueba)</div>
          <div className="demo-users">
            {DEMO_USERS.map((u) => (
              <button key={u.email} type="button" onClick={() => requestCode(u.email)} disabled={busy}>
                <b>{u.name}</b>
                <span>{u.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
