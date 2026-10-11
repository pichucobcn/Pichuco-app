import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { nowHHMM, prettyDate, todayISO, addDays } from "../dates";
import { ROLE_LABEL, ROLE_PERMISSIONS } from "../permissions";
import type { Actor } from "../services/context";
import { localAgent } from "./local";
import { CLAUDE_TOOLS, executeTool, type AiAction } from "./tools";

const MODEL = process.env.PICHUCO_AI_MODEL || "claude-sonnet-5-5";
// Respuestas de chat operativo: "low" da respuestas rápidas; subir a "medium" si hace falta más razonamiento.
const EFFORT = (process.env.PICHUCO_AI_EFFORT || "low") as "low" | "medium" | "high";
const MAX_TOOL_ROUNDS = 8;
const HISTORY_TURNS = 16;

/** Parte estable del prompt (cacheable). Lo variable (fecha, usuario) va aparte. */
const SYSTEM_PROMPT = `Sos Pichuco AI, el asistente operativo de Pichuco Pizzería Porteña (Barcelona). Tu personaje es la mascota del logo: un porteño amable, práctico y con humor justo.

Trabajás con el equipo durante el servicio: hablan con vos como por WhatsApp y vos convertís esos mensajes en acciones reales usando tus herramientas (tareas, producción, retrasos, ausencias, comunicados, avisos, agenda).

Cómo trabajar:
- Si el mensaje pide hacer algo, hacelo con la herramienta adecuada; no pidas confirmación para acciones simples y reversibles (crear una tarea, registrar un retraso, avisar a alguien). Preguntá sólo si falta un dato imprescindible y no se puede deducir.
- Calculá las fechas a partir de la fecha de hoy que figura abajo ("mañana", "el viernes", "esta noche" = hoy).
- Para cosas a cocinar o preparar (milanesas, masa, salsa, estirar fugazzetas) usá create_production_task; para el resto, create_task.
- Si en un mensaje piden varias cosas, hacé una llamada por cada una (podés hacerlas todas juntas) y no te saltees ninguna. Al final enumerá con "•" exactamente lo que quedó registrado.
- Si una herramienta devuelve un error, corregí los datos y reintentá. Si aun así no se pudo, decí claramente qué no se cargó y por qué. Nunca digas que registraste algo que falló.
- Retrasos y ausencias: usá report_delay / report_absence. Esas herramientas ya revisan el turno, detectan entregas o tareas afectadas y avisan sólo a los responsables. En tu respuesta contá qué quedó afectado y a quién avisaste.
- "Avisale a X que…" es send_team_message a esa persona. Un aviso para todo el equipo es create_announcement (sólo responsables).
- Para "¿qué tenemos mañana?" usá get_schedule y respondé con el formato de resumen (secciones en mayúsculas: PERSONAL, PRODUCCIÓN, TAREAS, ENTREGAS).
- Compras: para "comprá…", "necesitamos…", "pedí…" usá create_purchase_order (si el usuario tiene permiso de compras). La herramienta aplica sola las reglas de aprobación; vos contá el resultado: proveedor, coste estimado, si quedó aprobado o pendiente de Martín, y la entrega prevista. Nunca digas que el pedido se envió: el envío al proveedor se hace desde la app. Si el usuario no tiene permiso de compras, avisale a Gian con send_team_message.
- Antes de pedir, si ayuda, mirá get_stock para sugerir la cantidad. "¿Qué falta comprar?" es get_low_stock.
- Controles sanitarios: "la C1 está a 3 grados" es register_temperature (neveras B1, B2, C1–C6; congeladores B3 y C7); "limpié la campana", register_cleaning; "hice 8 kg de masa", register_elaboration (decí el lote y hasta cuándo dura); "¿qué controles faltan?", get_food_safety_status. Si una temperatura está fuera de rango, decilo claro y pedí qué se hizo.
- "Llegó la harina" / "llegó el pedido 12": buscá el pedido abierto con get_purchase_orders y registrá la entrega con receive_purchase_order.
- Si una herramienta devuelve un error de permisos, explicáselo al usuario con amabilidad; no intentes rodearlo.

Privacidad: los motivos de retrasos o ausencias (médico, temas personales) son privados. No los incluyas en avisos a otras personas ni los cuentes a quien no sea responsable.

Estilo: castellano rioplatense (vos), frases cortas, cálido y directo. Siempre decí qué hiciste ("Registré…", "Avisé a Gian…"). Sin markdown: usá viñetas "•". Nunca uses emojis ni emoticonos. No inventes datos que no salgan de las herramientas.`;

function contextBlock(actor: Actor) {
  const today = todayISO();
  return `Fecha de hoy: ${today} (${prettyDate(today)}), hora actual ${nowHHMM()}. Mañana es ${addDays(today, 1)} (${prettyDate(addDays(today, 1))}).
Usuario: ${actor.name} (llamalo ${actor.shortName}), rol ${ROLE_LABEL[actor.role]}, área ${actor.area}.
Permisos: ${ROLE_PERMISSIONS[actor.role].join(", ")}.`;
}

export type AgentReply = { text: string; actions: AiAction[]; mode: "claude" | "demo" };

export function aiMode(): "claude" | "demo" {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "demo";
}

async function claudeAgent(actor: Actor, input: string): Promise<AgentReply> {
  const client = new Anthropic();
  const history = await db.aiMessage.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
  });
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history.reverse()) {
    const role = m.role === "user" ? "user" : "assistant";
    // La API exige alternancia y que empiece por "user".
    if (!messages.length && role !== "user") continue;
    if (messages.at(-1)?.role === role) continue;
    messages.push({ role, content: m.text });
  }
  if (messages.at(-1)?.role === "user") messages.pop();
  messages.push({ role: "user", content: input });

  const actions: AiAction[] = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextBlock(actor) },
      ],
      tools: CLAUDE_TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: "Perdón, eso no lo puedo hacer. ¿Te ayudo con otra cosa?", actions, mode: "claude" };
    }
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "Listo.", actions, mode: "claude" };
    }

    // Todas las tool_result van en un único mensaje de usuario.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const r = await executeTool(actor, tu.name, tu.input, { input, viaAi: true });
      if (r.action) actions.push(r.action);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Hice varias cosas pero me quedé a mitad de camino. Revisá las acciones de abajo.", actions, mode: "claude" };
}

/** Punto de entrada: guarda la conversación y devuelve respuesta + acciones realizadas. */
export async function askPichuco(actor: Actor, input: string): Promise<AgentReply> {
  await db.aiMessage.create({ data: { userId: actor.id, role: "user", text: input } });
  let reply: AgentReply;
  if (aiMode() === "claude") {
    try {
      reply = await claudeAgent(actor, input);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error("Claude API error", err.status, err.message);
        const local = await localAgent(actor, input);
        reply = { ...local, text: local.text + "\n\n(Respondí en modo demo: no pude conectar con Claude.)", mode: "demo" };
      } else throw err;
    }
  } else {
    reply = { ...(await localAgent(actor, input)), mode: "demo" };
  }
  await db.aiMessage.create({
    data: { userId: actor.id, role: "assistant", text: reply.text, actions: reply.actions.length ? reply.actions : undefined },
  });
  return reply;
}
