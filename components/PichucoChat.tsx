"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Icon } from "./Icon";

export type ChatAction = { tool: string; ok: boolean; summary: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; actions?: ChatAction[] | null };

const SUGGESTIONS = ["¿Qué tenemos mañana?", "¿Quién trabaja esta noche?", "Mañana hay que preparar 10 milanesas", "Mis pendientes"];

const HEADING = /^[A-ZÁÉÍÓÚÑ ]{4,}$/;

/** Muestra en negrita los rótulos en mayúsculas de las respuestas (p. ej. "ENTREGAS"). */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const isHeading = HEADING.test(line.trim());
        // El salto en blanco antes de un rótulo lo da el propio margen del rótulo.
        if (!line.trim() && HEADING.test(lines[i + 1]?.trim() ?? "")) return null;
        if (!isHeading) return <span key={i}>{line + (i < lines.length - 1 ? "\n" : "")}</span>;
        const title = i === 0 && / EN PICHUCO$/.test(line);
        return (
          <span key={i} className={`heading${title ? " first" : ""}`}>
            {title ? line.charAt(0) + line.slice(1).toLowerCase().replace("pichuco", "Pichuco") : line}
          </span>
        );
      })}
    </>
  );
}

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
        {greeting && (!compact || shown.length === 0) && (
          <div className="ai-row">
            {!compact && <img src="/brand/pichuco-cara.png" alt="" className="ai-face" />}
            <div className="msg ai">{greeting}</div>
          </div>
        )}
        {shown.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg user">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="ai-row">
              {!compact && <img src="/brand/pichuco-cara.png" alt="" className="ai-face" />}
              <div className="msg ai">
                <RichText text={m.text} />
                <ActionsList actions={m.actions} />
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="msg ai" aria-label="Pichuco está escribiendo" style={{ marginLeft: compact ? 0 : 40 }}>
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
