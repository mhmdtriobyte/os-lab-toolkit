import { Button, Icon, NumberInput, randomSeed, tableClass, TextInput } from '@oslab/core';
import { randomProcesses, type ProcessSpec } from '../engine';
import { procColor } from './GanttChart';

export function ProcessTableEditor({
  processes,
  onChange,
}: {
  processes: ProcessSpec[];
  onChange: (processes: ProcessSpec[]) => void;
}) {
  const set = (i: number, patch: Partial<ProcessSpec>) =>
    onChange(processes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const nextName = () => {
    const used = new Set(processes.map((p) => p.name));
    let k = processes.length + 1;
    while (used.has(`P${k}`)) k++;
    return `P${k}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Process</th>
              <th>Arrival</th>
              <th>Burst</th>
              <th>Priority</th>
              <th className="sr-only">Remove</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p, i) => (
              <tr key={i}>
                <td>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: procColor(i) }}
                      aria-hidden
                    />
                    <TextInput
                      value={p.name}
                      aria-label={`Name of process ${i + 1}`}
                      maxLength={12}
                      onChange={(e) => set(i, { name: e.target.value })}
                      className="w-20"
                    />
                  </span>
                </td>
                <td>
                  <NumberInput
                    aria-label={`Arrival time of ${p.name}`}
                    value={p.arrival}
                    min={0}
                    max={1000}
                    onValueChange={(arrival) => set(i, { arrival })}
                  />
                </td>
                <td>
                  <NumberInput
                    aria-label={`Burst time of ${p.name}`}
                    value={p.burst}
                    min={1}
                    max={1000}
                    onValueChange={(burst) => set(i, { burst })}
                  />
                </td>
                <td>
                  <NumberInput
                    aria-label={`Priority of ${p.name}`}
                    value={p.priority}
                    min={-1000}
                    max={1000}
                    onValueChange={(priority) => set(i, { priority })}
                  />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => onChange(processes.filter((_, j) => j !== i))}
                    disabled={processes.length <= 1}
                  >
                    <Icon name="close" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onChange([...processes, { name: nextName(), arrival: 0, burst: 1, priority: 1 }])
          }
          disabled={processes.length >= 50}
        >
          + Add process
        </Button>
        <Button onClick={() => onChange(randomProcesses(randomSeed()))}>
          <Icon name="shuffle" />
          Random
        </Button>
      </div>
    </div>
  );
}
