import {GenieTreeNode, GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieFilterState} from '../../../options-panel/options-panel.models';

export class OrgChartUtils {
  static filterTree(
    tree: GenieTreeNode[],
    filters: GenieFilterState | null,
    getServicesFn: (node: GenieTreeNode) => GenieServiceRegistration[]
  ): GenieTreeNode[] {
    const compTags = filters?.componentTags || [];
    const depTags = filters?.dependencyTags || [];
    const hasCompFilter = compTags.length > 0;
    const hasDepFilter = depTags.length > 0;


    if (!filters || (!hasCompFilter && !hasDepFilter)) {
      return tree;
    }

    const matchMode = filters.matchMode || 'OR';

    const filterNode = (node: GenieTreeNode): GenieTreeNode | null => {

      let matchesComp = false;
      let matchesDep = false;


      if (hasCompFilter) {
        matchesComp = compTags.includes(node.label);
      }


      if (hasDepFilter) {
        const nodeServices = getServicesFn(node);
        const serviceLabels = new Set(nodeServices.map(s => s.label));

        if (matchMode === 'AND') {
          matchesDep = depTags.every(tag => serviceLabels.has(tag));
        } else {
          matchesDep = depTags.some(tag => serviceLabels.has(tag));
        }
      }


      let isSelfMatch = false;
      if (matchMode === 'AND') {
        if (hasCompFilter && hasDepFilter) isSelfMatch = matchesComp && matchesDep;
        else if (hasCompFilter) isSelfMatch = matchesComp;
        else if (hasDepFilter) isSelfMatch = matchesDep;
      } else {
        isSelfMatch = (hasCompFilter && matchesComp) || (hasDepFilter && matchesDep);
      }


      const matchingChildren: GenieTreeNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const filteredChild = filterNode(child);
          if (filteredChild) {
            matchingChildren.push(filteredChild);
          }
        }
      }


      if (isSelfMatch || matchingChildren.length > 0) {
        const newNode = {...node, children: matchingChildren};

        Object.defineProperty(newNode, '__isMatched', {
          value: isSelfMatch,
          enumerable: false,
          writable: true
        });
        return newNode;
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

  static isRoot(svc: GenieServiceRegistration): boolean {
    return !!(svc.isRoot || svc.token?.['ɵprov']?.providedIn === 'root');
  }

  static getAbbrType(type: string): string {
    if (!type) return 'UNK';
    switch (type) {
      case 'Service':
        return 'SVC';
      case 'System':
        return 'SYS';
      case 'Value':
        return 'VAL';
      case 'Observable':
        return 'OBS';
      case 'Component':
        return 'CMP';
      case 'Directive':
        return 'DIR';
      case 'Pipe':
        return 'PIP';
      case 'Token':
        return 'TOK';
      default:
        return type.substring(0, 3).toUpperCase();
    }
  }
}
