/**
 * Build profile graphics from first-party GitHub data. Node 24+, no packages.
 * Run: node scripts/update-metrics.mjs
 * Re-render the saved, dated snapshot: node scripts/update-metrics.mjs --offline
 * A failed request/validation leaves the last published snapshot untouched.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const username = 'KD9Sa';
const output = fileURLToPath(new URL('../assets/metrics/', import.meta.url));
const snapshotFile = path.join(output, 'snapshot.json');
const palette = {
  dark: { bg: '#0D1117', panel: '#151B23', border: '#30363D', text: '#F0F6FC', muted: '#9198A1', accent: '#2DD4BF', levels: ['#212830', '#0E4429', '#006D32', '#26A641', '#39D353'] },
  light: { bg: '#FFFFFF', panel: '#F6F8FA', border: '#D1D9E0', text: '#1F2328', muted: '#59636E', accent: '#0F766E', levels: ['#EFF2F5', '#ACEEBB', '#4AC26B', '#2DA44E', '#116329'] },
};
const languageColors = { 'C#': '#178600', TypeScript: '#3178C6', JavaScript: '#F1E05A', HTML: '#E34C26', CSS: '#663399', PHP: '#4F5D95', 'C++': '#F34B7D', C: '#555555', Python: '#3572A5', MATLAB: '#E16737', Dockerfile: '#384D54', Shell: '#89E051', Other: '#8B949E' };
const xml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const number = value => new Intl.NumberFormat('en-US').format(value);
const date = value => new Date(value).toISOString().slice(0, 10);
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));

async function request(url, json = true) {
  const headers = { 'User-Agent': 'KD9Sa-profile-metrics', Accept: json ? 'application/vnd.github+json' : 'text/html' };
  // Never send a repository token to the HTML endpoint or any other host.
  if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        const error = new Error(`GitHub returned HTTP ${response.status} for ${url}`);
        if (response.status < 500 && response.status !== 429) throw Object.assign(error, { permanent: true });
        throw error;
      }
      return json ? await response.json() : await response.text();
    } catch (error) {
      lastError = error;
      if (error.permanent || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
    }
  }
  throw lastError;
}

function parseCalendar(html) {
  const tooltips = new Map([...html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)].map(match => [attributes(match[1]).for, match[2].replace(/<[^>]*>/g, '').trim()]));
  const days = [...html.matchAll(/<td\b[^>]*\bdata-date="\d{4}-\d{2}-\d{2}"[^>]*>/g)].map(match => {
    const attrs = attributes(match[0]);
    const label = tooltips.get(attrs.id);
    const count = label?.match(/^(No|[\d,]+) contributions?\b/);
    if (!count) throw new Error(`Cannot verify the contribution count for ${attrs['data-date']}; GitHub markup may have changed.`);
    return { date: attrs['data-date'], count: count[1] === 'No' ? 0 : Number(count[1].replaceAll(',', '')), level: Number(attrs['data-level']) };
  }).sort((left, right) => left.date.localeCompare(right.date));
  const totalMatch = html.match(/id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions?\b/);
  if (!totalMatch || days.length < 350 || days.length > 380) throw new Error('The public contribution calendar is incomplete or has changed format.');
  const total = Number(totalMatch[1].replaceAll(',', ''));
  if (days.reduce((sum, day) => sum + day.count, 0) !== total) throw new Error('Contribution cells do not match GitHub\'s reported total.');
  return { total, from: days[0].date, to: days.at(-1).date, days };
}

async function collect() {
  const [profile, html] = await Promise.all([
    request(`https://api.github.com/users/${username}`),
    request(`https://github.com/users/${username}/contributions`, false),
  ]);
  if (profile.login?.toLowerCase() !== username.toLowerCase()) throw new Error('Unexpected GitHub profile response.');
  const repositories = [];
  for (let page = 1; ; page++) {
    const batch = await request(`https://api.github.com/users/${username}/repos?type=owner&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected repository response.');
    repositories.push(...batch.filter(repository => !repository.private));
    if (batch.length < 100) break;
  }
  const owned = repositories.filter(repository => !repository.fork);
  const languageRepositories = owned.filter(repository => repository.name.toLowerCase() !== username.toLowerCase());
  const languages = {};
  // Sequential requests avoid a burst against GitHub's unauthenticated quota.
  for (const repository of languageRepositories) {
    const bytes = await request(`https://api.github.com/repos/${username}/${encodeURIComponent(repository.name)}/languages`);
    for (const [language, size] of Object.entries(bytes)) {
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid language byte count in ${repository.name}.`);
      languages[language] = (languages[language] ?? 0) + size;
    }
  }
  return {
    schemaVersion: 1,
    username,
    fetchedAt: new Date().toISOString(),
    sources: { profile: `https://api.github.com/users/${username}`, repositories: `https://api.github.com/users/${username}/repos`, calendar: `https://github.com/users/${username}/contributions` },
    publicRepositories: repositories.length,
    stars: owned.reduce((sum, repository) => sum + repository.stargazers_count, 0),
    languageScope: 'GitHub language bytes across owned, non-fork public repositories; profile repository excluded. Includes GitHub-detected source, not a measure of proficiency.',
    languageRepositories: languageRepositories.map(repository => repository.name).sort(),
    languages,
    contributions: parseCalendar(html),
  };
}

function validate(snapshot) {
  if (snapshot.schemaVersion !== 1 || snapshot.username !== username || !Number.isSafeInteger(snapshot.publicRepositories) || snapshot.publicRepositories < 0 || !Number.isSafeInteger(snapshot.stars) || snapshot.stars < 0) throw new Error('Invalid metric snapshot.');
  if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error('Invalid snapshot timestamp.');
  if (!Number.isSafeInteger(snapshot.contributions?.total) || snapshot.contributions.total < 0 || !snapshot.contributions?.days?.length || snapshot.contributions.days.reduce((sum, day) => sum + day.count, 0) !== snapshot.contributions.total) throw new Error('Invalid saved contribution counts.');
  for (const [index, day] of snapshot.contributions.days.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isSafeInteger(day.count) || day.count < 0 || !Number.isInteger(day.level) || day.level < 0 || day.level > 4) throw new Error('Invalid contribution day.');
    if (index && Date.parse(day.date) - Date.parse(snapshot.contributions.days[index - 1].date) !== 86400000) throw new Error('Contribution dates are incomplete or duplicated.');
  }
  if (snapshot.contributions.from !== snapshot.contributions.days[0].date || snapshot.contributions.to !== snapshot.contributions.days.at(-1).date) throw new Error('Contribution date range does not match the saved days.');
  if (Object.values(snapshot.languages).some(bytes => !Number.isSafeInteger(bytes) || bytes < 0)) throw new Error('Invalid saved language data.');
}

function frame(title, description, height, theme, contents) {
  const p = palette[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img" aria-labelledby="title desc"><title id="title">${xml(title)}</title><desc id="desc">${xml(description)}</desc><style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;fill:${p.text}}.muted{fill:${p.muted}}.accent{fill:${p.accent}}</style><rect x=".5" y=".5" width="959" height="${height - 1}" rx="14" fill="${p.bg}" stroke="${p.border}"/>${contents}</svg>\n`;
}

function overview(snapshot, theme) {
  const p = palette[theme];
  const sorted = Object.entries(snapshot.languages).filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1]);
  const items = sorted.slice(0, 7);
  if (sorted.length > 7) items.push(['Other', sorted.slice(7).reduce((sum, [, bytes]) => sum + bytes, 0)]);
  const totalBytes = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
  let markup = `<text x="30" y="36" font-size="18" font-weight="600">GitHub snapshot</text><text x="930" y="36" text-anchor="end" font-size="12" class="muted">Updated ${xml(date(snapshot.fetchedAt))} UTC</text>`;
  const metrics = [[snapshot.publicRepositories, 'Public repositories'], [snapshot.stars, 'Stars on owned repositories'], [snapshot.contributions.total, 'Contributions · GitHub calendar']];
  metrics.forEach(([value, label], index) => {
    const x = 30 + index * 310;
    markup += `<text x="${x}" y="89" font-size="32" font-weight="650" class="accent">${number(value)}</text><text x="${x}" y="115" font-size="13" class="muted">${xml(label)}</text>`;
  });
  markup += `<path d="M30 140H930" stroke="${p.border}"/><text x="30" y="170" font-size="14" font-weight="600">Repository language distribution</text>`;
  let offset = 30;
  if (totalBytes > 0) {
    markup += '<defs><clipPath id="bar"><rect x="30" y="187" width="900" height="12" rx="6"/></clipPath></defs><g clip-path="url(#bar)">';
    for (const [language, bytes] of items) {
      const width = bytes / totalBytes * 900;
      markup += `<rect x="${offset.toFixed(3)}" y="187" width="${width.toFixed(3)}" height="12" fill="${languageColors[language] ?? '#8B949E'}"/>`;
      offset += width;
    }
    markup += '</g>';
    items.forEach(([language, bytes], index) => {
      const x = 30 + (index % 4) * 225;
      const y = 226 + Math.floor(index / 4) * 25;
      markup += `<circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${languageColors[language] ?? '#8B949E'}"/><text x="${x + 15}" y="${y}" font-size="12">${xml(language)} <tspan class="muted">${(bytes / totalBytes * 100).toFixed(1)}%</tspan></text>`;
    });
  } else markup += '<text x="30" y="215" font-size="12" class="muted">No GitHub language bytes reported.</text>';
  markup += '<text x="30" y="283" font-size="11" class="muted">Language bytes in owned public repositories; forks and this profile excluded. Distribution ≠ proficiency.</text>';
  return frame('KD9Sa — GitHub statistics and repository languages', `${snapshot.publicRepositories} public repositories; ${snapshot.stars} stars on owned repositories; ${snapshot.contributions.total} contributions in GitHub's displayed calendar. Language percentages are computed from ${totalBytes} GitHub-reported bytes, excluding forks and the profile repository. Snapshot ${snapshot.fetchedAt}.`, 304, theme, markup);
}

function activity(snapshot, theme) {
  const p = palette[theme];
  const { days, total, from, to } = snapshot.contributions;
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weeks = Math.ceil(((Date.parse(`${to}T00:00:00Z`) - start.getTime()) / 86400000 + 1) / 7);
  const step = Math.min(16, 856 / weeks);
  const cell = step - 4;
  let markup = `<text x="30" y="35" font-size="18" font-weight="600">Contribution activity</text><text x="930" y="35" text-anchor="end" font-size="12" class="muted">${xml(from)} → ${xml(to)}</text><text x="30" y="58" font-size="13" class="muted">${number(total)} contributions in GitHub's displayed calendar</text>`;
  const monthLabels = new Set();
  for (const day of days) {
    const current = new Date(`${day.date}T00:00:00Z`);
    const week = Math.floor((current.getTime() - start.getTime()) / 86400000 / 7);
    const x = 65 + week * step;
    const y = 94 + current.getUTCDay() * 16;
    const monthKey = day.date.slice(0, 7);
    // Label a month when its first day occurs; first partial month is omitted to avoid overlap.
    if (current.getUTCDate() === 1 && !monthLabels.has(monthKey)) {
      monthLabels.add(monthKey);
      const month = current.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      markup += `<text x="${x.toFixed(2)}" y="84" font-size="10" class="muted">${month}</text>`;
    }
    markup += `<rect x="${x.toFixed(2)}" y="${y}" width="${cell.toFixed(2)}" height="12" rx="2" fill="${p.levels[day.level]}"><title>${day.date}: ${number(day.count)} contribution${day.count === 1 ? '' : 's'}</title></rect>`;
  }
  for (const [label, row] of [['Mon', 1], ['Wed', 3], ['Fri', 5]]) markup += `<text x="30" y="${104 + row * 16}" font-size="10" class="muted">${label}</text>`;
  markup += `<text x="30" y="225" font-size="11" class="muted">Source: public GitHub calendar · Updated ${xml(date(snapshot.fetchedAt))} UTC</text><text x="774" y="225" font-size="10" class="muted">Less</text>`;
  p.levels.forEach((color, index) => { markup += `<rect x="${804 + index * 17}" y="215" width="12" height="12" rx="2" fill="${color}"/>`; });
  markup += '<text x="895" y="225" font-size="10" class="muted">More</text>';
  return frame('KD9Sa — public GitHub contribution calendar', `${total} contributions from ${from} to ${to}, as displayed by GitHub. Snapshot ${snapshot.fetchedAt}.`, 246, theme, markup);
}

function mobileFrame(title, description, height, theme, contents) {
  const p = palette[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}" viewBox="0 0 480 ${height}" role="img" aria-labelledby="title desc"><title id="title">${xml(title)}</title><desc id="desc">${xml(description)}</desc><style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;fill:${p.text}}.muted{fill:${p.muted}}.accent{fill:${p.accent}}</style><rect x=".5" y=".5" width="479" height="${height - 1}" rx="14" fill="${p.bg}" stroke="${p.border}"/>${contents}</svg>\n`;
}

function mobileOverview(snapshot, theme) {
  const p = palette[theme];
  const sorted = Object.entries(snapshot.languages).filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1]);
  const items = sorted.slice(0, 7);
  if (sorted.length > 7) items.push(['Other', sorted.slice(7).reduce((sum, [, bytes]) => sum + bytes, 0)]);
  const totalBytes = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
  let markup = `<text x="24" y="38" font-size="20" font-weight="600">GitHub snapshot</text><text x="24" y="63" font-size="14" class="muted">Updated ${xml(date(snapshot.fetchedAt))} UTC</text>`;
  [[snapshot.publicRepositories, 'Public repos'], [snapshot.stars, 'Stars'], [snapshot.contributions.total, 'Contributions']].forEach(([value, label], index) => {
    const x = 24 + index * 150;
    markup += `<text x="${x}" y="118" font-size="32" font-weight="650" class="accent">${number(value)}</text><text x="${x}" y="143" font-size="14" class="muted">${xml(label)}</text>`;
  });
  markup += `<path d="M24 165H456" stroke="${p.border}"/><text x="24" y="194" font-size="16" font-weight="600">Repository language distribution</text>`;
  let offset = 24;
  if (totalBytes > 0) {
    markup += '<defs><clipPath id="bar"><rect x="24" y="211" width="432" height="12" rx="6"/></clipPath></defs><g clip-path="url(#bar)">';
    for (const [language, bytes] of items) {
      const width = bytes / totalBytes * 432;
      markup += `<rect x="${offset.toFixed(3)}" y="211" width="${width.toFixed(3)}" height="12" fill="${languageColors[language] ?? '#8B949E'}"/>`;
      offset += width;
    }
    markup += '</g>';
    items.forEach(([language, bytes], index) => {
      const x = 24 + (index % 2) * 226;
      const y = 253 + Math.floor(index / 2) * 30;
      markup += `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${languageColors[language] ?? '#8B949E'}"/><text x="${x + 19}" y="${y}" font-size="16">${xml(language)} <tspan class="muted">${(bytes / totalBytes * 100).toFixed(1)}%</tspan></text>`;
    });
  } else markup += '<text x="24" y="253" font-size="16" class="muted">No GitHub language bytes reported.</text>';
  markup += '<text x="24" y="378" font-size="14" class="muted">Owned public repos; profile and forks excluded.</text><text x="24" y="399" font-size="14" class="muted">Source bytes describe distribution, not proficiency.</text>';
  return mobileFrame('KD9Sa — GitHub statistics and repository languages', `${snapshot.publicRepositories} public repositories; ${snapshot.stars} stars on owned repositories; ${snapshot.contributions.total} contributions in GitHub's displayed calendar. Language percentages use GitHub source bytes, excluding forks and the profile repository. Snapshot ${snapshot.fetchedAt}.`, 422, theme, markup);
}

function mobileActivity(snapshot, theme) {
  const p = palette[theme];
  const { days, total, from, to } = snapshot.contributions;
  const monthly = new Map();
  for (const day of days) monthly.set(day.date.slice(0, 7), (monthly.get(day.date.slice(0, 7)) ?? 0) + day.count);
  const months = [...monthly.entries()];
  const maximum = Math.max(1, ...monthly.values());
  let markup = `<text x="24" y="38" font-size="20" font-weight="600">Contribution activity</text><text x="24" y="63" font-size="14" class="muted">${xml(from)} → ${xml(to)}</text><text x="24" y="92" font-size="16">${number(total)} contributions · monthly totals</text>`;
  months.forEach(([month, count], index) => {
    const x = 24 + (index % 2) * 226;
    const y = 136 + Math.floor(index / 2) * 34;
    const boundary = index === 0 || index === months.length - 1;
    const label = new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const width = count / maximum * 88;
    markup += `<g><title>${xml(month)}: ${number(count)} contribution${count === 1 ? '' : 's'}${boundary ? ' (displayed dates only)' : ''}</title><text x="${x}" y="${y}" font-size="15">${xml(label)}${boundary ? '*' : ''}</text><rect x="${x + 70}" y="${y - 11}" width="88" height="11" rx="3" fill="${p.panel}" stroke="${p.border}"/>${count ? `<rect x="${x + 70}" y="${y - 11}" width="${width.toFixed(3)}" height="11" rx="3" fill="${p.accent}"/>` : ''}<text x="${x + 202}" y="${y}" text-anchor="end" font-size="16" class="muted">${number(count)}</text></g>`;
  });
  const footnoteY = 136 + Math.ceil(months.length / 2) * 34 + 15;
  markup += `<text x="24" y="${footnoteY}" font-size="13" class="muted">* Boundary months cover the displayed dates only.</text><text x="24" y="${footnoteY + 23}" font-size="13" class="muted">GitHub calendar · Updated ${xml(date(snapshot.fetchedAt))} UTC</text>`;
  return mobileFrame('KD9Sa — GitHub contribution totals by month', `${total} contributions from ${from} to ${to}, as displayed by GitHub. Monthly counts are summed from the same saved daily calendar. Boundary months include only dates inside this range. Snapshot ${snapshot.fetchedAt}.`, footnoteY + 45, theme, markup);
}

const offline = process.argv.includes('--offline');
const snapshot = offline ? JSON.parse(await readFile(snapshotFile, 'utf8')) : await collect();
validate(snapshot);
// Render and validate everything before replacing any published file.
const files = Object.keys(palette).flatMap(theme => [[`overview-${theme}.svg`, overview(snapshot, theme)], [`activity-${theme}.svg`, activity(snapshot, theme)], [`overview-mobile-${theme}.svg`, mobileOverview(snapshot, theme)], [`activity-mobile-${theme}.svg`, mobileActivity(snapshot, theme)]]);
if (!offline) files.push(['snapshot.json', `${JSON.stringify(snapshot, null, 2)}\n`]);
await mkdir(output, { recursive: true });
for (const [filename, contents] of files) await writeFile(path.join(output, filename), contents, 'utf8');
console.log(`Rendered ${files.length} files from ${snapshot.fetchedAt}: ${snapshot.publicRepositories} repositories, ${snapshot.stars} stars, ${snapshot.contributions.total} contributions.`);
