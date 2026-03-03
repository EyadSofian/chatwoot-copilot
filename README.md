# Engosoft AI Copilot v2

AI-powered Dashboard App for Chatwoot with full knowledge base.

## Knowledge Base
- `knowledge/chatwoot-guide.txt` - دليل Chatwoot والبوت (فهد)
- `knowledge/courses.md` - قاعدة بيانات الكورسات
- `knowledge/tracks.md` - المسارات الاحترافية
- `knowledge/grouping-rules.md` - قواعد تجميع الباقات

## Setup on Coolify
1. Push this repo to GitHub
2. In Coolify: Add Resource → Public Repository
3. Set Port: `3002`

## Environment Variables
```
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-mini
PORT=3002
```

## Add to Chatwoot
Settings → Integrations → Dashboard Apps → Add
- Name: `AI Copilot`
- URL: `https://copilot.engosoft.com`
