import bcrypt from 'bcrypt';

import { initDb, getDb } from './index.js';
import { getDefaultTreeDataJson } from '../utils/defaultTreeData.js';

async function seed() {
  initDb();
  const db = getDb();

  const users = [
    { email: 'owner@example.com', password: 'OwnerPass123!' },
    { email: 'editor@example.com', password: 'EditorPass123!' },
    { email: 'viewer@example.com', password: 'ViewerPass123!' },
  ];

  for (const user of users) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, 12);
      db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(user.email, passwordHash);
    }
  }

  const owner = db.prepare('SELECT id FROM users WHERE email = ?').get('owner@example.com');
  const editor = db.prepare('SELECT id FROM users WHERE email = ?').get('editor@example.com');
  const viewer = db.prepare('SELECT id FROM users WHERE email = ?').get('viewer@example.com');

  let tree = db.prepare('SELECT id FROM trees WHERE name = ?').get('Demo Family Tree');
  if (!tree) {
    const created = db.prepare('INSERT INTO trees (name, owner_id) VALUES (?, ?)').run('Demo Family Tree', owner.id);
    tree = { id: created.lastInsertRowid };
  }

  const upsertMembership = db.prepare(
    `INSERT INTO tree_memberships (user_id, tree_id, role, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, tree_id)
     DO UPDATE SET role = excluded.role, status = excluded.status`
  );

  upsertMembership.run(owner.id, tree.id, 'owner', 'approved');
  upsertMembership.run(editor.id, tree.id, 'editor', 'approved');
  upsertMembership.run(viewer.id, tree.id, 'viewer', 'approved');

  db.prepare(
    `INSERT INTO family_data (tree_id, json_data)
     VALUES (?, ?)
     ON CONFLICT(tree_id) DO NOTHING`
  ).run(tree.id, getDefaultTreeDataJson());

  console.log('Seed complete.');
  console.log('Users: owner@example.com, editor@example.com, viewer@example.com');
  console.log('Passwords: OwnerPass123!, EditorPass123!, ViewerPass123!');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
