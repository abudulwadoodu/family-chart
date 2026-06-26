const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({});

// Cognito's AdminLinkProviderForUser can only link a federated identity onto an
// existing native user, not the reverse - so this trigger only has work to do
// when a *new* federated sign-up (e.g. Google) shares an email with an existing
// user. Native email/password sign-ups are left untouched: the user pool's
// username_attributes = ["email"] already rejects a duplicate email there.
exports.handler = async (event) => {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return event;

  const email = event.request.userAttributes.email;
  const [providerName, providerSub] = splitProviderUsername(event.userName);

  const existing = await client.send(
    new ListUsersCommand({
      UserPoolId: event.userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  );
  const destination = existing.Users?.[0];

  if (destination && destination.Username !== event.userName) {
    try {
      await client.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: event.userPoolId,
          DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: destination.Username },
          SourceUser: {
            ProviderName: providerName,
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: providerSub,
          },
        })
      );
    } catch (error) {
      // Already linked from a previous attempt - treat as success rather than failing the sign-in.
      if (error.name !== 'AliasExistsException') throw error;
    }
  }

  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};

function splitProviderUsername(userName) {
  const idx = userName.indexOf('_');
  return [userName.slice(0, idx), userName.slice(idx + 1)];
}
