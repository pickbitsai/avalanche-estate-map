// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// Cycle-safe, bidirectional CI relationship traversal shared by the CLI and desk.

import { getCI, listCIs, listRelationships } from "./store.mjs";

export const DEFAULT_TREE_DEPTH = 3;

export function treeDepth(value = DEFAULT_TREE_DEPTH) {
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) throw new Error("depth must be a non-negative integer");
  return depth;
}

function compareCandidates(left, right) {
  return left.ci_key.localeCompare(right.ci_key)
    || left.parent_key.localeCompare(right.parent_key)
    || left.relationship.type.localeCompare(right.relationship.type)
    || left.direction.localeCompare(right.direction)
    || left.relationship.origin.localeCompare(right.relationship.origin);
}

export function traverseCITree(db, ciKey, { depth = DEFAULT_TREE_DEPTH } = {}) {
  const maxDepth = treeDepth(depth);
  const root = getCI(db, ciKey);
  const cis = new Map(listCIs(db).map((ci) => [ci.ci_key, ci]));
  const relationships = listRelationships(db);
  const visited = new Set([root.ci_key]);
  const nodes = [{
    ...root, depth: 0, parent_key: null, direction: null, relationship: null,
  }];
  let frontier = [root.ci_key];

  for (let level = 1; level <= maxDepth && frontier.length; level++) {
    const candidates = [];
    for (const parentKey of [...frontier].sort((a, b) => a.localeCompare(b))) {
      for (const relationship of relationships) {
        if (relationship.from_key === parentKey) {
          candidates.push({
            ci_key: relationship.to_key,
            parent_key: parentKey,
            direction: "outgoing",
            relationship,
          });
        }
        if (relationship.to_key === parentKey) {
          candidates.push({
            ci_key: relationship.from_key,
            parent_key: parentKey,
            direction: "incoming",
            relationship,
          });
        }
      }
    }

    const next = [];
    for (const candidate of candidates.sort(compareCandidates)) {
      if (visited.has(candidate.ci_key) || !cis.has(candidate.ci_key)) continue;
      visited.add(candidate.ci_key);
      next.push(candidate.ci_key);
      nodes.push({ ...cis.get(candidate.ci_key), ...candidate, depth: level });
    }
    frontier = next;
  }

  return { root: root.ci_key, depth: maxDepth, nodes };
}

export function formatCITree(tree) {
  return tree.nodes.map((node) => {
    const label = `${node.ci_key} [${node.class} · ${node.status}]`;
    if (!node.relationship) return label;
    const arrow = node.direction === "outgoing" ? "->" : "<-";
    return `${"  ".repeat(node.depth)}${arrow} ${node.relationship.type} — ${label}`;
  }).join("\n");
}
