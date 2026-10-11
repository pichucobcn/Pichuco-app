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
  let t = input.toLowerCase().trim();
  const today = todayISO();
  const date = parseSpanishDate(t, today) ?? today;
  const actions: AiAction[] = [];

  // 0a) Temperaturas: "la cámara 1 está a 3 grados", "congelador -19°"
  const eqWord = t.match(/(c[aá]mara(?:\s*(?:n[ºo°]?\s*)?\d+)?|congelador(?:\s*\d+)?|arc[oó]n|(?:nevera|heladera)(?:\s+de\s+[a-záéíóúñ]+)?|mesa fr[ií]a|frigo[a-z]*)/);
  const tempVal = t.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|º|grados?)/) ?? (eqWord ? t.match(/\ba\s+(-?\d+(?:[.,]\d+)?)\b/) : null);
  if (eqWord && tempVal && can(actor, "sanidad")) {
    const value = num(tempVal[1]);
    const action = input.match(/(?:ya\s+|y\s+)((?:cerr|ajust|mov|pas|baj|sub|revis|llam|arregl)[a-záéíóúñ]+.+)$/i)?.[1];
    const r = await call(actor, input, actions, "register_temperature", { equipment: eqWord[1], value, corrective_action: action });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    if (!r.data.outOfRange) return { text: `Anotado: ${r.data.equipment} a ${value} °C. Todo en rango (${r.data.range}).`, actions };
    return {
      text: r.data.incidentOpen
        ? `Ojo: ${r.data.equipment} está a ${value} °C, fuera de rango (${r.data.range}). Abrí una incidencia y avisé a los responsables.\n\n¿Qué hiciste? Por ejemplo: “cerré bien la puerta y vuelvo a medir en 30 minutos”. Podés anotarlo en Sanidad → Incidencias.`
        : `Anotado: ${r.data.equipment} a ${value} °C, fuera de rango (${r.data.range}). Quedó registrada la acción correctora.`,
      actions,
    };
  }

  // 0b) Limpieza: "limpié la campana", "desinfecté las tablas"
  const clean = input.match(/\b(?:limpi[eé]|limpiamos|desinfect[eé]|desinfectamos|ya est[aá] limpi[ao])\s+(?:el |la |los |las )?(.+?)[.!]?$/i);
  if (clean && can(actor, "sanidad")) {
    const r = await call(actor, input, actions, "register_cleaning", { item: clean[1] });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    return { text: `Hecho: limpieza de ${r.data.item.toLowerCase()} registrada.`, actions };
  }

  // 0c) Elaboraciones: "hice 8 kg de masa", "preparé salsa de tomate"
  const elab = t.match(/\b(?:hice|hicimos|prepar[eé]|preparamos|elabor[eé]|elaboramos)\s+(?:(\d+(?:[.,]\d+)?)\s*(kg|kilos?|l|litros?|unidades?|bandejas?)?\s*(?:de\s+)?)?(.+?)[.!]?$/);
  if (elab && can(actor, "sanidad")) {
    const unit = elab[2] ? (/^k/.test(elab[2]) ? "kg" : /^l/.test(elab[2]) ? "l" : elab[2]) : undefined;
    const r = await call(actor, input, actions, "register_elaboration", { product: stripDateWords(elab[3]), quantity: elab[1] ? num(elab[1]) : undefined, unit });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    return {
      text: `Registrado: ${r.data.name}, lote ${r.data.lot}. Consumir antes del ${relativeDay(r.data.expires)}.${r.data.allergens.length ? ` Alérgenos: ${r.data.allergens.join(", ").toLowerCase()}.` : ""}\n\nLa etiqueta está lista para imprimir en Sanidad → Etiquetas.`,
      actions,
    };
  }

  // 0d) Estado de controles: "¿qué controles faltan?", "¿qué caduca hoy?"
  if (/(qu[eé] controles|controles (pendientes|de hoy)|\bappcc\b|qu[eé] (caduca|vence)|c[oó]mo (estamos|vamos) (de|con) sanidad)/.test(t) && can(actor, "sanidad")) {
    const r = await call(actor, input, actions, "get_food_safety_status", {});
    const d = r.data;
    const parts: string[] = [];
    if (d.temperaturesPending.length) parts.push(`Temperaturas por tomar:\n${d.temperaturesPending.map((x: any) => `• ${x.equipment} (${x.done}/${x.required})`).join("\n")}`);
    if (d.cleaningPending.length) parts.push(`Limpieza pendiente:\n${d.cleaningPending.map((x: any) => `• ${x.item}`).join("\n")}`);
    if (d.expiring.length) parts.push(`Por caducar:\n${d.expiring.map((x: any) => `• ${x.name} (lote ${x.lot}) — ${x.state === "caducado" ? "caducado" : `caduca ${x.state}`}`).join("\n")}`);
    if (d.openIncidents.length) parts.push(`Incidencias abiertas:\n${d.openIncidents.map((x: string) => `• ${x}`).join("\n")}`);
    return { text: parts.length ? parts.join("\n\n") : "Los controles de hoy están al día.", actions };
  }

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

  // 3) Compras: "Comprá 15 kilos de mozzarella", "Necesitamos 20 kg de harina para mañana"
  if (/\b(compr[aá]|comprar|ped[ií]|ped[ií]le|necesitamos|hace falta)(?![a-zñáéíóú])/.test(t) && /\d/.test(t)) {
    // "…, que llamen antes a Juan Pablo"
    const cbMatch = t.match(/,?\s*(?:que\s+)?llam(?:en|ar|e)\s+(?:antes\s+)?a\s+(martín|martin|gian|juan pablo)(?:\s+antes)?/);
    const callBefore = cbMatch?.[1];
    if (cbMatch) t = t.replace(cbMatch[0], "");
    const rest = stripDateWords(t.replace(/^.*?\b(compr[aá]r?|ped[ií](le)?( al proveedor)?|necesitamos|hace falta)(?![a-zñáéíóú])\s*/, ""));
    const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|l|litros?|cajas?|unidades?|u|sacos?|botellas?|latas?|bandejas?)?\s*(?:de\s+)?(.+)$/);
    const product = m ? m[3].replace(/\s+para\s+.*$/, "").trim() : rest;
    const quantity = m ? num(m[1]) : NaN;
    if (!can(actor, "compras")) {
      const r = await call(actor, input, actions, "send_team_message", {
        recipients: ["Gian"],
        message: `${actor.shortName} pide comprar ${rest}${parseSpanishDate(t, today) ? ` para ${relativeDay(date)}` : ""}.`,
      });
      if (!r.ok) return { text: `No pude avisar: ${r.data.error}`, actions };
      return { text: `Vos no podés hacer pedidos, así que le pasé el pedido a Gian: “comprar ${rest}”.`, actions };
    }
    if (!Number.isFinite(quantity)) return { text: "¿Cuánto hay que pedir? Decime la cantidad, por ejemplo “Comprá 15 kg de mozzarella”.", actions };
    const r = await call(actor, input, actions, "create_purchase_order", {
      items: [{ product, quantity }],
      delivery_date: parseSpanishDate(t, today) ?? undefined,
      call_before: callBefore,
    });
    if (!r.ok) return { text: `No pude preparar el pedido: ${r.data.error}`, actions };
    const o = r.data;
    const state = o.approved
      ? "Quedó aprobado automáticamente. Para enviarlo al proveedor, abrí el pedido en Compras (WhatsApp o email)."
      : o.total === "Sin precio" || /sin precio/.test(o.total)
        ? "Hay productos sin precio cargado, así que lo tiene que aprobar Martín. Ya le avisé."
        : o.approvalLevel === "OBLIGATORIA"
        ? "Supera el límite: necesita aprobación obligatoria de Martín desde la app. Ya le avisé."
        : "Necesita la aprobación de Martín. Ya le avisé.";
    return {
      text: `Preparé el pedido #${o.number} a ${o.supplier}:\n\n• ${o.items}\n• Coste estimado: ${o.total === "Sin precio" ? "sin precio cargado" : o.total}\n• Entrega prevista: ${o.delivery ? relativeDay(o.delivery) + (o.deliveryWindow ? " " + o.deliveryWindow : "") : "a confirmar"}${o.callBefore ? `\n• Llamar antes a: ${o.callBefore}` : ""}\n\n${state}`,
      actions,
    };
  }

  // 3b) Aprobar: "Aprobá el pedido 12"
  const approve = t.match(/\baprob[aá](?:r)?\s+(?:el\s+)?pedido\s+(?:n\.?º?\s*|#)?(\d+)/);
  if (approve) {
    const r = await call(actor, input, actions, "approve_purchase_order", { order_number: Number(approve[1]) });
    if (!r.ok) return { text: `No pude aprobarlo: ${r.data.error}`, actions };
    return { text: `Aprobado el pedido #${r.data.number} a ${r.data.supplier} (${r.data.total}). Ya se puede enviar al proveedor.`, actions };
  }

  // 3c) Llegó un pedido: "llegó el pedido 12", "llegó la harina"
  const arrived = t.match(/\b(?:lleg[oó]|llegaron|recibimos|recib[ií])\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:pedido\s+(?:#\s*)?(\d+)|(.+))$/);
  if (arrived && can(actor, "compras")) {
    let number = arrived[1] ? Number(arrived[1]) : NaN;
    if (!Number.isFinite(number)) {
      const list = await call(actor, input, actions, "get_purchase_orders", { status: "ABIERTOS" });
      const word = (arrived[2] ?? "").replace(/[.!]$/, "").trim().replace(/s$/, "");
      const found = (list.data as any[]).find(
        (o) => ["Pedido enviado", "Confirmado"].includes(o.status) && (o.items.toLowerCase().includes(word) || o.supplier.toLowerCase().includes(word)),
      );
      if (!found) return { text: `No encuentro un pedido abierto de “${word}”. Decime el número de pedido.`, actions };
      number = found.number;
    }
    const r = await call(actor, input, actions, "receive_purchase_order", { order_number: number });
    if (!r.ok) return { text: `No pude registrarlo: ${r.data.error}`, actions };
    return { text: `Registré la entrega del pedido #${r.data.number} (${r.data.supplier}) y sumé al stock: ${r.data.items}.`, actions };
  }

  // 3d) Stock: "¿qué falta comprar?", "¿cuánta mozzarella queda?"
  if (/qu[eé] (falta|hay que) (comprar|pedir)|stock bajo|bajo m[ií]nimo|qu[eé] nos falta/.test(t)) {
    const r = await call(actor, input, actions, "get_low_stock", {});
    if (!r.ok) return { text: `No puedo consultarlo: ${r.data.error}`, actions };
    const list = r.data as any[];
    if (!list.length) return { text: "Está todo por encima del mínimo. No hace falta comprar nada por ahora.", actions };
    return {
      text: `Por debajo del mínimo:\n\n${list.map((p) => `• ${p.name}: ${p.stock} (mínimo ${p.min}). Sugiero pedir ${p.suggestedOrder} ${p.unit}${p.supplier ? ` a ${p.supplier}` : ""}.`).join("\n")}\n\nDecime “Comprá …” y preparo el pedido.`,
      actions,
    };
  }
  const stockQ = t.match(/\b(?:cu[aá]nt[oa]s?|stock de|queda(?:n)?|hay)\s+(?:de\s+)?([a-záéíóúñ ]+?)(?:\s+(?:queda|quedan|hay|tenemos))?\??$/);
  if (stockQ && can(actor, "stock") && !/qui[eé]n|tarea|pedido|personas/.test(t)) {
    const r = await call(actor, input, actions, "get_stock", { product: stockQ[1].replace(/^(la|el|los|las)\s+/, "").trim() });
    if (r.ok && r.data.name) {
      const p = r.data;
      return {
        text: `${p.name}: quedan ${p.stock} (mínimo ${p.min}).${p.low ? ` Está por debajo del mínimo: sugiero pedir ${p.suggestedOrder}${p.supplier ? ` a ${p.supplier}` : ""}.` : ""}${p.lastPrice ? ` Último precio: ${p.lastPrice}.` : ""}`,
        actions,
      };
    }
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
    let text = tasks.length ? `Tenés ${tasks.length} pendientes:\n\n${lines.join("\n")}` : "No tenés tareas pendientes.";
    if (ann.length) text += `\n\nY ${ann.length} ${ann.length === 1 ? "comunicado sin leer" : "comunicados sin leer"}.`;
    const appr = (r.data.approvals ?? []) as any[];
    if (appr.length) text += `\n\nCompras para aprobar:\n${appr.map((o) => `• Pedido #${o.number} · ${o.supplier} — €${o.total.toFixed(2).replace(".", ",")}`).join("\n")}`;
    if (r.data.lowStock?.length) text += `\n\nBajo mínimo: ${r.data.lowStock.join(", ")}.`;
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
  if (/qu[eé] (tenemos|hay)|resumen|agenda|c[oó]mo viene/.test(t) || parseSpanishDate(t, today)) {
    const r = await call(actor, input, actions, "get_schedule", { date });
    return { text: r.data.formatted, actions };
  }

  return {
    text:
      "No te entendí del todo (estoy en modo demo, sin conexión a Claude). Probá con algo como:\n\n" +
      "• “Mañana llego 30 minutos tarde porque tengo médico.”\n" +
      "• “Mañana hay que preparar 10 milanesas.”\n" +
      "• “Avisale a Gian que mañana llega harina a las 18.”\n" +
      "• “¿Qué tenemos mañana?”\n" +
      "• “¿Quién trabaja esta noche?”\n" +
      "• “Comprá 15 kilos de mozzarella.”\n" +
      "• “¿Qué falta comprar?”",
    actions,
  };
}
