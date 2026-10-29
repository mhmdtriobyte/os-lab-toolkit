import type { ModuleProps } from '@oslab/core';
import type { ComponentType, LazyExoticComponent } from 'react';

export interface ModuleEntry {
  /** Route path and examples folder name. */
  id: string;
  title: string;
  summary: string;
  topics: string[];
  icon: string;
  Component: LazyExoticComponent<ComponentType<ModuleProps>>;
}

export const modules: ModuleEntry[] = [];
