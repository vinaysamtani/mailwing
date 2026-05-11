export interface Provider {
  id: string;
  label: string;
  color: string;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'gmail',      label: 'Gmail',      color: '#4285F4' },
  { id: 'outlook',    label: 'Outlook',    color: '#0078D4' },
  { id: 'zoho',       label: 'Zoho',       color: '#E42527' },
  { id: 'fastmail',   label: 'Fastmail',   color: '#1A1A2E' },
  { id: 'yahoo',      label: 'Yahoo',      color: '#6001D2' },
  { id: 'protonmail', label: 'ProtonMail', color: '#6D4AFF' },
];

export const PROVIDER_ARIA_LABEL =
  'Supports Gmail, Outlook, Zoho, Fastmail, Yahoo, and ProtonMail.';
