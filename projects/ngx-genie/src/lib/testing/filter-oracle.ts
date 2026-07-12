/**
 * Independent reference implementation ("oracle") of the GLOBAL OPS → TREE filter pipeline.
 *
 * This is written from the DOCUMENTED filter semantics, NOT copied from the runtime chunked path, so
 * that comparing it against GenieExplorerStateService.filteredTree() is a genuine differential test:
 * the service builds the filtered tree with a stack-based chunked algorithm (and a separate synchronous
 * one), while this oracle uses a plain recursive walk. If they disagree, one of them has a bug.
 *
 * The integration spec derives EVERY expectation from this oracle (fed the same mock data), so
 * regenerating the mock never requires updating assertions.
 */
import {GenieNode, GenieServiceRegistration, GenieTreeNode} from '../models/genie-node.model';
import {GenieFilterState} from '../components/genie/options-panel/options-panel.models';

/** The GLOBAL OPS defaults — mirrors GenieExplorerStateService.filterState's initial value. */
export const DEFAULT_FILTER_STATE: GenieFilterState = {
  hideUnusedDeps: true,
  hideIsolatedComponents: true,
  hideInternals: true,
  groupSimilarSiblings: true,
  showRootOnly: false,
  showLocalOnly: false,

  showUserServices: true,
  showUserPipes: true,
  showUserDirectives: true,
  showUserComponents: true,
  showUserTokens: true,
  showUserValues: true,
  showUserObservables: true,
  showUserSignals: false,

  showFrameworkServices: false,
  showFrameworkSystem: false,
  showFrameworkPipes: false,
  showFrameworkDirectives: false,
  showFrameworkComponents: false,
  showFrameworkTokens: false,
  showFrameworkObservables: false,
  showFrameworkSignals: false,

  minDeps: 0,
  maxDeps: 100,
  searchTags: [],
  componentTags: [],
  dependencyTags: [],
  searchMode: 'component',
  matchMode: 'OR'
};

export function makeFilterState(overrides: Partial<GenieFilterState> = {}): GenieFilterState {
  return {...DEFAULT_FILTER_STATE, ...overrides};
}

export interface OracleOptions {
  searchQuery?: string;
  isDeepFocus?: boolean;
  selectedNodeId?: number | null;
  isScanActive?: boolean;
  /** Advanced-config "Show" pins. Default: nothing force-shown (matches a pristine GenFilterService). */
  isForceShown?: (label: string) => boolean;
}

/** Build the parent→child tree exactly like GenieExplorerStateService._buildRawTreeSync (array order). */
export function oracleBuildRawTree(nodes: GenieNode[]): GenieTreeNode[] {
  const byId = new Map<number, GenieTreeNode>();
  const roots: GenieTreeNode[] = [];
  for (const node of nodes) byId.set(node.id, {...node, children: []});
  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

/** Mirror of GenieExplorerStateService._serviceMatchesFilters. */
export function oracleServiceMatches(
  s: GenieServiceRegistration,
  f: GenieFilterState,
  isForceShown: (label: string) => boolean
): boolean {
  const isRoot = s.isRoot === true || (s.token as any)?.['ɵprov']?.providedIn === 'root';
  if (f.showRootOnly && !isRoot) return false;
  if (f.showLocalOnly && isRoot) return false;
  if (f.hideUnusedDeps && (s.usageCount || 0) === 0) return false;

  if (isForceShown(s.label)) return true;

  const type = s.dependencyType;
  if (f.hideInternals && s.isFramework) return false;

  if (!s.isFramework) {
    switch (type) {
      case 'Service': return f.showUserServices;
      case 'Pipe': return f.showUserPipes;
      case 'Directive': return f.showUserDirectives;
      case 'Component': return f.showUserComponents;
      case 'Token': return f.showUserTokens;
      case 'Value': return f.showUserValues;
      case 'Observable': return f.showUserObservables;
      case 'Signal': return f.showUserSignals;
      default: return true;
    }
  }

  switch (type) {
    case 'Service': return f.showFrameworkServices;
    case 'System': return f.showFrameworkSystem;
    case 'Pipe': return f.showFrameworkPipes;
    case 'Directive': return f.showFrameworkDirectives;
    case 'Component': return f.showFrameworkComponents;
    case 'Token': return f.showFrameworkTokens;
    case 'Observable': return f.showFrameworkObservables;
    case 'Signal': return f.showFrameworkSignals;
    default: return true;
  }
}

/** Map<nodeId, filtered services[]> — mirror of _buildFilteredServicesByNodeId. */
export function oracleFilteredServicesByNodeId(
  services: GenieServiceRegistration[],
  f: GenieFilterState,
  isForceShown: (label: string) => boolean
): Map<number, GenieServiceRegistration[]> {
  const index = new Map<number, GenieServiceRegistration[]>();
  for (const s of services) {
    if (!oracleServiceMatches(s, f, isForceShown)) continue;
    const list = index.get(s.nodeId);
    if (list) list.push(s);
    else index.set(s.nodeId, [s]);
  }
  return index;
}

/** Mirror of _groupIdenticalSiblings (collapses identical childless/serviceless siblings). */
function oracleGroupSiblings(
  siblings: GenieTreeNode[],
  servicesByNodeId: Map<number, GenieServiceRegistration[]>
): GenieTreeNode[] {
  const groups = new Map<string, GenieTreeNode[]>();
  const result: GenieTreeNode[] = [];
  for (const node of siblings) {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const hasServices = (servicesByNodeId.get(node.id)?.length ?? 0) > 0;
    if (hasChildren || hasServices) {
      result.push(node);
      continue;
    }
    const key = `${node.label}|${node.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(node);
  }
  groups.forEach((groupNodes) => {
    if (groupNodes.length === 1) {
      result.push(groupNodes[0]);
    } else {
      const first = groupNodes[0];
      result.push({...first, id: -Math.abs(first.id), children: first.children || [], groupCount: groupNodes.length});
    }
  });
  return result;
}

/** Independent recursive re-implementation of _calculateFilteredTree. */
export function oracleFilteredTree(
  nodes: GenieNode[],
  services: GenieServiceRegistration[],
  f: GenieFilterState,
  opts: OracleOptions = {}
): GenieTreeNode[] {
  const isForceShown = opts.isForceShown ?? (() => false);
  const rawTree = oracleBuildRawTree(nodes);
  const servicesByNodeId = oracleFilteredServicesByNodeId(services, f, isForceShown);

  const nodeById = new Map<number, GenieNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const query = (opts.searchQuery ?? '').trim().toLowerCase();
  const isDeepFocus = !!opts.isDeepFocus;
  const selectedNodeId = opts.selectedNodeId ?? null;
  const isScanActive = !!opts.isScanActive;

  const pathIds = new Set<number>();
  if (isDeepFocus && selectedNodeId != null) {
    let curr: GenieNode | undefined = nodeById.get(selectedNodeId);
    while (curr) {
      pathIds.add(curr.id);
      if (curr.parentId == null) break;
      curr = nodeById.get(curr.parentId);
    }
  }

  const hasTextSearch = query.length > 0;
  const compTags = f.componentTags ?? [];
  const depTags = f.dependencyTags ?? [];
  const hasCompTags = compTags.length > 0;
  const hasDepTags = depTags.length > 0;
  const hasActiveSearchOrFilter = hasTextSearch || hasCompTags || hasDepTags;

  const filterNode = (node: GenieTreeNode, forceInclude: boolean): GenieTreeNode | null => {
    let forced = forceInclude;
    if (isDeepFocus && selectedNodeId != null) {
      if (!forced) {
        if (node.id === selectedNodeId) forced = true;
        else if (!pathIds.has(node.id)) return null;
      }
    }

    const svc = servicesByNodeId.get(node.id) ?? [];
    const effectiveCount = svc.length;
    const canApply = !isScanActive;
    const hasChildren = (node.children?.length ?? 0) > 0;
    let matchesSelf = true;

    if (canApply && f.hideIsolatedComponents && !hasChildren && !forced) return null;

    if (canApply && f.hideUnusedDeps && !hasChildren && !forced) {
      const anyUsed = svc.some((s) => (s.usageCount || 0) > 0);
      if (!anyUsed) return null;
    }

    if (hasActiveSearchOrFilter && !forced) {
      if (hasTextSearch && !node.label.toLowerCase().includes(query)) matchesSelf = false;
      if (matchesSelf && hasCompTags && !compTags.includes(node.label)) matchesSelf = false;
      if (matchesSelf && hasDepTags) {
        const labels = new Set(svc.map((s) => s.label));
        matchesSelf = f.matchMode === 'AND'
          ? depTags.every((t) => labels.has(t))
          : depTags.some((t) => labels.has(t));
      }
    } else if (!forced) {
      matchesSelf = effectiveCount >= f.minDeps && effectiveCount <= f.maxDeps;
    }

    let filteredChildren = (node.children ?? [])
      .map((c) => filterNode(c, forced))
      .filter((n): n is GenieTreeNode => n !== null);

    if (f.groupSimilarSiblings && filteredChildren.length > 1) {
      filteredChildren = oracleGroupSiblings(filteredChildren, servicesByNodeId);
    }

    if (matchesSelf || filteredChildren.length > 0 || forced) {
      return {...node, children: filteredChildren};
    }
    return null;
  };

  return rawTree.map((r) => filterNode(r, false)).filter((n): n is GenieTreeNode => n !== null);
}

// ---- comparison projection -------------------------------------------------

export interface ProjectedNode {
  id: number;
  label: string;
  type: string;
  groupCount: number | null;
  /** Labels of this node's visible services (sorted for a stable, order-independent comparison). */
  deps: string[];
  children: ProjectedNode[];
}

/**
 * Project a filtered tree to a plain, comparable shape. `servicesFor` returns the node's visible
 * services — pass `state.getProvidersForNode` for the SUT tree and the oracle's index for the oracle
 * tree, so the two projections are directly deep-equal comparable.
 */
export function projectTree(
  tree: GenieTreeNode[],
  servicesFor: (nodeId: number) => GenieServiceRegistration[]
): ProjectedNode[] {
  return tree.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
    groupCount: node.groupCount ?? null,
    deps: servicesFor(node.id).map((s) => s.label).sort(),
    children: projectTree(node.children ?? [], servicesFor)
  }));
}

/** Recursively count nodes + total visible dependency rows in a projected tree (for stat assertions). */
export function countProjected(tree: ProjectedNode[]): { nodes: number; dependencies: number; rows: number } {
  let nodes = 0;
  let dependencies = 0;
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop()!;
    nodes++;
    dependencies += n.deps.length;
    if (n.children.length) stack.push(...n.children);
  }
  return {nodes, dependencies, rows: nodes + dependencies};
}
