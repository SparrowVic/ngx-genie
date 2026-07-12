export interface WorkerInputData {
  tree: any[];
  treeIsFlat?: boolean;
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

// Pure matrix computation. Hoisted to module scope (rather than nested inside matrixWorkerFn) so the
// same implementation runs both inside the blob worker and, as a fallback, synchronously on the main
// thread when a Worker cannot be created — without duplicating the logic. See MATRIX_WORKER_SOURCE.
export function calculateMatrix(payload: WorkerInputData): MatrixWorkerResult {
  const {tree, filterState, services, dependencies} = payload;

  let allNodes = payload.treeIsFlat ? tree : flattenTree(tree);
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

  const serviceViewUsage = new Map<number, number>();

  for (const dependency of dependencies) {
    if (visibleNodeIds.has(dependency.consumerNodeId) && dependency.providerId) {
      serviceViewUsage.set(dependency.providerId, (serviceViewUsage.get(dependency.providerId) || 0) + 1);
    }
  }

  for (const service of candidateServices) {
    if (visibleNodeIds.has(service.nodeId)) {
      serviceViewUsage.set(service.id, (serviceViewUsage.get(service.id) || 0) + 1);
    }
  }

  let finalServices = candidateServices;
  if (filterState?.hideUnusedDeps) {
    finalServices = finalServices.filter((s: any) => (serviceViewUsage.get(s.id) || 0) > 0);
  }

  const columns: ProcessedColumn[] = finalServices
    .map((service: any) => ({
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

  const columnIndexByServiceId = new Map<number, number>();
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    columnIndexByServiceId.set(Number(column.id), index);
  }

  const cellsByNodeId = new Map<number, Map<number, {
    dependency: any;
    isConsumer: boolean;
    isProvider: boolean;
  }>>();

  for (const dependency of dependencies) {
    if (!dependency.providerId || !visibleNodeIds.has(dependency.consumerNodeId)) continue;

    const colIndex = columnIndexByServiceId.get(dependency.providerId);
    if (colIndex === undefined) continue;

    const rowCells = getOrCreateRowCells(cellsByNodeId, dependency.consumerNodeId);
    const existing = rowCells.get(colIndex);
    rowCells.set(colIndex, {
      dependency,
      isConsumer: true,
      isProvider: existing?.isProvider ?? false
    });
  }

  for (const service of finalServices) {
    if (!visibleNodeIds.has(service.nodeId)) continue;

    const colIndex = columnIndexByServiceId.get(service.id);
    if (colIndex === undefined) continue;

    const rowCells = getOrCreateRowCells(cellsByNodeId, service.nodeId);
    const existing = rowCells.get(colIndex);
    rowCells.set(colIndex, {
      dependency: existing?.dependency ?? null,
      isConsumer: existing?.isConsumer ?? false,
      isProvider: true
    });
  }

  const rows: ProcessedRow[] = filteredNodes
    .sort((a: any, b: any) => a.label.localeCompare(b.label))
    .map((node: any, rowIndex: number) => {
      const cells = new Map<number, ProcessedCell>();
      const sparseCells = cellsByNodeId.get(node.id);

      if (sparseCells) {
        sparseCells.forEach((cellData, colIdx) => {
          const col = columns[colIdx];
          if (!col) return;

          cells.set(colIdx, {
            id: `${node.id}_${col.id}`,
            isConsumer: cellData.isConsumer,
            isProvider: cellData.isProvider,
            active: true,
            dependency: cellData.dependency,
            colIndex: colIdx,
            rowIndex: rowIndex,
            typeClass: col.typeClass,
            isFramework: col.isFramework
          });
        });
      }

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

function getOrCreateRowCells(
  cellsByNodeId: Map<number, Map<number, { dependency: any; isConsumer: boolean; isProvider: boolean }>>,
  nodeId: number
): Map<number, { dependency: any; isConsumer: boolean; isProvider: boolean }> {
  let rowCells = cellsByNodeId.get(nodeId);
  if (!rowCells) {
    rowCells = new Map<number, { dependency: any; isConsumer: boolean; isProvider: boolean }>();
    cellsByNodeId.set(nodeId, rowCells);
  }
  return rowCells;
}

function flattenTree(nodes: any[]): any[] {
  const result: any[] = [];
  const stack = [...nodes].reverse();

  while (stack.length > 0) {
    const node = stack.pop();
    result.push(node);

    if (node.children && node.children.length > 0) {
      for (let index = node.children.length - 1; index >= 0; index--) {
        stack.push(node.children[index]);
      }
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

export function matrixWorkerFn() {
  self.addEventListener('message', ({data}: any) => {
    if (data.type === 'CALCULATE') {
      const result = calculateMatrix(data.payload);
      self.postMessage({type: 'RESULT', payload: result, requestId: data.requestId});
    }
  });
}

/**
 * Source string used to build the blob-URL worker. It concatenates the real pure functions (via
 * `.toString()`, so there is a single source of truth shared with the main-thread fallback) followed
 * by an IIFE that boots the message listener. Minifiers rename these module-scoped bindings
 * consistently, so `matrixWorkerFn`'s call to `calculateMatrix` still resolves inside the blob.
 */
export const MATRIX_WORKER_SOURCE =
  [calculateMatrix, getOrCreateRowCells, flattenTree, getTypeClass]
    .map((fn) => fn.toString())
    .join('\n\n') +
  `\n\n(${matrixWorkerFn.toString()})();`;
