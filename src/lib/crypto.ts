import { createHash, randomBytes, randomUUID } from "node:crypto";

export function uuid() {
  return randomUUID();
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function nowIso() {
  return new Date().toISOString();
}
