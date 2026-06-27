import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cabtReplayToSnapshot } from '../src/lib/cabt/cabtReplay';
import {
  animationCoverageRank,
  classifyAnimationCoverage,
  type AnimationCoverageClassification,
  type AnimationCoverageLevel,
} from '../src/lib/cabt/actionAnimationCoverage';
import {
  kaggleEpisodeReplayUrl,
  loadKaggleEpisodeDays,
  loadKaggleEpisodesForDay,
  type KaggleEpisodeDay,
  type KaggleEpisodeSummary,
} from '../src/lib/kaggle/episodes';
import type { ActionTimelineEvent } from '../src/lib/game/types';
import type { ReplaySnapshot } from '../src/lib/game/replay';

type SourceMode = 'fixtures' | 'kaggle' | 'both';

type CliOptions = {
  source: SourceMode;
  days: number;
  episodesPerDay: number;
  maxEpisodes: number;
  seed: number;
  json: boolean;
  out?: string;
  files: string[];
};

type ReplaySource = {
  id: string;
  label: string;
  url?: string;
  file?: string;
  day?: string;
  rank?: number;
  avgScore?: number;
};

type EventExample = {
  source: string;
  stepIndex: number;
  stepLabel: string;
  message: string;
  notes: string[];
};

type ShapeSummary = {
  key: string;
  label: string;
  level: AnimationCoverageLevel;
  count: number;
  examples: EventExample[];
};

type AuditReport = {
  generatedAt: string;
  options: Omit<CliOptions, 'json'>;
  sourcesRequested: number;
  sourcesParsed: number;
  failures: Array<{ source: string; error: string }>;
  totals: {
    replays: number;
    steps: number;
    events: number;
    animationPhases: number;
  };
  byLevel: Record<AnimationCoverageLevel, number>;
  shapes: ShapeSummary[];
};

const defaultOptions: CliOptions = {
  source: 'fixtures',
  days: 2,
  episodesPerDay: 6,
  maxEpisodes: 12,
  seed: 7,
  json: false,
  files: [],
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = await buildSources(options);
  const report = await auditSources(sources, options);
  const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : renderTextReport(report);
  if (options.out) {
    await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await fs.writeFile(options.out, output);
  }
  process.stdout.write(output);
  if (report.sourcesParsed === 0 || report.failures.length === report.sourcesRequested) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { ...defaultOptions, files: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} expects a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === '--source') {
      const value = next();
      if (value !== 'fixtures' && value !== 'kaggle' && value !== 'both') {
        throw new Error('--source must be fixtures, kaggle, or both.');
      }
      options.source = value;
    } else if (arg === '--days') {
      options.days = positiveInteger(next(), arg);
    } else if (arg === '--episodes-per-day') {
      options.episodesPerDay = positiveInteger(next(), arg);
    } else if (arg === '--max-episodes') {
      options.maxEpisodes = positiveInteger(next(), arg);
    } else if (arg === '--seed') {
      options.seed = positiveInteger(next(), arg);
    } else if (arg === '--file') {
      options.files.push(next());
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--out') {
      options.out = next();
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function buildSources(options: CliOptions): Promise<ReplaySource[]> {
  const sources: ReplaySource[] = [];
  if (options.source === 'fixtures' || options.source === 'both' || options.files.length) {
    sources.push(...await fixtureSources(options.files));
  }
  if (options.source === 'kaggle' || options.source === 'both') {
    sources.push(...await kaggleSources(options));
  }
  return dedupeSources(sources).slice(0, options.maxEpisodes || sources.length);
}

async function fixtureSources(files: string[]): Promise<ReplaySource[]> {
  const explicitFiles = files.map((file) => path.resolve(file));
  const defaultFiles = explicitFiles.length ? [] : await defaultFixtureFiles();
  return [...explicitFiles, ...defaultFiles].map((file) => ({
    id: `file:${path.relative(process.cwd(), file)}`,
    label: path.relative(process.cwd(), file),
    file,
  }));
}

async function defaultFixtureFiles(): Promise<string[]> {
  const logsDir = path.resolve('public/game-logs');
  const entries = await fs.readdir(logsDir);
  return entries
    .filter((entry) => entry.endsWith('.json') && entry !== 'logs.json')
    .sort()
    .map((entry) => path.join(logsDir, entry));
}

async function kaggleSources(options: CliOptions): Promise<ReplaySource[]> {
  const days = (await loadKaggleEpisodeDays()).sort((left, right) => right.date.localeCompare(left.date)).slice(0, options.days);
  const daySources = await Promise.all(days.map((day, dayIndex) => kaggleSourcesForDay(day, options, dayIndex)));
  return daySources.flat();
}

async function kaggleSourcesForDay(day: KaggleEpisodeDay, options: CliOptions, dayIndex: number): Promise<ReplaySource[]> {
  const episodes = await loadKaggleEpisodesForDay(day.slug);
  const sampled = sampleEpisodes(episodes, options.episodesPerDay, options.seed + dayIndex * 101);
  return sampled.map((episode) => ({
    id: `${day.slug}/${episode.episodeId}`,
    label: `${day.date} rank ${episode.dailyRank} episode ${episode.episodeId}`,
    url: kaggleEpisodeReplayUrl(day.slug, episode.episodeId),
    day: day.date,
    rank: episode.dailyRank,
    avgScore: episode.avgScore,
  }));
}

function sampleEpisodes(episodes: KaggleEpisodeSummary[], count: number, seed: number): KaggleEpisodeSummary[] {
  if (episodes.length <= count) {
    return episodes;
  }
  const picks = new Map<string, KaggleEpisodeSummary>();
  const buckets = [
    episodes.slice(0, Math.max(1, Math.ceil(episodes.length * 0.15))),
    episodes.slice(Math.floor(episodes.length * 0.4), Math.max(Math.floor(episodes.length * 0.4) + 1, Math.ceil(episodes.length * 0.6))),
    episodes.slice(Math.floor(episodes.length * 0.85)),
  ].filter((bucket) => bucket.length);

  let random = seededRandom(seed);
  for (const bucket of buckets) {
    const episode = bucket[Math.floor(random() * bucket.length)];
    picks.set(episode.episodeId, episode);
  }

  const remaining = episodes.filter((episode) => !picks.has(episode.episodeId));
  while (picks.size < count && remaining.length) {
    random = seededRandom(seed + picks.size * 17);
    const index = Math.floor(random() * remaining.length);
    const [episode] = remaining.splice(index, 1);
    picks.set(episode.episodeId, episode);
  }

  return [...picks.values()].sort((left, right) => left.dailyRank - right.dailyRank);
}

async function auditSources(sources: ReplaySource[], options: CliOptions): Promise<AuditReport> {
  const shapeMap = new Map<string, ShapeSummary>();
  const byLevel: Record<AnimationCoverageLevel, number> = {
    polished: 0,
    conditional: 0,
    static: 0,
    unsupported: 0,
  };
  const failures: AuditReport['failures'] = [];
  let sourcesParsed = 0;
  let steps = 0;
  let events = 0;
  let animationPhases = 0;

  for (const source of sources) {
    try {
      const snapshot = await loadSnapshot(source);
      sourcesParsed += 1;
      steps += snapshot.steps.length;
      for (const step of snapshot.steps) {
        animationPhases += step.animationPhases?.length ?? 0;
        const stepEvents = step.actionTimeline ?? [];
        for (const event of stepEvents) {
          events += 1;
          const classification = classifyAnimationCoverage(event, stepEvents);
          byLevel[classification.level] += 1;
          addShape(shapeMap, classification, {
            source: source.label,
            stepIndex: step.index,
            stepLabel: step.label,
            message: event.message,
            notes: classification.notes,
          });
        }
      }
    } catch (error) {
      failures.push({
        source: source.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    options: {
      source: options.source,
      days: options.days,
      episodesPerDay: options.episodesPerDay,
      maxEpisodes: options.maxEpisodes,
      seed: options.seed,
      out: options.out,
      files: options.files,
    },
    sourcesRequested: sources.length,
    sourcesParsed,
    failures,
    totals: {
      replays: sourcesParsed,
      steps,
      events,
      animationPhases,
    },
    byLevel,
    shapes: [...shapeMap.values()].sort(compareShapeSummary),
  };
}

async function loadSnapshot(source: ReplaySource): Promise<ReplaySnapshot> {
  if (source.file) {
    const contents = await fs.readFile(source.file, 'utf8');
    return cabtReplayToSnapshot(JSON.parse(contents));
  }
  if (!source.url) {
    throw new Error('Source had no file or URL.');
  }
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`${source.url}: ${response.status}`);
  }
  return cabtReplayToSnapshot(await response.json());
}

function addShape(shapeMap: Map<string, ShapeSummary>, classification: AnimationCoverageClassification, example: EventExample): void {
  const existing = shapeMap.get(classification.key);
  if (!existing) {
    shapeMap.set(classification.key, {
      key: classification.key,
      label: classification.label,
      level: classification.level,
      count: 1,
      examples: [example],
    });
    return;
  }

  existing.count += 1;
  if (animationCoverageRank(classification.level) > animationCoverageRank(existing.level)) {
    existing.level = classification.level;
    existing.label = classification.label;
  }
  if (existing.examples.length < 3 && (classification.level !== 'polished' || existing.examples.length === 0)) {
    existing.examples.push(example);
  }
}

function renderTextReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('CABT animation coverage audit');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Parsed: ${report.sourcesParsed}/${report.sourcesRequested} replays, ${report.totals.steps} steps, ${report.totals.events} events, ${report.totals.animationPhases} replay animation phases`);
  lines.push('');
  lines.push('Coverage by event count:');
  for (const level of ['polished', 'conditional', 'static', 'unsupported'] as const) {
    lines.push(`  ${level.padEnd(11)} ${report.byLevel[level]}`);
  }

  const attention = report.shapes.filter((shape) => shape.level !== 'polished');
  lines.push('');
  lines.push('Needs attention:');
  if (!attention.length) {
    lines.push('  None in this sample.');
  } else {
    for (const shape of attention.slice(0, 20)) {
      lines.push(`  ${shape.level.padEnd(11)} ${String(shape.count).padStart(4)}  ${shape.key} - ${shape.label}`);
      const example = shape.examples[0];
      if (example) {
        lines.push(`               e.g. ${example.source} step ${example.stepIndex}: ${example.message}`);
        for (const note of example.notes.slice(0, 2)) {
          lines.push(`               note: ${note}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('Most common shapes:');
  for (const shape of [...report.shapes].sort((left, right) => right.count - left.count).slice(0, 16)) {
    lines.push(`  ${String(shape.count).padStart(4)}  ${shape.level.padEnd(11)} ${shape.key} - ${shape.label}`);
  }

  if (report.failures.length) {
    lines.push('');
    lines.push('Failures:');
    for (const failure of report.failures.slice(0, 10)) {
      lines.push(`  ${failure.source}: ${failure.error}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function compareShapeSummary(left: ShapeSummary, right: ShapeSummary): number {
  return animationCoverageRank(right.level) - animationCoverageRank(left.level)
    || right.count - left.count
    || left.key.localeCompare(right.key);
}

function dedupeSources(sources: ReplaySource[]): ReplaySource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) {
      return false;
    }
    seen.add(source.id);
    return true;
  });
}

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function helpText(): string {
  return `Usage: npm run audit:animations -- [options]

Options:
  --source fixtures|kaggle|both   Replay source. Default: fixtures.
  --file PATH                     Add a local replay JSON file. Repeatable.
  --days N                        Recent Kaggle archive days to sample. Default: 2.
  --episodes-per-day N            Episodes sampled per Kaggle day. Default: 6.
  --max-episodes N                Hard cap across all sources. Default: 12.
  --seed N                        Deterministic sampler seed. Default: 7.
  --json                          Emit JSON instead of text.
  --out PATH                      Also write the report to a file.
`;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
