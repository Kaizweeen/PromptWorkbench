/**
 * Tech stack metadata for the *target* project a prompt is written for —
 * not the stack of this app. Selections render into the prompt as a
 * <tech_stack> block (see lib/render.ts).
 */

import type { TechStack } from './render';

export interface StackCategory {
  id: string;
  label: string;
  options: readonly string[];
}

export const STACK_CATEGORIES: readonly StackCategory[] = [
  {
    id: 'language',
    label: 'Language / runtime',
    options: [
      'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java',
      'Ruby', 'C#', 'PHP', 'Node.js', 'Deno', 'Bun',
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend framework',
    options: [
      'React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'SvelteKit',
      'Angular', 'Solid', 'Astro', 'React Native', 'HTMX',
    ],
  },
  {
    id: 'styling',
    label: 'Styling',
    options: [
      'Tailwind CSS', 'CSS Modules', 'styled-components', 'Sass',
      'vanilla-extract', 'shadcn/ui', 'Material UI', 'Chakra UI',
    ],
  },
  {
    id: 'backend',
    label: 'Backend / API',
    options: [
      'Next.js Route Handlers', 'Express', 'Fastify', 'NestJS', 'Hono',
      'FastAPI', 'Django', 'Flask', 'Rails', 'tRPC', 'GraphQL', 'gRPC',
    ],
  },
  {
    id: 'database',
    label: 'Database / ORM',
    options: [
      'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis', 'Prisma',
      'Drizzle', 'TypeORM', 'SQLAlchemy', 'Supabase', 'DynamoDB',
    ],
  },
  {
    id: 'auth',
    label: 'Auth',
    options: [
      'Auth.js / NextAuth', 'Clerk', 'Auth0', 'Supabase Auth', 'Lucia',
      'Passport', 'JWT', 'OAuth 2.0', 'SAML', 'Session cookies',
    ],
  },
  {
    id: 'testing',
    label: 'Testing',
    options: [
      'Vitest', 'Jest', 'Playwright', 'Cypress', 'Testing Library',
      'pytest', 'Go testing', 'RSpec', 'JUnit',
    ],
  },
  {
    id: 'deployment',
    label: 'Deployment',
    options: [
      'Vercel', 'Netlify', 'AWS', 'Cloudflare Workers', 'Fly.io',
      'Railway', 'Docker', 'Kubernetes', 'GitHub Actions',
    ],
  },
  {
    id: 'ai',
    label: 'AI / LLM SDKs',
    options: [
      'Anthropic SDK', 'Claude Agent SDK', 'Vercel AI SDK', 'LangChain',
      'LlamaIndex', 'OpenAI SDK', 'pgvector', 'Pinecone',
    ],
  },
] as const;

/** What the checkbox grid holds: chosen options plus a free-text "other". */
export interface CategorySelection {
  items: string[];
  other: string;
}

export type StackSelection = Record<string, CategorySelection>;

export function emptyStackSelection(): StackSelection {
  return Object.fromEntries(
    STACK_CATEGORIES.map((c) => [c.id, { items: [], other: '' }]),
  );
}

/** Split an "other" field on commas so free text can name several tools. */
function parseOther(other: string): string[] {
  return other
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Convert the grid selection into the render-ready shape. Categories with
 * nothing selected are dropped, so an untouched category never appears as an
 * empty line in the prompt.
 */
export function toTechStack(selection: StackSelection): TechStack {
  const stack: TechStack = [];

  for (const category of STACK_CATEGORIES) {
    const chosen = selection[category.id];
    if (!chosen) continue;

    const items = [...chosen.items, ...parseOther(chosen.other)]
      .map((i) => i.trim())
      .filter((i) => i !== '');

    // De-duplicate, keeping first-selected order.
    const unique = [...new Set(items)];
    if (unique.length > 0) stack.push({ category: category.label, items: unique });
  }

  return stack;
}

/**
 * Rebuild a grid selection from a stored stack, so a saved version or preset
 * reopens with the right boxes ticked. Values that are not known options land
 * in that category's "other" field rather than being dropped.
 */
export function fromTechStack(stack: TechStack | null | undefined): StackSelection {
  const selection = emptyStackSelection();
  if (!stack) return selection;

  for (const entry of stack) {
    const category = STACK_CATEGORIES.find((c) => c.label === entry.category);
    if (!category) continue;

    const known = entry.items.filter((i) => category.options.includes(i));
    const unknown = entry.items.filter((i) => !category.options.includes(i));

    selection[category.id] = { items: known, other: unknown.join(', ') };
  }

  return selection;
}

/** Total number of selected technologies across every category. */
export function countSelected(selection: StackSelection): number {
  return toTechStack(selection).reduce((n, entry) => n + entry.items.length, 0);
}
