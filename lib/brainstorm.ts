/**
 * Parsing brainstorm replies.
 *
 * Claude emits the full requirement set in a <requirements> block on every
 * turn. Parsing it here — rather than making a second extraction call — keeps
 * the panel to one request per turn and makes the extraction deterministic
 * and testable.
 */

const REQUIREMENTS_BLOCK = /<requirements>([\s\S]*?)<\/requirements>/i;
/** Matches an unterminated block, so a mid-stream reply hides it too. */
const PARTIAL_BLOCK = /<requirements>[\s\S]*$/i;

export interface ParsedReply {
  /** The message to display, with the requirements block removed. */
  visible: string;
  /**
   * The full requirement set, or null when the reply carried no block —
   * null means "unchanged", which is different from "now empty".
   */
  requirements: string[] | null;
}

function parseLines(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of body.split('\n')) {
    const line = raw.trim().replace(/^[-*•]\s*/, '').trim();
    if (line === '' || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }

  return out;
}

/**
 * Split a reply into what the user sees and the extracted requirements.
 *
 * Safe to call on a partial reply while streaming: an unterminated block is
 * hidden rather than shown half-written.
 */
export function parseBrainstormReply(text: string): ParsedReply {
  const complete = text.match(REQUIREMENTS_BLOCK);

  if (complete) {
    const visible = text.replace(REQUIREMENTS_BLOCK, '').trim();
    return { visible, requirements: parseLines(complete[1]) };
  }

  // Streaming: the opening tag has arrived but the closing one has not.
  if (PARTIAL_BLOCK.test(text)) {
    return { visible: text.replace(PARTIAL_BLOCK, '').trim(), requirements: null };
  }

  return { visible: text.trim(), requirements: null };
}

export interface BrainstormTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Condense the interview into a goal line for deterministic generation.
 * The first thing the developer said is what they actually came in wanting.
 */
export function goalFromConversation(turns: BrainstormTurn[]): string {
  const first = turns.find((t) => t.role === 'user')?.content.trim() ?? '';
  const firstSentence = first.split(/(?<=[.!?])\s/)[0] ?? first;
  const goal = (firstSentence.length > 0 ? firstSentence : first).trim();

  // Read as the object of "Your job is to …".
  return goal
    .replace(/^(i\s+(want|need)\s+(something|a\s+prompt)?\s*(that|to)?\s*)/i, '')
    .replace(/^(build|create|make|write)\s+(me\s+)?(a|an)?\s*/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
}
