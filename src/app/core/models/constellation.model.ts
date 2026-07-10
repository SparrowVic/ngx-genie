export type NodeKind = 'service' | 'component' | 'token' | 'directive' | 'pipe';
export type ProviderScope = 'root' | 'element' | 'platform';

export interface GraphNode {
  readonly id: number;
  readonly label: string;
  readonly kind: NodeKind;
  readonly scope: ProviderScope;
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly r: number;
  readonly accent: string;
}

export interface GraphEdge {
  readonly source: number;
  readonly target: number;
  readonly strength: number;
}

export interface GraphModel {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
