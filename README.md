# Pichuco App

Centro operativo de **Pichuco Pizzería Porteña**. *Hablale a Pichuco. Pichuco se encarga.*

Prototipo de la **Fase 1**: login, usuarios y roles, Home, Pichuco AI (lenguaje natural → acciones), Fichar, Tareas, Producción, Comunicados, Agenda básica y Equipo.

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

`public/brand/logo.svg` y `public/brand/pichuco.svg` son **provisionales**. Reemplazarlos por el logo oficial y la ilustración de Pichuco con el teléfono (mismo nombre de archivo, o cambiar la ruta en las páginas).

## Próximas fases

- **Fase 2**: compras, stock, proveedores, automatización de pedidos, chat interno.
- **Fase 3**: reservas de mesa y pedidos para llevar públicos, clientes, pagos.
- **Fase 4**: agente de compras, WhatsApp Business, email, voz, análisis y predicción.
