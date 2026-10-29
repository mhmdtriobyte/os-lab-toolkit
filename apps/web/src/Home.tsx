import { Icon } from '@oslab/core';
import { Link } from 'react-router-dom';
import { REPO_URL } from './config';
import { examplesFor } from './examples';
import { modules } from './modules';

export function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 py-4">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          OS Lab Toolkit
        </h1>
        <p className="max-w-3xl text-lg text-slate-600 dark:text-slate-300">
          Open source teaching tools for operating systems courses. Paste C code that calls{' '}
          <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">fork()</code> and watch the
          process tree grow, schedule processes, hunt deadlocks and race conditions. Nothing to
          install: everything is simulated in your browser and works offline.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every module has an <strong>Examples</strong> menu and a <strong>Share link</strong>{' '}
          button, so an exercise can be handed out as a single URL. Turn on{' '}
          <strong>Presentation</strong> mode on a projector.
        </p>
      </section>

      <section aria-labelledby="modules-heading" className="flex flex-col gap-3">
        <h2 id="modules-heading" className="text-xl font-semibold">
          Modules
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link
                to={`/${m.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                  <Icon name={m.icon} className="h-6 w-6" />
                </span>
                <span className="text-lg font-semibold text-slate-900 dark:text-white">
                  {m.title}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{m.summary}</span>
                <span className="mt-auto flex flex-wrap gap-1 pt-2">
                  {m.topics.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="examples-heading" className="flex flex-col gap-3">
        <h2 id="examples-heading" className="text-xl font-semibold">
          Examples from the course
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((m) => {
            const examples = examplesFor(m.id);
            if (examples.length === 0) return null;
            return (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <h3 className="mb-2 font-semibold">{m.title}</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {examples.map((ex) => (
                    <li key={ex.id}>
                      <Link
                        to={`/${m.id}#ex=${encodeURIComponent(ex.id)}`}
                        className="text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
                      >
                        {ex.title}
                      </Link>
                      {ex.description && (
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          · {ex.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="text-sm text-slate-600 dark:text-slate-400">
        Found a bug or want to add an exercise?{' '}
        <a href={REPO_URL} className="text-indigo-700 underline dark:text-indigo-300">
          Contribute on GitHub
        </a>
        . Examples are plain JSON files, no code needed.
      </section>
    </div>
  );
}
