/** Internal data shapes used while building a constellation graph layout. */
import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {ConstellationGraphStats, RenderLink, RenderNode} from '../models/constellation.models';
import {WorkerLink, WorkerNode} from '../worker/constellation.worker';

export interface MappedGraphData {
  workerNodes: WorkerNode[];
  workerLinks: WorkerLink[];
  renderNodes: Map<string, RenderNode>;
  renderLinks: RenderLink[];
  stats: ConstellationGraphStats;
}

export interface VisibleDependency {
  consumerNodeId: number;
  providerId: number;
}

export interface AggregatedDependencyLink {
  sourceId: string;
  targetId: string;
  count: number;
  sortKey: number;
}

export interface AggregatedDependencySummary {
  total: number;
  renderedLinks: AggregatedDependencyLink[];
}

export interface OrganicGroupAssignment {
  key: string;
  label: string;
  index: number;
  memberCount: number;
  center: { x: number; y: number };
  radius: number;
  colorSeed: number;
  subgroupKey?: string;
  subgroupLabel?: string;
  subgroupIndex?: number;
  subgroupMemberCount?: number;
  subgroupCenter?: { x: number; y: number };
  subgroupRadius?: number;
}

export interface StaticLayoutResult {
  injectorPositions: Map<number, { x: number; y: number }>;
  servicePositions: Map<number, { x: number; y: number }>;
  injectorGroups?: Map<number, OrganicGroupAssignment>;
  serviceGroups?: Map<number, OrganicGroupAssignment>;
}

export interface OrganicRankedNode {
  node: GenieTreeNode;
  services: GenieServiceRegistration[];
  originalIndex: number;
  importance: number;
  clusterRadius: number;
  groupKey: string;
  groupLabel: string;
  subgroupKey: string;
  subgroupLabel: string;
}

export interface OrganicServiceRankedNode {
  service: GenieServiceRegistration;
  ownerNodeId: number;
  originalIndex: number;
  importance: number;
  clusterRadius: number;
  groupKey: string;
  groupLabel: string;
  subgroupKey: string;
  subgroupLabel: string;
}

export interface OrganicGroup {
  key: string;
  label: string;
  members: OrganicRankedNode[];
  radius: number;
  importance: number;
}

export interface OrganicSubgroup {
  key: string;
  label: string;
  members: OrganicRankedNode[];
  radius: number;
  importance: number;
}

export interface OrganicServiceGroup {
  key: string;
  label: string;
  members: OrganicServiceRankedNode[];
  radius: number;
  importance: number;
}

export interface OrganicServiceSubgroup {
  key: string;
  label: string;
  members: OrganicServiceRankedNode[];
  radius: number;
  importance: number;
}
