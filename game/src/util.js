// Small shared helpers: a seeded RNG so ?shot= captures are deterministic,
// clamps, and a breadth-first search over the waypoint graph bots walk.
export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// nodes: [{x, z}], edges: [[a, b], ...] (undirected). Returns an array of node
// indices from start to goal, or null when no route exists.
export function findPath(nodes, edges, start, goal) {
  if (start === goal) return [start];
  const neighbours = nodes.map(() => []);
  for (const [a, b] of edges) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  const cameFrom = new Array(nodes.length).fill(-1);
  const queue = [start];
  cameFrom[start] = start;
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbours[current]) {
      if (cameFrom[next] !== -1) continue;
      cameFrom[next] = current;
      if (next === goal) {
        const path = [goal];
        let at = goal;
        while (at !== start) {
          at = cameFrom[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function nearestNode(nodes, x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const dx = nodes[i].x - x;
    const dz = nodes[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
