import { describe, expect, it } from 'vitest';
import { goalFromConversation, parseBrainstormReply } from './brainstorm';

describe('parseBrainstormReply', () => {
  it('extracts requirements and strips the block from the visible text', () => {
    const parsed = parseBrainstormReply(
      'What does the input look like?\n\n<requirements>\n- Return JSON only.\n- Never invent a field.\n</requirements>',
    );
    expect(parsed.visible).toBe('What does the input look like?');
    expect(parsed.requirements).toEqual(['Return JSON only.', 'Never invent a field.']);
  });

  it('returns null requirements when the reply has no block', () => {
    const parsed = parseBrainstormReply('Just a question?');
    expect(parsed.visible).toBe('Just a question?');
    // null means unchanged, which is not the same as an empty list.
    expect(parsed.requirements).toBeNull();
  });

  it('distinguishes an empty block from a missing one', () => {
    const parsed = parseBrainstormReply('Question?\n<requirements>\n</requirements>');
    expect(parsed.requirements).toEqual([]);
  });

  it('hides a half-streamed block instead of showing it mid-write', () => {
    const parsed = parseBrainstormReply(
      'What is the output?\n\n<requirements>\n- Return JS',
    );
    expect(parsed.visible).toBe('What is the output?');
    expect(parsed.requirements).toBeNull();
  });

  it('accepts several bullet markers', () => {
    const parsed = parseBrainstormReply(
      '<requirements>\n- dash\n* star\n• bullet\nbare\n</requirements>',
    );
    expect(parsed.requirements).toEqual(['dash', 'star', 'bullet', 'bare']);
  });

  it('drops blank lines and duplicates', () => {
    const parsed = parseBrainstormReply(
      '<requirements>\n- one\n\n- one\n-   \n- two\n</requirements>',
    );
    expect(parsed.requirements).toEqual(['one', 'two']);
  });

  it('is case-insensitive about the tag', () => {
    const parsed = parseBrainstormReply('Hi\n<REQUIREMENTS>\n- x\n</REQUIREMENTS>');
    expect(parsed.requirements).toEqual(['x']);
    expect(parsed.visible).toBe('Hi');
  });

  it('handles a reply that is only the block', () => {
    const parsed = parseBrainstormReply('<requirements>\n- only\n</requirements>');
    expect(parsed.visible).toBe('');
    expect(parsed.requirements).toEqual(['only']);
  });

  it('leaves ordinary prose mentioning requirements alone', () => {
    const parsed = parseBrainstormReply('Tell me your requirements for the output.');
    expect(parsed.visible).toBe('Tell me your requirements for the output.');
    expect(parsed.requirements).toBeNull();
  });
});

describe('goalFromConversation', () => {
  it('takes the first user turn', () => {
    expect(
      goalFromConversation([
        { role: 'user', content: 'Review PRs for security issues.' },
        { role: 'assistant', content: 'What language?' },
      ]),
    ).toBe('Review PRs for security issues');
  });

  it('strips a leading "I need something that"', () => {
    expect(
      goalFromConversation([
        { role: 'user', content: 'I need something that reviews PRs for security issues' },
      ]),
    ).toBe('reviews PRs for security issues');
  });

  it('strips a leading build/create verb', () => {
    expect(
      goalFromConversation([{ role: 'user', content: 'Build me a changelog writer.' }]),
    ).toBe('changelog writer');
  });

  it('keeps only the first sentence', () => {
    expect(
      goalFromConversation([
        { role: 'user', content: 'Classify support tickets. It runs nightly.' },
      ]),
    ).toBe('Classify support tickets');
  });

  it('returns an empty string when there is no user turn', () => {
    expect(goalFromConversation([{ role: 'assistant', content: 'Hello?' }])).toBe('');
    expect(goalFromConversation([])).toBe('');
  });
});
