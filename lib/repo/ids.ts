/** Identifier generation, shared across the repository modules. */
export function newId(): string {
  return crypto.randomUUID();
}
