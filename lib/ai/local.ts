import { parseSpanishDate, relativeDay, todayISO } from "../dates";
import { can } from "../permissions";
import type { Actor } from "../services/context";
import { listTasks } from "../services/tasks";
import { executeTool, type AiAction } from "./tools";

/**
 * Intérprete local de Pichuco AI (modo demo, sin API key). Cubre las frases
 * más habituales con reglas simples y usa exactamente las mismas herramientas
 * validadas que el modelo de Claude.
 */

type Reply = { text: string; actions: AiAction[] };

const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
};

function num(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NUM_WORDS[s] ?? NaN;
}

export function parseDelayMinutes(t: string): number | null {
  if (/media hora/.test(t)) return /hora y media/.test(t) ? 90 : 30;
  if (/cuarto de hora/.test(t)) return 15;
  if (/hora y media/.test(t)) return 90;
  const m = t.match(/(\d+|un|una|uno|dos|tres|cinco|diez|quince|veinte|treinta|cuarenta)\s*(min|minutos|mins|'|horas?|h)\b/);
  if (m) {
    const n = num(m[1]);
    return /^h/.test(m[2]) ? n * 60 : n;
  }
  return null;
}

function reasonOf(text: string): string | undefined {
  const m = text.match(/\b(?:porque|ya que|por)\s+(.+?)[.!]?$/i);
  return m ? m[1].trim() : undefined;
}

const TEAM_NAMES = ["martín", "martin", "gian", "juan pablo", "juanpa", "juan", "eva"];

function firstName(t: string): string | undefined {
  return TEAM_NAMES.find((n) => new RegExp(`(^|\\s|a\\s)${n}\\b`).test(t));
}

function stripDateWords(s: string): string {
  return s
    .replace(/\b(para\s+)?(pasado\s+)?mañana\b/g, "")
    .replace(/\b(para\s+)?(hoy|esta noche|esta tarde)\b/g, "")
    .replace(/\b(para\s+)?el\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/g, "")
    .replace(/\bantes de las\s+\d{1,2}(:\d{2})?\b/g, "")
    .replace(/\bpara las\s+\d{1,2}(:\d{2})?\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;!]+$/, "")
    .trim();
}

function dueTimeOf(t: string): string | undefined {
  const m = t.match(/\b(?:antes de las|para las|a las|hasta las)\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function call(actor: Actor, input: string, actions: AiAction[], tool: string, args: unknown) {
  const r = await executeTool(actor, tool, args, { input, viaAi: true });
  if (r.action) actions.push(r.action);
  const data = JSON.parse(r.content);
  return { ok: !r.isError, data };
}

export async function localAgent(actor: Actor, input: string): Promise<Reply> {
  const t = input.toLowerCase().trim();
  const today = todayISO();
  const date = parseSpanishDate(t, today) ?? today;
  const actions: AiAction[] = [];

  // 1) Ausencias
  if (/\b(no (voy a )?(ir|venir|puedo (ir|venir))|no vengo|no voy|falto|estoy enferm[oa])\b/.test(t)) {
    const r = await call(actor, input, actions, "report_absence", { date, reason: reasonOf(input) });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    const conf = r.data.conflicts.length
      ? `\n\nQueda sin cubrir:\n${r.data.conflicts.map((c: any) => `• ${c.title}${c.time ? " " + c.time : ""}`).join("\n")}`
      : "";
    return {
      text: `Entendido. Registré que ${relativeDay(date)} no venís.${conf}\n\nAvisé a ${r.data.notified.join(" y ") || "los responsables"}. ¡Que te mejores!`,
      actions,
    };
  }

  // 2) Retrasos
  const delay = parseDelayMinutes(t);
  if (delay && /\b(tarde|retraso|demoro|llego|llega|entro)\b/.test(t)) {
    const self = /\b(llego|entro|me demoro|voy a llegar|tengo)\b/.test(t);
    const other = !self ? firstName(t) : undefined;
    const r = await call(actor, input, actions, "report_delay", {
      date,
      minutes: delay,
      reason: reasonOf(input),
      user_name: other,
    });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    const who = other ? `${r.data.user} entrará` : "entrarás";
    let text = `Entendido. He registrado que ${relativeDay(date)} ${who} ${delay} minutos tarde`;
    text += r.data.newStart ? ` (a las ${r.data.newStart}).` : ".";
    if (r.data.conflicts.length) {
      const c = r.data.conflicts
        .map((c: any) => {
          const what = c.kind === "tarea" ? `la tarea “${c.title}”` : c.kind === "entrega" ? `la entrega de ${c.title.toLowerCase()}` : `${c.kind} “${c.title}”`;
          return `${what}${c.time ? ` prevista a las ${c.time}` : ""}`;
        })
        .join(" y ");
      text += `\n\n${other ? "Tenía" : "Tenés"} ${c}. He avisado a ${r.data.notified.join(" y ")} para que quede cubierta.`;
    } else if (r.data.notified.length) {
      text += `\n\nNo afecta a ninguna entrega ni tarea. Avisé a ${r.data.notified.join(" y ")}.`;
    }
    return { text, actions };
  }

  // 3) Compras (Fase 2): se anota como tarea administrativa para el jefe.
  if (/\b(compr[aá]|comprar|ped[ií]|ped[ií]le|necesitamos)(?![a-zñáéíóú])/.test(t) && /\d/.test(t)) {
    const what = stripDateWords(input.replace(/^.*?\b(compr[aá]r?|ped[ií](le)?( al proveedor)?|necesitamos)(?![a-zñáéíóú])\s*/i, ""));
    const r = await call(actor, input, actions, "create_task", {
      title: `Comprar ${what}`,
      kind: "ADMINISTRATIVA",
      area: "ADMIN",
      date,
      priority: "ALTA",
      ...(can(actor, "tareas_crear") ? { assignee_name: "Martín" } : {}),
    });
    if (!r.ok) return { text: `No pude anotarlo: ${r.data.error}`, actions };
    return {
      text: `El módulo de compras y proveedores llega en la Fase 2, así que todavía no puedo enviar el pedido.\n\nMientras tanto lo dejé anotado como tarea: “Comprar ${what}” para ${relativeDay(date)}.`,
      actions,
    };
  }

  // 4) Avisos a personas concretas
  const msg = input.match(/\b(?:avis[aá]le|decile|dile|avisa|recordale)\s+a\s+([a-záéíóúñ]+(?:\s+pablo)?)\s+(?:que\s+)?(.+)$/i);
  if (msg) {
    const r = await call(actor, input, actions, "send_team_message", { recipients: [msg[1]], message: cap(msg[2].trim()) });
    if (!r.ok) return { text: `No pude enviarlo: ${r.data.error}`, actions };
    return { text: `Listo, le avisé a ${r.data.sentTo}: “${cap(msg[2].trim())}”.`, actions };
  }

  // 5) Comunicados
  const ann = input.match(/^(?:comunicado|publicá|publica|avis[aá] a todos)\s*(?:un comunicado)?\s*(?:que|:)?\s*(.+)$/i);
  if (ann) {
    const body = cap(ann[1].trim());
    const level = /urgente/i.test(input) ? "URGENTE" : /importante/i.test(input) ? "IMPORTANTE" : "GENERAL";
    const title = body.split(/[.!\n]/)[0].slice(0, 80);
    const r = await call(actor, input, actions, "create_announcement", { title, body, level });
    if (!r.ok) return { text: `No pude publicarlo: ${r.data.error}`, actions };
    return { text: `Publiqué el comunicado “${title}”. Todo el equipo lo verá en Comunicados y podré decirte quién lo leyó.`, actions };
  }

  // 6) Producción
  const prod = t.match(
    /\b(?:hay que|tenemos que|preparar|prepará|hacer|haceme|producir)\s+(?:preparar\s+|hacer\s+)?(\d+(?:[.,]\d+)?|un|una|dos|tres|cuatro|cinco|seis|ocho|diez|doce|quince|veinte)\s*(kg|kilos?|g|l|litros?|bandejas?|unidades?|porciones?)?\s*(?:de\s+)?(.+)$/,
  );
  if (prod) {
    const unitRaw = prod[2];
    const unit = unitRaw ? (/^k/.test(unitRaw) ? "kg" : /^l/.test(unitRaw) ? "l" : /^unidad/.test(unitRaw) ? undefined : unitRaw) : undefined;
    const item = stripDateWords(prod[3]);
    const r = await call(actor, input, actions, "create_production_task", {
      item,
      quantity: num(prod[1]),
      unit,
      date,
      due_time: dueTimeOf(t),
      priority: /urgente|important/.test(t) ? "ALTA" : "MEDIA",
    });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    return {
      text: `Hecho. Registré la producción:\n\n• ${r.data.title}\n• Fecha: ${relativeDay(date)}${r.data.dueTime ? `\n• Hora límite: ${r.data.dueTime}` : ""}\n• Área: cocina\n• Estado: pendiente\n\nCocina lo va a ver en Tareas.`,
      actions,
    };
  }

  // 7) ¿Quién trabaja?
  if (/qui[eé]n(es)?\s+(trabaja|viene|est[aá]|entra)/.test(t)) {
    const r = await call(actor, input, actions, "get_staff_status", { date });
    const staff = r.data.working as any[];
    if (!staff.length) return { text: `No hay turnos cargados para ${relativeDay(date)}.`, actions };
    const lines = staff.map((p) =>
      p.absent ? `• ${p.name} — no viene` : `• ${p.name} ${p.effectiveStart}–${p.end}${p.delayMinutes ? ` (llega ${p.delayMinutes}' tarde)` : ""}`,
    );
    return { text: `${cap(relativeDay(date))} trabajan:\n\n${lines.join("\n")}`, actions };
  }

  // 8) Pendientes
  if (/pendiente|qu[eé] (tengo|me toca|hay) que hacer|mis tareas/.test(t)) {
    const r = await call(actor, input, actions, "get_pending_items", {});
    const tasks = r.data.tasks as any[];
    const ann = r.data.unreadAnnouncements as any[];
    const lines = tasks.map((x) => `• ${x.title}${x.date ? ` (${relativeDay(x.date)}${x.dueTime ? " " + x.dueTime : ""})` : ""}`);
    let text = tasks.length ? `Tenés ${tasks.length} pendientes:\n\n${lines.join("\n")}` : "No tenés tareas pendientes. 🙌";
    if (ann.length) text += `\n\nY ${ann.length} ${ann.length === 1 ? "comunicado sin leer" : "comunicados sin leer"}.`;
    return { text, actions };
  }

  // 9) Completar tareas: "terminé las milanesas", "ya está la masa"
  const done = t.match(/\b(?:termin[eé]|ya (?:est[aá]n?|hice|hicimos)|complet[eé]|listas?|listos?)\s+(?:las?|los?|el)?\s*(.+)$/);
  if (done) {
    const words = done[1].split(/\s+/).filter((w) => w.length > 3);
    const open = await listTasks(actor, { status: "ABIERTAS" });
    const match = open.find((x) => words.some((w) => x.title.toLowerCase().includes(w.replace(/s$/, ""))));
    if (match) {
      const r = await call(actor, input, actions, "complete_task", { task_id: match.id });
      if (!r.ok) return { text: `No pude marcarla: ${r.data.error}`, actions };
      return { text: `¡Bien ahí! Marqué como completada “${match.title}”.`, actions };
    }
  }

  // 10) Tareas genéricas
  const task = input.match(/^(?:tarea|nueva tarea|anot[aá]|record[aá](?:me)?|hay que)\s*:?\s*(.+)$/i);
  if (task) {
    let rest = task[1];
    let assignee: string | undefined;
    const para = rest.match(/\b(?:para|a)\s+(martín|martin|gian|juan pablo|eva)\b/i);
    if (para) {
      assignee = para[1];
      rest = rest.replace(para[0], "");
    }
    const title = cap(stripDateWords(rest));
    const r = await call(actor, input, actions, "create_task", {
      title,
      assignee_name: assignee,
      date: parseSpanishDate(t, today) ?? undefined,
      due_time: dueTimeOf(t),
      kind: /limpi/.test(t) ? "LIMPIEZA" : /arregl|reparar|mantenimiento/.test(t) ? "MANTENIMIENTO" : "GENERAL",
    });
    if (!r.ok) return { text: `No pude crear la tarea: ${r.data.error}`, actions };
    return {
      text: `Anotado: “${r.data.title}”${r.data.assignee ? ` para ${r.data.assignee}` : ""}${r.data.date ? `, ${relativeDay(r.data.date)}` : ""}.`,
      actions,
    };
  }

  // 11) Resumen / agenda
  if (/qu[eé] (tenemos|hay)|resumen|agenda|c[oó]mo viene|reservas|pedidos/.test(t) || parseSpanishDate(t, today)) {
    const r = await call(actor, input, actions, "get_schedule", { date });
    return { text: r.data.formatted, actions };
  }

  return {
    text:
      "No te entendí del todo 🤔 (estoy en modo demo, sin conexión a Claude). Probá con algo como:\n\n" +
      "• “Mañana llego 30 minutos tarde porque tengo médico.”\n" +
      "• “Mañana hay que preparar 10 milanesas.”\n" +
      "• “Avisale a Gian que mañana llega harina a las 18.”\n" +
      "• “¿Qué tenemos mañana?”\n" +
      "• “¿Quién trabaja esta noche?”",
    actions,
  };
}
