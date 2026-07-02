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
const TERMS_LINK = '<a href="/terms" data-internal-link="/terms">Terms &amp; Conditions</a>';

export const TERMS_DOC = {
  slug: 'terms',
  path: '/terms',
  title: 'Terms & Conditions',
  version: '2.0',
  lastUpdatedLabel: 'July 2026',
  lastUpdatedISO: '2026-07-02',
  seoDescription:
    'Read the Terms & Conditions for Family Chart, covering accounts, shared family trees, content ownership, imports and exports, and account deletion.',
  intro:
    'These Terms & Conditions describe the rules that apply when you create an account and use Family Chart to build, import, share, and export family trees.',
  versionHistory: [
    { version: '1.0', date: '2026-07-01', summary: 'Initial publication of the Terms & Conditions.' },
    {
      version: '2.0',
      date: '2026-07-02',
      summary:
        'Expanded with dedicated sections on eligibility, intellectual property, exports, shared-tree ownership, accuracy disclaimers, third-party services, and governing law placeholders.',
    },
  ],
  sections: [
    {
      id: 'introduction',
      title: 'Introduction',
      blocks: [
        p(
          'Welcome to Family Chart ("Family Chart", "we", "us", or "our"). Family Chart is a web application that lets you create, visualize, import, export, and collaboratively manage family trees. These Terms &amp; Conditions ("Terms") form a legal agreement between you and Family Chart and describe the rules that apply when you create an account and use the Service.'
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
          'If you are using Family Chart on behalf of a family group, club, or other organization, you represent that you have the authority to accept these Terms on its behalf, and "you" in that context refers to both you individually and that organization.'
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
          `A specific minimum age requirement (for example, 13, 16, or 18, depending on target jurisdictions) has not been confirmed, and the sign-up flow does not currently collect a date of birth or enforce an age gate. Add the applicable minimum age and any required parental-consent or age-verification mechanism once decided. See also the Children&rsquo;s Privacy section of the ${PRIVACY_LINK}.`
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
          'You are responsible for all activity that occurs under your account, and for providing accurate registration information. Notify us immediately if you suspect unauthorized access to your account. We are not liable for losses caused by your failure to keep your login credentials secure.'
        ),
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable Use',
      blocks: [
        p('When using Family Chart, you agree not to:'),
        list([
          "Upload or share content that is unlawful, defamatory, or harassing, or that infringes another person's rights, including their privacy or publicity rights;",
          "Use the Service to impersonate any person or misrepresent your relationship to any person or family;",
          "Attempt to gain unauthorized access to another user's account, family tree, or data;",
          'Interfere with, disrupt, or attempt to circumvent the security or availability of the Service;',
          'Use automated means (scraping, bulk extraction, etc.) to access the Service, except through any APIs we expressly provide;',
          'Upload malicious files or content designed to harm the Service or other users;',
          'Use import, export, or sharing features to collect or redistribute other users&rsquo; family tree data without their permission.',
        ]),
        p(
          'We may suspend or terminate accounts that violate this section, as described in <a href="#suspension-and-termination">Suspension &amp; Termination</a>.'
        ),
      ],
    },
    {
      id: 'family-trees-and-sharing',
      title: 'Family Trees & Collaboration',
      blocks: [
        sub('Family Tree Ownership'),
        p(
          'When you create a family tree, you are its owner. As owner, you control who can view or edit the tree, control its sharing settings, and may delete it at any time.'
        ),
        sub('Shared Family Trees'),
        p(
          'Owners may share a family tree with other registered users. Sharing a tree allows more than one account to view or edit the same family tree data. Everyone a tree is shared with can see the shared data on the terms the owner grants them; Family Chart does not control what owners choose to share or with whom.'
        ),
        sub('Collaboration Permissions'),
        p(
          "Owners can assign collaborators a role &mdash; such as editor or viewer &mdash; that determines whether they can modify the tree or only view it, and can change or revoke that access at any time from the tree's sharing settings."
        ),
        p(
          'If you are a collaborator rather than the owner of a tree, your access continues only for as long as the owner keeps you on the tree, and the owner may revoke it at any time. We are not responsible for disputes between an owner and collaborators over editing decisions, removed content, or revoked access.'
        ),
        sub('Shared Ownership & Family Disputes'),
        p(
          'A family tree often reflects the shared history of multiple people, but the Service treats only the creating account (or a transferred owner, see below) as the tree&rsquo;s owner for access-control purposes. Family Chart does not mediate disagreements among family members about who should own, edit, or be included in a tree; owners are responsible for resolving such disagreements directly with the people involved.'
        ),
      ],
    },
    {
      id: 'content-and-moderation',
      title: 'Content Ownership & Reporting Inappropriate Content',
      blocks: [
        sub('Content Ownership'),
        p(
          'As between you and Family Chart, you retain ownership of the family tree data, notes, and other content you create, upload, or import (&ldquo;Your Content&rdquo;). We do not claim ownership of Your Content.'
        ),
        sub('License You Grant Us'),
        p(
          'By submitting Your Content to the Service, you grant us a limited, non-exclusive, worldwide, royalty-free license to host, store, reproduce, and display Your Content solely as necessary to operate and provide the Service to you and the collaborators you authorize (for example, to render your tree, generate an export file you request, or process an import file you upload). This license ends when you delete the relevant content or your account, except for copies retained for a limited time as described in <a href="#account-deletion">Account Deletion</a> below and the Privacy Policy&rsquo;s data retention section.'
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
      id: 'accuracy-disclaimer',
      title: 'Accuracy of Family Tree Information',
      blocks: [
        p(
          'Family tree data on Family Chart &mdash; names, dates, relationships, locations, notes, and any information brought in through CSV or GEDCOM import &mdash; is entered or imported by users, not verified by us. Family Chart does not check genealogical claims against public records, other trees, or any external source, and makes no representation that any tree is accurate, complete, or up to date.'
        ),
        p(
          'You should treat information in a family tree, including one shared with you by another user, as that user&rsquo;s personal account of their family history rather than a verified genealogical record. If you rely on tree data for a purpose where accuracy matters (for example, legal, medical, or inheritance-related purposes), you should independently verify it.'
        ),
      ],
    },
    {
      id: 'importing-data',
      title: 'Importing Data',
      blocks: [
        p(
          'Family Chart lets you import family tree data from CSV, GEDCOM, or Family Chart&rsquo;s own JSON export files that you provide, and offers downloadable templates to help format CSV imports.'
        ),
        p(
          'You are responsible for ensuring you have the right to use and upload any data you import, including personal information about living individuals and any content (such as a GEDCOM file) originally exported from another service. Importing a file does not transfer any rights you did not already have in that data.'
        ),
      ],
    },
    {
      id: 'exporting-data',
      title: 'Exporting Data',
      blocks: [
        p(
          'Family Chart lets tree owners and, where permitted by the owner, collaborators export tree data as a GEDCOM file or as a versioned Family Chart JSON file, for backup or use in other genealogy tools.'
        ),
        p(
          'Once a tree is exported, the resulting file is outside the Service and this Service&rsquo;s access controls no longer apply to it. You are responsible for how you store, share, or transmit exported files, including making sure you do not disclose information about living individuals beyond what you are authorized to share.'
        ),
        todo(
          'Image (e.g., PNG/SVG chart snapshot) and PDF export are referenced as planned features. This section should be revisited once those formats ship, including whether exported images embed the same data-handling notice.'
        ),
      ],
    },
    {
      id: 'intellectual-property',
      title: 'Intellectual Property',
      blocks: [
        p(
          'The Family Chart software, branding, logos, and underlying technology (excluding Your Content) are owned by Family Chart or its licensors and are protected by copyright, trademark, and other intellectual property laws. Nothing in these Terms grants you rights in our trademarks, logos, or source code beyond what is necessary to use the Service for its intended purpose.'
        ),
        p(
          'You may not copy, modify, reverse-engineer, or create derivative works of the Service itself (as distinct from Your Content), except to the extent applicable law expressly permits despite this restriction.'
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
      id: 'third-party-services',
      title: 'Third-Party Services',
      blocks: [
        p(
          `Family Chart relies on third-party service providers to operate &mdash; for example, Amazon Web Services for authentication and hosting, and Google for optional sign-in. These providers have their own terms and privacy practices, which are described further in the Data Sharing &amp; Third-Party Services section of our ${PRIVACY_LINK}. We are not responsible for the availability or performance of third-party services outside our control.`
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
          'If you own one or more family trees that are shared with other users, you may be required to transfer ownership of those trees to another collaborator, or export them, before your account can be deleted, so that collaborators are not unexpectedly cut off from shared data.'
        ),
        todo(
          'The exact data retention period following account deletion, and whether any data is retained for legal, security, or backup purposes, must be confirmed and documented here.'
        ),
      ],
    },
    {
      id: 'suspension-and-termination',
      title: 'Suspension & Termination',
      blocks: [
        p(
          'We may suspend or terminate your access to the Service if you violate these Terms, misuse the Service, or if required to do so by law. You may stop using the Service and delete your account at any time, as described above.'
        ),
        p(
          'Where we suspend or remove access to a specific shared tree in response to a content report, we will attempt to notify the tree owner of the action taken, except where doing so would be inappropriate given the nature of the report.'
        ),
        todo(
          'Notice requirements before suspension/termination (if any) and the process for contesting a termination decision should be confirmed by the application owner / legal counsel.'
        ),
      ],
    },
    {
      id: 'service-availability-and-disclaimer',
      title: 'Service Availability & Disclaimer of Warranties',
      blocks: [
        p(
          'We aim to keep Family Chart available and reliable, but we do not guarantee uninterrupted or error-free operation. The Service may be unavailable from time to time for maintenance, updates, or causes beyond our control.'
        ),
        p(
          'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT, EXCEPT AS REQUIRED BY APPLICABLE LAW. WE DO NOT WARRANT THAT FAMILY TREE DATA ENTERED, IMPORTED, OR SHARED BY USERS IS ACCURATE OR RELIABLE; SEE <a href="#accuracy-disclaimer">Accuracy of Family Tree Information</a> ABOVE.'
        ),
      ],
    },
    {
      id: 'limitation-of-liability',
      title: 'Limitation of Liability',
      blocks: [
        p(
          'To the fullest extent permitted by law, Family Chart and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of data, loss of goodwill, or inaccuracy of family tree information, arising from or related to your use of the Service.'
        ),
        todo(
          'A liability cap, the governing law, and the jurisdiction/venue for disputes have not been determined. This section should be reviewed by qualified legal counsel before publication.'
        ),
      ],
    },
    {
      id: 'governing-law',
      title: 'Governing Law',
      blocks: [
        todo(
          'The governing law and venue/forum for resolving disputes under these Terms (and whether disputes are resolved by arbitration, small-claims court, or ordinary litigation) have not been finalized. Add the applicable jurisdiction here once decided, in consultation with legal counsel.'
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
  version: '2.0',
  lastUpdatedLabel: 'July 2026',
  lastUpdatedISO: '2026-07-02',
  seoDescription:
    'Learn what information Family Chart collects, how it is used and protected, and your rights, including account, family tree, living-person, and AI-related privacy details.',
  intro:
    'This Privacy Policy explains what information Family Chart collects, how we use it, and the choices you have when you use the Service.',
  versionHistory: [
    { version: '1.0', date: '2026-07-01', summary: 'Initial publication of the Privacy Policy.' },
    {
      version: '2.0',
      date: '2026-07-02',
      summary:
        'Added dedicated sections on living vs. deceased individuals, exported file responsibility, content ownership/license, AI usage, and expanded international transfer and children\'s privacy coverage.',
    },
  ],
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
        sub('Family Tree Data You Provide'),
        p(
          'Family tree data includes the information you choose to enter or import about family members &mdash; such as names, dates, relationships, locations, biographical notes, and living/deceased status &mdash; including any data you import via CSV, GEDCOM, or a Family Chart JSON file.'
        ),
        sub('Shared Tree Data'),
        p(
          "If a tree is shared with you, or you share a tree you own, the relevant family tree data and the list of collaborators (and their assigned roles) is visible to the people the tree is shared with, consistent with the access you've granted."
        ),
        sub('Exported Files'),
        p(
          'When you export a tree as GEDCOM or JSON, we generate that file from your tree data on request; the export itself is delivered to your device and is not separately retained by us beyond what is needed to process the request.'
        ),
        sub('Support Requests'),
        p(
          'When you contact us through the Contact Us page, we collect the subject, category, message, and any attachment you choose to provide (up to 10&nbsp;MB, limited to common image and document formats), along with your account email, to create and respond to a support ticket. Support conversations are stored so that you and our support team can review the history of a ticket.'
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
      id: 'living-and-deceased-individuals',
      title: 'Living vs. Deceased Individuals in Family Trees',
      blocks: [
        p(
          'Family Chart lets you mark a person in a tree as living or deceased. This flag affects how the person is labeled and exported, and is intended to help tree owners and collaborators understand who a piece of information is about.'
        ),
        p(
          'Information about a living person that another user adds to a tree (for example, a birth date, address, or note) is personal information about that individual, even though the account holder adding it is you, not them. If you add or import information about a living person, you are responsible for having a lawful basis to do so &mdash; including, where required by applicable law, that person&rsquo;s knowledge or consent &mdash; particularly before sharing that tree with other collaborators or exporting it.'
        ),
        p(
          `Information about deceased individuals is generally treated as family history content rather than personal data subject to the same individual privacy rights, but we still expect users to enter it accurately and respectfully, consistent with the Accuracy of Family Tree Information section of the ${TERMS_LINK}.`
        ),
        todo(
          'Confirm whether any jurisdiction Family Chart serves imposes specific legal obligations for data about deceased persons (for example, a limited post-mortem privacy right), and whether the application should default new "living" person records to a more restricted visibility level. Today, living and deceased people are treated the same for tree visibility purposes &mdash; see <a href="#privacy-controls-within-a-tree">Privacy Controls Within a Tree</a> below.'
        ),
      ],
    },
    {
      id: 'privacy-controls-within-a-tree',
      title: 'Privacy Controls Within a Tree',
      blocks: [
        p(
          'Today, access to a family tree is controlled at the tree level: the owner decides who can view or edit the entire tree, and everyone with access to a tree can see the same fields for every person in it, whether living or deceased.'
        ),
        todo(
          'Field-level privacy controls (for example, hiding a living person&rsquo;s phone number, email address, or photo from certain collaborators while still showing their name and relationships) are planned but not yet implemented. When this feature ships, this section should be updated to describe the available controls, their defaults, and how they interact with import/export.'
        ),
      ],
    },
    {
      id: 'content-ownership-and-license',
      title: 'Ownership of Your Content & License to Operate the Service',
      blocks: [
        p(
          'You own the family tree data, notes, and other content you create, upload, or import into Family Chart. We do not claim ownership of it.'
        ),
        p(
          'To provide the Service, you grant us a limited license to host, store, process, and display your content &mdash; for example, to render your tree in the app, generate a GEDCOM or JSON export you request, process a CSV/GEDCOM/JSON file you import, or show shared data to collaborators you&rsquo;ve authorized. We use this content only to operate the Service for you and do not use it to train external products or share it for marketing purposes.'
        ),
        todo(
          'If AI-powered features are introduced (see <a href="#ai-features">AI Features</a> below), confirm whether any user content will be processed by a third-party AI provider, and if so, whether that provider retains or trains on submitted data, so this section and the AI Features section can be updated together.'
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
        p('To store, display, and let you create, edit, import, and export the family trees you manage.'),
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
      id: 'ai-features',
      title: 'AI Features',
      blocks: [
        p(
          'Family Chart does not currently offer any AI-powered features, and no family tree data is processed by an AI model or AI service provider today.'
        ),
        todo(
          'If AI-powered features are introduced in the future (for example, to suggest relationships, clean up imported data, or generate summaries), this section must be updated before launch to name the AI provider(s) used, describe what data is sent to them, whether that data is used to train their models, and what choices users have (such as opting out of AI features). Any such feature should also be reflected in <a href="#data-sharing-and-third-parties">Data Sharing &amp; Third-Party Services</a> below.'
        ),
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
          'Confirm and document the specific at-rest encryption configuration for the database and stored support-ticket attachments used in production.'
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
        p(
          'We do not currently use a separate file-storage provider for photos or attachments; support-ticket attachments are stored directly in our database, subject to a 10&nbsp;MB size limit and file-type restrictions.'
        ),
        todo(
          'If additional sub-processors, hosting providers, a dedicated file-storage service (e.g., for photos), or AI providers are added, list them here along with their role, before they go live.'
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
          'If you own a family tree that is shared with other collaborators, you may need to transfer ownership of that tree, or export it, before your account can be deleted, so that shared data is not unexpectedly lost for the remaining collaborators.'
        ),
        todo(
          'The exact retention period for backups and any data retained after deletion (e.g., 30 days, 90 days) has not been finalized and should be confirmed and documented here.'
        ),
      ],
    },
    {
      id: 'exported-files-and-your-responsibility',
      title: 'Exported Files Are Your Responsibility',
      blocks: [
        p(
          'When you export a tree as a GEDCOM or JSON file, that file leaves Family Chart&rsquo;s systems and our access controls, encryption, and sharing permissions no longer apply to it. The exported file is a copy of the data at the time of export and will not reflect later changes made in the app.'
        ),
        p(
          'You are responsible for how you store, transmit, or share an exported file, including protecting it from unauthorized access and being mindful of information about living individuals it may contain before sending it to a third party or another service.'
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
          'Regardless of your jurisdiction, you can access, update, or delete much of your personal information directly within the application (for example, via Security Settings, tree editing, and account deletion), or by contacting us using the details below.'
        ),
      ],
    },
    {
      id: 'childrens-privacy',
      title: "Children's Privacy",
      blocks: [
        p(
          'Family Chart is not directed at children and is not knowingly used to collect personal information from children under the applicable minimum age. Note that a child may still appear as a person within a family tree created by an adult relative; that is treated as family tree data about the child provided by the adult user, not as the child&rsquo;s own account data.'
        ),
        todo(
          "Confirm the applicable minimum age for account holders (commonly 13 under COPPA, or higher in some jurisdictions) and add a process for removing a child's account information if we learn it has been collected in violation of this policy. Consider whether any additional safeguards are needed for minors appearing as tree members rather than as account holders."
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
