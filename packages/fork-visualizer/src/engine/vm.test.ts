import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { exploreAll } from './exhaustive';
import { checkAnswer, generateQuiz } from './quiz';
import {
  clockStep,
  initialStep,
  killStep,
  runDeterministic,
  runToEnd,
  type ForkStep,
} from './scheduler';
import { mainWith, runToFinal, stdoutText } from './testing';
import { DEFAULT_CONFIG, findProc, type System } from './vm';

const users = (sys: System) => sys.procs.filter((p) => p.kind === 'user');

describe('interpreter basics', () => {
  it('evaluates integer expressions with C semantics', () => {
    const sys = runToFinal(
      mainWith(`
        int a = 7, b = 2;
        printf("%d %d %d %d\\n", a / b, -7 / 2, -7 % 2, a * b + 1);
        printf("%d %d %d\\n", !0, !5, (3 > 2) + (2 > 3));
        int x = 0;
        if (x) printf("no\\n"); else printf("zero is false\\n");
        if (-1) printf("nonzero is true\\n");
        printf("%c%c %s %5d|%-3d|%%\\n", 'o', 'k', "str", 42, 7);
      `),
    );
    expect(stdoutText(sys)).toBe(
      '3 -3 -1 15\n1 0 1\nzero is false\nnonzero is true\nok str    42|7  |%\n',
    );
  });

  it('runs loops, break/continue and functions', () => {
    const sys = runToFinal(
      `int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }
       int main() {
         int s = 0;
         for (int i = 0; i < 10; i++) { if (i % 2) continue; if (i > 6) break; s += i; }
         int j = 0;
         do { j++; } while (j < 3);
         while (j > 0) j--;
         printf("%d %d %d\\n", s, j, fact(5));
       }`,
    );
    expect(stdoutText(sys)).toBe('12 0 120\n');
  });

  it('kills a process on division by zero', () => {
    const sys = runToFinal(mainWith('int z = 0; printf("%d\\n", 1 / z);'));
    const p = users(sys)[0];
    expect(p?.signal).toBe('SIGFPE');
    expect(p?.error).toMatch(/division by zero/);
  });
});

describe('fork', () => {
  it('fork(); fork(); creates 4 processes', () => {
    const sys = runToFinal(mainWith('fork(); fork(); printf("hi\\n");'));
    expect(users(sys)).toHaveLength(4);
    expect(stdoutText(sys)).toBe('hi\n'.repeat(4));
  });

  it('three forks create 8 processes', () => {
    expect(users(runToFinal(mainWith('fork(); fork(); fork();')))).toHaveLength(8);
  });

  it('forks in a loop: 2^n processes', () => {
    expect(users(runToFinal(mainWith('for (int i = 0; i < 4; i++) fork();')))).toHaveLength(16);
  });

  it('if (fork()) gives the parent the child pid and the child 0', () => {
    const sys = runToFinal(
      mainWith(`
        pid_t pid = fork();
        if (pid) { printf("parent %d got %d\\n", getpid(), pid); wait(NULL); }
        else printf("child %d got %d, parent %d\\n", getpid(), pid, getppid());
      `),
    );
    expect(stdoutText(sys)).toBe('parent 1000 got 1001\nchild 1001 got 0, parent 1000\n');
  });

  it('short-circuit && and || control which processes fork', () => {
    expect(users(runToFinal(mainWith('fork() && fork();')))).toHaveLength(3);
    expect(users(runToFinal(mainWith('fork() || fork();')))).toHaveLength(3);
  });

  it('copies variables on fork and keeps them separate afterwards', () => {
    const sys = runToFinal(
      mainWith(
        `int x = 1;
         if (fork() == 0) { x = 100; g = 5; printf("child %d %d\\n", x, g); exit(0); }
         wait(NULL);
         printf("parent %d %d\\n", x, g);`,
        'int g = 1;',
      ),
    );
    expect(stdoutText(sys)).toBe('child 100 5\nparent 1 1\n');
  });

  it('allocates pids sequentially from the configured start', () => {
    const sys = runToFinal(mainWith('fork(); fork();'), 'parent-first', {
      ...DEFAULT_CONFIG,
      pidStart: 5000,
    });
    expect(users(sys).map((p) => p.pid)).toEqual([5000, 5001, 5002, 5003]);
  });

  it('fork returns -1 after the configured limit', () => {
    const sys = runToFinal(
      mainWith('if (fork() < 0) printf("fail\\n");\nif (fork() < 0) printf("fail\\n");'),
      'parent-first',
      {
        ...DEFAULT_CONFIG,
        forkLimit: 1,
      },
    );
    expect(users(sys)).toHaveLength(2);
    expect(stdoutText(sys)).toBe('fail\nfail\n');
  });

  it('child-first policy runs the child right after fork', () => {
    const src = mainWith('if (fork() == 0) printf("child\\n"); else printf("parent\\n");');
    expect(stdoutText(runToFinal(src, 'parent-first'))).toBe('parent\nchild\n');
    expect(stdoutText(runToFinal(src, 'child-first'))).toBe('child\nparent\n');
  });
});

describe('wait, zombies and orphans', () => {
  it('wait blocks until a child terminates and returns its pid and status', () => {
    const sys = runToFinal(
      mainWith(`
        int status;
        if (fork() == 0) { printf("child\\n"); exit(3); }
        int w = wait(&status);
        printf("reaped %d code %d exited %d\\n", w, WEXITSTATUS(status), WIFEXITED(status));
        printf("again %d\\n", wait(NULL));
      `),
    );
    expect(stdoutText(sys)).toBe('child\nreaped 1001 code 3 exited 1\nagain -1\n');
    expect(findProc(sys, 1001)?.state).toBe('terminated');
  });

  it('waitpid waits for a specific child', () => {
    const sys = runToFinal(
      mainWith(`
        pid_t a = fork();
        if (a == 0) { sleep(5); printf("a\\n"); exit(0); }
        pid_t b = fork();
        if (b == 0) { printf("b\\n"); exit(0); }
        waitpid(a, NULL, 0);
        printf("parent after a\\n");
      `),
    );
    expect(stdoutText(sys)).toBe('b\na\nparent after a\n');
  });

  it('a child that exits before its parent waits is a zombie', () => {
    const program = compile(
      mainWith(`
        if (fork() == 0) { exit(0); }
        sleep(10);
        wait(NULL);
      `),
    );
    const run = runDeterministic(program, 'parent-first', DEFAULT_CONFIG);
    const states = run.steps.map((s) => findProc(s.state.sys, 1001)?.state);
    expect(states).toContain('zombie');
    expect(states[states.length - 1]).toBe('terminated');
  });

  it('re-parents orphans to init (PID 1)', () => {
    const sys = runToFinal(
      mainWith(`
        if (fork() == 0) {
          printf("before %d\\n", getppid());
          sleep(5);
          printf("after %d\\n", getppid());
          return 0;
        }
        sleep(1);
        printf("parent exits\\n");
      `),
    );
    expect(stdoutText(sys)).toBe('before 1000\nparent exits\nafter 1\n');
    const child = findProc(sys, 1001);
    expect(child?.ppid).toBe(1);
    expect(child?.orphaned).toBe(true);
    expect(child?.state).toBe('terminated'); // init reaps it
  });

  it('course exercise: both sleep(30), killing the parent makes the child an orphan', () => {
    const program = compile(
      mainWith(`
        pid_t pid = fork();
        if (pid) { printf("parent %d\\n", getpid()); sleep(30); }
        else { printf("child %d parent %d\\n", getpid(), getppid()); sleep(30); printf("child now has parent %d\\n", getppid()); }
      `),
    );
    const run = runDeterministic(program, 'parent-first', DEFAULT_CONFIG);
    // The step just before the clock jumps to t=30: both processes are asleep.
    const before = run.steps.findIndex((s) => s.state.events.some((e) => e.k === 'clock')) - 1;
    const asleep = run.steps.slice(0, before + 1);
    expect(
      users((asleep[asleep.length - 1] as ForkStep).state.sys).every((p) => p.state === 'sleeping'),
    ).toBe(true);
    const killed = killStep((asleep[asleep.length - 1] as ForkStep).state, 1000, DEFAULT_CONFIG);
    expect(findProc(killed.state.sys, 1001)?.ppid).toBe(1);
    const rest = runToEnd(program, [...asleep, killed], 'parent-first', DEFAULT_CONFIG);
    const final = (rest.steps[rest.steps.length - 1] as ForkStep).state.sys;
    expect(stdoutText(final)).toContain('child now has parent 1\n');
    expect(findProc(final, 1000)?.signal).toBe('SIGKILL');
  });

  it('sleep orders processes by virtual time', () => {
    const sys = runToFinal(
      mainWith(`
        if (fork() == 0) { sleep(2); printf("child\\n"); return 0; }
        sleep(1);
        printf("parent\\n");
        wait(NULL);
      `),
    );
    expect(stdoutText(sys)).toBe('parent\nchild\n');
    expect(sys.clock).toBe(2);
  });

  it('clockStep only advances when nothing is ready', () => {
    const program = compile(mainWith('printf("x\\n");'));
    expect(clockStep(initialStep(program, DEFAULT_CONFIG).state, DEFAULT_CONFIG)).toBeNull();
  });

  it('stops infinite loops at the step limit', () => {
    const run = runDeterministic(
      compile(mainWith('while (1) { }')),
      'parent-first',
      DEFAULT_CONFIG,
      200,
    );
    expect(run.truncated).toBe(true);
  });
});

describe('exhaustive exploration', () => {
  it('Before the fork / After the fork yields the expected outputs', () => {
    const program = compile(
      mainWith(`
        printf("Before the fork\\n");
        pid_t pid = fork();
        printf("After the fork %d\\n", pid);
      `),
    );
    const r = exploreAll(program, DEFAULT_CONFIG);
    expect(r.truncated).toBe(false);
    expect(r.outcomes.map((o) => o.output).sort()).toEqual(
      [
        'Before the fork\nAfter the fork 0\nAfter the fork 1001\n',
        'Before the fork\nAfter the fork 1001\nAfter the fork 0\n',
      ].sort(),
    );
    expect(r.outcomes.every((o) => o.count >= 1)).toBe(true);
  });

  it('wait forces the child to print first', () => {
    const program = compile(
      mainWith(`
        if (fork() == 0) { printf("child\\n"); return 0; }
        wait(NULL);
        printf("parent\\n");
      `),
    );
    const r = exploreAll(program, DEFAULT_CONFIG);
    expect(r.outcomes.map((o) => o.output)).toEqual(['child\nparent\n']);
  });

  it('counts interleavings and keeps a replayable example path', () => {
    const program = compile(mainWith('fork(); printf("x\\n");'));
    const r = exploreAll(program, DEFAULT_CONFIG);
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0]?.output).toBe('x\nx\n');
    expect(r.outcomes[0]?.path.length).toBeGreaterThan(0);
  });

  it('reports truncation at the state cap', () => {
    const program = compile(mainWith('fork(); fork(); fork(); fork(); printf("%d\\n", getpid());'));
    expect(exploreAll(program, DEFAULT_CONFIG, 50).truncated).toBe(true);
  });
});

describe('quiz', () => {
  it('generates checkable questions of every kind', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const kind of ['processes', 'prints', 'possible-output'] as const) {
        const quiz = generateQuiz(kind, seed);
        expect(() => compile(quiz.code)).not.toThrow();
        expect(checkAnswer(quiz, quiz.answer)).toBe(true);
        if (kind === 'possible-output') {
          expect(quiz.options).toHaveLength(4);
          expect(quiz.options?.filter((o) => checkAnswer(quiz, o))).toHaveLength(1);
        }
      }
    }
  });

  it('is deterministic for a seed', () => {
    expect(generateQuiz('processes', 42)).toEqual(generateQuiz('processes', 42));
  });
});
