/** Primitives the engine renders: a positioned graph node, a link between nodes, and link animation. */

export interface RenderNode {
  id: string;
  x: number;
  y: number;
  type: 'injector' | 'service';
  data: any;
  radius: number;
  baseColor: string;
  glowColor: string;
  meta?: {
    isRoot?: boolean;
    isFramework?: boolean;
    dependencyType?: string;
    label: string;
    subLabel?: string;
    isUnused?: boolean;
    importance?: number;
    clusterSize?: number;
    groupKey?: string;
    groupLabel?: string;
    groupIndex?: number;
    groupMemberCount?: number;
    groupCenterX?: number;
    groupCenterY?: number;
    groupRadius?: number;
    groupColorSeed?: number;
    subgroupKey?: string;
    subgroupLabel?: string;
    subgroupIndex?: number;
    subgroupMemberCount?: number;
    subgroupCenterX?: number;
    subgroupCenterY?: number;
    subgroupRadius?: number;
  };
  angle?: number;
  pulseOffset?: number;
}

export interface RenderLink {
  sourceId: string;
  targetId: string;
  type: 'provider' | 'dependency' | 'component-child' | 'aggregate-dependency';
  uniqueId: string;
  weight?: number;
}

export interface LinkAnimState {
  state: 'IDLE' | 'SHOOTING';
  stateStartTime: number;
  duration: number;
  currentSpeed: number;
  currentLength: number;
}
