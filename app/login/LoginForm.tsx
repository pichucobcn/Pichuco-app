"use client";
import { useState } from "react";
import { api } from "@/components/api";

type Person = { id: string; name: string; role: string; hasPassword: boolean };

/**
 * Entrar: 1) tocar tu nombre, 2) tu contraseña. La primera vez se usa el código
 * del equipo que reparte Martín y después cada uno elige la suya.
 */
export function LoginForm({ people, minPassword }: { people: Person[]; minPassword: number }) {
  const [who, setWho] = useState<Person | null>(null);
  const [step, setStep] = useState<"who" | "password" | "setup">("who");
  const [password, setPassword] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function choose(p: Person) {
    setWho(p);
    setStep("password");
    setPassword("");
    setError(undefined);
  }

  async function login() {
    if (!who) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ setup?: boolean }>("/api/auth/login", { userId: who.id, password });
      if (r.setup) {
        setTeamCode(password);
        setStep("setup");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function setup() {
    if (!who) return;
    if (newPassword !== repeat) return setError("Las dos contraseñas no coinciden.");
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/setup", { userId: who.id, teamCode, password: newPassword });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card stack login-card">
      {step === "who" && (
        <>
          <h2 className="login-h">¿Quién sos?</h2>
          <div className="demo-users">
            {people.map((p) => (
              <button key={p.id} type="button" onClick={() => choose(p)}>
                <b>{p.name}</b>
                <span>{p.role}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "password" && who && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <h2 className="login-h">Hola, {who.name}</h2>
          {who.hasPassword ? (
            <div className="field">
              <label htmlFor="pw">Tu contraseña</label>
              <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            </div>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                Es tu primera vez. Escribí el <b>código del equipo</b> que te pasó Martín; después vas a elegir tu propia contraseña.
              </p>
              <div className="field">
                <label htmlFor="pw">Código del equipo</label>
                <input id="pw" className="input" autoComplete="off" autoCapitalize="none" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
              </div>
            </>
          )}
          <button className="btn block" disabled={busy || !password}>
            {who.hasPassword ? "Entrar" : "Seguir"}
          </button>
          {who.hasPassword && <p className="small muted" style={{ margin: 0 }}>¿Te la olvidaste? Pedile a Martín que la restablezca desde Equipo.</p>}
          <button type="button" className="btn ghost small" onClick={() => setStep("who")}>
            No soy {who.name}
          </button>
        </form>
      )}

      {step === "setup" && who && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setup();
          }}
        >
          <h2 className="login-h">Elegí tu contraseña</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Es sólo tuya: con ella vas a entrar a partir de ahora. Mínimo {minPassword} caracteres.
          </p>
          <div className="field">
            <label htmlFor="np">Contraseña nueva</label>
            <input id="np" className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus required minLength={minPassword} />
          </div>
          <div className="field">
            <label htmlFor="rp">Repetila</label>
            <input id="rp" className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={minPassword} />
          </div>
          <button className="btn block" disabled={busy || newPassword.length < minPassword || !repeat}>
            Guardar y entrar
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
