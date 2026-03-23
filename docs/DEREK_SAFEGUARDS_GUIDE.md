# Derek Autonomous Bot - Safeguards & Integration Guide

## Overview

Derek is now equipped with **smart posting safeguards** to prevent spam while maximizing comedic impact. He respects rate limits, confidence thresholds, and contextual timing.

## Features Implemented

### 1. Rate Limiting

- **Minimum 30 minutes** between posts in same channel (configurable)
- **Maximum 5 posts per day** per channel (configurable)
- Daily counter resets automatically at midnight
- Enforced per-channel to allow simultaneous posts across different channels

### 2. Confidence Threshold Filtering

- Posts checked against confidence score (0-1 scale)
- Only posts if score ≥ 0.65 (configurable)
- Random observations: 60-80% confidence (strict filter)
- Metric-specific roasts: 80-100% confidence (better odds)
- Prevents weak/unfunny messages from ever posting

### 3. Team Context Awareness

- Auto-refreshes user message history every 1 hour
- Loads ~100 recent messages per user for roasting accuracy
- Understands team dynamics, activity levels, individual topics
- Enables contextual roasts with insider knowledge

### 4. Automatic Reset Mechanism

- Daily post counter resets automatically every 24 hours
- No manual intervention needed
- Post timestamps tracked per channel

## Configuration

Set these environment variables to control Derek's behavior:

```bash
# Enable/disable autonomous posting (default: true)
DEREK_AUTONOMOUS_ENABLED=true

# Minutes between autonomous posting cycles (default: 45)
DEREK_AUTONOMOUS_INTERVAL_MIN=45

# Hours before context refreshes (default: 1)
DEREK_CONTEXT_REFRESH_HOURS=1

# Channels where Derek posts (comma-separated, default: C09ULGH1BEC)
DEREK_TARGET_CHANNELS=C09ULGH1BEC,C0ABC123DEF,C0XYZ456GHI

# Minimum minutes between posts per channel (default: 30)
DEREK_MIN_POST_INTERVAL_MIN=30

# Max posts per channel per day (default: 5)
DEREK_MAX_POSTS_PER_DAY=5

# Confidence score threshold 0-1 (default: 0.65)
DEREK_CONFIDENCE_THRESHOLD=0.65

# Derek's display name
BOT_NAME=Derek

# Derek's emoji
BOT_EMOJI=📊

# Derek's personality traits
BOT_PERSONALITY="chill, direct, a little sarcastic, gets excited about metrics"
```

## Integration

### Starting Derek's Autonomous Mode

In your Slack app initialization:

```typescript
import { startDerekAutonomous } from "./services/derek-autonomous.js";

// In your app setup
app.start(async () => {
  logger.info("Bot started");

  // Start Derek's autonomous posting
  await startDerekAutonomous(app);
});
```

### Manual Posting (With Safeguards)

```typescript
import { postDerekComment, canDerekPost } from "./services/bot-personality.js";

// Check if Derek can post
const { canPost, reason } = canDerekPost(channelId);
if (!canPost) {
  console.log(`Derek waiting: ${reason}`); // "Wait 15m before next post"
  return;
}

// Try to post (returns boolean if successful)
const posted = await postDerekComment(app, channelId, "conversion");
if (posted) {
  console.log("Derek posted!");
} else {
  console.log("Derek skipped (low confidence or other safeguards)");
}
```

### Event-Based Triggering

```typescript
import { postDerekComment } from "./services/bot-personality.js";

// When a metric spike is detected
app.event("app_mention", async ({ event, client }) => {
  if (event.text.includes("conversion")) {
    // Derek jumps in with safeguards respected
    await postDerekComment(client, event.channel, "conversion");
  }
});
```

## How Derek Decides to Post

### Flow Diagram

```
postDerekComment() called
    ↓
1. Check rate limit (30 min min, 5/day max)
    ├─ ❌ Rate limited? → Return false (wait period)
    └─ ✅ Pass
    ↓
2. Generate comment & check confidence
    ├─ ❌ Confidence < 0.65? → Return false (not funny enough)
    └─ ✅ Pass
    ↓
3. Post to Slack
    ↓
4. Update tracking (timestamp & daily count)
    ↓
5. Return true (posted successfully)
```

## Safeguard Functions

### `canDerekPost(channelId: string)`

Checks if Derek can post right now.

```typescript
const { canPost, reason } = canDerekPost(channelId);
// Returns:
// { canPost: true }
// { canPost: false, reason: "Daily max posts reached" }
// { canPost: false, reason: "Wait 15m before next post" }
```

### `getPostConfidence(): number`

Calculates confidence score (0-1) for a potential post.

```typescript
// Random observations: 0.2-1.0 then filtered
// Metric-specific roasts: 0.8-1.0 (higher confidence)
```

### `getDerekCommentIfWorth(metric?): string | null`

Gets a comment only if confidence threshold is met.

```typescript
const message = getDerekCommentIfWorth("conversion");
// Returns message or null if too risky
```

### `postDerekComment(app, channelId, metric?): Promise<boolean>`

Posts Derek's comment with all safeguards.

```typescript
const posted = await postDerekComment(app, channelId);
// Returns true if posted, false if filtered/rate-limited
```

## Monitoring & Logs

Derek logs all activity at DEBUG level:

```typescript
// Set in env
LOG_LEVEL=debug

// You'll see:
[derek] Autonomous mode started - posting every 45min to 1 channel(s)
[derek] Initial context refresh completed
[derek] Context refresh completed
[derek] Autonomously posted to C09ULGH1BEC (1/5 today)
[derek] Skipped post to C0ABC2 (safeguards or low confidence)
[derek] Cannot post to C0XYZ: Daily max posts reached
[derek] Daily post counter reset
```

## Perfect Timing Strategy

Derek achieves "awesome timing" through:

1. **Staggered Intervals**: Posts every 45 minutes gives space between messages
2. **Confidence Filtering**: Only posts when truly funny (65%+ threshold)
3. **Activity Awareness**: Context shows when team is active/engaged
4. **Rate Limits**: 30+ min gap prevents annoyance fatigue
5. **Daily Caps**: Max 5 posts/day ensures Derek isn't spam bot

## Examples

### Example 1: Derek Posts Autonomously

```
[12:00 PM] Derek: 📊 Fun fact: people *love* SMS. Well, except when we send them 47 messages a day. Who knew?
(Derek waited 30+ min since last post, confidence was 0.78, only 2 posts today)
```

### Example 2: Derek Skips (Rate Limited)

```
canDerekPost(channelId)
→ { canPost: false, reason: "Wait 14m before next post" }
→ Derek waits, nobody is annoyed
```

### Example 3: Derek Skips (Low Confidence)

```
getDerekCommentIfWorth()
→ confidence = 0.42
→ 0.42 < 0.65 threshold
→ Returns null
→ null message never posts
→ Nobody sees a weak joke
```

### Example 4: Derek Posts Context-Aware Roast

```
roastUser(userId)
→ User's message history shows: chatty, talks a lot about "errors"
→ Derek generates: "You and errors are basically best friends at this point."
→ Funny because it's TRUE based on message history
```

## Derek's Funny Insights (Pre-written)

Derek has 10 pre-written insights covering metric scenarios:

- "📉 So, uh... conversion rates took a little nap. Maybe coffee would help? ☕"
- "⚡ WHOA. Your team just went HARD. Like, I didn't know that was possible. Respect. 🔥"
- "📊 Fun fact: people _love_ SMS. Well, except when we send them 47 messages a day. Who knew?"
- "🚨 SLA at 73%? That's not a goal, that's a cry for help."
- "🎯 Okay but like... what if we actually ANSWERED messages? Just a thought."
- "💯 Team Performance looking CRISPY today. I'm not even mad, I'm impressed."
- "📞 Response time going crazy? Maybe less Slack, more action buttons? 👀"
- "🎉 New record! Literally never seen these numbers before. Probably fake but I'll take it."
- "😴 Traffic's been... let's call it 'quiet'. Like TOO quiet."
- "🔥 Hottest metrics I've seen all week. Y'all ARE the chosen ones."

Plus 4 roast templates for specific metric types (conversion, response time, etc).

## Design Principles

✅ **Don't Spam**: 30+ min between posts, max 5/day
✅ **Funnel Weak Jokes**: 65% confidence threshold filters unfunny messages
✅ **Be Contextual**: Loads user history for real roasting
✅ **Fail Gracefully**: Skipped posts never error, just log and continue
✅ **Stay Transparent**: Full debug logging shows Derek's decision-making

## Troubleshooting

### Derek's Not Posting

1. Check `DEREK_AUTONOMOUS_ENABLED=true`
2. Check logs for rate limit messages
3. Verify channel in `DEREK_TARGET_CHANNELS`
4. Check confidence threshold - lower `DEREK_CONFIDENCE_THRESHOLD` if too strict

### Derek Posts Too Much

1. Increase `DEREK_MIN_POST_INTERVAL_MIN` (default: 30)
2. Lower `DEREK_MAX_POSTS_PER_DAY` (default: 5)
3. Increase `DEREK_CONFIDENCE_THRESHOLD` (default: 0.65)

### Derek Posts Too Little

1. Decrease `DEREK_MIN_POST_INTERVAL_MIN`
2. Increase `DEREK_MAX_POSTS_PER_DAY`
3. Decrease `DEREK_CONFIDENCE_THRESHOLD`

## File Reference

- **[sms-insights/services/bot-personality.ts](./bot-personality.ts)** - Derek's personality engine, safeguards, and posting logic
- **[sms-insights/services/message-context.ts](./message-context.ts)** - Team context loading for roasting accuracy
- **[sms-insights/services/derek-autonomous.ts](./derek-autonomous.ts)** - Autonomous scheduling and periodic posting
