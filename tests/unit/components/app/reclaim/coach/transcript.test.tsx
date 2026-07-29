/**
 * How a coach turn is drawn — the shared renderer both surfaces use.
 *
 * The property under test is emphasis. A leader is walked through nineteen readings, and until the
 * coach could mark what a question was about, the name of the area was an ordinary noun in an
 * ordinary sentence while the panel beside them listed those same names in bold. So:
 *
 *  - the marked phrase reaches the page as real emphasis, and the markers never do;
 *  - a marker still arriving, mid-stream, shows as the phrase brightening rather than as asterisks
 *    that land and then vanish;
 *  - nothing else is parsed, because the transcript is not a markdown surface and the voice has no
 *    bullets, headings or tables in it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CoachLine,
  coachParagraphs,
  renderEmphasis,
  splitParagraphs,
} from '@/components/app/reclaim/coach/transcript';

/** The nodes as a page would read them: text with the markup applied, not the markup itself. */
function drawn(text: string, markArea = false) {
  const { container } = render(<p>{renderEmphasis(text, markArea)}</p>);
  return container.firstElementChild as HTMLElement;
}

describe('renderEmphasis', () => {
  it('draws the marked phrase as emphasis and never shows the markers', () => {
    const line = drawn('Next, **learning and development**. How many hours a week?');

    const strong = line.querySelector('strong');
    expect(strong?.textContent).toBe('learning and development');
    expect(line.textContent).toBe('Next, learning and development. How many hours a week?');
    expect(line.textContent).not.toContain('*');
  });

  it('leaves a turn with nothing marked exactly as it was written', () => {
    const line = drawn('That is a lot of the week.');

    expect(line.querySelector('strong')).toBeNull();
    expect(line.textContent).toBe('That is a lot of the week.');
  });

  it('marks more than one phrase when a turn carries more than one', () => {
    // The instruction asks for one per turn, but a renderer that silently dropped the second would
    // leave stray asterisks in the leader's question, which is worse than honouring both.
    const line = drawn('**Deep work** and **recovery** both.');

    expect([...line.querySelectorAll('strong')].map((s) => s.textContent)).toEqual([
      'Deep work',
      'recovery',
    ]);
    expect(line.textContent).toBe('Deep work and recovery both.');
  });

  it('brightens the phrase as it arrives, rather than showing a marker that is still opening', () => {
    // The words are released two characters at a time, so the closing pair does not exist yet for as
    // long as the phrase takes to type. Everything since the unclosed marker is emphasised.
    const line = drawn('Next, **learning and dev');

    expect(line.querySelector('strong')?.textContent).toBe('learning and dev');
    expect(line.textContent).toBe('Next, learning and dev');
  });

  it('holds back a marker that is only half on screen', () => {
    // One frame of the animation: the first asterisk has landed and its pair has not.
    const line = drawn('Next, *');

    expect(line.textContent).toBe('Next, ');
  });

  it('treats a lone asterisk in ordinary prose as ordinary prose', () => {
    const line = drawn('You said 5 * 3 hours across the fortnight.');

    expect(line.querySelector('strong')).toBeNull();
    expect(line.textContent).toBe('You said 5 * 3 hours across the fortnight.');
  });
});

/**
 * The fallback. The pinned model already ignores the older prohibition in the same instruction block
 * against opening with "Certainly", so a leader's ability to see what they are being asked cannot rest
 * on it remembering a formatting rule. The nine area names are authored, so the app can mark them.
 */
describe('renderEmphasis — the area a question is about', () => {
  it('marks the area the coach named, in the coach’s own words', () => {
    const line = drawn(
      'Let’s move on to the next area: learning and development. How many hours a week?',
      true
    );

    expect(line.querySelector('strong')?.textContent).toBe('learning and development');
    expect(line.textContent).toBe(
      'Let’s move on to the next area: learning and development. How many hours a week?'
    );
  });

  it('matches the spoken form of a name the content writes with an ampersand', () => {
    // `RECLAIM_BUCKETS` says "Recovery & white space"; nobody says that out loud.
    expect(
      drawn('What about recovery and white space?', true).querySelector('strong')?.textContent
    ).toBe('recovery and white space');
    expect(
      drawn('What about Recovery & white space?', true).querySelector('strong')?.textContent
    ).toBe('Recovery & white space');
  });

  it('marks only the first area in a paragraph, so a question is not a highlighter', () => {
    const line = drawn('Between deep work and team development, which gave way?', true);

    expect([...line.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['deep work']);
  });

  it('leaves a question naming no area alone', () => {
    const line = drawn('What stands out to you here?', true);

    expect(line.querySelector('strong')).toBeNull();
  });

  it('does not mark a name that is only part of a longer word', () => {
    const line = drawn('Nothing about redeep workings here.', true);

    expect(line.querySelector('strong')).toBeNull();
  });
});

describe('coachParagraphs', () => {
  const question = 'How many hours a week go on learning and development?';

  it('flags the question’s paragraph and no other', () => {
    expect(coachParagraphs(`I heard 5 hours of deep work.\n\n${question}`)).toEqual([
      { text: 'I heard 5 hours of deep work.', markArea: false },
      { text: question, markArea: true },
    ]);
  });

  it('stands aside entirely when the coach marked something itself', () => {
    // Its judgement wins: the app never adds a second mark to a turn that already carries one.
    const marked = coachParagraphs(
      `I heard 5 hours of deep work.\n\nHow many on **learning and development**?`
    );

    expect(marked.every((p) => !p.markArea)).toBe(true);
  });

  it('withholds the mark while the turn is still arriving', () => {
    // Mid-stream the "last" paragraph is whichever is being typed, so marking it would bold an area
    // named in the reflection and unbold it the moment the question began.
    expect(coachParagraphs('I heard 5 hours of deep work.', true)).toEqual([
      { text: 'I heard 5 hours of deep work.', markArea: false },
    ]);
  });
});

describe('CoachLine', () => {
  it('marks the area in the question, and leaves the reflection above it plain', () => {
    // The turn from the screenshot that started this: no `**` from the coach at all.
    render(
      <CoachLine
        text={
          'Thank you for sharing that. It sounds like those disruptions cut into your deep work time.\n\nLet’s move on to the next area: learning and development. How many hours a week do you dedicate to this?'
        }
      />
    );

    const question = screen.getByText(/How many hours a week do you dedicate/);
    expect(question.querySelector('strong')?.textContent).toBe('learning and development');
    // "deep work" in the reflection is not the question, so it stays as written.
    const reflection = screen.getByText(/Thank you for sharing that/);
    expect(reflection.querySelector('strong')).toBeNull();
  });

  it('applies the emphasis inside the paragraph the coach wrote it in', () => {
    render(
      <CoachLine text={'Got it, 5 hours.\n\nNext, **team development**. How many hours a week?'} />
    );

    const question = screen.getByText(/How many hours a week/);
    expect(question.tagName).toBe('P');
    expect(question.querySelector('strong')?.textContent).toBe('team development');
    // The reflection is its own paragraph and carries no emphasis of its own.
    const reflection = screen.getByText('Got it, 5 hours.');
    expect(reflection).not.toBe(question);
    expect(reflection.querySelector('strong')).toBeNull();
  });
});

describe('splitParagraphs', () => {
  it('keeps a deliberate single line break inside its paragraph', () => {
    expect(splitParagraphs('one\ntwo\n\nthree')).toEqual(['one\ntwo', 'three']);
  });

  it('never returns nothing, so a turn mid-break is still drawn', () => {
    expect(splitParagraphs('')).toEqual(['']);
  });
});
