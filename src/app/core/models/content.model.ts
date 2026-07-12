export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly tag: string;
}

export interface RoadmapItem {
  readonly text: string;
  readonly done: boolean;
}

export interface RoadmapPhase {
  readonly quarter: string;
  readonly title: string;
  readonly status: 'shipped' | 'in-progress' | 'planned';
  readonly items: readonly RoadmapItem[];
}

export interface CommandAction {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: string;
  readonly group: string;
  readonly path?: string;
  readonly external?: string;
}

export interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly body: string;
  readonly code?: string;
  readonly lang?: string;
}

export interface ConfigOption {
  readonly name: string;
  readonly type: string;
  readonly default: string;
  readonly description: string;
}

export interface MechanismStep {
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly accent: string;
}
