# SLK Radar Telegram Bot

A Node.js Telegram companion for the SLK Radar XAU/USD scanner.

## Commands

- `/start` or `/help` — show available commands
- `/scan` — latest candle close and scan summary
- `/levels` — latest A-shape, V-shape and Open-Close candidate zones
- `/fvg` — recent three-candle FVGs and candidate-level overlaps

## Run locally

Requires Node.js 20+.

```bash
cd telegram-bot
npm install
TELEGRAM_BOT_TOKEN="your-bot-token" TWELVE_DATA_API_KEY="your-data-key" npm start
```

Set environment variables in your shell or hosting provider. Never commit real tokens or API keys.

## Deploy as a background worker

1. Create a bot with Telegram's official **@BotFather** and copy the bot token.
2. Create a new Background Worker on Render from this repository.
3. Set the root directory to `telegram-bot`.
4. Set build command to `npm install`.
5. Set start command to `npm start`.
6. Add environment variables:
   - `TELEGRAM_BOT_TOKEN` — token from BotFather
   - `TWELVE_DATA_API_KEY` — Twelve Data API key
   - Optional: `SYMBOL=XAU/USD`, `INTERVAL=4h`, `OUTPUT_SIZE=200`
7. Deploy, then open the bot in Telegram and send `/start`.

The bot uses Telegram long polling, so deploy it as a continuously running worker rather than a static site.

## Current limitations

This first bot version reuses the website's provisional candidate heuristics. It detects classic three-candle FVG geometry and reports overlaps, but it does not yet validate the complete SLK sequence of nearby liquidity, reaction from the overlapping key level, and an external high/low break confirmed by candle-body close. Do not treat these messages as trade signals.
