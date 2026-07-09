import { query } from '../db/index.js';

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

function memberName(person) {
  const data = person.data || {};
  return [data['first name'], data['last name']].filter(Boolean).join(' ').trim() || 'Unnamed';
}

// Family members live inside each tree's family_data.json_data blob, not as
// their own SQL rows, so this flattens every tree's members into one list in
// application code. Fine at this app's scale (family trees, not millions of
// rows) - if that changes, this is the place to introduce a members table.
export async function listMembersForAdmin({ search, treeId, page, pageSize }) {
  const { rows: trees } = await query(
    `SELECT t.id AS tree_id, t.name AS tree_name, owner.email AS owner_email, fd.json_data
     FROM trees t
     LEFT JOIN users owner ON owner.id = t.owner_id
     JOIN family_data fd ON fd.tree_id = t.id
     ${treeId ? 'WHERE t.id = $1' : ''}
     ORDER BY t.id`,
    treeId ? [Number(treeId)] : []
  );

  let members = [];
  for (const tree of trees) {
    // json_data is JSONB - pg already parses it into a JS value, not a string.
    const people = Array.isArray(tree.json_data) ? tree.json_data : [];
    for (const person of people) {
      members.push({
        id: `${tree.tree_id}:${person.id}`,
        memberId: person.id,
        treeId: tree.tree_id,
        treeName: tree.tree_name,
        ownerEmail: tree.owner_email,
        name: memberName(person),
        gender: person.data?.gender || null,
        birthday: person.data?.birthday ?? null,
        avatar: person.data?.avatar || null,
      });
    }
  }

  if (search) {
    const needle = search.toLowerCase();
    members = members.filter(
      (m) => m.name.toLowerCase().includes(needle) || m.treeName.toLowerCase().includes(needle)
    );
  }

  const total = members.length;
  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const pageItems = members.slice(offset, offset + limit);

  return { members: pageItems, total, page: safePage, pageSize: safePageSize };
}
