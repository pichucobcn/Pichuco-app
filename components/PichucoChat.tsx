"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Icon } from "./Icon";

export type ChatAction = { tool: string; ok: boolean; summary: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; actions?: ChatAction[] | null };

const SUGGESTIONS = ["¿Qué tenemos mañana?", "¿Quién trabaja esta noche?", "Mañana hay que preparar 10 milanesas", "Mis pendientes"];

export function ActionsList({ actions }: { actions?: ChatAction[] | null }) {
  if (!actions?.length) return null;
  return (
    <div className="ai-actions">
      <strong>Lo que hizo Pichuco</strong>
      {actions.map((a, i) => (
        <span key={i} className={a.ok ? "ok" : "fail"}>
          {a.summary}
        </span>
      ))}
    </div>
  );
}

/**
 * Conversación con Pichuco AI. `compact` es la versión de la Home: muestra el
 * saludo y sólo el último intercambio.
 */
export function PichucoChat({
  initial,
  greeting,
  compact = false,
}: {
  initial: ChatMessage[];
  greeting?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compact) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, compact]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setText("");
    setMessages((prev) => [...prev, { id: "u" + Date.now(), role: "user", text: m }]);
    setBusy(true);
    try {
      const r = await api<{ text: string; actions: ChatAction[] }>("/api/ai", { message: m });
      setMessages((prev) => [...prev, { id: "a" + Date.now(), role: "assistant", text: r.text, actions: r.actions }]);
      router.refresh();
    } catch (e) {
      setMessages((prev) => [...prev, { id: "e" + Date.now(), role: "assistant", text: `Uy, algo falló: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const shown = compact ? messages.slice(-2) : messages;

  return (
    <>
      <div className="convo" aria-live="polite">
        {greeting && (!compact || shown.length === 0) && <div className="msg ai">{greeting}</div>}
        {shown.map((m) => (
          <div key={m.id} className={`msg ${m.role === "user" ? "user" : "ai"}`}>
            {m.text}
            {m.role === "assistant" && <ActionsList actions={m.actions} />}
          </div>
        ))}
        {busy && (
          <div className="msg ai" aria-label="Pichuco está escribiendo">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje a Pichuco…"
          aria-label="Mensaje para Pichuco AI"
          enterKeyHint="send"
          maxLength={2000}
        />
        <button className="send" type="submit" disabled={busy || !text.trim()} aria-label="Enviar">
          <Icon name="send" />
        </button>
      </form>
      {compact && messages.length === 0 && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip-btn" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
