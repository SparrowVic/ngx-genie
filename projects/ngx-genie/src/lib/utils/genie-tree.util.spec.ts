import {Injector} from '@angular/core';

import {GenieNode, GenieNodeType, GenieTreeNode} from '../models/genie-node.model';
import {buildGenieTree} from './genie-tree.util';

/**
 * Unit tests for buildGenieTree() — a PURE flat-list → forest transformer.
 *
 * Contract (read from the source, not assumed):
 *   1. Every flat node is cloned via `{...n, children: []}` into a Map keyed by `id`.
 *   2. A node is a ROOT when `parentId == null` (loose equality → null AND undefined).
 *   3. Otherwise it is linked into `byId.get(parentId).children`.
 *   4. If the parent id is not present in the map, the node is PROMOTED to a root (orphan rescue).
 *   5. Iteration order is `Map.values()` which is *first-insertion* order == input array order,
 *      so both `roots` and every `children[]` are populated in input order.
 *
 * These are characterization tests: where the implementation has surprising-but-real
 * behavior (self-reference, duplicate ids, `parentId: 0`, `undefined` parentId), the test
 * pins the ACTUAL behavior and flags it in a comment rather than asserting an ideal.
 */
describe('buildGenieTree', () => {
  // ---- fixture helpers -----------------------------------------------------

  /**
   * Build a faithful GenieNode. `injector` is a real Injector (Injector.NULL) so the
   * fixture matches the interface shape; the SUT never reads it, it only spreads it.
   */
  function makeNode(
    id: number,
    parentId: number | null,
    overrides: Partial<GenieNode> = {},
  ): GenieNode {
    return {
      id,
      parentId,
      label: `node-${id}`,
      injector: Injector.NULL,
      type: 'Element' as GenieNodeType,
      isActive: true,
      ...overrides,
    };
  }

  /** Shallow list of ids in a node collection (order-sensitive). */
  const ids = (nodes: GenieTreeNode[]): number[] => nodes.map((n) => n.id);

  /** Recursively assert every node in an ACYCLIC tree carries a real children array. */
  function assertEveryNodeHasChildrenArray(nodes: GenieTreeNode[]): void {
    for (const n of nodes) {
      expect(Array.isArray(n.children))
        .withContext(`node ${n.id} must expose a children array`)
        .toBe(true);
      assertEveryNodeHasChildrenArray(n.children);
    }
  }

  // ---- empty / trivial inputs ---------------------------------------------

  describe('empty and single-node inputs', () => {
    it('returns [] for an empty flat list', () => {
      const result = buildGenieTree([]);
      expect(result).toEqual([]);
    });

    it('returns a brand-new array (not the input reference) for empty input', () => {
      const input: GenieNode[] = [];
      const result = buildGenieTree(input);
      expect(result).not.toBe(input as unknown as GenieTreeNode[]);
    });

    it('treats a single node with parentId === null as the sole root', () => {
      const input = [makeNode(1, null)];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('single root id').toEqual([1]);
      expect(result[0].children).withContext('lone root has empty children').toEqual([]);
    });

    it('gives a lone root a children array even though it has no children', () => {
      const result = buildGenieTree([makeNode(1, null)]);
      expect(Array.isArray(result[0].children)).toBe(true);
      expect(result[0].children.length).toBe(0);
    });
  });

  // ---- multiple roots ------------------------------------------------------

  describe('multiple roots', () => {
    it('collects every parentId === null node as a root, in input order', () => {
      const input = [makeNode(10, null), makeNode(20, null), makeNode(30, null)];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('roots preserve input order').toEqual([10, 20, 30]);
      result.forEach((r) =>
        expect(r.children).withContext(`root ${r.id} childless`).toEqual([]),
      );
    });
  });

  // ---- multi-level hierarchy ----------------------------------------------

  describe('multi-level hierarchy assembly', () => {
    it('nests a simple parent → child pair', () => {
      const input = [makeNode(1, null), makeNode(2, 1)];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('only the root surfaces at top level').toEqual([1]);
      expect(ids(result[0].children)).withContext('child linked under parent').toEqual([2]);
      expect(result[0].children[0].children).toEqual([]);
    });

    it('assembles a deep 4-level chain 1 → 2 → 3 → 4', () => {
      const input = [makeNode(1, null), makeNode(2, 1), makeNode(3, 2), makeNode(4, 3)];
      const result = buildGenieTree(input);

      expect(ids(result)).toEqual([1]);
      const lvl1 = result[0];
      expect(ids(lvl1.children)).toEqual([2]);
      const lvl2 = lvl1.children[0];
      expect(ids(lvl2.children)).toEqual([3]);
      const lvl3 = lvl2.children[0];
      expect(ids(lvl3.children)).toEqual([4]);
      expect(lvl3.children[0].children).withContext('leaf is childless').toEqual([]);
    });

    it('preserves child insertion order under a single parent', () => {
      const input = [
        makeNode(1, null),
        makeNode(2, 1),
        makeNode(3, 1),
        makeNode(4, 1),
      ];
      const result = buildGenieTree(input);

      expect(ids(result[0].children))
        .withContext('children follow flat-list order 2,3,4')
        .toEqual([2, 3, 4]);
    });

    it('keeps each parents children in input order when two parents interleave', () => {
      // Interleaved so a naive per-parent grouping bug would reorder something.
      const input = [
        makeNode(1, null), // root A
        makeNode(2, null), // root B
        makeNode(3, 1), // A child #1
        makeNode(4, 2), // B child #1
        makeNode(5, 1), // A child #2
        makeNode(6, 2), // B child #2
      ];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('roots in order').toEqual([1, 2]);
      expect(ids(result[0].children)).withContext('root A children').toEqual([3, 5]);
      expect(ids(result[1].children)).withContext('root B children').toEqual([4, 6]);
    });

    it('links parents correctly even when a child appears BEFORE its parent in the flat list', () => {
      // The two-pass design (build the whole map first, then link) makes ordering irrelevant.
      const input = [
        makeNode(3, 2), // grandchild first
        makeNode(2, 1), // child second
        makeNode(1, null), // root last
      ];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('root still surfaces').toEqual([1]);
      expect(ids(result[0].children)).toEqual([2]);
      expect(ids(result[0].children[0].children)).toEqual([3]);
    });

    it('builds a broad multi-root, multi-level forest exactly', () => {
      const input = [
        makeNode(1, null),
        makeNode(2, 1),
        makeNode(3, 1),
        makeNode(4, 2),
        makeNode(5, null),
        makeNode(6, 5),
      ];
      const result = buildGenieTree(input);

      expect(ids(result)).toEqual([1, 5]);
      expect(ids(result[0].children)).toEqual([2, 3]);
      expect(ids(result[0].children[0].children)).withContext('node 2 → node 4').toEqual([4]);
      expect(result[0].children[1].children).withContext('node 3 leaf').toEqual([]);
      expect(ids(result[1].children)).toEqual([6]);
      assertEveryNodeHasChildrenArray(result);
    });
  });

  // ---- orphan promotion ----------------------------------------------------

  describe('orphan promotion (missing parent)', () => {
    it('promotes a node whose parentId points to a missing id to a root', () => {
      const input = [makeNode(1, null), makeNode(2, 999)];
      const result = buildGenieTree(input);

      expect(ids(result))
        .withContext('orphan 2 rescued as a root alongside real root 1')
        .toEqual([1, 2]);
      expect(result[1].children).withContext('orphan keeps its empty children').toEqual([]);
    });

    it('keeps a promoted orphan as a real subtree parent for its own descendants', () => {
      const input = [
        makeNode(10, 42), // orphan: parent 42 does not exist
        makeNode(11, 10), // real child of the orphan
      ];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('only the orphan is a root').toEqual([10]);
      expect(ids(result[0].children)).withContext('orphans descendant still attaches').toEqual([11]);
    });

    it('promotes multiple orphans in input order', () => {
      const input = [makeNode(1, 100), makeNode(2, null), makeNode(3, 200)];
      const result = buildGenieTree(input);

      expect(ids(result))
        .withContext('orphans (1,3) and the null-root (2) all become roots, in order')
        .toEqual([1, 2, 3]);
    });
  });

  // ---- property preservation ----------------------------------------------

  describe('property preservation and shape', () => {
    it('spreads every own property of the source node onto the tree node', () => {
      const componentInstance = {tag: 'my-cmp'};
      const source = makeNode(1, null, {
        label: 'custom-label',
        type: 'Environment',
        isActive: false,
        componentInstance,
      });
      const result = buildGenieTree([source]);
      const out = result[0];

      expect(out.id).toBe(1);
      expect(out.parentId).toBeNull();
      expect(out.label).withContext('label preserved').toBe('custom-label');
      expect(out.type).withContext('type preserved').toBe('Environment');
      expect(out.isActive).withContext('isActive preserved').toBe(false);
      expect(out.injector).withContext('injector reference preserved').toBe(source.injector);
      expect(out.componentInstance)
        .withContext('componentInstance reference preserved')
        .toBe(componentInstance);
      expect(out.children).withContext('children array appended').toEqual([]);
    });

    it('emits fresh node objects, not the original references (shallow clone via spread)', () => {
      const source = makeNode(1, null);
      const result = buildGenieTree([source]);
      expect(result[0]).not.toBe(source as unknown as GenieTreeNode);
    });

    it('every node across the tree has an Array children property', () => {
      const input = [
        makeNode(1, null),
        makeNode(2, 1),
        makeNode(3, 2),
        makeNode(4, null),
      ];
      const result = buildGenieTree(input);
      assertEveryNodeHasChildrenArray(result);
    });
  });

  // ---- immutability of the input ------------------------------------------

  describe('input immutability', () => {
    it('does not mutate the input array (length, order, and element identity intact)', () => {
      const a = makeNode(1, null);
      const b = makeNode(2, 1);
      const c = makeNode(3, 1);
      const input = [a, b, c];

      buildGenieTree(input);

      expect(input.length).withContext('array length unchanged').toBe(3);
      expect(input[0]).toBe(a);
      expect(input[1]).toBe(b);
      expect(input[2]).toBe(c);
    });

    it('does not add a children property to the original source objects', () => {
      const a = makeNode(1, null);
      const b = makeNode(2, 1);
      buildGenieTree([a, b]);

      expect('children' in a).withContext('root source untouched').toBe(false);
      expect('children' in b).withContext('child source untouched').toBe(false);
    });

    it('leaves every scalar field of every source node unchanged', () => {
      const a = makeNode(1, null, {label: 'A', type: 'Root', isActive: true});
      const b = makeNode(2, 1, {label: 'B', type: 'Element', isActive: false});
      const snapshotA = {...a};
      const snapshotB = {...b};

      buildGenieTree([a, b]);

      expect(a).toEqual(snapshotA);
      expect(b).toEqual(snapshotB);
    });

    it('returns a roots array distinct from the input array', () => {
      const input = [makeNode(1, null)];
      const result = buildGenieTree(input);
      expect(result).not.toBe(input as unknown as GenieTreeNode[]);
    });
  });

  // ---- edge cases / characterization --------------------------------------

  describe('edge cases (characterization of the actual == null / Map behavior)', () => {
    it('treats parentId === 0 as a REAL parent id, not a nullish root marker', () => {
      // `node.parentId == null` is loose equality, so 0 is NOT nullish: the child links to id 0.
      const input = [makeNode(0, null), makeNode(5, 0)];
      const result = buildGenieTree(input);

      expect(ids(result)).withContext('id-0 node is the only root').toEqual([0]);
      expect(ids(result[0].children)).withContext('child attaches to parent id 0').toEqual([5]);
    });

    it('treats an undefined parentId as a root (loose == null catches undefined)', () => {
      // Type says number | null, but the runtime guard `== null` also catches undefined.
      const weird = makeNode(1, undefined as unknown as null);
      const result = buildGenieTree([weird]);

      expect(ids(result)).withContext('undefined parentId promoted to root').toEqual([1]);
    });

    it('collapses duplicate ids to the LAST-written node (Map.set overwrite)', () => {
      // Two nodes share id 1; the map keeps one entry, whose value is the last spread.
      const first = makeNode(1, null, {label: 'first'});
      const second = makeNode(1, null, {label: 'second'});
      const result = buildGenieTree([first, second]);

      expect(result.length).withContext('duplicate id yields a single node').toBe(1);
      expect(result[0].label).withContext('last write wins for the stored value').toBe('second');
    });

    it('CHARACTERIZATION: a self-referencing node (parentId === id) is never a root and forms a cycle', () => {
      // parentId is a number (== null is false) → else branch → byId.get(id) === itself →
      // it pushes itself into its own children and is NEVER added to `roots`.
      const input = [makeNode(1, 1)];
      const result = buildGenieTree(input);

      expect(result).withContext('self-parented node produces NO roots').toEqual([]);
      // The node object still exists inside its own children (a 1-node cycle).
      // We cannot getById it from `result`, so re-derive the behavior directly is unnecessary;
      // asserting the empty roots is the observable contract of buildGenieTree.
    });

    it('CHARACTERIZATION: a mutual parent cycle (1↔2 with no null root) yields no roots', () => {
      // Neither node is nullish-parented and both parents resolve, so both are linked and
      // neither is pushed to roots — the forest surfaces nothing.
      const input = [makeNode(1, 2), makeNode(2, 1)];
      const result = buildGenieTree(input);

      expect(result).withContext('a pure cycle exposes no top-level roots').toEqual([]);
    });
  });
});
