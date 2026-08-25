import { describe, expect, it } from 'vitest';
import {
  STACK_CATEGORIES,
  countSelected,
  emptyStackSelection,
  fromTechStack,
  toTechStack,
} from './stack';
import { renderTechStack } from './render';

describe('stack categories', () => {
  it('covers the nine categories the spec asks for', () => {
    expect(STACK_CATEGORIES.map((c) => c.id)).toEqual([
      'language', 'frontend', 'styling', 'backend',
      'database', 'auth', 'testing', 'deployment', 'ai',
    ]);
  });

  it('has unique ids and non-empty option lists', () => {
    const ids = STACK_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of STACK_CATEGORIES) expect(c.options.length).toBeGreaterThan(0);
  });
});

describe('toTechStack', () => {
  it('drops categories with nothing selected', () => {
    const selection = emptyStackSelection();
    selection.language.items = ['TypeScript'];
    expect(toTechStack(selection)).toEqual([
      { category: 'Language / runtime', items: ['TypeScript'] },
    ]);
  });

  it('returns nothing for an untouched grid', () => {
    expect(toTechStack(emptyStackSelection())).toEqual([]);
  });

  it('folds the free-text other field in, splitting on commas', () => {
    const selection = emptyStackSelection();
    selection.database.items = ['PostgreSQL'];
    selection.database.other = 'Kysely, Neon';
    expect(toTechStack(selection)[0].items).toEqual(['PostgreSQL', 'Kysely', 'Neon']);
  });

  it('ignores an other field of only whitespace and separators', () => {
    const selection = emptyStackSelection();
    selection.auth.items = ['Clerk'];
    selection.auth.other = ' , ,  ';
    expect(toTechStack(selection)[0].items).toEqual(['Clerk']);
  });

  it('de-duplicates an other value that repeats a checked option', () => {
    const selection = emptyStackSelection();
    selection.language.items = ['Go'];
    selection.language.other = 'Go';
    expect(toTechStack(selection)[0].items).toEqual(['Go']);
  });

  it('keeps categories in the declared order, not selection order', () => {
    const selection = emptyStackSelection();
    selection.deployment.items = ['Vercel'];
    selection.language.items = ['TypeScript'];
    expect(toTechStack(selection).map((e) => e.category)).toEqual([
      'Language / runtime',
      'Deployment',
    ]);
  });
});

describe('fromTechStack', () => {
  it('round-trips a selection through the stored shape', () => {
    const selection = emptyStackSelection();
    selection.language.items = ['TypeScript', 'Node.js'];
    selection.testing.items = ['Vitest'];
    expect(toTechStack(fromTechStack(toTechStack(selection)))).toEqual(
      toTechStack(selection),
    );
  });

  it('puts unrecognised values into the other field rather than dropping them', () => {
    const restored = fromTechStack([
      { category: 'Database / ORM', items: ['PostgreSQL', 'Kysely'] },
    ]);
    expect(restored.database.items).toEqual(['PostgreSQL']);
    expect(restored.database.other).toBe('Kysely');
  });

  it('handles null and empty input', () => {
    expect(toTechStack(fromTechStack(null))).toEqual([]);
    expect(toTechStack(fromTechStack([]))).toEqual([]);
  });

  it('ignores a category label that no longer exists', () => {
    const restored = fromTechStack([{ category: 'Retired category', items: ['x'] }]);
    expect(toTechStack(restored)).toEqual([]);
  });
});

describe('countSelected', () => {
  it('counts across categories including other entries', () => {
    const selection = emptyStackSelection();
    selection.language.items = ['TypeScript', 'Go'];
    selection.styling.other = 'UnoCSS';
    expect(countSelected(selection)).toBe(3);
  });

  it('is zero for an untouched grid', () => {
    expect(countSelected(emptyStackSelection())).toBe(0);
  });
});

describe('stack rendering', () => {
  it('renders a selection into the <tech_stack> block', () => {
    const selection = emptyStackSelection();
    selection.language.items = ['TypeScript'];
    selection.frontend.items = ['Next.js', 'React'];
    expect(renderTechStack(toTechStack(selection))).toBe(
      [
        '<tech_stack>',
        'Language / runtime: TypeScript',
        'Frontend framework: Next.js, React',
        '</tech_stack>',
      ].join('\n'),
    );
  });
});
