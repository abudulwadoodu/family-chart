import * as d3 from 'd3';

function collectRelationIds(d) {
  return [
    ...(d.rels?.parents || []),
    ...(d.rels?.children || []),
    ...(d.rels?.spouses || []),
  ];
}

function toLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum.id);
}

// Assigns every person an index identifying which connected group (family
// island) they belong to, via BFS over parent/child/spouse links. Unlike a
// "largest component only" filter, every person gets an index - including
// singletons with no relations at all (each forms its own group of one) -
// so nothing imported or created ever silently disappears from this view.
function getConnectedComponents(data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const visited = new Set();
  const componentById = new Map();
  let componentIndex = 0;

  for (const d of data) {
    if (visited.has(d.id)) continue;
    const queue = [d.id];
    while (queue.length) {
      const id = queue.shift();
      if (!id || visited.has(id) || !byId.has(id)) continue;
      visited.add(id);
      componentById.set(id, componentIndex);
      collectRelationIds(byId.get(id)).forEach((relId) => {
        if (byId.has(relId) && !visited.has(relId)) queue.push(relId);
      });
    }
    componentIndex += 1;
  }

  return { componentById, componentCount: componentIndex };
}

// Picks a sensible default "main person" for Focused view: a member of the
// largest connected family group, rather than blindly data[0]. Without this,
// an imported (or otherwise unrelated) family would permanently disappear
// from Focused view every time the tree is loaded, even right after the
// import wizard explicitly re-rooted onto it for that one session.
export function pickDefaultMainId(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const { componentById } = getConnectedComponents(data);

  const sizeByComponent = new Map();
  componentById.forEach((component) => {
    sizeByComponent.set(component, (sizeByComponent.get(component) || 0) + 1);
  });

  let largestComponent = 0;
  let largestSize = 0;
  sizeByComponent.forEach((size, component) => {
    if (size > largestSize) {
      largestSize = size;
      largestComponent = component;
    }
  });

  const representative = data.find((d) => componentById.get(d.id) === largestComponent);
  return representative?.id ?? data[0].id;
}

export function buildAllNodesGraphData(data) {
  if (!Array.isArray(data) || data.length === 0) return { nodes: [], links: [], componentCount: 0 };
  const byId = new Map(data.map((d) => [d.id, d]));
  const { componentById, componentCount } = getConnectedComponents(data);

  const nodes = data.map((datum) => ({
    id: datum.id,
    label: toLabel(datum),
    gender: datum?.data?.gender || 'U',
    component: componentById.get(datum.id) ?? 0,
  }));

  const linksMap = new Map();
  const push = (a, b, type) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}|${type}`;
    if (!linksMap.has(key)) linksMap.set(key, { source: a, target: b, type });
  };

  data.forEach((d) => {
    (d.rels?.parents || []).forEach((pid) => push(d.id, pid, 'parent'));
    (d.rels?.children || []).forEach((cid) => push(d.id, cid, 'child'));
    (d.rels?.spouses || []).forEach((sid) => push(d.id, sid, 'spouse'));
  });

  return { nodes, links: Array.from(linksMap.values()), componentCount };
}

// Arranges N component centers in a roughly square grid across the
// viewport, used to gently pull separate family islands apart instead of
// leaving them to drift wherever charge/center forces happen to settle them.
function layoutComponentCenters(componentCount, width, height) {
  const cols = Math.ceil(Math.sqrt(componentCount));
  const rows = Math.ceil(componentCount / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  return Array.from({ length: componentCount }, (_, i) => ({
    x: cellW * ((i % cols) + 0.5),
    y: cellH * (Math.floor(i / cols) + 0.5),
  }));
}

export function renderAllNodesGraph(selector, graph) {
  const container = document.querySelector(selector);
  if (!container) return () => {};
  container.innerHTML = '';

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 600;
  const componentCount = Math.max(1, graph.componentCount || 1);
  const componentCenters = layoutComponentCenters(componentCount, width, height);

  const svg = d3
    .select(container)
    .append('svg')
    .attr('class', 'all-nodes-svg')
    .attr('width', width)
    .attr('height', height);

  const graphLayer = svg.append('g').attr('class', 'all-graph-layer');

  const links = graphLayer
    .append('g')
    .attr('class', 'all-links')
    .selectAll('line')
    .data(graph.links)
    .join('line')
    .attr('stroke', (d) => (d.type === 'spouse' ? '#d4a8ff' : '#8ab4ff'))
    .attr('stroke-opacity', 0.75)
    .attr('stroke-width', (d) => (d.type === 'spouse' ? 2 : 1.25));

  const nodes = graphLayer
    .append('g')
    .attr('class', 'all-nodes')
    .selectAll('g')
    .data(graph.nodes)
    .join('g');

  nodes
    .append('circle')
    .attr('r', 11)
    .attr('fill', (d) => (d.gender === 'F' ? '#cc93a6' : '#76a5b8'))
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.5);

  nodes
    .append('text')
    .text((d) => d.label)
    .attr('x', 14)
    .attr('y', 4)
    .attr('font-size', 11)
    .attr('fill', '#ffffff')
    .attr('paint-order', 'stroke')
    .attr('stroke', '#000000')
    .attr('stroke-width', 2);

  // Component-cluster pull is only meaningful with more than one island;
  // at strength 0 (the single-tree case) forceX/forceY are no-ops, so this
  // doesn't change the existing single-component layout at all.
  const clusterStrength = componentCount > 1 ? 0.06 : 0;

  const simulation = d3
    .forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.links).id((d) => d.id).distance(85).strength(0.45))
    .force('charge', d3.forceManyBody().strength(-320))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(22))
    .force('clusterX', d3.forceX((d) => componentCenters[d.component]?.x ?? width / 2).strength(clusterStrength))
    .force('clusterY', d3.forceY((d) => componentCenters[d.component]?.y ?? height / 2).strength(clusterStrength));

  const zoomBehavior = d3
    .zoom()
    .scaleExtent([0.2, 3])
    .on('start', () => svg.classed('is-panning', true))
    .on('zoom', (event) => {
      graphLayer.attr('transform', event.transform);
    })
    .on('end', () => svg.classed('is-panning', false));

  svg.call(zoomBehavior);

  const dragBehavior = d3
    .drag()
    .on('start', (event, d) => {
      if (event.sourceEvent) event.sourceEvent.stopPropagation();
      if (!event.active) simulation.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  nodes.call(dragBehavior);

  simulation.on('tick', () => {
    links
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    nodes.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  function fitToView(transition_duration) {
    const placed = graph.nodes.filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
    if (placed.length === 0) return;

    const minX = d3.min(placed, (d) => d.x);
    const maxX = d3.max(placed, (d) => d.x);
    const minY = d3.min(placed, (d) => d.y);
    const maxY = d3.max(placed, (d) => d.y);
    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);
    const pad = 40;
    const scale = Math.max(0.2, Math.min(3, Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH)));
    const tx = width / 2 - ((minX + maxX) / 2) * scale;
    const ty = height / 2 - ((minY + maxY) / 2) * scale;
    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    svg.transition().duration(transition_duration).call(zoomBehavior.transform, transform);
  }

  const fitTimer = setTimeout(() => fitToView(300), 220);

  let highlightTimer = null;

  return {
    destroy() {
      clearTimeout(fitTimer);
      clearTimeout(highlightTimer);
      simulation.stop();
      container.innerHTML = '';
    },
    // Re-fits the whole connected-component graph to the viewport - the
    // "back to default view" action for All Nodes mode, where there's no
    // single main person to re-root on.
    resetView() {
      fitToView(400);
    },
    // Pans/zooms the simulation's current node position to the center of the
    // viewport and pulses a highlight ring on it. Returns false if the node
    // has no simulated position yet (the graph is still settling) so the
    // caller can fall back to Focused mode instead.
    focusNode(id) {
      const target = graph.nodes.find((d) => d.id === id);
      if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;

      const currentK = d3.zoomTransform(svg.node()).k || 1;
      const k = Math.max(currentK, 1.3);
      const tx = width / 2 - target.x * k;
      const ty = height / 2 - target.y * k;
      const transform = d3.zoomIdentity.translate(tx, ty).scale(k);
      svg.transition().duration(500).call(zoomBehavior.transform, transform);

      const matched = nodes.filter((d) => d.id === id);
      matched.classed('all-node-highlight', false);
      void container.offsetWidth; // restart animation if already highlighted
      matched.classed('all-node-highlight', true);
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => matched.classed('all-node-highlight', false), 2500);

      return true;
    },
  };
}
