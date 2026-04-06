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

function getLargestConnectedComponent(data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const visited = new Set();
  let best = [];

  for (const d of data) {
    if (visited.has(d.id)) continue;
    const queue = [d.id];
    const group = [];
    while (queue.length) {
      const id = queue.shift();
      if (!id || visited.has(id) || !byId.has(id)) continue;
      visited.add(id);
      group.push(id);
      collectRelationIds(byId.get(id)).forEach((relId) => {
        if (byId.has(relId) && !visited.has(relId)) queue.push(relId);
      });
    }
    if (group.length > best.length) best = group;
  }

  return new Set(best);
}

export function buildAllNodesGraphData(data) {
  if (!Array.isArray(data) || data.length === 0) return { nodes: [], links: [] };
  const byId = new Map(data.map((d) => [d.id, d]));
  const component = getLargestConnectedComponent(data);

  const nodes = Array.from(component).map((id) => {
    const datum = byId.get(id);
    return {
      id,
      label: toLabel(datum),
      gender: datum?.data?.gender || 'U',
    };
  });

  const linksMap = new Map();
  const push = (a, b, type) => {
    if (!component.has(a) || !component.has(b) || a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}|${type}`;
    if (!linksMap.has(key)) linksMap.set(key, { source: a, target: b, type });
  };

  component.forEach((id) => {
    const d = byId.get(id);
    (d.rels?.parents || []).forEach((pid) => push(id, pid, 'parent'));
    (d.rels?.children || []).forEach((cid) => push(id, cid, 'child'));
    (d.rels?.spouses || []).forEach((sid) => push(id, sid, 'spouse'));
  });

  return { nodes, links: Array.from(linksMap.values()) };
}

export function renderAllNodesGraph(selector, graph) {
  const container = document.querySelector(selector);
  if (!container) return () => {};
  container.innerHTML = '';

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 600;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('class', 'all-nodes-svg')
    .attr('width', width)
    .attr('height', height);

  const links = svg
    .append('g')
    .attr('class', 'all-links')
    .selectAll('line')
    .data(graph.links)
    .join('line')
    .attr('stroke', (d) => (d.type === 'spouse' ? '#d4a8ff' : '#8ab4ff'))
    .attr('stroke-opacity', 0.75)
    .attr('stroke-width', (d) => (d.type === 'spouse' ? 2 : 1.25));

  const nodes = svg
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

  const simulation = d3
    .forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.links).id((d) => d.id).distance(85).strength(0.45))
    .force('charge', d3.forceManyBody().strength(-320))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(22));

  simulation.on('tick', () => {
    links
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    nodes.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  return () => {
    simulation.stop();
    container.innerHTML = '';
  };
}
