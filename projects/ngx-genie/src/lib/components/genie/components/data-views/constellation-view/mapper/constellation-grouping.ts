import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {ConstellationGroupingStrategy} from '../models/constellation.models';

/**
 * Resolves how nodes/services are bucketed into groups and subgroups for the organic (clustered)
 * layout: the effective strategy, the group/subgroup keys and labels, and the tree-path/anchor logic
 * that keeps every member of a subtree under one stable group label. Pure and side-effect free.
 */
export class ConstellationGrouping {
  static _resolveGroupingStrategy(
    groupingStrategy: ConstellationGroupingStrategy,
    useOrganicLayout: boolean
  ): Exclude<ConstellationGroupingStrategy, 'auto'> {
    if (groupingStrategy === 'type') return 'node-type';
    if (
      groupingStrategy === 'node-type'
      || groupingStrategy === 'scope'
      || groupingStrategy === 'tree'
      || groupingStrategy === 'none'
    ) {
      return groupingStrategy;
    }

    // 'auto': group by node type whenever the layout is organic (consistent with the AUTO label),
    // instead of only above an invisible node-count threshold.
    return useOrganicLayout ? 'node-type' : 'none';
  }

  static _organicGroupingKey(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (groupingStrategy === 'none') return 'all';
    if (node.id === rootNodeId) return 'root';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return 'node-type:injector';
    if (groupingStrategy === 'scope') return 'scope:injector';

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    const current = path[this._semanticGroupAnchorIndex(path)] ?? node;

    return `tree:${current.id}`;
  }

  static _organicGroupingLabel(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (node.id === rootNodeId) return 'ROOT';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return 'Injector / Node';
    if (groupingStrategy === 'scope') return 'Injector / Node';
    // tree: label every member of a subtree by that subtree's anchor node (mirrors _organicGroupingKey),
    // instead of each member reporting its own name and the region taking an arbitrary member's label.
    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    const anchor = path[this._semanticGroupAnchorIndex(path)] ?? node;
    return anchor.label;
  }

  static _organicSubgroupingKey(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (groupingStrategy === 'none') return 'all';
    if (node.id === rootNodeId) return 'root';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') {
      return `node-type:injector:${this._normalizeGroupPart(node.label)}`;
    }
    if (groupingStrategy === 'scope') {
      return `scope:injector:${this._normalizeGroupPart(node.type)}:${this._normalizeGroupPart(node.label)}`;
    }

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    if (path.length === 0) return `tree:${node.id}`;

    const groupAnchorIndex = this._semanticGroupAnchorIndex(path);
    const subgroupAnchor = path[Math.min(path.length - 1, groupAnchorIndex + 1)] ?? path[groupAnchorIndex] ?? node;

    return `subtree:${subgroupAnchor.id}`;
  }

  static _organicSubgroupingLabel(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (node.id === rootNodeId) return 'ROOT';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return node.label;
    if (groupingStrategy === 'scope') return `${node.type} / ${node.label}`;

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    if (path.length === 0) return node.label;
    const groupAnchorIndex = this._semanticGroupAnchorIndex(path);
    const subgroupAnchor = path[Math.min(path.length - 1, groupAnchorIndex + 1)] ?? path[groupAnchorIndex] ?? node;
    return subgroupAnchor.label;
  }

  static _pathFromRoot(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>
  ): GenieTreeNode[] {
    const path: GenieTreeNode[] = [];
    let current: GenieTreeNode | undefined = node;
    let guard = 0;

    while (current && current.id !== rootNodeId && guard < 300) {
      path.push(current);
      current = current.parentId === null ? undefined : nodeById.get(current.parentId);
      guard++;
    }

    return path.reverse();
  }

  static _semanticGroupAnchorIndex(path: GenieTreeNode[]): number {
    if (path.length <= 1) return 0;

    const first = path[0];
    const firstLabel = first.label.toLowerCase();
    const isAppShell = firstLabel === '_app'
      || firstLabel === 'app'
      || firstLabel.includes('appcomponent')
      || firstLabel.includes('root')
      || first.children.length > 32;

    if (isAppShell && path.length > 1) return 1;
    return 0;
  }

  static _organicGroupLabel(key: string, sampleNode?: GenieTreeNode): string {
    if (key.startsWith('type:')) {
      const type = key.split(':')[1] ?? 'TYPE';
      return sampleNode?.label ? `${type.toUpperCase()} / ${sampleNode.label}` : type.toUpperCase();
    }
    if (key.startsWith('node-type:')) return key.slice('node-type:'.length).replace(/-/g, ' ').toUpperCase();
    if (key.startsWith('scope:')) return key.slice('scope:'.length).replace(/-/g, ' ').toUpperCase();
    if (sampleNode?.label) return sampleNode.label;
    return key.replace(/^(tree|type|subtree|node-type|scope):/, '').toUpperCase();
  }

  static _normalizeGroupPart(value: string | number | null | undefined): string {
    return String(value ?? 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.$-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'unknown';
  }

  static _serviceScopeGroup(
    service: GenieServiceRegistration,
    isRootScope: boolean,
    isUnused: boolean
  ): { key: string; label: string } {
    if (isRootScope) return {key: 'root-singleton', label: 'Root Singleton'};
    if (isUnused) return {key: 'unused', label: 'Unused'};
    if (service.isFramework) return {key: 'framework', label: 'Framework'};
    return {key: 'user-code-active', label: 'User Code'};
  }
}
