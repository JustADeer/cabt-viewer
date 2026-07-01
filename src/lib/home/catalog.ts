export type AgentOption = {
  id: string;
  name: string;
  description?: string;
  path?: string;
  deckUrl?: string;
};

export type GameLogEntry = {
  id: string;
  name: string;
  file: string;
  createdAt?: string;
  players?: string[];
  description?: string;
};

const FALLBACK_AGENT: AgentOption = {
  id: 'first-legal',
  name: 'First legal option',
  description: 'Uses the first legal CABT selection whenever the local engine controls the opponent.',
};

export async function loadAgentOptions(): Promise<AgentOption[]> {
  const [upstream, local] = await Promise.all([
    loadJsonList<AgentOption>('/agents/agents.json', 'agents'),
    loadJsonList<AgentOption>('/agents/local-agents.json', 'agents'),
  ]);
  const ids = new Set(upstream.map((a) => a.id));
  const merged = upstream.concat(local.filter((a) => !ids.has(a.id)));
  return merged.length ? merged : [FALLBACK_AGENT];
}

export async function loadGameLogs(): Promise<GameLogEntry[]> {
  return loadJsonList<GameLogEntry>('/game-logs/logs.json', 'logs');
}

async function loadJsonList<T extends { id?: unknown }>(url: string, key: string): Promise<T[]> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`${url}: ${response.status}`);
  }

  const json = await response.json();
  const list = Array.isArray(json) ? json : json?.[key];
  if (!Array.isArray(list)) {
    throw new Error(`${url}: expected an array or { "${key}": [...] }`);
  }
  return list.filter((item): item is T => !!item && typeof item === 'object' && typeof item.id === 'string');
}
