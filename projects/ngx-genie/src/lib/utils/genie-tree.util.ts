import {GenieNode, GenieTreeNode} from '../models/genie-node.model';

export function buildGenieTree(flatNodes: GenieNode[]): GenieTreeNode[] {
  const byId = new Map<number, GenieTreeNode>();
  const roots: GenieTreeNode[] = [];

  for (const n of flatNodes) {
    byId.set(n.id, {...n, children: []});
  }

  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}
