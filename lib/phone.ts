/** "699 12 34 56" → "+34699123456"; números de 9 cifras se asumen españoles. */
export function normalizePhone(raw: string): string {
  const plain = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").replace(/^00/, "+");
  if (/^[6789]\d{8}$/.test(plain)) return "+34" + plain;
  return plain;
}

export function isValidPhone(raw: string) {
  return /^\+?\d{9,15}$/.test(normalizePhone(raw));
}

/** "+34699123456" → "699 12 34 56" para mostrar y dictar. */
export function formatPhone(phone: string) {
  const m = phone.match(/^\+34(\d{3})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
