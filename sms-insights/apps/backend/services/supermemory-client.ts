import Supermemory from 'supermemory';

let client: Supermemory | null = null;

export function getSupermemoryClient(): Supermemory | null {
  const apiKey = process.env.SUPERMEMORY_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!client) {
    client = new Supermemory({ apiKey });
  }

  return client;
}

export function isSupermemoryConfigured(): boolean {
  return Boolean(process.env.SUPERMEMORY_API_KEY?.trim());
}
