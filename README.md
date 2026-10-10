# Pichuco App

Centro operativo de **Pichuco Pizzería Porteña**. *Hablale a Pichuco. Pichuco se encarga.*

Prototipo con:

- **Fase 1**: login, usuarios y roles, Home, Pichuco AI (lenguaje natural → acciones), Fichar, Tareas, Producción, Comunicados, Agenda y Equipo.
- **Fase 2**: Stock, Proveedores, Compras con reglas de aprobación y Chat del equipo.
- **Sanidad (APPCC)**: controles alimentarios y sanitarios.

### Sanidad (APPCC)

- **Temperaturas** de cámaras, congelador, mesa fría y nevera de bebidas: lecturas de apertura y cierre, rango por equipo, historial de 7 días. Fuera de rango → incidencia y aviso a Gian y Martín (si se indica la acción correctora, queda cerrada).
- **Limpieza y desinfección**: plan con frecuencia diaria, semanal o mensual, producto y método; se marca hecho con un toque.
- **Etiquetas / trazabilidad**: cada elaboración (masa, salsa, milanesas…) recibe lote y caducidad según su vida útil, con sus alérgenos; etiqueta imprimible. Avisos de lo que caduca hoy o ya caducó.
- **Recepción de mercancías**: temperatura, envase, etiquetado, lote y caducidad; rechazos generan incidencia.
- **Alérgenos**: tabla de los 14 alérgenos obligatorios por plato (contiene / trazas), imprimible.
- **Incidencias** con acción correctora, **control de plagas** y **formación de manipuladores** (con aviso de vencimiento).
- **Informe para inspección** por período, imprimible o en CSV para Excel.
- El "día de servicio" termina a las 05:00 (lo registrado a la 01:00 cuenta para el día anterior). Las lecturas de cierre y la limpieza diaria cuentan como pendientes desde las 21:00.
- Pichuco AI: "La cámara 1 está a 3 grados", "Limpié la campana", "Hice 8 kg de masa", "¿Qué controles faltan?".
- Permisos: todo el equipo registra controles; Gian y Martín gestionan el plan, cierran incidencias y sacan el informe.

### Compras y aprobaciones

Estados: Borrador → Pendiente de aprobación → Aprobado → Enviado → Confirmado → Entregado (o Cancelado).

- Hasta el límite automático (100 € por defecto, o el límite propio de cada persona) el pedido se aprueba solo.
- Hasta el límite del jefe (300 €) lo aprueba Martín (también desde Pichuco AI).
- Por encima, o en categorías marcadas como sensibles, la aprobación es obligatoria y **sólo desde la pantalla del pedido**.
- Las reglas se editan en Compras → Reglas de aprobación.
- El envío al proveedor abre WhatsApp o el correo con el pedido ya escrito (no hay integraciones automáticas todavía). Al confirmar el proveedor, la entrega aparece en la Agenda; al recibirla, se suma al stock y se guarda el último precio.

### Chat del equipo

Conversaciones 1 a 1 y grupos, respuestas, fotos y archivos (hasta 5 MB, guardados en la base de datos). Los mensajes nuevos se consultan cada 4 segundos.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript, web responsive / PWA
- PostgreSQL + Prisma
- Login por email con código de un solo uso (OTP)
- Pichuco AI: API de Claude con herramientas (tool use). El modelo **nunca** toca la base de datos: sólo llama a funciones validadas (`lib/ai/tools.ts`) que comprueban los permisos del usuario.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # ajustar DATABASE_URL
npm run db:push               # crea las tablas
npm run db:seed               # carga los 4 usuarios y datos de prueba (fechas relativas a hoy)
npm run dev                   # http://localhost:3000
```

Para activar Pichuco AI con Claude, añadir `ANTHROPIC_API_KEY` al `.env`. Sin clave funciona en **modo demo** con un intérprete local que entiende las frases típicas (retrasos, ausencias, producción, avisos, “¿qué tenemos mañana?”, “¿quién trabaja esta noche?”…).

Con `PICHUCO_DEMO_OTP=1` el código de acceso aparece en pantalla y hay botones para entrar como cada usuario. **Quitarlo en producción** y conectar un envío de email real en `app/api/auth/request/route.ts`.

Tests: `npm test` (usan la base de `DATABASE_URL` y la re-siembran).

## Usuarios de prueba

| Persona | Email | Rol |
|---|---|---|
| Martín Grossman | martin@pichuco.es | Jefe (acceso completo) |
| Gian Marcuzzi | gian@pichuco.es | Jefe de cocina |
| Juan Pablo Buono | juanpablo@pichuco.es | Cocinero |
| Eva Fort | eva@pichuco.es | Camarera |

Los permisos por rol están en `lib/permissions.ts` y se comprueban en el backend (`lib/services/*`), tanto desde las pantallas como desde Pichuco AI.

## Estructura

```
app/                 páginas y rutas API (app/api/*)
components/          UI compartida (PichucoChat, iconos, navegación)
lib/services/        lógica de negocio + autorización + auditoría
lib/ai/              Pichuco AI: herramientas, agente Claude, intérprete demo
prisma/              esquema y datos de prueba
public/brand/        logo y personaje (provisionales)
```

## Marca

En `public/brand/`: `logo.png` (rojo), `logo-crema.png` (cabecera sobre burdeos), `pichuco.png` (dibujo de Pichuco con el bandoneón), `pichuco-cara.png` (avatar de Pichuco AI) e `icon-192/512.png` (icono de la app). El dibujo es rojo sobre transparente: siempre va sobre fondo crema.

## Archivado

La web pública de **reservas de mesa y pedidos para llevar** (con clientes, pagos online y previsión de demanda) está guardada en la rama `archivo/fase-3-reservas-y-pedidos`. Por ahora la app es sólo de uso interno.

## Próximas fases

- **Fase 4**: agente de compras, WhatsApp Business, email, voz, análisis y predicción.
