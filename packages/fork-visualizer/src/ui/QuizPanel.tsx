import { Alert, Button, Field, Panel, randomSeed, Select, TextInput } from '@oslab/core';
import { useMemo, useState } from 'react';
import { checkAnswer, generateQuiz, QUIZ_KINDS, type QuizKind } from '../engine';

export function QuizPanel({ onOpen }: { onOpen: (code: string) => void }) {
  const [kind, setKind] = useState<QuizKind>('processes');
  const [seed, setSeed] = useState(() => randomSeed());
  const [response, setResponse] = useState('');
  const [checked, setChecked] = useState(false);
  const quiz = useMemo(() => generateQuiz(kind, seed), [kind, seed]);
  const correct = checked && checkAnswer(quiz, response);

  const next = () => {
    setSeed(randomSeed());
    setResponse('');
    setChecked(false);
  };

  return (
    <Panel
      title="Fork quiz"
      actions={
        <>
          <Select
            aria-label="Question type"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as QuizKind);
              setResponse('');
              setChecked(false);
            }}
          >
            {QUIZ_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <Button onClick={next}>New question</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-sm text-slate-100">
            {quiz.code}
          </pre>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Question seed {seed} (reproducible).
          </p>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(true);
          }}
        >
          <p className="text-lg font-semibold">{quiz.question}</p>
          {quiz.options ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Possible outputs</legend>
              {quiz.options.map((o, i) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700"
                >
                  <input
                    type="radio"
                    name="quiz-option"
                    className="mt-1 accent-indigo-600"
                    checked={response === o}
                    onChange={() => {
                      setResponse(o);
                      setChecked(false);
                    }}
                  />
                  <span className="text-sm font-semibold">{String.fromCharCode(65 + i)}.</span>
                  <pre className="text-sm">{o}</pre>
                </label>
              ))}
            </fieldset>
          ) : (
            <Field label="Your answer">
              <TextInput
                inputMode="numeric"
                value={response}
                onChange={(e) => {
                  setResponse(e.target.value);
                  setChecked(false);
                }}
                className="w-32"
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={!response}>
              Check answer
            </Button>
            <Button onClick={() => setChecked(true)}>Show answer</Button>
            <Button onClick={() => onOpen(quiz.code)}>Open in the visualizer</Button>
          </div>
          {checked && (
            <Alert tone={correct ? 'success' : response ? 'error' : 'info'}>
              <p className="font-semibold">
                {correct ? 'Correct!' : response ? 'Not quite.' : 'Answer:'}{' '}
                {!quiz.options && `The answer is ${quiz.answer}.`}
              </p>
              {quiz.options && !correct && <pre className="mt-1 text-sm">{quiz.answer}</pre>}
              <p className="mt-2 whitespace-pre-line text-sm">{quiz.explanation}</p>
            </Alert>
          )}
        </form>
      </div>
    </Panel>
  );
}
