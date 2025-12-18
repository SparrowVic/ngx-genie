export interface WorkerInputData {
  tree: any[];
  filterState: any;
  services: any[];
  dependencies: any[];
}

export interface MatrixWorkerResult {
  rows: ProcessedRow[];
  columns: ProcessedColumn[];
  metadata: {
    totalRows: number;
    totalCols: number;
  };
}

export interface ProcessedRow {
  id: string;
  label: string;
  index: number;
  cells: Map<number, ProcessedCell>;
}

export interface ProcessedColumn {
  id: string;
  label: string;
  index: number;
  service: any;
  typeClass: string;
  isFramework: boolean;
  totalCount: number;
}

export interface ProcessedCell {
  id: string;
  isConsumer: boolean;
  isProvider: boolean;
  active: boolean;
  dependency: any;
  colIndex: number;
  rowIndex: number;
  typeClass: string;
  isFramework: boolean;
}

export function matrixWorkerFn() {
  self.addEventListener('message', ({data}: any) => {
    if (data.type === 'CALCULATE') {
      const result = calculateMatrix(data.payload);
      self.postMessage({type: 'RESULT', payload: result});
    }
  });

  function calculateMatrix(payload: WorkerInputData): MatrixWorkerResult {
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

    let candidateServices = services;

    if (filterState && filterState.searchMode === 'dependency') {
      const searchTags = filterState.dependencyTags || [];
      if (searchTags.length > 0) {
        candidateServices = candidateServices.filter((s: any) => {
          const label = s.label;
          const matchMode = filterState.matchMode || 'OR';
          if (matchMode === 'AND') {
            return searchTags.every((tag: string) => label === tag);
          } else {
            return searchTags.includes(label);
          }
        });
      }
    }

    const depMap = new Map<string, any>();
    const providerMap = new Set<string>();
    const serviceViewUsage = new Map<number, number>();

    dependencies.forEach((d: any) => {
      if (visibleNodeIds.has(d.consumerNodeId)) {
        const key = `${d.consumerNodeId}_${d.providerId}`;
        depMap.set(key, d);

        if (d.providerId) {
          serviceViewUsage.set(d.providerId, (serviceViewUsage.get(d.providerId) || 0) + 1);
        }
      }
    });

    candidateServices.forEach((s: any) => {
      providerMap.add(`${s.nodeId}_${s.id}`);
      if (visibleNodeIds.has(s.nodeId)) {
        serviceViewUsage.set(s.id, (serviceViewUsage.get(s.id) || 0) + 1);
      }
    });

    let finalServices = candidateServices;
    if (filterState?.hideUnusedDeps) {
      finalServices = finalServices.filter((s: any) => (serviceViewUsage.get(s.id) || 0) > 0);
    }

    const columns: ProcessedColumn[] = finalServices
      .map((service: any, index: number) => ({
        id: service.id,
        label: service.label,
        index: 0,
        service: service,
        typeClass: getTypeClass(service),
        isFramework: service.isFramework,
        totalCount: serviceViewUsage.get(service.id) || 0,
      }))
      .sort((a: any, b: any) => b.totalCount - a.totalCount);

    columns.forEach((col, idx) => col.index = idx);

    const rows: ProcessedRow[] = filteredNodes
      .sort((a: any, b: any) => a.label.localeCompare(b.label))
      .map((node: any, rowIndex: number) => {
        const cells = new Map<number, ProcessedCell>();

        columns.forEach((col, colIdx) => {
          const key = `${node.id}_${col.id}`;
          const dependency = depMap.get(key);
          const isProvider = providerMap.has(key);

          if (dependency || isProvider) {
            cells.set(colIdx, {
              id: key,
              isConsumer: !!dependency,
              isProvider,
              active: true,
              dependency,
              colIndex: colIdx,
              rowIndex: rowIndex,
              typeClass: col.typeClass,
              isFramework: col.isFramework
            });
          }
        });

        return {
          id: node.id,
          label: node.label,
          index: rowIndex,
          cells
        };
      });

    return {
      rows,
      columns,
      metadata: {
        totalRows: rows.length,
        totalCols: columns.length
      }
    };
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
      case 'Signal':
        return 'type-signal';
      case 'Token':
        return 'type-token';
      default:
        return 'type-other';
    }
  }
}
