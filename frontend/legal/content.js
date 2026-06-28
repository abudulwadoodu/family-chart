// Content for the public legal pages (Terms & Conditions, Privacy Policy).
//
// This file holds *only* data - no markup - so legal copy can be reviewed,
// edited, and versioned without touching the rendering code in
// legalPageLayout.js. Each document is a flat list of top-level sections
// (used to build the table of contents); sections may contain `subheading`
// blocks for nested topics so the TOC stays short and scannable.
//
// To publish a revision: update `version` / `lastUpdatedLabel` /
// `lastUpdatedISO`, append an entry to `versionHistory`, and edit the
// relevant section(s) below.
import { SUPPORT_EMAIL } from '../components.js';

const p = (html) => ({ type: 'p', html });
const list = (items) => ({ type: 'list', items });
const sub = (text) => ({ type: 'subheading', text });
// "TODO / Review Required" callouts mark decisions that need input from the
// application owner or legal counsel (governing law, retention periods,
// registered address, etc.) rather than invented legal claims.
const todo = (html) => ({ type: 'callout', tone: 'todo', html });

const CONTACT_LINK = `<a href="mailto:${SUPPORT_EMAIL}" data-contact-link>Contact Us page</a>`;
const EMAIL_LINK = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;
const PRIVACY_LINK = '<a href="/privacy" data-internal-link="/privacy">Privacy Policy</a>';

export const TERMS_DOC = {
  slug: 'terms',
  path: '/terms',
  title: 'Terms & Conditions',
  version: '1.0',
  lastUpdatedLabel: 'July 2026',
  lastUpdatedISO: '2026-07-01',
  seoDescription:
    'Read the Terms & Conditions for Family Chart, covering accounts, authentication, shared family trees, content moderation, and account deletion.',
  intro:
    'These Terms & Conditions describe the rules that apply when you create an account and use Family Chart to build, import, and share family trees.',
  versionHistory: [{ version: '1.0', date: '2026-07-01', summary: 'Initial publication of the Terms & Conditions.' }],
  sections: [
    {
      id: 'introduction',
      title: 'Introduction',
      blocks: [
        p(
          'Welcome to Family Chart ("Family Chart", "we", "us", or "our"). Family Chart is a web application that lets you create, visualize, import, and collaboratively manage family trees. These Terms &amp; Conditions ("Terms") describe the rules that apply when you create an account and use the Service.'
        ),
        todo(
          'The legal operating entity for Family Chart (company name, registration jurisdiction, and registered address) has not yet been finalized. Replace this placeholder, and the references to "we"/"us" throughout this document, with the correct legal entity details before this document is treated as binding.'
        ),
      ],
    },
    {
      id: 'acceptance-of-terms',
      title: 'Acceptance of Terms',
      blocks: [
        p(
          `By creating an account, signing in, or otherwise using Family Chart, you agree to be bound by these Terms and by our ${PRIVACY_LINK}, which is incorporated into these Terms by reference. If you do not agree, you must not use the Service.`
        ),
        p(
          'If you are using Family Chart on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.'
        ),
      ],
    },
    {
      id: 'eligibility',
      title: 'Eligibility',
      blocks: [
        p(
          'You must be able to form a legally binding contract to use Family Chart. Account registration requires a valid email address, or a Google account in good standing.'
        ),
        todo(
          'A specific minimum age requirement (for example, 13, 16, or 18, depending on target jurisdictions) has not been confirmed. Add the applicable minimum age and any required parental-consent mechanism once decided.'
        ),
      ],
    },
    {
      id: 'accounts-and-authentication',
      title: 'User Accounts & Authentication',
      blocks: [
        p('You need an account to create or manage family trees. Family Chart supports the following sign-in methods.'),
        sub('Email & Password'),
        p(
          "You may register using an email address and password. You are responsible for choosing a password that meets the Service's complexity requirements and for keeping it confidential."
        ),
        sub('Google Sign-In'),
        p(
          'You may sign in using your Google account instead of a password. When you do, Family Chart receives basic profile information (such as your name and email address) from Google to create or match your account. We do not receive or store your Google password.'
        ),
        sub('Multi-Factor Authentication (MFA)'),
        p(
          'You may optionally enable time-based one-time password (TOTP) multi-factor authentication from the Security Settings page. When enabled, sign-in requires a code from an authenticator app in addition to your password. MFA is optional and can be turned on or off at any time from your account settings.'
        ),
        sub('Account Security'),
        p(
          'You are responsible for all activity that occurs under your account. Notify us immediately if you suspect unauthorized access to your account. We are not liable for losses caused by your failure to keep your login credentials secure.'
        ),
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable Use',
      blocks: [
        p('When using Family Chart, you agree not to:'),
        list([
          "Upload or share content that is unlawful, defamatory, or harassing, or that infringes another person's rights, including their privacy;",
          "Use the Service to impersonate any person or misrepresent your relationship to any person or family;",
          "Attempt to gain unauthorized access to another user's account, family tree, or data;",
          'Interfere with, disrupt, or attempt to circumvent the security or availability of the Service;',
          'Use automated means (scraping, bulk extraction, etc.) to access the Service, except through any APIs we expressly provide;',
          'Upload malicious files or content designed to harm the Service or other users.',
        ]),
        p('We may suspend or terminate accounts that violate this section.'),
      ],
    },
    {
      id: 'family-trees-and-sharing',
      title: 'Family Trees & Sharing',
      blocks: [
        sub('Family Tree Ownership'),
        p(
          'When you create a family tree, you are its owner. As owner, you control who can view or edit the tree and may delete it at any time.'
        ),
        sub('Importing Data'),
        p(
          'You may import family tree data from a CSV file you provide. You are responsible for ensuring you have the right to use and upload any data you import, including personal information about living individuals.'
        ),
        sub('Shared Family Trees'),
        p(
          'Owners may share a family tree with other registered users. Sharing a tree allows more than one account to view or edit the same family tree data.'
        ),
        sub('Collaboration Permissions'),
        p(
          "Owners can assign collaborators a role &mdash; such as editor or viewer &mdash; that determines whether they can modify the tree or only view it, and can change or revoke that access at any time from the tree's sharing settings."
        ),
        p(
          'If you are a collaborator rather than the owner of a tree, your access continues only for as long as the owner keeps you on the tree, and the owner may revoke it at any time.'
        ),
      ],
    },
    {
      id: 'content-and-moderation',
      title: 'Content Ownership & Reporting Inappropriate Content',
      blocks: [
        sub('Content Ownership'),
        p(
          'As between you and Family Chart, you retain ownership of the family tree data you create or upload. By submitting content to the Service, you grant us a limited license to host, store, and display that content solely as necessary to operate the Service and to provide it to you and the collaborators you authorize.'
        ),
        sub('Reporting Inappropriate Content'),
        p(
          'If you believe a family tree that has been shared with you contains inappropriate, harmful, or unlawful content, you can report it from within the application. Reports are reviewed by Family Chart administrators, who may take action including removing access to the tree or suspending the account responsible.'
        ),
        todo(
          'The specific moderation timelines, escalation process, and appeal mechanism for reported content have not yet been finalized.'
        ),
      ],
    },
    {
      id: 'intellectual-property',
      title: 'Intellectual Property',
      blocks: [
        p(
          'The Family Chart software, branding, and underlying technology (excluding the family tree data you and other users contribute) are owned by Family Chart or its licensors and are protected by intellectual property laws. Nothing in these Terms grants you rights in our trademarks, logos, or source code beyond what is necessary to use the Service.'
        ),
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy',
      blocks: [
        p(
          `Our collection and use of personal information is described in our ${PRIVACY_LINK}. By using Family Chart, you agree to the practices described there.`
        ),
      ],
    },
    {
      id: 'account-deletion',
      title: 'Account Deletion',
      blocks: [
        p(
          'You may delete your account at any time from your account settings. Deleting your account permanently removes your personal account data in accordance with our data retention practices, described in the ' +
            PRIVACY_LINK +
            '.'
        ),
        p(
          'If you own one or more family trees that are shared with other users, you may be required to transfer ownership of those trees to another collaborator before your account can be deleted, so that collaborators are not unexpectedly cut off from shared data.'
        ),
        todo(
          'The exact data retention period following account deletion, and whether any data is retained for legal, security, or backup purposes, must be confirmed and documented here.'
        ),
      ],
    },
    {
      id: 'termination',
      title: 'Termination',
      blocks: [
        p(
          'We may suspend or terminate your access to the Service if you violate these Terms, misuse the Service, or if required to do so by law. You may stop using the Service and delete your account at any time, as described above.'
        ),
        todo(
          'Notice requirements before suspension/termination (if any) and the process for contesting a termination decision should be confirmed by the application owner / legal counsel.'
        ),
      ],
    },
    {
      id: 'service-availability-and-disclaimer',
      title: 'Service Availability & Disclaimer',
      blocks: [
        p(
          'We aim to keep Family Chart available and reliable, but we do not guarantee uninterrupted or error-free operation. The Service may be unavailable from time to time for maintenance, updates, or causes beyond our control.'
        ),
        p(
          'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT, EXCEPT AS REQUIRED BY APPLICABLE LAW.'
        ),
      ],
    },
    {
      id: 'limitation-of-liability',
      title: 'Limitation of Liability',
      blocks: [
        p(
          'To the fullest extent permitted by law, Family Chart and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of data, arising from or related to your use of the Service.'
        ),
        todo(
          'A liability cap, the governing law, and the jurisdiction/venue for disputes have not been determined. This section should be reviewed by qualified legal counsel before publication.'
        ),
      ],
    },
    {
      id: 'changes-to-these-terms',
      title: 'Changes to These Terms',
      blocks: [
        p(
          'We may update these Terms from time to time to reflect changes to the Service or for legal or operational reasons. When we make material changes, we will update the "Last Updated" date and version number at the top of this page. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.'
        ),
      ],
    },
    {
      id: 'contact-information',
      title: 'Contact Information',
      blocks: [
        p(`Questions about these Terms can be sent through our ${CONTACT_LINK}, or by email at ${EMAIL_LINK}.`),
        todo('A registered business address for legal notices has not been provided and should be added here once available.'),
      ],
    },
  ],
};

export const PRIVACY_DOC = {
  slug: 'privacy',
  path: '/privacy',
  title: 'Privacy Policy',
  version: '1.0',
  lastUpdatedLabel: 'July 2026',
  lastUpdatedISO: '2026-07-01',
  seoDescription:
    'Learn what information Family Chart collects, how it is used and protected, and your rights, including account, authentication, and family tree data.',
  intro:
    'This Privacy Policy explains what information Family Chart collects, how we use it, and the choices you have when you use the Service.',
  versionHistory: [{ version: '1.0', date: '2026-07-01', summary: 'Initial publication of the Privacy Policy.' }],
  sections: [
    {
      id: 'introduction',
      title: 'Introduction',
      blocks: [
        p(
          'This Privacy Policy explains what information Family Chart ("Family Chart", "we", "us", or "our") collects, how we use it, and the choices you have. It applies to your use of the Family Chart web application (the "Service").'
        ),
        todo(
          'Legal entity name, registered address, and (if applicable) a designated Data Protection Officer or EU/UK representative should be added once finalized.'
        ),
      ],
    },
    {
      id: 'information-we-collect',
      title: 'Information We Collect',
      blocks: [
        sub('Account Information & Email Address'),
        p(
          'Your account is identified primarily by your email address, which we collect when you register and use to identify your account, deliver sign-in related communications, and respond to support requests.'
        ),
        sub('Authentication Information'),
        p(
          'We use Amazon Cognito to manage authentication. Cognito stores your hashed password (we never see or store your plaintext password) and, if you choose to enable it, the secret used for time-based one-time password (TOTP) multi-factor authentication.'
        ),
        sub('Google Sign-In Information'),
        p(
          'If you choose "Continue with Google," Google shares basic profile information with us (such as your name, email address, and a unique identifier) so that we can create or match your Family Chart account. We do not receive your Google password.'
        ),
        sub('Family Tree Data'),
        p(
          'Family tree data includes the information you choose to enter or import about family members &mdash; such as names, dates, relationships, locations, and notes &mdash; including any data you import via CSV.'
        ),
        sub('Shared Tree Data'),
        p(
          "If a tree is shared with you, or you share a tree you own, the relevant family tree data and the list of collaborators (and their assigned roles) is visible to the people the tree is shared with, consistent with the access you've granted."
        ),
        sub('Support Requests'),
        p(
          'When you contact us through the Contact Us page, we collect the subject, category, message, and any attachment you choose to provide, along with your account email, to create and respond to a support ticket. Support conversations are stored so that you and our support team can review the history of a ticket.'
        ),
        sub('Usage Information'),
        p(
          'We may collect basic technical information needed to operate the Service, such as server request logs (for example, timestamps and error information), for security and troubleshooting purposes.'
        ),
        sub('Cookies'),
        p(
          'Family Chart stores authentication tokens locally in your browser (via Amazon Cognito) so that you can stay signed in between visits. We do not currently use cookies or similar technologies for analytics, advertising, or cross-site tracking.'
        ),
        todo(
          'If cookies or similar technologies are introduced for analytics or advertising in the future, this section should be expanded and a dedicated Cookie Policy should be added.'
        ),
      ],
    },
    {
      id: 'how-we-use-information',
      title: 'How We Use Information',
      blocks: [
        sub('Authentication'),
        p('To verify your identity, sign you in, and keep your account secure, including via optional MFA.'),
        sub('Family Tree Management'),
        p('To store, display, and let you create, edit, and import the family trees you manage.'),
        sub('Sharing Features'),
        p('To let tree owners share trees with collaborators and manage their access.'),
        sub('Customer Support'),
        p('To respond to support tickets you submit and to maintain a record of the conversation.'),
        sub('Email Notifications'),
        p(
          'To send transactional emails related to your account and support requests (for example, confirming a new support ticket or notifying you of a reply) using Amazon SES.'
        ),
        p('We do not use your information for advertising, and we do not sell your personal information.'),
      ],
    },
    {
      id: 'how-we-protect-information',
      title: 'How We Protect Information',
      blocks: [
        sub('Amazon Cognito'),
        p(
          'Authentication credentials are managed by Amazon Cognito, a managed identity service. Passwords are hashed and are never stored or visible to us in plaintext.'
        ),
        sub('Encryption'),
        p('Data is encrypted in transit using HTTPS/TLS.'),
        todo(
          'Confirm and document the specific at-rest encryption configuration for the database and any file storage (e.g., support ticket attachments) used in production.'
        ),
        sub('Access Controls'),
        p(
          "Access to family tree data is restricted to a tree's owner and the collaborators they have explicitly added. Administrative access to support tickets and content moderation tools is limited to designated administrator accounts."
        ),
      ],
    },
    {
      id: 'data-sharing-and-third-parties',
      title: 'Data Sharing & Third-Party Services',
      blocks: [
        p(
          'We do not sell your personal information. We share information only with the service providers needed to operate Family Chart, and with other users to the extent you direct (for example, by sharing a tree).'
        ),
        sub('Amazon Cognito'),
        p('Used to store and manage account credentials and authentication sessions.'),
        sub('Amazon SES'),
        p('Used to send transactional emails, such as support ticket notifications.'),
        sub('Google Authentication'),
        p(
          'Used to offer "Continue with Google" sign-in. Google acts as an identity provider and processes your sign-in according to its own privacy policy.'
        ),
        todo(
          'If additional sub-processors or hosting providers (e.g., the database host, file storage for attachments) are added, list them here along with their role.'
        ),
      ],
    },
    {
      id: 'data-retention-and-account-deletion',
      title: 'Data Retention & Account Deletion',
      blocks: [
        p(
          'We retain your account and family tree data for as long as your account is active. If you delete your account, your personal account data is permanently removed in accordance with our data retention practices, except where retention is required for legal, security, or fraud-prevention purposes.'
        ),
        p(
          'If you own a family tree that is shared with other collaborators, you may need to transfer ownership of that tree to another collaborator before your account can be deleted, so that shared data is not lost for the remaining collaborators.'
        ),
        todo(
          'The exact retention period for backups and any data retained after deletion (e.g., 30 days, 90 days) has not been finalized and should be confirmed and documented here.'
        ),
      ],
    },
    {
      id: 'your-privacy-rights',
      title: 'Your Privacy Rights',
      blocks: [
        sub('GDPR (European Economic Area / UK users)'),
        todo(
          'If Family Chart serves users in the EEA/UK, this section should describe the lawful bases for processing and the rights available under the GDPR/UK GDPR (access, rectification, erasure, restriction, portability, objection) and the supervisory authority users may complain to. Confirm with legal counsel before publication.'
        ),
        sub('CCPA (California users)'),
        todo(
          'If Family Chart serves California residents, this section should describe the rights available under the CCPA/CPRA (know, delete, correct, opt out of sale/sharing, non-discrimination) and how to exercise them. Confirm with legal counsel before publication.'
        ),
        p(
          'Regardless of your jurisdiction, you can access, update, or delete much of your personal information directly within the application (for example, via Security Settings and account deletion), or by contacting us using the details below.'
        ),
      ],
    },
    {
      id: 'childrens-privacy',
      title: "Children's Privacy",
      blocks: [
        p(
          'Family Chart is not directed at children and is not knowingly used to collect personal information from children under the applicable minimum age.'
        ),
        todo(
          "Confirm the applicable minimum age (commonly 13 under COPPA, or higher in some jurisdictions) and add a process for removing a child's information if we learn it has been collected."
        ),
      ],
    },
    {
      id: 'international-data-transfers',
      title: 'International Data Transfers',
      blocks: [
        p(
          'Family Chart and the third-party services we rely on (such as Amazon Web Services) may process and store data in countries other than your own.'
        ),
        todo(
          'Confirm the AWS region(s) used in production and document the legal mechanism (e.g., Standard Contractual Clauses) relied on for any international transfers, if applicable.'
        ),
      ],
    },
    {
      id: 'policy-updates',
      title: 'Policy Updates',
      blocks: [
        p(
          'We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last Updated" date and version number at the top of this page. We encourage you to review this page periodically.'
        ),
      ],
    },
    {
      id: 'contact-information',
      title: 'Contact Information',
      blocks: [
        p(
          `Questions about this Privacy Policy or your personal information can be sent through our ${CONTACT_LINK}, or by email at ${EMAIL_LINK}.`
        ),
        todo('A registered business address for privacy-related legal notices has not been provided and should be added here once available.'),
      ],
    },
  ],
};

export const LEGAL_DOCS = {
  terms: TERMS_DOC,
  privacy: PRIVACY_DOC,
};
