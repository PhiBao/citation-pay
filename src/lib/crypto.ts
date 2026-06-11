import { createHash, randomUUID } from "node:crypto";

export function uuid() {
  return randomUUID();
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}
