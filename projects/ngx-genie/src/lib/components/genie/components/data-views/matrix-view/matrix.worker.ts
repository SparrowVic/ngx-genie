import {ANGULAR_INTERNALS} from '../../../../../configs/angular-internals';

export interface WorkerInputData {
  tree: any[];
  filterState: any;
  services: any[];
  dependencies: any[];
}

addEventListener('message', ({data}) => {
  if (data.type === 'CALCULATE') {
    const result = calculateMatrix(data.payload);
    postMessage({type: 'RESULT', payload: result});
  }
});

function calculateMatrix(payload: WorkerInputData) {
  const {tree, filterState, services, dependencies} = payload;

  let allNodes = flattenTree(tree);
  let filteredNodes = allNodes;


  if (filterState && filterState.searchMode === 'component') {
    const tags = filterState.componentTags || [];
    const matchMode = filterState.matchMode || 'OR';

    if (tags.length > 0) {
      filteredNodes = filteredNodes.filter((node: any) => {
        if (matchMode === 'OR') return tags.includes(node.label);
        if (matchMode === 'AND') return tags.every((t: string) => node.label === t);
        return true;
      });
    }
  }

  const visibleNodeIds = new Set(filteredNodes.map((n: any) => n.id));


  let candidateServices = services.filter((s: any) => {
    const isFramework = s.isFramework;


    if (filterState?.hideInternals && isFramework) return false;

    if (filterState) {
      const type = s.dependencyType;

      if (isFramework) {

        if (type === 'Service' && !filterState.showFrameworkServices) return false;
        if (type === 'System' && !filterState.showFrameworkSystem) return false;
        if (type === 'Pipe' && !filterState.showFrameworkPipes) return false;
        if (type === 'Directive' && !filterState.showFrameworkDirectives) return false;
        if (type === 'Component' && !filterState.showFrameworkComponents) return false;
        if (type === 'Token' && !filterState.showFrameworkTokens) return false;
        if (type === 'Observable' && !filterState.showFrameworkObservables) return false;
      } else {

        if (type === 'Service' && !filterState.showUserServices) return false;
        if (type === 'Pipe' && !filterState.showUserPipes) return false;
        if (type === 'Directive' && !filterState.showUserDirectives) return false;
        if (type === 'Component' && !filterState.showUserComponents) return false;
        if (type === 'Token' && !filterState.showUserTokens) return false;
        if (type === 'Value' && !filterState.showUserValues) return false;
        if (type === 'Observable' && !filterState.showUserObservables) return false;
      }

      const isRoot = s.isRoot === true || (s.token && s.token['ɵprov']?.providedIn === 'root');
      if (filterState.showRootOnly && !isRoot) return false;
      if (filterState.showLocalOnly && isRoot) return false;


      const isDepSearchMode = filterState.searchMode === 'dependency';
      const searchTags = filterState.dependencyTags || [];
      if (isDepSearchMode && searchTags.length > 0) {
        const label = s.label;
        const matchMode = filterState.matchMode || 'OR';
        if (matchMode === 'AND') {
          if (!searchTags.every((tag: string) => label === tag)) return false;
        } else {
          if (!searchTags.includes(label)) return false;
        }
      }
    }
    return true;
  });

  const depMap = new Map<string, any>();
  const providerMap = new Set<string>();
  const serviceViewUsage = new Map<number, number>();

  dependencies.forEach((d: any) => {
    if (visibleNodeIds.has(d.consumerNodeId)) {
      const key = `${d.consumerNodeId}_${d.providerId}`;
      depMap.set(key, d);

      if (d.providerId) {
        const currentCount = serviceViewUsage.get(d.providerId) || 0;
        serviceViewUsage.set(d.providerId, currentCount + 1);
      }
    }
  });

  services.forEach((s: any) => {
    providerMap.add(`${s.nodeId}_${s.id}`);
    if (visibleNodeIds.has(s.nodeId)) {
      const currentCount = serviceViewUsage.get(s.id) || 0;
      serviceViewUsage.set(s.id, currentCount + 1);
    }
  });

  let finalServices = candidateServices;

  if (filterState?.hideUnusedDeps) {
    finalServices = finalServices.filter((s: any) => {
      const count = serviceViewUsage.get(s.id) || 0;
      return count > 0;
    });
  }

  const columns = finalServices
    .map((service: any) => ({
      id: service.id,
      label: service.label,
      totalCount: serviceViewUsage.get(service.id) || 0,
      service: service,
      typeClass: getTypeClass(service),
      isFramework: service.isFramework
    }))
    .sort((a: any, b: any) => b.totalCount - a.totalCount);

  if (columns.length === 0 && filteredNodes.length === 0) {
    return {rows: [], columns: []};
  }

  const rows = filteredNodes
    .sort((a: any, b: any) => a.label.localeCompare(b.label))
    .map((node: any) => {
      const cells = columns.map((col: any, colIdx: number) => {
        const key = `${node.id}_${col.id}`;
        const dependency = depMap.get(key);
        const isProvider = providerMap.has(key);
        const active = !!dependency || isProvider;

        return {
          id: key,
          isConsumer: !!dependency,
          isProvider,
          active,
          service: col.service,
          dependency: dependency,
          colIndex: colIdx,
          typeClass: col.typeClass
        };
      });

      return {node, cells};
    });

  return {rows, columns};
}

function flattenTree(nodes: any[]): any[] {
  let result: any[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length > 0) {
      result = result.concat(flattenTree(node.children));
    }
  }
  return result;
}

function getTypeClass(service: any): string {
  const type = service.dependencyType;
  if (!type) return 'type-other';

  switch (type) {
    case 'Component':
      return 'type-component';
    case 'Directive':
      return 'type-directive';
    case 'Pipe':
      return 'type-pipe';
    case 'Service':
      return 'type-service';
    case 'System':
      return 'type-system';
    case 'Value':
      return 'type-value';
    case 'Observable':
      return 'type-observable';
    case 'Token':
      return 'type-token';
    default:
      return 'type-other';
  }
}
