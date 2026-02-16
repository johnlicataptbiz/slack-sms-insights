let cachedAllowedChannels: Set<string> | undefined;
let cachedAllowedChannelsRaw: string | undefined;

const getAllowedChannels = (): Set<string> => {
  const configured = process.env.ALLOWED_CHANNEL_IDS?.trim() || '';
  if (cachedAllowedChannels && cachedAllowedChannelsRaw === configured) {
    return cachedAllowedChannels;
  }

  if (!configured) {
    cachedAllowedChannelsRaw = configured;
    cachedAllowedChannels = new Set();
    return cachedAllowedChannels;
  }

  const ids = configured
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  cachedAllowedChannelsRaw = configured;
  cachedAllowedChannels = new Set(ids);
  return cachedAllowedChannels;
};

export const isChannelAllowed = (channelId?: string): boolean => {
  const allowed = getAllowedChannels();
  if (allowed.size === 0) {
    return true;
  }

  if (!channelId) {
    return false;
  }

  return allowed.has(channelId);
};

export const __resetChannelAccessCacheForTests = (): void => {
  cachedAllowedChannelsRaw = undefined;
  cachedAllowedChannels = undefined;
};
