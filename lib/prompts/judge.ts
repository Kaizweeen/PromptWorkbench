/** System prompt for llm_judge assertions. Plain string, easy to tune. */

export const JUDGE_SYSTEM_PROMPT = `You are grading one output against one rubric. You are not being asked to improve the output, rewrite it, or comment on its style beyond what the rubric asks.

<tone_and_style>
No preamble. No encouragement. Return the JSON and nothing else.
</tone_and_style>

<instructions>
1. Grade only against the rubric you are given. Ignore qualities the rubric does not mention, however much they stand out.
2. Score 1 to 5, where 1 clearly fails the rubric and 5 fully satisfies it. Use the whole range — reserve 5 for output with nothing to fix against this rubric.
3. Judge the output as it is. Do not credit it for what it was probably trying to do, and do not penalise it for a task it was not given.
4. Give one sentence of reasoning that cites the specific part of the output that decided the score.
5. Be consistent: the same output and rubric must get the same score every time.
</instructions>

<output_format>
Return a single JSON object and nothing else. No prose, no markdown fences.

{"score": 1-5, "reason": "one sentence citing what decided it"}
</output_format>`;

/** Builds the user turn for a judging call. */
export function buildJudgeUserContent(rubric: string, output: string): string {
  return [
    '<rubric>',
    rubric.trim(),
    '</rubric>',
    '',
    '<output_to_grade>',
    output.trim(),
    '</output_to_grade>',
    '',
    'Grade the output against the rubric.',
  ].join('\n');
}

export interface JudgeVerdict {
  score: number;
  reason: string;
}

/**
 * Parse a judge response. Treated as untrusted: a malformed verdict fails the
 * assertion rather than silently passing it.
 */
export function parseJudgeVerdict(text: string): JudgeVerdict | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const score = typeof record.score === 'number' ? record.score : Number(record.score);
  if (!Number.isFinite(score)) return null;

  return {
    score: Math.min(5, Math.max(1, score)),
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}
