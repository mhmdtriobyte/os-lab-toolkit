import { cpp } from '@codemirror/lang-cpp';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useTheme } from '@oslab/core';
import { useMemo } from 'react';

export interface LineMark {
  line: number;
  pid: number;
  color: string;
  /** The line this process executed in the current step. */
  active: boolean;
}

class PidChips extends WidgetType {
  constructor(private readonly marks: LineMark[]) {
    super();
  }

  eq(other: PidChips): boolean {
    return JSON.stringify(other.marks) === JSON.stringify(this.marks);
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-pid-chips';
    for (const m of this.marks) {
      const chip = document.createElement('span');
      chip.textContent = `P${m.pid}`;
      chip.style.cssText = `background:${m.color};color:white;border-radius:4px;padding:0 4px;margin-left:4px;font-size:0.75em;font-weight:600;${m.active ? 'outline:2px solid currentColor;outline-offset:1px;' : 'opacity:0.7;'}`;
      wrap.appendChild(chip);
    }
    return wrap;
  }
}

function decorations(view: EditorView, marks: LineMark[], errorLine: number | null): DecorationSet {
  const doc = view.state.doc;
  const byLine = new Map<number, LineMark[]>();
  for (const m of marks) {
    if (m.line < 1 || m.line > doc.lines) continue;
    byLine.set(m.line, [...(byLine.get(m.line) ?? []), m]);
  }
  if (errorLine !== null && errorLine >= 1 && errorLine <= doc.lines && !byLine.has(errorLine)) {
    byLine.set(errorLine, []);
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const lineNo of [...byLine.keys()].sort((a, b) => a - b)) {
    const line = doc.line(lineNo);
    const lineMarks = byLine.get(lineNo) as LineMark[];
    const active = lineMarks.find((m) => m.active);
    const style =
      lineNo === errorLine
        ? 'background: rgba(225, 29, 72, 0.18)'
        : `background: ${(active ?? lineMarks[0])?.color}${active ? '33' : '14'}`;
    builder.add(line.from, line.from, Decoration.line({ attributes: { style } }));
    if (lineMarks.length > 0) {
      builder.add(
        line.to,
        line.to,
        Decoration.widget({ widget: new PidChips(lineMarks), side: 1 }),
      );
    }
  }
  return builder.finish();
}

export function CodeEditor({
  value,
  onChange,
  marks,
  errorLine,
}: {
  value: string;
  onChange: (value: string) => void;
  marks: LineMark[];
  errorLine: number | null;
}) {
  const { theme } = useTheme();
  const extensions = useMemo(
    () => [
      cpp(),
      EditorView.lineWrapping,
      EditorView.decorations.of((view) => decorations(view, marks, errorLine)),
    ],
    [marks, errorLine],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={theme === 'dark' ? 'dark' : 'light'}
      basicSetup={{ foldGutter: false, highlightActiveLine: false }}
      minHeight="280px"
      maxHeight="60vh"
      aria-label="C source code"
      className="overflow-hidden rounded-md border border-slate-300 text-[0.9rem] dark:border-slate-600"
    />
  );
}
