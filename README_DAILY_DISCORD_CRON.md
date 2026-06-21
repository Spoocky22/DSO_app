# Daily Discord summary from Vercel

This version adds a Vercel Cron route:

```text
/api/cron/daily-discord-summary
```

It runs once per day through `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-discord-summary",
      "schedule": "0 10 * * *"
    }
  ]
}
```

Vercel cron times are UTC. `0 10 * * *` is around 12:00 in Belgium/France during summer time, and around 11:00 during winter time.

## Required Vercel environment variables

Add these in Vercel → Project → Settings → Environment Variables:

```env
CRON_SECRET=long_random_secret
DISCORD_DAILY_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_DAILY_USERNAME=DSO Daily Stats
```

`DISCORD_DAILY_USERNAME` is optional. If omitted, the route uses `DSO Daily Stats`.

The route posts only if at least one NINA raw exposure was imported in the last 24 hours. It reports:

- NINA exposure added in the last 24 hours
- global NINA raw exposure total
- totals per filter with the 24h delta
- top target/panel/filter changes over the last 24 hours

## Manual test

After deployment, you can test with PowerShell:

```powershell
$secret = "your_CRON_SECRET"
Invoke-RestMethod `
  -Method Get `
  -Uri "https://YOUR-APP.vercel.app/api/cron/daily-discord-summary" `
  -Headers @{ Authorization = "Bearer $secret" }
```
