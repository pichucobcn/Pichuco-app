import { randomInt } from "node:crypto";

// Sin 0/O/1/I para que se pueda dictar por teléfono.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function publicCode(len = 6) {
  return Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
