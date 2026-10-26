import type { RoundInfo } from '../types';

export interface RuleSection {
  title: string;
  items: string[];
}

/** The rules a participant must read and accept before a round starts. Written for each round type. */
export function rulesFor(r: RoundInfo): RuleSection[] {
  const limit =
    r.maxViolations > 0
      ? `After ${r.maxViolations} violations your round is submitted automatically.`
      : 'The organiser can disqualify a participant who breaks these rules.';

  const general: RuleSection = {
    title: 'Exam rules (every round)',
    items: [
      'The round opens in full screen and must stay in full screen until you submit. If you leave full screen, the questions are hidden until you return.',
      'Do not switch tabs, windows or apps. Every time you leave the page it is recorded and shown to the organiser. ' + limit,
      'Copy, cut, paste and right-click are switched off. Do not use notes, other devices, the internet or other people.',
      `You get ${r.durationMin} minutes. The timer starts when you press Start, is kept by the server and cannot be paused, even if you close the page.`,
      'You can attempt this round only once. It is submitted automatically when the time ends.',
      'After you submit you will see only your score. The organiser decides who moves to the next round and will tell you.',
    ],
  };

  if (r.type === 'quiz') {
    return [
      {
        title: 'Round 1: technical quiz',
        items: [
          `You get ${r.problemCount} multiple-choice questions in a random order. Every student sees a different order.`,
          `Each correct answer is worth ${r.marksPerQuestion} mark${r.marksPerQuestion === 1 ? '' : 's'}. Total: ${r.maxScore}. Wrong or skipped questions give 0. There is no negative marking.`,
          'Choose one option per question. Click the same option again to clear it. You can change answers until you submit.',
          'Your answers are saved automatically. Press Submit round when you are done.',
        ],
      },
      general,
    ];
  }
  if (r.type === 'codefix') {
    return [
      {
        title: 'Round 2: code correction',
        items: [
          'Choose your language (Python, Java or C) before you start. You cannot change it later.',
          `You get ${r.problemCount} questions in a random order, in your chosen language. Each shows wrong code with a mistake in it.`,
          'Type the complete corrected program in your editor. Press Tab to indent. Your code is saved automatically.',
          `Your code is compared with the organiser's correct code. Comments, blank lines and extra spaces are ignored, but names, symbols and logic must match. Each question is worth ${r.marksPerQuestion} marks (total ${r.maxScore}), all or nothing.`,
          'Press Submit round after your last question. Your score is generated when you submit.',
        ],
      },
      general,
    ];
  }
  return [
    {
      title: 'Round 3: problem solving',
      items: [
        'Choose your language (Python, Java or C) before you start. You cannot change it later.',
        `You get ${r.problemCount} problems. Write a complete program that reads the input and prints the output. In Java the class must be named Main.`,
        'Run code tests your program on the sample input, or on an input you type. Running gives no marks.',
        `Submit code tests your program against the organiser's hidden test cases. Marks are given in proportion to the tests passed (total ${r.maxScore}). Your best submission for each problem counts, and you can submit again.`,
        'Wrong output, extra text, compile errors and slow programs lose marks. Print exactly what the problem asks for.',
        'Press Submit round when you finish. Code you did not submit with Submit code is not scored.',
      ],
    },
    general,
  ];
}
