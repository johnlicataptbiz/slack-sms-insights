# Derek Bot Safeguards & Smart Timing System

Derek is an AI personality bot that generates witty comments about SMS metrics and conversation patterns. To prevent spam and maintain quality, Derek includes intelligent safeguards that control when and how often he posts.

## Overview

Derek's posting behavior is controlled by three independent safety mechanisms:

1. **Rate Limiting** - Minimum time between posts per channel
2. **Daily Post Cap** - Maximum posts allowed per channel per day
3. **Confidence Threshold** - Minimum quality score to post

These safeguards work together to ensure Derek enhances conversations without becoming spammy or intrusive.

## Safeguard Details

### 1. Rate Limiting (Per-Channel)

**What it does:** Derek won't post multiple times in the same Slack channel within a minimum interval.

**Configuration:**

```env
# Minimum minutes between Derek posts in the same channel (default: 30)
DEREK_MIN_POST_INTERVAL_MIN=30
```

**How it works:**

- Every time Derek posts to a channel, the timestamp is recorded
- Before posting again to that channel, Derek checks if enough time has passed
- Prevents Derek from responding to every mention or metric update in quick succession
- Different channels have independent timers (Derek can post to #channel-a and #channel-b at the same time)

**Example:**

- 2:00 PM: Derek posts about SMS performance in #metrics
- 2:15 PM: New metrics trigger another potential post
- ❌ Derek skips posting (only 15 min since last post, need 30 min)
- 2:30 PM: Another metric update
- ✅ Derek posts (exactly 30 min since last post)

### 2. Daily Post Cap (Per-Channel)

**What it does:** Derek has a maximum number of posts per channel per day.

**Configuration:**

```env
# Maximum Derek posts per channel per day (default: 5)
DEREK_MAX_POSTS_PER_DAY=5
```

**How it works:**

- Daily counts reset at midnight UTC
- Once the limit is reached, Derek stays quiet for the rest of that calendar day
- Prevents Derek from dominating channel conversations even if conditions are right
- Counts are tracked independently per channel

**Example:**

- Derek has posted 4 times to #metrics today
- 11:50 PM UTC: A great metric update occurs
- ✅ Derek posts (4 < 5 limit)
- 11:55 PM UTC: Another metric update
- ❌ Derek skips posting (at limit for today, resets tomorrow)

### 3. Confidence Threshold (Quality Filter)

**What it does:** Derek only posts comments that meet a minimum confidence/quality score.

**Configuration:**

```env
# Minimum confidence score (0.0-1.0, default: 0.6)
DEREK_CONFIDENCE_THRESHOLD=0.6
```

**How it works:**

- Each comment candidate is scored 0.0-1.0 based on quality and relevance
- Scores vary by comment type:
  - **Random observations:** 60-80% confidence (stricter filtering - they're less contextual)
  - **Metric-specific roasts:** 80-100% confidence (more likely to post - they're highly relevant)
- Only comments exceeding the threshold are posted
- Keeps Derek's comments sharp and relevant rather than generic filler

**Example (with default 0.6 threshold):**

- Random observation: "SMS is just yelling into the void"
  - Calculated confidence: 0.55
  - ❌ Filtered out (below 0.6 threshold)
- Observations about a 30% SMS open rate:
  - Calculated confidence: 0.85
  - ✅ Posted (above 0.6 threshold)

## How the System Works

### Finding Comments

```text
// 1. Get comments from Derek (may be unsuitable for posting)
const comment = getDerekComment(context);

// 2. Check if it's worth posting (applies all safeguards)
const worthPosting = getDerekCommentIfWorth(comment);

// 3. Post only if it passed the confidence threshold
if (worthPosting) {
  await postDerekComment(channel, worthPosting);
}
```

### Safeguard Flow

```text

When Derek is triggered to comment:

```

Generated Comment
↓
Pass Confidence Check?
├─→ No → ❌ Drop comment (too generic/low quality)
└─→ Yes
↓
Rate Limit Check (Can post to this channel?)
├─→ No → ❌ Skip posting (too soon since last post)
└─→ Yes
↓
Daily Cap Check (Under today's limit?)
├─→ No → ❌ Skip posting (hit daily max)
└─→ Yes
↓
✅ Post to Slack

````

## Exported Functions

---

### `canDerekPost(channelId: string): boolean`

Checks if Derek can post to a specific channel based on rate limiting and daily cap.

```typescript
if (canDerekPost(channelId)) {
  // Safe to post
}
````

---

### `getPostConfidence(comment: string, context: MessageContext): number`

Calculates the confidence score (0-1) for a given comment.

```typescript
const confidence = getPostConfidence(comment, context);
console.log(`Comment confidence: ${(confidence * 100).toFixed(0)}%`);
```

---

### `getDerekCommentIfWorth(comment: string | null, context?: MessageContext): string | null`

Gets a comment only if it passes the confidence threshold. Returns null if below threshold.

```typescript
const worthyComment = getDerekCommentIfWorth(comment, context);
if (worthyComment) {
  // This comment passed the quality filter
}
```

---

### `postDerekComment(channelId: string, comment: string): Promise<boolean>`

Posts to Slack and returns true if successful, false if rate limited or over daily cap.

```typescript
const posted = await postDerekComment(channelId, comment);
if (!posted) {
  logger.debug("Derek skipped posting (safeguards active)");
}
```

---

## Configuration Examples

### Maximum Frequency (Chatty Derek)

```env
DEREK_MIN_POST_INTERVAL_MIN=5
DEREK_MAX_POSTS_PER_DAY=15
DEREK_CONFIDENCE_THRESHOLD=0.5
```

- Posts frequently but still maintains quality baseline
- Good for high-traffic channels or dev environments

### Moderate Frequency (Balanced)

```env
DEREK_MIN_POST_INTERVAL_MIN=30
DEREK_MAX_POSTS_PER_DAY=5
DEREK_CONFIDENCE_THRESHOLD=0.6
```

- Default configuration
- Professional balance between engagement and restraint

### Minimal Frequency (Quiet Derek)

```env
DEREK_MIN_POST_INTERVAL_MIN=120
DEREK_MAX_POSTS_PER_DAY=2
DEREK_CONFIDENCE_THRESHOLD=0.8
```

- Very selective posting
- Only the best comments make it through
- Good for executive dashboards or formal channels

## Monitoring Derek's Behavior

### Check Per-Channel State

```typescript
import { getDerekChannelState } from "./bot-personality.ts";

const state = getDerekChannelState("#metrics");
console.log(`Posts today: ${state.postsToday}`);
console.log(`Last post: ${state.lastPostTime}`);
```

### View Configuration

```bash
# Current safeguard settings:
echo "DEREK_MIN_POST_INTERVAL_MIN=${DEREK_MIN_POST_INTERVAL_MIN:-30}"
echo "DEREK_MAX_POSTS_PER_DAY=${DEREK_MAX_POSTS_PER_DAY:-5}"
echo "DEREK_CONFIDENCE_THRESHOLD=${DEREK_CONFIDENCE_THRESHOLD:-0.6}"
```

## Common Scenarios

### Scenario 1: Rapid Metric Updates

You have a #monitoring channel with frequent SMS metrics. Derek posts about the latest 50% failure rate at 2:00 PM.

- **2:15 PM:** Another metric spike (90% failure)
  - ❌ Rate limit blocks it (only 15 min passed)
- **2:31 PM:** Crisis resolved, metrics normalize
  - ✅ Derek posts (31 min passed, rate limit satisfied)

### Scenario 2: Daily Limits

Your #highlights channel gets interesting metrics throughout the day.

- Derek posts at: 9am, 10:30am, 1pm, 3pm, 4:30pm
- **6pm:** Exceptional metric (email open rate hit 100%)
  - ❌ Blocked (5 posts already today = at limit)
- **Next day, 9am:** Same metric data
  - ✅ Derek posts (daily count reset)

### Scenario 3: Quality Filtering

Derek generates two observations about SMS patterns:

1. "SMS is fast"
   - Confidence: 0.45 (too generic)
   - ❌ Filtered (below 0.6 threshold)

2. "Your SMS to email ratio is 7:1 - that's a message moat!"
   - Confidence: 0.85 (specific, contextual, clever)
   - ✅ Posted (above 0.6 threshold)

## Troubleshooting

### Derek isn't posting anything

Check in order:

1. **Confidence threshold too high?** Lower `DEREK_CONFIDENCE_THRESHOLD`
2. **Rate limit too strict?** Increase `DEREK_MIN_POST_INTERVAL_MIN` or check recent posts
3. **Daily cap hit?** Check if channel has already hit `DEREK_MAX_POSTS_PER_DAY` today
4. **Comments too generic?** Improve comment generation or lower confidence threshold

```bash
# Debug: Enable logging
LOG_LEVEL=debug npm run dev
```

### Derek posting too much

1. Increase `DEREK_MIN_POST_INTERVAL_MIN` (e.g., 30 → 60)
2. Decrease `DEREK_MAX_POSTS_PER_DAY` (e.g., 5 → 2)
3. Increase `DEREK_CONFIDENCE_THRESHOLD` (e.g., 0.6 → 0.75)

### Comments seem low quality

Increase `DEREK_CONFIDENCE_THRESHOLD` - this filters out weaker comments while keeping sharp ones.

## Technical Details

### State Tracking

- Per-channel state stored in memory during session
- Tracks `lastPostTime` (timestamp) and `postsToday` (count)
- Resets at UTC midnight for daily counts
- **Note:** Restarts clear memory; consider persistent storage for long-running services

### Confidence Calculation

```typescript
// Rough scoring logic:
// - Random observations: base 60-80% (not directly tied to metrics)
// - Daily metrics: 80-95% (highly contextual)
// - Roasts about SMs performance: 90-100% (specific and relevant)
// - Generic/cliché phrases: 40-60% (filtered easily)
```

### Performance Impact

- Rate limiting: O(1) timestamp comparison per post
- Daily cap: O(1) count check per post
- Confidence: ~O(1) string analysis per comment
- &lt;1ms total overhead per post

## Best Practices

1. **Start with defaults** - The default configuration is well-balanced for most channels
2. **Adjust by channel type** - Different thresholds for #random vs #metrics channels
3. **Monitor in staging** - Test configuration changes before updating production
4. **Keep confidence reasonable** - 0.5-0.8 is the practical range; extremes (0.1 or 0.95) cause issues
5. **Document overrides** - If you customize per-channel settings, document why

## Related Files

- [bot-personality.ts](../services/bot-personality.ts) - Implementation
- [.env.sample](../.env.sample) - Default configuration
- [Slack Bot Integration](./SLACK_BOT_INTEGRATION.md) - Overall Derek architecture
