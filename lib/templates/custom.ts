import type { ArchetypeTemplate } from './types';

/**
 * The empty skeleton. Fills in only what the deterministic generator can know
 * from the goal and requirements, leaving the rest for you to write — this is
 * the archetype to pick when none of the others fit the shape of the task.
 */
const template: ArchetypeTemplate = {
  id: 'custom',
  label: 'Custom',
  blurb: 'A blank structure. Only the goal and your requirements are filled in.',

  task_context: 'You are an expert assistant. Your job is to [[goal]].',
  tone: '',
  rules: [],
  examples: [],
  thinking: '',
  output_format: '',
  immediate_task: '',
  prefill: '',
};

export default template;
