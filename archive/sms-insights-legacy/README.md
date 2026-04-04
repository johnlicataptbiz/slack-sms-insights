# Bolt for JavaScript (TypeScript) Template App

This is a generic Bolt for JavaScript (TypeScript) template app used to build out Slack apps.

Before getting started, make sure you have a development workspace where you have permissions to install apps. If you don’t have one setup, go ahead and [create one](https://slack.com/create).

## Installation

#### Create a Slack App

1. Open [https://api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
2. Choose the workspace you want to install the application to
3. Copy the contents of [manifest.json](./manifest.json) into the text box that says `*Paste your manifest code here*` (within the JSON tab) and click _Next_
4. Review the configuration and click _Create_
5. Click _Install to Workspace_ and _Allow_ on the screen that follows. You'll then be redirected to the App Configuration dashboard.

#### Environment Variables

Before you can run the app, you'll need to store some environment variables.

1. Copy `.env.sample` to `.env`
2. Open your apps configuration page from [this list](https://api.slack.com/apps), click _OAuth & Permissions_ in the left hand menu, then copy the _Bot User OAuth Token_ into your `.env` file under `SLACK_BOT_TOKEN`
3. Click _Basic Information_ from the left hand menu and follow the steps in the _App-Level Tokens_ section to create an app-level token with the `connections:write` scope. Copy that token into your `.env` as `SLACK_APP_TOKEN`.

For safe local testing, keep `ALLOWED_CHANNEL_IDS` and `ALOWARE_CHANNEL_ID`
set to a non-production channel in `.env`.

To enable lead-watcher alerts in the Aloware SMS channel, set:
- `ALOWARE_WATCHER_ENABLED=true`
- `ALOWARE_WATCHER_BRANDON_USER_ID=<Slack user ID>`
- `ALOWARE_WATCHER_JACK_USER_ID=<Slack user ID>`
- Optional: `ALOWARE_WATCHER_CHANNEL_ID=<channel ID>` to override `ALOWARE_CHANNEL_ID`
- Optional: `ALOWARE_WATCHER_DEFAULT_ASSIGNEE=balanced|brandon|jack`
- Optional: `ALOWARE_WATCHER_REQUIRE_OWNER_HINT=true|false` (`true` recommended so alerts only tag the line owner and never fall back)
- Optional: `ALOWARE_INBOUND_COACHING_ENABLED=false|true` (`false` recommended to avoid public AI-style response scripting in threads)
- Optional: `ALOWARE_SEQUENCE_ATTRIBUTION_LOOKBACK_DAYS=30` (keeps booked leads attributed to their originating sequence even after unenroll/no-sequence follow-ups)

AI-generated reports stay in the main channel (threaded when helpful) and are no longer persisted to a Slack canvas log.
Optional: `ALOWARE_DAILY_ANALYSIS_HANDOFF_ENABLED=false` to stop automatic AI analysis prompt posts in daily-report threads.

Note: `CLAUDE_ASSISTANT_USER_ID` should point to the Slack user ID for an AI assistant (not a human/team watcher). If `CLAUDE_ASSISTANT_USER_ID` matches a configured watcher (e.g. `ALOWARE_WATCHER_JACK_USER_ID`), the app will ignore it to avoid accidentally tagging real users.

Also: the app will now *skip* automatic setter feedback for messages that are part of an automated `Sequence` (these are typically bulk/automated messages). Setter coaching feedback only triggers for manual outbound messages.

New: setter-feedback deduping — the app now suppresses duplicate setter-feedback requests for the same message/thread for `ALOWARE_SETTER_FEEDBACK_DEDUPE_MINUTES` (default 10 minutes). Set `ALOWARE_SETTER_FEEDBACK_DEDUPE_MINUTES=0` to disable dedupe.

Persistent dedupe: when a database is available the app will persist dedupe records so suppression survives restarts. Control with `ALOWARE_SETTER_FEEDBACK_PERSISTENT_DEDUPE=true|false` (default: `true` when DB is available).

#### Install Dependencies

```sh
npm install
```

#### Build the App

```sh
npm run build
```

For development, use watch mode to automatically rebuild on changes:

```sh
npm run build:watch
```

#### Run Bolt Server

```sh
npm start
```

## Project Structure

### `manifest.json`

`manifest.json` is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### `app.ts`

`app.ts` is the entry point for the application and is the file you'll run to start the server. This project aims to keep this file as thin as possible, primarily using it as a way to route inbound requests.

### `/listeners`

Every incoming request is routed to a "listener". Inside this directory, we group each listener based on the Slack Platform feature used, so `/listeners/shortcuts` handles incoming [Shortcuts](https://api.slack.com/interactivity/shortcuts) requests, `/listeners/views` handles [View submissions](https://api.slack.com/reference/interaction-payloads/views#view_submission) and so on.

## App Distribution / OAuth

Only implement OAuth if you plan to distribute your application across multiple workspaces. A separate `app-oauth.ts` file can be found with relevant OAuth settings.

When using OAuth, Slack requires a public URL where it can send requests. In this template app, we've used [`ngrok`](https://ngrok.com/download). Checkout [this guide](https://ngrok.com/docs#getting-started-expose) for setting it up.

Start `ngrok` to access the app on an external network and create a redirect URL for OAuth.

```
ngrok http 3000
```

This output should include a forwarding address for `http` and `https` (we'll use `https`). It should look something like the following:

```
Forwarding   https://3cb89939.ngrok.io -> http://localhost:3000
```

Navigate to **OAuth & Permissions** in your app configuration and click **Add a Redirect URL**. The redirect URL should be set to your `ngrok` forwarding address with the `slack/oauth_redirect` path appended. For example:

```
https://3cb89939.ngrok.io/slack/oauth_redirect
```
