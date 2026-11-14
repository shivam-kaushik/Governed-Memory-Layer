// Heuristic scan for instruction-like text (G11). Flagged text is quarantined, never trusted.
// shortcut: regex rules only, catches common phrasing, not paraphrase. Upgrade with a classifier if needed.
const RULES: Array<[string, RegExp]> = [
  ["override_instructions", /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(instructions?|rules?|prompts?)\b/i],
  ["reveal_prompt", /\breveal\b[^.\n]{0,30}\b(system\s+)?prompt\b/i],
  ["role_reassign", /\byou\s+are\s+now\b/i],
  ["new_instructions", /\bnew\s+instructions?\s*:/i],
  ["markup_break", /<\/?\s*(system|evidence|assistant|instructions?)\b[^>]*>/i],
  ["pipe_to_shell", /\b(curl|wget)\b[^\n]*\|\s*(ba|z)?sh\b/i],
];

export function scanInjection(text: string): { suspicious: boolean; matches: string[] } {
  const matches = RULES.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { suspicious: matches.length > 0, matches };
}
