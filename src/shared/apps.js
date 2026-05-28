'use strict';

/**
 * App registry.
 *
 * Each entry pre-fills the Add App modal so the user doesn't have to type a
 * URL for common apps. The URL is still editable on the modal — tenant-bound
 * apps (Atlassian, Slack workspaces, etc.) need that to be useful.
 *
 * Fields:
 *   key           string    — unique registry key (also used as the source-of
 *                              -truth for the bundled SVG filename).
 *   label         string    — display name in the picker and list.
 *   url           string    — default URL. Some tenant apps use a placeholder
 *                              apex; the user is expected to edit before save.
 *   category      string    — must be one of CATEGORIES below.
 *   allowedHosts  string[]? — optional. Used by the hostname safety check that
 *                              guards `appLastUrl` writes. If unset the check
 *                              uses the entry's own url hostname as the apex
 *                              and accepts any subdomain of it.
 */

const CATEGORIES = [
  'Dev & Infrastructure',
  'Project Management & Work',
  'Design',
  'Finance & Business',
  'Communication',
  'Analytics & Marketing',
  'AI Assistants',
];

const APPS = {
  // ── Dev & Infrastructure ────────────────────────────────────────────────
  cloudflare:   { key: 'cloudflare',   label: 'Cloudflare',     url: 'https://dash.cloudflare.com',         category: 'Dev & Infrastructure' },
  aws:          { key: 'aws',          label: 'AWS Console',    url: 'https://console.aws.amazon.com',      category: 'Dev & Infrastructure',
                  // AWS sign-in lives on signin.aws.amazon.com; SSO redirects through *.awsapps.com
                  allowedHosts: ['aws.amazon.com', 'awsapps.com'] },
  github:       { key: 'github',       label: 'GitHub',         url: 'https://github.com',                  category: 'Dev & Infrastructure' },
  gitlab:       { key: 'gitlab',       label: 'GitLab',         url: 'https://gitlab.com',                  category: 'Dev & Infrastructure' },
  bitbucket:    { key: 'bitbucket',    label: 'Bitbucket',      url: 'https://bitbucket.org',               category: 'Dev & Infrastructure' },
  vercel:       { key: 'vercel',       label: 'Vercel',         url: 'https://vercel.com/dashboard',        category: 'Dev & Infrastructure' },
  netlify:      { key: 'netlify',      label: 'Netlify',        url: 'https://app.netlify.com',             category: 'Dev & Infrastructure',
                  allowedHosts: ['netlify.com', 'netlify.app'] },
  railway:      { key: 'railway',      label: 'Railway',        url: 'https://railway.app',                 category: 'Dev & Infrastructure',
                  // Railway has been bouncing between railway.app and railway.com during the apex move
                  allowedHosts: ['railway.app', 'railway.com'] },
  render:       { key: 'render',       label: 'Render',         url: 'https://dashboard.render.com',        category: 'Dev & Infrastructure' },
  digitalocean: { key: 'digitalocean', label: 'DigitalOcean',   url: 'https://cloud.digitalocean.com',      category: 'Dev & Infrastructure' },
  hetzner:      { key: 'hetzner',      label: 'Hetzner Cloud',  url: 'https://console.hetzner.cloud',       category: 'Dev & Infrastructure',
                  allowedHosts: ['hetzner.cloud', 'hetzner.com'] },
  vultr:        { key: 'vultr',        label: 'Vultr',          url: 'https://my.vultr.com',                category: 'Dev & Infrastructure' },
  sentry:       { key: 'sentry',       label: 'Sentry',         url: 'https://sentry.io',                   category: 'Dev & Infrastructure' },
  datadog:      { key: 'datadog',      label: 'Datadog',        url: 'https://app.datadoghq.com',           category: 'Dev & Infrastructure',
                  // Datadog has regional apexes — EU, US3, US5, gov, etc.
                  allowedHosts: ['datadoghq.com', 'datadoghq.eu', 'ddog-gov.com'] },
  pagerduty:    { key: 'pagerduty',    label: 'PagerDuty',      url: 'https://app.pagerduty.com',           category: 'Dev & Infrastructure' },

  // ── Project Management & Work ───────────────────────────────────────────
  linear:       { key: 'linear',       label: 'Linear',         url: 'https://linear.app',                  category: 'Project Management & Work' },
  jira:         { key: 'jira',         label: 'Jira',           url: 'https://atlassian.net',               category: 'Project Management & Work',
                  // Tenant URLs are *.atlassian.net; user edits the default before save
                  allowedHosts: ['atlassian.net'] },
  confluence:   { key: 'confluence',   label: 'Confluence',     url: 'https://atlassian.net/wiki',          category: 'Project Management & Work',
                  allowedHosts: ['atlassian.net'] },
  notion:       { key: 'notion',       label: 'Notion',         url: 'https://notion.so',                   category: 'Project Management & Work',
                  allowedHosts: ['notion.so', 'notion.com'] },
  asana:        { key: 'asana',        label: 'Asana',          url: 'https://app.asana.com',               category: 'Project Management & Work' },
  clickup:      { key: 'clickup',      label: 'ClickUp',        url: 'https://app.clickup.com',             category: 'Project Management & Work' },
  monday:       { key: 'monday',       label: 'Monday.com',     url: 'https://monday.com',                  category: 'Project Management & Work' },
  basecamp:     { key: 'basecamp',     label: 'Basecamp',       url: 'https://basecamp.com',                category: 'Project Management & Work',
                  allowedHosts: ['basecamp.com', '37signals.com'] },

  // ── Design ──────────────────────────────────────────────────────────────
  figma:        { key: 'figma',        label: 'Figma',          url: 'https://figma.com',                   category: 'Design' },
  canva:        { key: 'canva',        label: 'Canva',          url: 'https://canva.com',                   category: 'Design' },

  // ── Finance & Business ──────────────────────────────────────────────────
  stripe:       { key: 'stripe',       label: 'Stripe',         url: 'https://dashboard.stripe.com',        category: 'Finance & Business' },
  paypal:       { key: 'paypal',       label: 'PayPal Business', url: 'https://business.paypal.com',        category: 'Finance & Business',
                  allowedHosts: ['paypal.com'] },
  quickbooks:   { key: 'quickbooks',   label: 'QuickBooks',     url: 'https://qbo.intuit.com',              category: 'Finance & Business',
                  allowedHosts: ['intuit.com', 'qbo.intuit.com'] },
  wave:         { key: 'wave',         label: 'Wave',           url: 'https://app.waveapps.com',            category: 'Finance & Business' },
  xero:         { key: 'xero',         label: 'Xero',           url: 'https://go.xero.com',                 category: 'Finance & Business' },
  shopify:      { key: 'shopify',      label: 'Shopify',        url: 'https://admin.shopify.com',           category: 'Finance & Business',
                  allowedHosts: ['shopify.com', 'myshopify.com'] },

  // ── Communication ───────────────────────────────────────────────────────
  slack:        { key: 'slack',        label: 'Slack',          url: 'https://app.slack.com',               category: 'Communication',
                  // Workspace-specific hostnames live under *.slack.com
                  allowedHosts: ['slack.com'] },
  discord:      { key: 'discord',      label: 'Discord',        url: 'https://discord.com/app',             category: 'Communication' },
  intercom:     { key: 'intercom',     label: 'Intercom',       url: 'https://app.intercom.com',            category: 'Communication' },

  // ── Analytics & Marketing ───────────────────────────────────────────────
  ga:           { key: 'ga',           label: 'Google Analytics', url: 'https://analytics.google.com',      category: 'Analytics & Marketing',
                  allowedHosts: ['analytics.google.com', 'google.com'] },
  gsc:          { key: 'gsc',          label: 'Google Search Console', url: 'https://search.google.com/search-console', category: 'Analytics & Marketing',
                  allowedHosts: ['search.google.com', 'google.com'] },
  ahrefs:       { key: 'ahrefs',       label: 'Ahrefs',         url: 'https://app.ahrefs.com',              category: 'Analytics & Marketing' },

  // ── AI Assistants ───────────────────────────────────────────────────────
  claude:       { key: 'claude',       label: 'Claude',         url: 'https://claude.ai',                   category: 'AI Assistants' },
  chatgpt:      { key: 'chatgpt',      label: 'ChatGPT',        url: 'https://chatgpt.com',                 category: 'AI Assistants' },
  gemini:       { key: 'gemini',       label: 'Gemini',         url: 'https://gemini.google.com',           category: 'AI Assistants',
                  allowedHosts: ['gemini.google.com', 'google.com'] },
  perplexity:   { key: 'perplexity',   label: 'Perplexity',     url: 'https://perplexity.ai',               category: 'AI Assistants' },
  grok:         { key: 'grok',         label: 'Grok',           url: 'https://grok.com',                    category: 'AI Assistants' },
  copilot:      { key: 'copilot',      label: 'Microsoft Copilot', url: 'https://copilot.microsoft.com',    category: 'AI Assistants',
                  allowedHosts: ['copilot.microsoft.com', 'microsoft.com', 'bing.com'] },
  mistral:      { key: 'mistral',      label: 'Mistral Le Chat', url: 'https://chat.mistral.ai',            category: 'AI Assistants' },
};

module.exports = { APPS, CATEGORIES };
