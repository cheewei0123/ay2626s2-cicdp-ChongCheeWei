import { randomInt } from 'node:crypto';

// No 0/O or 1/I, because they look alike when read out at the table
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 5;
const CODE_SHAPE = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${LENGTH}}$`);

// 32^5 ≈ 33 million codes; randomInt uses a secure random source
export function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// " k7p2q " → "K7P2Q"; anything that can't be a code → null
export function normaliseJoinCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return CODE_SHAPE.test(code) ? code : null;
}

// Two friends called Ben become "Ben" and "Ben (2)", so the summary can tell them apart
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  let n = 2;
  while (used.has(`${name} (${n})`.toLowerCase())) n++;
  return `${name} (${n})`;
}
