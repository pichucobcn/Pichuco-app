"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageView } from "@/lib/services/chat";
import { Icon } from "@/components/Icon";

const POLL_MS = 4000;
// Horas siempre en la zona del restaurante, esté donde esté el teléfono.
const TZ = "Europe/Madrid";
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const day = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "numeric", timeZone: TZ });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function Conversation({ id, me, initial, isGroup }: { id: string; me: string; initial: ChatMessageView[]; isGroup: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastAt = useRef(initial.at(-1)?.at);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Consulta periódica de mensajes nuevos (simple y suficiente para el equipo).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      const url = `/api/chat/${id}/messages${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`;
      const r = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (stop || !r?.messages?.length) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = (r.messages as ChatMessageView[]).filter((m) => !known.has(m.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      lastAt.current = r.messages.at(-1).at;
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if ((!text.trim() && !file) || busy) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    form.set("body", text.trim());
    if (replyTo) form.set("replyToId", replyTo.id);
    if (file) form.set("file", file);
    try {
      const res = await fetch(`/api/chat/${id}/messages`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      setText("");
      setFile(null);
      setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
      const r = await fetch(`/api/chat/${id}/messages${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`).then((x) => x.json());
      if (r.messages?.length) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...(r.messages as ChatMessageView[]).filter((m) => !known.has(m.id))];
        });
        lastAt.current = r.messages.at(-1).at;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  let lastDay = "";
  return (
    <section className="ai-hero chat-page team-chat">
      <div className="convo">
        {messages.length === 0 && <p className="empty card-empty">Escribí el primer mensaje.</p>}
        {messages.map((m) => {
          const mine = m.authorId === me;
          const d = day(m.at);
          const showDay = d !== lastDay;
          lastDay = d;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {showDay && <div className="day-sep">{d}</div>}
              <div className={`msg ${mine ? "user" : "ai"} chat-msg`}>
                {!mine && isGroup && (
                  <span className="chat-author" style={{ color: m.authorColor }}>
                    {m.author}
                  </span>
                )}
                {m.replyTo && (
                  <span className="chat-quote">
                    <b>{m.replyTo.author}</b> {m.replyTo.body}
                  </span>
                )}
                {m.attachment &&
                  (m.attachment.mime.startsWith("image/") ? (
                    <a href={`/api/chat/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/chat/attachments/${m.attachment.id}`} alt={m.attachment.name} className="chat-img" />
                    </a>
                  ) : (
                    <a href={`/api/chat/attachments/${m.attachment.id}`} target="_blank" rel="noreferrer" className="chat-file">
                      <Icon name="tasks" size={18} /> {m.attachment.name} <span className="small">({kb(m.attachment.size)})</span>
                    </a>
                  ))}
                {m.body}
                <span className="chat-meta">
                  {time(m.at)}
                  <button type="button" className="reply-btn" onClick={() => setReplyTo(m)} aria-label="Responder">
                    Responder
                  </button>
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {(replyTo || file) && (
        <div className="chat-draft">
          {replyTo && (
            <span>
              Respondiendo a <b>{replyTo.author}</b>: {replyTo.body.slice(0, 60)}
            </span>
          )}
          {file && (
            <span>
              Adjunto: <b>{file.name}</b> ({kb(file.size)})
            </span>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setReplyTo(null);
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Quitar
          </button>
        </div>
      )}
      <form className="composer" onSubmit={send}>
        <input ref={fileRef} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="send attach" onClick={() => fileRef.current?.click()} aria-label="Adjuntar foto o archivo">
          <Icon name="plus" />
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí un mensaje…" aria-label="Mensaje" maxLength={4000} enterKeyHint="send" />
        <button className="send" disabled={busy || (!text.trim() && !file)} aria-label="Enviar">
          <Icon name="send" />
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
