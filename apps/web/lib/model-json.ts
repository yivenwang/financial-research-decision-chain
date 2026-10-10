export class DuplicateJsonKeyError extends SyntaxError {}

// Shared by transport and offline/history replay; duplicate fields never win silently.
export function parseMemoJson(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  const stack: ({ keys: Set<string>; expectsKey: boolean } | null)[] = [];
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],]/g)) {
    const token = match[0];
    if (token === "{") stack.push({ keys: new Set(), expectsKey: true });
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else {
      const frame = stack.at(-1);
      if (token === ",") { if (frame) frame.expectsKey = true; }
      else if (frame?.expectsKey) {
        const key: string = JSON.parse(token);
        if (frame.keys.has(key)) throw new DuplicateJsonKeyError("Duplicate JSON field");
        frame.keys.add(key);
        frame.expectsKey = false;
      }
    }
  }
  return parsed;
}
