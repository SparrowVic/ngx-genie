/** Layout/grouping strategy identifiers and the per-render statistics the view exposes. */

export type ConstellationLinkRenderMode = 'adaptive' | 'focused' | 'all';
export type ConstellationLayoutStrategy = 'auto' | 'atlas' | 'organic';
// 'type' is a legacy stored alias for 'node-type' (migrated on load); it is not a user-facing option.
export type ConstellationGroupingStrategy = 'node-type' | 'scope' | 'tree' | 'type' | 'none';
export type ConstellationLayoutMode = 'force' | 'atlas' | 'organic';

export interface ConstellationGraphStats {
  nodes: number;
  renderedNodes: number;
  links: number;
  renderedLinks: number;
  providerLinks: number;
  dependencyLinks: number;
  componentLinks: number;
  aggregateLinks: number;
  simulationLinks: number;
  hiddenSimulationLinks: number;
  isHuge: boolean;
  layoutMode: ConstellationLayoutMode;
}
