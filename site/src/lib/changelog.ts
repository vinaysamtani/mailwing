import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

marked.use(gfmHeadingId());

export interface ChangelogVersion {
  version: string;
  date: string;
  anchor: string;
}

export interface ChangelogPayload {
  html: string;
  versions: ChangelogVersion[];
}

const CHANGELOG_URL = new URL('../../../CHANGELOG.md', import.meta.url);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function loadChangelog(): Promise<ChangelogPayload> {
  const path = fileURLToPath(CHANGELOG_URL);
  const md = await readFile(path, 'utf8');
  const html = marked.parse(md) as string;

  const versions: ChangelogVersion[] = [];
  const re = /^## \[([^\]]+)\]\s*-\s*(\S+)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    versions.push({
      version: m[1],
      date: m[2],
      anchor: slugify(`${m[1]} ${m[2]}`),
    });
  }
  return { html, versions };
}
