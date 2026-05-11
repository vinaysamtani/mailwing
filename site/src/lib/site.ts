export const SITE = {
  name: 'Mailwing',
  tagline: 'Your inbox, on the wing.',
  description:
    'Six email providers in one native desktop app. Gmail, Outlook, Zoho, Fastmail, Yahoo, ProtonMail. Free and open source.',
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
