"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

/** Cambiar la propia contraseña. */
export function ChangePassword({ minPassword }: { minPassword: number }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  if (!open)
    return (
      <button className="btn small secondary" onClick={() => setOpen(true)}>
        Cambiar mi contraseña
      </button>
    );
  return (
    <form
      className="stack"
      style={{ gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== repeat) return setMsg({ ok: false, text: "Las dos contraseñas nuevas no coinciden." });
        setBusy(true);
        setMsg(undefined);
        try {
          await api("/api/auth/password", { current, password: next });
          setMsg({ ok: true, text: "Contraseña cambiada." });
          setCurrent("");
          setNext("");
          setRepeat("");
          setOpen(false);
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="cp-cur">Contraseña actual</label>
        <input id="cp-cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="cp-new">Nueva (mínimo {minPassword} caracteres)</label>
        <input id="cp-new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={minPassword} />
      </div>
      <div className="field">
        <label htmlFor="cp-rep">Repetila</label>
        <input id="cp-rep" className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={minPassword} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn small" disabled={busy}>
          Guardar
        </button>
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      {msg && <p className={msg.ok ? "small" : "error"}>{msg.text}</p>}
    </form>
  );
}

/** Para Martín: la persona vuelve a entrar con el código del equipo y elige una nueva. */
export function ResetPassword({ userId, name, hasPassword }: { userId: string; name: string; hasPassword: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!hasPassword) return <span className="small muted">Todavía no eligió contraseña</span>;
  return (
    <button
      className="link-btn"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`¿Restablecer la contraseña de ${name}? Va a tener que entrar con el código del equipo y elegir una nueva.`)) return;
        setBusy(true);
        try {
          await api(`/api/team/${userId}/reset-password`, {});
          router.refresh();
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Restablecer contraseña
    </button>
  );
}
