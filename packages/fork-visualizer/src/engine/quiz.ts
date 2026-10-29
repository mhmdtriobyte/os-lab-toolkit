import { rng, type Rng } from '@oslab/core/engine';
import { compile } from './compiler';
import { exploreAll } from './exhaustive';
import { runDeterministic } from './scheduler';
import { DEFAULT_CONFIG, type System } from './vm';

export type QuizKind = 'processes' | 'prints' | 'possible-output';

export const QUIZ_KINDS: { value: QuizKind; label: string }[] = [
  { value: 'processes', label: 'How many processes?' },
  { value: 'prints', label: 'How many times printed?' },
  { value: 'possible-output', label: 'Which output is possible?' },
];

export interface Quiz {
  kind: QuizKind;
  seed: number;
  code: string;
  question: string;
  /** Multiple-choice options (possible-output only). */
  options?: string[];
  answer: string;
  explanation: string;
}

const HEADER = '#include <stdio.h>\n#include <unistd.h>\n#include <sys/wait.h>\n\nint main() {\n';
const MAX_PROCESSES = 32;

function indent(lines: string[], level: number): string[] {
  return lines.map((l) => '    '.repeat(level) + l);
}

/** Random statements mixing fork() in sequences, conditionals, loops and short-circuit operators. */
function forkBlock(r: Rng, depth: number, print: string | null): string[] {
  const out: string[] = [];
  const count = r.int(1, depth === 0 ? 3 : 2);
  for (let i = 0; i < count; i++) {
    const choice = r.int(0, depth >= 1 ? 2 : 5);
    if (choice <= 1) out.push('fork();');
    else if (choice === 2) out.push(r.pick(['fork() && fork();', 'fork() || fork();']));
    else if (choice === 3) {
      out.push(r.pick(['if (fork() == 0) {', 'if (fork()) {']));
      out.push(...indent(forkBlock(r, depth + 1, null), 1));
      out.push('}');
    } else if (choice === 4) {
      out.push(`for (i = 0; i < ${r.int(2, 3)}; i++) {`);
      out.push(...indent(['fork();'], 1));
      out.push('}');
    } else {
      out.push('if (fork() == 0) {');
      out.push(...indent(forkBlock(r, depth + 1, null), 1));
      out.push('} else {');
      out.push(...indent(['fork();'], 1));
      out.push('}');
    }
    if (print && r.int(0, 3) === 0) out.push(`printf("${print}\\n");`);
  }
  return out;
}

function program(body: string[]): string {
  return `${HEADER}${indent(body, 1).join('\n')}\n    return 0;\n}\n`;
}

function userProcs(sys: System) {
  return sys.procs.filter((p) => p.kind === 'user');
}

function treeText(sys: System): string {
  const procs = userProcs(sys);
  return procs
    .map((p) => {
      const kids = procs.filter((c) => c.creator === p.pid).map((c) => `P${c.pid}`);
      return kids.length ? `P${p.pid} → ${kids.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function countingQuiz(kind: 'processes' | 'prints', seed: number): Quiz {
  for (let attempt = 0; ; attempt++) {
    const r = rng(seed + attempt * 7919);
    const word = kind === 'prints' ? r.pick(['hello', 'OS', 'hi', 'fork']) : null;
    const body = forkBlock(r, 0, word);
    const usesLoop = body.some((l) => l.startsWith('for ('));
    if (word && !body.some((l) => l.includes('printf'))) body.push(`printf("${word}\\n");`);
    const code = program([...(usesLoop ? ['int i;'] : []), ...body]);
    const run = runDeterministic(compile(code), 'parent-first', DEFAULT_CONFIG);
    const final = (run.steps[run.steps.length - 1] as { state: { sys: System } }).state.sys;
    const total = final.forks + 1;
    if (total > MAX_PROCESSES || run.truncated) continue;
    const tree = treeText(final);
    if (kind === 'processes') {
      return {
        kind,
        seed,
        code,
        question: 'How many processes exist in total, counting the original one?',
        answer: String(total),
        explanation:
          `fork() succeeded ${final.forks} time(s) across all processes, and every successful fork() creates exactly one new process, ` +
          `so there are ${final.forks} + 1 = ${total} processes.\n` +
          'Remember: with &&, the right side only runs when the left side is non-zero (in the parent); with ||, only when it is 0 (in the child).' +
          (tree ? `\n\nWho created whom:\n${tree}` : ''),
      };
    }
    const lines = final.stdout
      .map((c) => c.text)
      .join('')
      .split('\n')
      .filter((l) => l === word).length;
    const printers = new Set(final.stdout.map((c) => c.pid)).size;
    return {
      kind,
      seed,
      code,
      question: `How many times is "${word}" printed?`,
      answer: String(lines),
      explanation:
        `Every process that reaches a printf runs it once. ${printers} of the ${total} processes reach it, ` +
        `printing "${word}" ${lines} time(s) in total (the order can vary, the count cannot).` +
        (tree ? `\n\nWho created whom:\n${tree}` : ''),
    };
  }
}

function possibleOutputQuiz(seed: number): Quiz {
  const r = rng(seed);
  const [a, b, c, d, e] = r.shuffle([
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'K',
    'M',
    'P',
    'X',
    'Y',
    'Z',
  ]) as string[];
  const p = (s: string | undefined) => `printf("${s}\\n");`;
  const withWait = r.int(0, 1) === 1;
  const templates: string[][] = [
    [
      p(a),
      'pid_t pid = fork();',
      'if (pid == 0) {',
      `    ${p(b)}`,
      '} else {',
      ...(withWait ? ['    wait(NULL);'] : []),
      `    ${p(c)}`,
      '}',
      p(d),
    ],
    [
      p(a),
      'if (fork() == 0) {',
      `    ${p(b)}`,
      `    ${p(c)}`,
      '    exit(0);',
      '}',
      p(d),
      ...(withWait ? ['wait(NULL);'] : []),
      p(e),
    ],
  ];
  const code = program(r.pick(templates));
  const result = exploreAll(compile(code), DEFAULT_CONFIG);
  const possible = new Set(result.outcomes.map((o) => o.output));
  const correct = r.pick([...possible]);
  const lines = correct.trimEnd().split('\n');
  const wrong = new Set<string>();
  for (let i = 0; i < 200 && wrong.size < 3; i++) {
    const candidate = `${r.shuffle(lines).join('\n')}\n`;
    if (!possible.has(candidate)) wrong.add(candidate);
  }
  const options = r.shuffle([correct, ...wrong]);
  return {
    kind: 'possible-output',
    seed,
    code,
    question: 'Which of these outputs is possible?',
    options,
    answer: correct,
    explanation:
      `The exhaustive explorer found ${possible.size} different possible outputs over ${result.totalInterleavings} interleavings. ` +
      `Text printed before fork() always comes first, because the child does not exist yet. ` +
      (withWait
        ? "wait(NULL) blocks the parent until the child exits, so the child's lines come before what the parent prints after wait()."
        : 'Without wait(), parent and child run concurrently, so their lines can interleave in any order; each process keeps its own order.'),
  };
}

export function generateQuiz(kind: QuizKind, seed: number): Quiz {
  return kind === 'possible-output' ? possibleOutputQuiz(seed) : countingQuiz(kind, seed);
}

export function checkAnswer(quiz: Quiz, response: string): boolean {
  return quiz.kind === 'possible-output'
    ? response === quiz.answer
    : Number(response.trim()) === Number(quiz.answer);
}
