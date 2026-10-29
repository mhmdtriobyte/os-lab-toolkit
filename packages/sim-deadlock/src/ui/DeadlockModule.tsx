import { ModuleHeader, Tabs, useSharedInput, type ModuleProps } from '@oslab/core';
import { BankerView } from './BankerView';
import { DetectionView } from './DetectionView';
import { DEFAULT_INPUT, sanitizeInput, type DeadlockInput, type DeadlockTab } from './input';
import { RagView } from './RagView';

const TABS: { value: DeadlockTab; label: string }[] = [
  { value: 'banker', label: "Banker's algorithm" },
  { value: 'detection', label: 'Deadlock detection' },
  { value: 'rag', label: 'Resource allocation graph' },
];

export function DeadlockModule({ examples }: ModuleProps) {
  const shared = useSharedInput(examples, DEFAULT_INPUT, sanitizeInput);
  const { input, setInput } = shared;
  const update = (patch: Partial<DeadlockInput>) => setInput({ ...input, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        title="Deadlock"
        description="Banker's algorithm (safety and resource requests), deadlock detection, and resource allocation graphs."
        moduleId="deadlock"
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
      {input.tab === 'banker' && (
        <BankerView state={input.banker} onChange={(banker) => update({ banker })} />
      )}
      {input.tab === 'detection' && (
        <DetectionView state={input.detection} onChange={(detection) => update({ detection })} />
      )}
      {input.tab === 'rag' && <RagView rag={input.rag} onChange={(rag) => update({ rag })} />}
    </div>
  );
}
