/** Join truthy class fragments into a single className string. Shared by all app-layer components. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
