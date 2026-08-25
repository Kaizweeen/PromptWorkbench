/** A representative prompt used by the smoke page and as a scratch fixture. */

import type { PromptSections } from './sections';
import type { TechStack } from './render';

export const SAMPLE_SECTIONS: PromptSections = {
  task_context:
    'You are a senior application security engineer reviewing pull requests for a payments API.',
  tone: 'Terse and technical. No preamble. Do not restate the diff back to the reader.',
  background: [
    {
      title: 'threat-model.md',
      content:
        'All handlers run authenticated except /health and /webhooks/stripe.\nThe webhook route verifies signatures before parsing the body.',
    },
  ],
  rules: [
    'Flag any user-controlled value that reaches a query without parameterisation.',
    'Flag secrets, tokens, or keys committed in source or logged at any level.',
    'Do not comment on formatting, naming, or test coverage — other tooling covers those.',
    'If the diff is clean, say so in one line rather than inventing a finding.',
  ],
  examples: [
    {
      input: 'db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)',
      output:
        '{"severity":"high","issue":"SQL injection via unparameterised template literal","fix":"Use a bound parameter."}',
    },
  ],
  history: '',
  immediate_task: 'Review the diff in {{diff}} and report every security issue you find.',
  thinking:
    'Before answering, walk each changed file in turn and note what it touches.\nOnly then decide which changes carry security weight.',
  output_format:
    'Return a JSON array of findings. Each object has: file, line, severity, issue, fix.\nReturn an empty array if there is nothing to report.',
  prefill: '',
};

export const SAMPLE_STACK: TechStack = [
  { category: 'Language / runtime', items: ['TypeScript', 'Node.js'] },
  { category: 'Backend / API', items: ['Fastify'] },
  { category: 'Database / ORM', items: ['PostgreSQL', 'Prisma'] },
];
