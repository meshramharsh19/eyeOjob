// AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md §5.2) —
// Consumer 2's rendering rules. The two properties that matter most here,
// per the second-developer review that shaped this design:
//   1. Bounded — never more than 2 examples, regardless of how many are passed in.
//   2. Per-example, not per-sender — must never read as "this sender always
//      means X", since the same domain sends confirmations, interviews,
//      offers, AND rejections.

const { buildPrompt, formatFewShotSection } = require('../src/pipelines/email-pipeline/extraction/prompt.builder');

describe('formatFewShotSection', () => {
  test('renders nothing when there are no examples', () => {
    expect(formatFewShotSection([])).toBe('');
    expect(formatFewShotSection(undefined)).toBe('');
  });

  test('caps at 2 examples even when more are supplied', () => {
    const examples = [
      { inputSnippet: 'a', fieldCorrected: 'status', correctValue: 'Offer' },
      { inputSnippet: 'b', fieldCorrected: 'status', correctValue: 'Interview' },
      { inputSnippet: 'c', fieldCorrected: 'status', correctValue: 'Rejected' },
    ];
    const section = formatFewShotSection(examples);
    expect(section).toContain('Example 1');
    expect(section).toContain('Example 2');
    expect(section).not.toContain('Example 3');
  });

  test('explicitly disclaims a per-sender rule, framing each example as one specific past email', () => {
    const section = formatFewShotSection([{ inputSnippet: 'x', fieldCorrected: 'status', correctValue: 'Offer' }]);
    expect(section).toMatch(/NOT a rule about this sender in general/i);
    expect(section).toMatch(/do NOT mean every email from this sender is the same thing/i);
  });

  test('renders a structured JSON pair, never a freeform instruction', () => {
    const section = formatFewShotSection([{ inputSnippet: 'We are pleased to offer you...', fieldCorrected: 'status', correctValue: 'Offer' }]);
    expect(section).toContain('{"status": "Offer"}');
  });

  test('false_positive corrections render as a distinct, structured signal', () => {
    const section = formatFewShotSection([{ inputSnippet: 'Check out this newsletter', fieldCorrected: 'false_positive', correctValue: 'not_a_job' }]);
    expect(section).toContain('{"was_actually_a_job_email": false}');
  });

  test('truncates a long snippet rather than inlining the full email body', () => {
    const longSnippet = 'x'.repeat(1000);
    const section = formatFewShotSection([{ inputSnippet: longSnippet, fieldCorrected: 'status', correctValue: 'Offer' }]);
    const inputLine = section.split('\n').find((l) => l.startsWith('Input snippet:'));
    expect(inputLine.length).toBeLessThan(350);
  });
});

describe('buildPrompt — few-shot integration', () => {
  test('omits the few-shot section entirely when none are passed (default behavior unchanged)', () => {
    const prompt = buildPrompt('Subject', 'Body text', 'a@b.com', null);
    expect(prompt).not.toContain('PAST CORRECTIONS');
  });

  test('includes the few-shot section, placed before OUTPUT, when examples are passed', () => {
    const prompt = buildPrompt('Subject', 'Body text', 'a@b.com', null, [
      { inputSnippet: 'past email', fieldCorrected: 'status', correctValue: 'Offer' },
    ]);
    expect(prompt).toContain('PAST CORRECTIONS');
    expect(prompt.indexOf('PAST CORRECTIONS')).toBeLessThan(prompt.indexOf('OUTPUT'));
  });
});
