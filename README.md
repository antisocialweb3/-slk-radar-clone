# SLK Radar — XAUUSD Key-Level Scanner

A mobile-friendly independent SLK Radar-inspired prototype hosted with GitHub Pages.

## Current features
- Twelve Data connection for XAU/USD historical OHLC candles (API key required).
- Selectable Daily, 4-hour, 1-hour, and 15-minute intervals (provider plan and symbol access apply).
- Close-price history chart with detected candidate-level midlines.
- Provisional A-shape, V-shape, and Open-Close body-zone detection.
- Candle-pivot mode and close/line-pivot mode.
- Key is held in browser session storage and is not committed to this repository.

## Set up live candles
1. Create an account and obtain an API key from [Twelve Data](https://twelvedata.com/).
2. Open the deployed site and paste the key into the API key field.
3. Select a timeframe and press **Load XAU/USD**.
4. If the request fails, check the provider's API limits, symbol availability, CORS/access restrictions, and whether the plan supports the chosen interval.

The page fetches OHLC candles from Twelve Data. It refreshes on request; it is not a tick-by-tick streaming quote. The latest displayed price is the latest returned candle's close and may be delayed.

## Detection rules: provisional, not a finished trading strategy
- **A-shape:** local peak using a 3-candle comparison on either side. The candidate zone is the pivot candle's open-close body, excluding wick extremes.
- **V-shape:** local trough using a 3-candle comparison on either side. The candidate zone is the pivot candle's open-close body, excluding wick extremes.
- **Open-Close:** a candle body at least 1.8 times the median body size of the previous 10 candles becomes a candidate zone.
- **Line representation:** pivots are selected using closes rather than candle highs/lows, while the candidate zone remains the pivot candle's body.

These are explicit first-pass heuristics to make the feature usable and testable. They may not exactly represent the user's complete SLK definitions. Validate against the user's chart examples before using them for decisions. No buy/sell signals, entry triggers, stop losses, or targets are produced.

## Security note
The API key is stored only in this browser's session storage and is not included in the source code or GitHub commits. Browser-side API keys can still be seen by someone with access to browser developer tools and requests. Do not use a sensitive account credential. For a production-grade app, route requests through a secure server-side function and keep provider credentials in server-side secrets.

## Disclaimer
For educational/research use only. Candidate levels are not guaranteed rejection zones or financial advice. Verify data quality, provider delays, and the detection logic independently.
