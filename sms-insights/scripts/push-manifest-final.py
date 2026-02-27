import json
import urllib.request

with open('/Users/jl/.slack/credentials.json') as f:
    creds = json.load(f)
token = creds.get('TJ3QQ76KV', {}).get('token', '')
print('Token prefix:', token[:20])

manifest = {
    "display_information": {
        "name": "PT Biz SMS",
        "description": "A real time SMS insights dashboard integrated with Slack, Aloware, and Monday.com.",
        "background_color": "#0977e6",
        "long_description": "PT Biz SMS Insights is a real time SMS analytics dashboard built for high performance coaching and sales teams. Integrated directly with Slack, Aloware, and Monday.com, it centralizes campaign performance, conversation tracking, and revenue attribution into a single operational view."
    },
    "features": {
        "app_home": {
            "home_tab_enabled": True,
            "messages_tab_enabled": False,
            "messages_tab_read_only_enabled": True
        },
        "bot_user": {
            "display_name": "Aloware SMS Insights",
            "always_online": True
        },
        "slash_commands": [
            {
                "command": "/ask",
                "description": "Ask the SMS Insights bot a question or request an analytics query",
                "usage_hint": "[your question or analytics query]",
                "should_escape": False
            },
            {
                "command": "/sms-report",
                "description": "Generate a rich daily SMS performance report with interactive buttons",
                "usage_hint": "[today | yesterday | YYYY-MM-DD | MM/DD]",
                "should_escape": False
            },
            {
                "command": "/sms-scoreboard",
                "description": "Post the weekly setter scoreboard - bookings, sequences, reply rates and compliance",
                "usage_hint": "[optional: week]",
                "should_escape": False
            }
        ]
    },
    "oauth_config": {
        "redirect_urls": [
            "https://localhost:3000/api/oauth/callback",
            "https://sms-insights-production.up.railway.app/api/oauth/callback",
            "https://ptbizsms.com/api/oauth/callback"
        ],
        "scopes": {
            "bot": [
                "app_mentions:read",
                "canvases:read",
                "channels:history",
                "canvases:write",
                "chat:write",
                "commands",
                "files:read",
                "groups:history",
                "reactions:read",
                "assistant:write"
            ],
            "user": [
                "channels:history",
                "channels:read",
                "channels:write",
                "users:read",
                "users:write",
                "chat:write",
                "search:read.public",
                "search:read.private",
                "search:read.mpim",
                "search:read.im",
                "search:read.files",
                "search:read.users",
                "groups:history",
                "mpim:history",
                "im:history",
                "canvases:read",
                "canvases:write",
                "users:read.email"
            ]
        }
    },
    "settings": {
        "socket_mode_enabled": True,
        "org_deploy_enabled": True,
        "interactivity": {"is_enabled": True},
        "event_subscriptions": {
            "bot_events": [
                "app_home_opened",
                "app_mention",
                "message.channels",
                "message.groups",
                "reaction_added",
                "reaction_removed"
            ]
        },
        "token_rotation_enabled": False
    }
}

body = json.dumps({
    'app_id': 'A0AFCE7ENE5',
    'manifest': json.dumps(manifest)
}).encode('utf-8')

req = urllib.request.Request(
    'https://slack.com/api/apps.manifest.update',
    data=body,
    headers={
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Bearer ' + token
    },
    method='POST'
)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())

if data.get('ok'):
    print('SUCCESS - Slash commands registered: /ask, /sms-report, /sms-scoreboard')
else:
    print('FAILED:', data.get('error'))
    for e in data.get('errors', []):
        print(' -', e.get('pointer'), ':', e.get('message'), '(', e.get('code'), ')')
    print('Full response:', json.dumps(data, indent=2))
