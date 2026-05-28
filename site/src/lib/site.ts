export const SITE = {
  name: 'Mailwing',
  tagline: 'All your email accounts in one native app',
  description:
    'Mailwing brings your real Gmail, Outlook, Zoho, Fastmail, Yahoo and ProtonMail inboxes into one native desktop app — no browser tabs, no new client to learn. Free and open source.',
  url: import.meta.env.SITE ?? 'https://mailwing.app',
  ogImage: '/img/social-preview.png',
  repo: 'https://github.com/vinaysamtani/mailwing',
  releases: 'https://github.com/vinaysamtani/mailwing/releases',
  issues: 'https://github.com/vinaysamtani/mailwing/issues',
  license: 'https://github.com/vinaysamtani/mailwing/blob/main/LICENSE',
  brewTap: 'vinaysamtani/mailwing/mailwing',
  wingetId: 'Mailwing.Mailwing',
  ghOwner: 'vinaysamtani',
  ghRepo: 'mailwing',
} as const;

export type SiteConfig = typeof SITE;
