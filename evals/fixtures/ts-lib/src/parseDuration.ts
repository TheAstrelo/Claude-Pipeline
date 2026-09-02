const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const TOKEN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)/;

/**
 * Parse a compact duration such as `"1h30m"`, `"45s"` or `"250ms"` into
 * milliseconds. Whitespace between tokens is ignored. Throws on anything
 * that is not a sequence of `<number><unit>` tokens.
 */
export function parseDuration(input: string): number {
  let rest = input.trim();
  if (rest === "") throw new Error("duration must not be empty");
  let total = 0;
  while (rest !== "") {
    const match = TOKEN.exec(rest);
    if (!match) throw new Error(`invalid duration: ${JSON.stringify(input)}`);
    const [token, amount, unit] = match;
    total += Number(amount) * (UNIT_MS[unit as string] ?? 0);
    rest = rest.slice(token.length).trimStart();
  }
  return total;
}
