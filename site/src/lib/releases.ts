import { SITE } from './site';
import type { GhAsset, GhRelease, LatestRelease, Os, OsAsset } from './releases.types';

const FALLBACK: LatestRelease = {
  version: '1.2.1',
  tag: 'v1.2.1',
  publishedAt: '2026-05-07T12:00:00Z',
  htmlUrl: `${SITE.releases}/tag/v1.2.1`,
  assets: {
    mac:   { os: 'mac',   name: 'Mailwing-1.2.1-universal.dmg', url: `${SITE.releases}/download/v1.2.1/Mailwing-1.2.1-universal.dmg`, size: 125_000_000 },
    win:   { os: 'win',   name: 'Mailwing.Setup.1.2.1.exe',     url: `${SITE.releases}/download/v1.2.1/Mailwing.Setup.1.2.1.exe`,     size: 95_000_000  },
    linux: { os: 'linux', name: 'Mailwing-1.2.1.AppImage',      url: `${SITE.releases}/download/v1.2.1/Mailwing-1.2.1.AppImage`,      size: 140_000_000 },
  },
};

let cached: Promise<LatestRelease> | null = null;

function pickAsset(assets: GhAsset[], os: Os): OsAsset | null {
  const patterns: Record<Os, RegExp[]> = {
    mac:   [/-universal\.dmg$/i, /\.dmg$/i],
    win:   [/setup.*\.exe$/i, /\.exe$/i],
    linux: [/\.AppImage$/i],
  };
  for (const re of patterns[os]) {
    const hit = assets.find(a => re.test(a.name));
    if (hit) return { os, name: hit.name, url: hit.browser_download_url, size: hit.size };
  }
  return null;
}

function stripV(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

export function getLatestRelease(): Promise<LatestRelease> {
  if (cached) return cached;
  cached = (async () => {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'User-Agent': 'mailwing-site-build',
      Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${SITE.ghOwner}/${SITE.ghRepo}/releases/latest`,
        { headers, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const r = (await res.json()) as GhRelease;
      return {
        version: stripV(r.tag_name),
        tag: r.tag_name,
        publishedAt: r.published_at,
        htmlUrl: r.html_url,
        assets: {
          mac:   pickAsset(r.assets, 'mac'),
          win:   pickAsset(r.assets, 'win'),
          linux: pickAsset(r.assets, 'linux'),
        },
      };
    } catch (err) {
      const isProd = process.env.NODE_ENV === 'production' || process.env.CF_PAGES === '1';
      if (isProd && !process.env.MAILWING_ALLOW_FALLBACK) {
        throw new Error(
          `Failed to fetch latest release from GitHub: ${(err as Error).message}. ` +
          `Set GITHUB_TOKEN or MAILWING_ALLOW_FALLBACK=1 to permit fallback.`
        );
      }
      console.warn(`[releases] Falling back to v${FALLBACK.version}: ${(err as Error).message}`);
      return FALLBACK;
    }
  })();
  return cached;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / 1_000_000;
  if (mb < 1) return `${Math.round(bytes / 1000)} KB`;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
