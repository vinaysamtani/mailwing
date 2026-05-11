export interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
  download_count?: number;
}

export interface GhRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body?: string;
  assets: GhAsset[];
  prerelease?: boolean;
  draft?: boolean;
}

export type Os = 'mac' | 'win' | 'linux';

export interface OsAsset {
  os: Os;
  name: string;
  url: string;
  size: number;
}

export interface LatestRelease {
  version: string;       // "1.2.1" — leading "v" stripped
  tag: string;           // "v1.2.1" — original tag
  publishedAt: string;   // ISO
  htmlUrl: string;
  assets: Record<Os, OsAsset | null>;
}
