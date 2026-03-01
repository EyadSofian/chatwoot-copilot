# Engosoft AI Copilot

AI-powered Dashboard App for Chatwoot - helps agents learn and use Chatwoot effectively.

## Setup on Coolify

1. Push this repo to GitHub
2. In Coolify: Add Resource → Public Repository
3. Set repository URL and branch: `main`
4. Set Port: `3002`

## Environment Variables

```
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-mini
PORT=3002
```

## Add to Chatwoot

1. Go to Chatwoot → Settings → Integrations → Dashboard Apps
2. Click "Configure" → Add new app
3. Name: `AI Copilot`
4. URL: `https://copilot.engosoft.com` (or your deployed URL)
5. Save

## Endpoints

- `GET /` - Chat UI (Frontend)
- `POST /api/chat` - AI Chat API
- `GET /api/health` - Health check
