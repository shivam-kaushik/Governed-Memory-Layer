import { PROMPT_TEMPLATE } from "../agent/scenarios";
import type { Alert, EvidenceCard } from "../contracts/contracts";

// shortcut: whitespace-word count as a token proxy, not a model tokenizer. Upgrade if an LLM brain needs exact counts.
export const countTokens = (s: string): number => (s.match(/\S+/g) ?? []).length;

export function renderMemoryBlock(cards: EvidenceCard[]): string {
  if (cards.length === 0) return "(no memory)";
  return cards
    .map(
      (c, i) =>
        `[${i + 1}] id=${c.memoryId} v${c.version} conf=${c.confidence} expires=${c.expiresAtMs}\n${c.statement}\nvalue=${JSON.stringify(c.value)}`,
    )
    .join("\n");
}

// The only thing that may differ between arms is memoryBlock (G20).
export function promptParts(alert: Alert, cards: EvidenceCard[]): { head: string; memoryBlock: string; tail: string } {
  const [head = "", tail = ""] = PROMPT_TEMPLATE.split("{{memory_block}}");
  return { head: head.replace("{{alert}}", () => alert.text), memoryBlock: renderMemoryBlock(cards), tail };
}

export function renderPrompt(alert: Alert, cards: EvidenceCard[]): string {
  const p = promptParts(alert, cards);
  return p.head + p.memoryBlock + p.tail;
}
