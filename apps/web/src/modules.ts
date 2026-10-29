import type { ModuleProps } from '@oslab/core';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface ModuleEntry {
  /** Route path and examples folder name. */
  id: string;
  title: string;
  summary: string;
  topics: string[];
  icon: string;
  Component: LazyExoticComponent<ComponentType<ModuleProps>>;
}

export const modules: ModuleEntry[] = [
  {
    id: 'fork',
    title: 'Fork visualizer',
    summary:
      'Paste C code with fork(), wait() and sleep(). See the process tree, every possible output, zombies and orphans.',
    topics: ['fork', 'getpid', 'wait', 'zombie', 'orphan', 'ps / kill'],
    icon: '🌳',
    Component: lazy(() => import('@oslab/fork-visualizer').then((m) => ({ default: m.Module }))),
  },
  {
    id: 'scheduling',
    title: 'CPU scheduling',
    summary:
      'FCFS, SJF, SRTF, Priority and Round Robin with an animated Gantt chart, ready queue, metrics and a compare mode.',
    topics: ['Gantt chart', 'waiting time', 'turnaround', 'preemption', 'time quantum'],
    icon: '📊',
    Component: lazy(() => import('@oslab/sim-scheduling').then((m) => ({ default: m.Module }))),
  },
];
