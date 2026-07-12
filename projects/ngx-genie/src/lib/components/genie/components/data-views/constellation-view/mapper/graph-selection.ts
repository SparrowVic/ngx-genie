import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {GenieFilterState} from '../../../../options-panel/options-panel.models';
import {ATLAS_MAX_SERVICES_PER_INJECTOR} from './mapper.constants';

/**
 * Decides which services and tree nodes are included in the graph: the per-node service filter
 * (mirroring the tree view's predicate, including the force-shown bypass), the budget-limited service
 * selection for huge atlas layouts, and the deep-search tree pruning. Pure and side-effect free.
 */
export class GraphSelection {
  static _filterServicesForNode(
    services: GenieServiceRegistration[],
    filterState: GenieFilterState | null,
    usedProviderIds: Set<number>,
    forceShown: (label: string) => boolean = () => false
  ): GenieServiceRegistration[] {
    if (!filterState) return services;

    return services.filter(s => {
      if (filterState.showRootOnly && !s.isRoot) return false;
      if (filterState.showLocalOnly && s.isRoot) return false;
      if (filterState.hideUnusedDeps && !usedProviderIds.has(s.id)) return false;

      // A token the user pinned visible (Advanced config → "Show") bypasses the internal + per-type
      // gates, matching explorer-state._serviceMatchesFilters so the constellation agrees with the tree.
      if (forceShown(s.label)) return true;

      const isFramework = s.isFramework;
      if (filterState.hideInternals && isFramework) return false;

      const type = s.dependencyType || 'Service';

      if (isFramework) {
        if (type === 'Service' && !filterState.showFrameworkServices) return false;
        if (type === 'System' && !filterState.showFrameworkSystem) return false;
        if (type === 'Pipe' && !filterState.showFrameworkPipes) return false;
        if (type === 'Directive' && !filterState.showFrameworkDirectives) return false;
        if (type === 'Component' && !filterState.showFrameworkComponents) return false;
        if (type === 'Token' && !filterState.showFrameworkTokens) return false;
        if (type === 'Observable' && !filterState.showFrameworkObservables) return false;
        if (type === 'Signal' && !filterState.showFrameworkSignals) return false;
      } else {
        if (type === 'Service' && !filterState.showUserServices) return false;
        if (type === 'Pipe' && !filterState.showUserPipes) return false;
        if (type === 'Directive' && !filterState.showUserDirectives) return false;
        if (type === 'Component' && !filterState.showUserComponents) return false;
        if (type === 'Token' && !filterState.showUserTokens) return false;
        if (type === 'Value' && !filterState.showUserValues) return false;
        if (type === 'Observable' && !filterState.showUserObservables) return false;
        if (type === 'Signal' && !filterState.showUserSignals) return false;
      }

      return true;
    });
  }

  static _selectAtlasServicesForRender(
    services: GenieServiceRegistration[],
    remainingGlobalBudget: number
  ): GenieServiceRegistration[] {
    const limit = Math.min(ATLAS_MAX_SERVICES_PER_INJECTOR, Math.max(0, Math.floor(remainingGlobalBudget)));
    if (limit <= 0) return [];
    if (services.length <= limit) return services;

    const selected: GenieServiceRegistration[] = [];
    const selectedIds = new Set<number>();
    const priorityLimit = Math.max(48, Math.floor(limit * 0.45));

    for (const service of services) {
      if (selected.length >= priorityLimit) break;
      if (service.isRoot || (service.usageCount || 0) > 0 || !service.isFramework) {
        selected.push(service);
        selectedIds.add(service.id);
      }
    }

    const remaining = limit - selected.length;
    if (remaining <= 0) return selected;

    const stride = Math.max(1, Math.ceil(services.length / remaining));
    let cursor = 0;

    while (selected.length < limit && cursor < services.length) {
      const service = services[cursor];
      if (!selectedIds.has(service.id)) {
        selected.push(service);
        selectedIds.add(service.id);
      }
      cursor += stride;
    }

    cursor = 0;
    while (selected.length < limit && cursor < services.length) {
      const service = services[cursor++];
      if (selectedIds.has(service.id)) continue;
      selected.push(service);
      selectedIds.add(service.id);
    }

    return selected;
  }

  static _applyDeepSearch(tree: GenieTreeNode[], filters: GenieFilterState | null): GenieTreeNode[] {
    if (!filters) return tree;
    const compTags = filters.componentTags || [];
    const hasCompFilter = compTags.length > 0;

    if (!hasCompFilter) return tree;

    const filterNode = (node: GenieTreeNode): GenieTreeNode | null => {
      let matchesComp = compTags.includes(node.label);

      const matchingChildren: GenieTreeNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const filteredChild = filterNode(child);
          if (filteredChild) matchingChildren.push(filteredChild);
        }
      }
      if (matchesComp || matchingChildren.length > 0) {
        return {...node, children: matchingChildren};
      }
      return null;
    };

    const result: GenieTreeNode[] = [];
    for (const rootNode of tree) {
      const filtered = filterNode(rootNode);
      if (filtered) result.push(filtered);
    }
    return result;
  }

  static _flattenTree(nodes: GenieTreeNode[]): GenieTreeNode[] {
    const result: GenieTreeNode[] = [];
    const stack = [...nodes].reverse();

    while (stack.length > 0) {
      const node = stack.pop()!;
      result.push(node);

      if (node.children?.length) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return result;
  }
}
