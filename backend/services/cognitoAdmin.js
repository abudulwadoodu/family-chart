import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

let client;

function getClient() {
  if (!client) {
    client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-south-2' });
  }
  return client;
}

// Username here is the user's email, matching how backend/db/seed.js looks up
// Cognito users in this pool (email is the alias Cognito users are addressed by).
export async function globalSignOutAndDeleteUser(email) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const cognito = getClient();

  for (const command of [
    new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: email }),
    new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }),
  ]) {
    try {
      await cognito.send(command);
    } catch (error) {
      // Already gone from Cognito — treat as success so a retried delete converges.
      if (error.name !== 'UserNotFoundException') throw error;
    }
  }
}
