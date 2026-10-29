import { ModuleHeader, Tabs, useSharedInput, type ModuleProps } from '@oslab/core';
import { AllocationView } from './AllocationView';
import { DEFAULT_INPUT, sanitizeInput, type MemoryInput, type MemoryTab } from './input';
import { PagingView } from './PagingView';

const TABS: { value: MemoryTab; label: string }[] = [
  { value: 'paging', label: 'Page replacement' },
  { value: 'allocation', label: 'Memory allocation' },
];

export function MemoryModule({ examples }: ModuleProps) {
  const shared = useSharedInput(examples, DEFAULT_INPUT, sanitizeInput);
  const { input, setInput } = shared;
  const update = (patch: Partial<MemoryInput>) => setInput({ ...input, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        title="Memory"
        description="Page replacement (FIFO, LRU, Optimal, Clock) with Belady's anomaly, and first/best/worst fit allocation."
        moduleId="memory"
        examples={examples}
        exampleId={shared.exampleId}
        onLoadExample={shared.loadExample}
        input={input}
        onImport={(raw) => {
          const parsed = sanitizeInput(raw);
          if (parsed) setInput(parsed);
          return parsed !== null;
        }}
      />
      <Tabs label="Tool" value={input.tab} onChange={(tab) => update({ tab })} options={TABS} />
      {input.tab === 'paging' ? (
        <PagingView input={input} update={update} />
      ) : (
        <AllocationView input={input} update={update} />
      )}
    </div>
  );
}
