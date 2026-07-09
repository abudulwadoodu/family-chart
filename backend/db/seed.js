import dotenv from 'dotenv';

dotenv.config();

// Dynamic imports so dotenv.config() above runs before db/index.js reads
// process.env.DATABASE_URL at module-load time (static imports are hoisted and
// would otherwise run first) — same pattern as backend/server.js.
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} = await import('@aws-sdk/client-cognito-identity-provider');
const { initDb, query } = await import('./index.js');
const { getDefaultTreeDataJson } = await import('../utils/defaultTreeData.js');

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const demoPassword = process.env.SEED_DEMO_PASSWORD || 'Demo-Pass-2026!';

const cognito = userPoolId
  ? new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-south-2' })
  : null;

// Idempotent: returns the Cognito `sub` for an existing or newly created demo user.
async function ensureCognitoUser(email) {
  if (!cognito) {
    throw new Error('COGNITO_USER_POOL_ID is not set — cannot seed Cognito users.');
  }

  try {
    const existing = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }));
    return existing.UserAttributes.find((attr) => attr.Name === 'sub').Value;
  } catch (error) {
    if (error.name !== 'UserNotFoundException') throw error;
  }

  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    })
  );

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: demoPassword,
      Permanent: true,
    })
  );

  return created.User.Attributes.find((attr) => attr.Name === 'sub').Value;
}

async function seed() {
  await initDb();

  const emails = ['owner@example.com', 'editor@example.com', 'viewer@example.com'];
  const userIdByEmail = {};

  for (const email of emails) {
    const cognitoSub = await ensureCognitoUser(email);
    const { rows: existingRows } = await query('SELECT id FROM users WHERE cognito_sub = $1', [cognitoSub]);
    if (existingRows[0]) {
      userIdByEmail[email] = existingRows[0].id;
    } else {
      const { rows } = await query('INSERT INTO users (email, cognito_sub) VALUES ($1, $2) RETURNING id', [
        email,
        cognitoSub,
      ]);
      userIdByEmail[email] = rows[0].id;
    }
  }

  const { rows: existingTreeRows } = await query('SELECT id FROM trees WHERE name = $1', ['Demo Family Tree']);
  let treeId = existingTreeRows[0]?.id;
  if (!treeId) {
    const { rows } = await query('INSERT INTO trees (name, owner_id) VALUES ($1, $2) RETURNING id', [
      'Demo Family Tree',
      userIdByEmail['owner@example.com'],
    ]);
    treeId = rows[0].id;
  }

  async function upsertPermission(userId, role) {
    await query(
      `INSERT INTO tree_permissions (tree_id, user_id, role, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT(tree_id, user_id)
       DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
      [treeId, userId, role]
    );
  }

  await upsertPermission(userIdByEmail['owner@example.com'], 'owner');
  await upsertPermission(userIdByEmail['editor@example.com'], 'editor');
  await upsertPermission(userIdByEmail['viewer@example.com'], 'viewer');

  await query(
    `INSERT INTO family_data (tree_id, json_data)
     VALUES ($1, $2)
     ON CONFLICT(tree_id) DO NOTHING`,
    [treeId, getDefaultTreeDataJson()]
  );

  console.log('Seed complete.');
  console.log(`Demo accounts (password: ${demoPassword}):`);
  console.log('  owner@example.com / editor@example.com / viewer@example.com');
  console.log('Sign in through the app UI; set up TOTP MFA on first login if prompted.');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
