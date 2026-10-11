/**
 * Revisa las variables de la base antes de publicar y explica en castellano
 * qué está mal. Nunca imprime la contraseña.
 */
const problems: string[] = [];

function check(name: "DATABASE_URL" | "DIRECT_URL", port: string) {
  const raw = process.env[name];
  if (!raw) {
    problems.push(`${name}: no existe en este entorno (revisá que esté marcada para Production y Preview).`);
    return;
  }
  const value = raw.trim();
  if (value !== raw) problems.push(`${name}: tiene espacios o saltos de línea al principio o al final.`);
  if (/^["']|["']$/.test(value)) problems.push(`${name}: tiene comillas; pegala sin comillas.`);
  if (/YOUR-PASSWORD|\[|\]/.test(value)) problems.push(`${name}: todavía dice [YOUR-PASSWORD] o tiene corchetes; poné la contraseña de la base sin corchetes.`);
  let url: URL;
  try {
    url = new URL(value.replace(/^["']|["']$/g, ""));
  } catch {
    problems.push(`${name}: no es una dirección válida (¿la contraseña tiene símbolos como @ # / ? %?).`);
    return;
  }
  if (!url.protocol.startsWith("postgres")) problems.push(`${name}: tiene que empezar con postgresql://`);
  if (url.hostname.startsWith("db.") && url.hostname.endsWith(".supabase.co"))
    problems.push(`${name}: es la "Direct connection" (${url.hostname}), que no funciona desde Vercel. Usá la del pooler (…pooler.supabase.com).`);
  if (url.hostname.endsWith("pooler.supabase.com") && !url.username.includes("."))
    problems.push(`${name}: el usuario tiene que ser postgres.<id-del-proyecto>, no sólo "${url.username}".`);
  if (!url.password) problems.push(`${name}: le falta la contraseña.`);
  if (url.port && url.port !== port) console.warn(`Aviso: ${name} usa el puerto ${url.port}; lo normal es ${port}.`);
  if (url.port === "6543" && !url.searchParams.has("pgbouncer")) problems.push(`${name}: con el puerto 6543 tiene que terminar en ?pgbouncer=true`);
  console.log(`${name}: ${url.username}@${url.hostname}:${url.port || "(sin puerto)"}${url.pathname}${url.search}`);
}

check("DATABASE_URL", "6543");
check("DIRECT_URL", "5432");

if (problems.length) {
  console.error("\n==== Pichuco: hay que corregir las variables de la base ====");
  for (const p of problems) console.error("- " + p);
  console.error("Corregilas en Vercel → Settings → Environment Variables y volvé a publicar.\n");
  process.exit(1);
}
console.log("Variables de la base: bien.");
