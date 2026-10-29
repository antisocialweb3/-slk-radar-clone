# SLK Radar Telegram Bot

A Node.js Telegram companion for multi-market SLK Radar scans.

## Supported command symbols

- Forex: `XAU/USD`, `EUR/USD`, `GBP/USD`, `USD/JPY`, `AUD/USD`, `USD/CAD`
- Crypto: `BTC/USD`, `ETH/USD`, `SOL/USD`
- Index: `NAS100` (provider ticker is configurable; default `NDX`, must be verified with your data provider/account)

## Commands

- `/start` or `/help` — show commands and markets
- `/scan [symbol]` — latest close and scan summary; no symbol defaults to XAU/USD
- `/levels [symbol]` — latest candidate key levels
- `/fvg [symbol]` — recent FVGs and candidate-level overlaps
- `/alert [symbol]` — toggle provisional overlap alerts for that market
- `/alerts` — list this chat's alert subscriptions

Examples: `/scan BTC/USD`, `/levels EUR/USD`, `/fvg NAS100`, `/alert XAU/USD`.

## Run locally

Requires Node.js 20+.

```bash
cd telegram-bot
npm install
TELEGRAM_BOT_TOKEN="your-bot-token" TWELVE_DATA_API_KEY="your-data-key" npm start
```

Set secrets in your shell or hosting provider. Never commit real tokens or API keys.

## Deploy as a background worker

1. Create a bot with Telegram's official **@BotFather** and copy the bot token.
2. Create a Background Worker on Render from this repository.
3. Set root directory to `telegram-bot`, build command to `npm install`, start command to `npm start`.
4. Add environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TWELVE_DATA_API_KEY`
   - Optional: `INTERVAL=4h`, `OUTPUT_SIZE=200`, `NAS100_PROVIDER_SYMBOL=NDX`
5. Deploy, then send `/start` to the bot in Telegram.

The bot uses Telegram long polling, so it needs a continuously running background worker rather than a static site.

## Data-provider notes

Twelve Data's time-series API charges credits per symbol, and actual availability depends on the instrument and your plan. The bot caches each symbol/timeframe for 60 seconds to reduce duplicate requests. Verify the provider ticker and data access for NAS100/NDX in your account before using it. See [Twelve Data API documentation](https://twelvedata.com/docs) and [symbol lookup guide](https://support.twelvedata.com/en/articles/5620513-how-to-find-all-available-symbols-at-twelve-data).

## Current limitations

Key-level detections are provisional heuristics, not the fully taught SLK method. Alerts currently notify when a recent three-candle FVG overlaps a detected candidate key level. They do **not** validate nearby liquidity, reaction from the overlapping key level, or an external break confirmed by candle-body close. Alerts are not trade signals. Alert subscriptions are stored in process memory and will reset when the worker restarts; persistence is a planned upgrade.
