<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadKaggleEpisodeDays,
    loadKaggleEpisodesForDay,
    type KaggleEpisodeDay,
    type KaggleEpisodeSummary,
  } from '../kaggle/episodes';

  type Props = {
    busy?: boolean;
    openEpisode: (day: KaggleEpisodeDay, episode: KaggleEpisodeSummary) => void;
  };

  const largeReplayWarningBytes = 50 * 1024 * 1024;

  let { busy = false, openEpisode }: Props = $props();
  let days = $state<KaggleEpisodeDay[]>([]);
  let episodes = $state<KaggleEpisodeSummary[]>([]);
  let selectedSlug = $state('');
  let loadedSlug = $state('');
  let loadingDays = $state(false);
  let loadingEpisodes = $state(false);
  let error = $state('');
  let minAvgScore = $state('');
  let maxSizeMb = $state('');
  let sortKey = $state<'rank' | 'score' | 'time' | 'size'>('rank');
  let dayOptions = $derived(days.slice().sort((left, right) => right.date.localeCompare(left.date)));
  let selectedDay = $derived(dayOptions.find((day) => day.slug === selectedSlug));
  let filteredEpisodes = $derived(sortedEpisodes(episodes).filter(episodeVisible));
  let loading = $derived(loadingDays || loadingEpisodes);

  onMount(() => {
    void refreshDays();
  });

  $effect(() => {
    if (!selectedSlug || selectedSlug === loadedSlug) {
      return;
    }
    void refreshEpisodes(selectedSlug);
  });

  async function refreshDays() {
    loadingDays = true;
    error = '';
    try {
      const nextDays = await loadKaggleEpisodeDays();
      days = nextDays;
      const latest = nextDays.slice().sort((left, right) => right.date.localeCompare(left.date))[0];
      if (latest && !nextDays.some((day) => day.slug === selectedSlug)) {
        selectedSlug = latest.slug;
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loadingDays = false;
    }
  }

  async function refreshEpisodes(slug: string) {
    loadingEpisodes = true;
    error = '';
    try {
      episodes = await loadKaggleEpisodesForDay(slug);
      loadedSlug = slug;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
      episodes = [];
      loadedSlug = '';
    } finally {
      loadingEpisodes = false;
    }
  }

  function reloadSelectedDay() {
    loadedSlug = '';
    if (selectedSlug) {
      void refreshEpisodes(selectedSlug);
    }
  }

  function chooseEpisode(episode: KaggleEpisodeSummary) {
    if (!selectedDay) {
      return;
    }
    if (episode.sizeBytes >= largeReplayWarningBytes && !confirm(`Load ${formatBytes(episode.sizeBytes)} replay ${episode.episodeId}?`)) {
      return;
    }
    openEpisode(selectedDay, episode);
  }

  function sortedEpisodes(source: KaggleEpisodeSummary[]): KaggleEpisodeSummary[] {
    const next = source.slice();
    if (sortKey === 'score') {
      return next.sort((left, right) => right.avgScore - left.avgScore);
    }
    if (sortKey === 'time') {
      return next.sort((left, right) => right.createTime.localeCompare(left.createTime));
    }
    if (sortKey === 'size') {
      return next.sort((left, right) => right.sizeBytes - left.sizeBytes);
    }
    return next.sort((left, right) => left.dailyRank - right.dailyRank);
  }

  function episodeVisible(episode: KaggleEpisodeSummary): boolean {
    const minScore = Number(minAvgScore);
    if (Number.isFinite(minScore) && minAvgScore.trim() && episode.avgScore < minScore) {
      return false;
    }
    const maxBytes = Number(maxSizeMb) * 1024 * 1024;
    if (Number.isFinite(maxBytes) && maxSizeMb.trim() && episode.sizeBytes > maxBytes) {
      return false;
    }
    return true;
  }

  function formatScore(score: number): string {
    return Number.isFinite(score) ? score.toFixed(1) : '0.0';
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 MB';
    }
    const mb = bytes / 1024 / 1024;
    if (mb < 1024) {
      return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
    }
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  function formatDateTime(value: string): string {
    return value.replace('T', ' ').replace(/\.\d+$/, '');
  }
</script>

<div class="kaggle-browser">
  <div class="kaggle-toolbar">
    <label>
      <span>Date</span>
      <select bind:value={selectedSlug} disabled={loadingDays || dayOptions.length === 0}>
        {#each dayOptions as day}
          <option value={day.slug}>{day.date}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Sort</span>
      <select bind:value={sortKey}>
        <option value="rank">Rank</option>
        <option value="score">Avg score</option>
        <option value="time">Newest</option>
        <option value="size">Size</option>
      </select>
    </label>

    <label>
      <span>Min score</span>
      <input bind:value={minAvgScore} inputmode="decimal" placeholder="Any" />
    </label>

    <label>
      <span>Max MB</span>
      <input bind:value={maxSizeMb} inputmode="numeric" placeholder="Any" />
    </label>

    <button type="button" disabled={loading} onclick={selectedSlug ? reloadSelectedDay : refreshDays}>
      {loading ? 'Loading...' : 'Refresh'}
    </button>
  </div>

  {#if selectedDay}
    <div class="day-summary">
      <strong>{selectedDay.episodeCount.toLocaleString()} episodes</strong>
      <span>{formatBytes(selectedDay.totalBytes)}</span>
      <span>Top {formatScore(selectedDay.topAvgScore)}</span>
      <span>Median {formatScore(selectedDay.medianAvgScore)}</span>
    </div>
  {/if}

  {#if error}
    <pre class="error">{error}</pre>
  {:else if loadingDays && days.length === 0}
    <p class="empty">Loading Kaggle dates...</p>
  {:else if loadingEpisodes && episodes.length === 0}
    <p class="empty">Loading episodes...</p>
  {:else if filteredEpisodes.length === 0}
    <p class="empty">No episodes match the current filters.</p>
  {:else}
    <div class="episode-list">
      {#each filteredEpisodes as episode}
        <button type="button" disabled={busy} onclick={() => chooseEpisode(episode)}>
          <span class="rank">#{episode.dailyRank}</span>
          <span>
            <strong>{episode.episodeId}</strong>
            <small>{formatDateTime(episode.createTime)}</small>
          </span>
          <span>
            <small>Avg {formatScore(episode.avgScore)}</small>
            <small>Min {formatScore(episode.minScore)}</small>
          </span>
          <span>
            <small>{formatBytes(episode.sizeBytes)}</small>
            <small>{episode.agentCount} agents</small>
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kaggle-browser {
    display: grid;
    gap: 12px;
  }

  .kaggle-toolbar {
    display: grid;
    grid-template-columns: minmax(150px, 1.15fr) minmax(120px, 0.8fr) minmax(96px, 0.65fr) minmax(96px, 0.65fr) auto;
    gap: 10px;
    align-items: end;
  }

  label {
    display: grid;
    gap: 5px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
  }

  select,
  input {
    min-width: 0;
    min-height: 38px;
    border: 1px solid var(--input-border);
    border-radius: 8px;
    background: var(--input-bg);
    color: var(--input-text);
    padding: 0 10px;
    font: inherit;
  }

  button {
    min-height: 38px;
  }

  .day-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .day-summary strong {
    color: var(--text-primary);
  }

  .episode-list {
    display: grid;
    gap: 8px;
    max-height: min(68vh, 760px);
    overflow: auto;
  }

  .episode-list button {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) minmax(105px, auto) minmax(95px, auto);
    gap: 12px;
    align-items: center;
    min-height: 62px;
    border-radius: 8px;
    text-align: left;
    background: var(--button-bg);
  }

  .episode-list span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .episode-list strong,
  .episode-list small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .episode-list small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .rank {
    color: var(--text-primary);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .error {
    margin: 0;
    padding: 12px;
    border-radius: 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    color: var(--danger-strong);
    white-space: pre-wrap;
  }

  @media (max-width: 980px) {
    .kaggle-toolbar,
    .episode-list button {
      grid-template-columns: 1fr;
    }
  }
</style>
