const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATA_KEY = process.env.TWELVE_DATA_API_KEY;
const DEFAULT_SYMBOL = process.env.SYMBOL || "XAU/USD";
const SYMBOLS = {
  "XAU/USD": "XAU/USD", "EUR/USD": "EUR/USD", "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY", "BTC/USD": "BTC/USD", "SOL/USD": "SOL/USD",
  "AUD/USD": "AUD/USD", "USD/CAD": "USD/CAD", "ETH/USD": "ETH/USD",
  // Confirm this provider-specific ticker in your Twelve Data account before relying on NAS100.
  "NAS100": process.env.NAS100_PROVIDER_SYMBOL || "NDX"
};
const aliases = { "XAUUSD": "XAU/USD", "EURUSD": "EUR/USD", "GBPUSD": "GBP/USD", "USDJPY": "USD/JPY", "BTCUSD": "BTC/USD", "SOLUSD": "SOL/USD", "AUDUSD": "AUD/USD", "USDCAD": "USD/CAD", "ETHUSD": "ETH/USD", "NASDAQ100": "NAS100", "US100": "NAS100", "NDX": "NAS100" };
const watchlists = new Map();
const scanCache = new Map();
const alertedKeys = new Map();
const INTERVAL = process.env.INTERVAL || "4h";
const OUTPUT_SIZE = Math.min(500, Math.max(50, Number(process.env.OUTPUT_SIZE || 200)));

if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function loadCandles(symbol) {
  if (!DATA_KEY) throw new Error("The bot owner has not configured TWELVE_DATA_API_KEY yet.");
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", SYMBOLS[symbol] || symbol);
  url.searchParams.set("interval", INTERVAL);
  url.searchParams.set("outputsize", String(OUTPUT_SIZE));
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", DATA_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || payload.status === "error" || !Array.isArray(payload.values)) {
    throw new Error(payload.message || payload.msg || `Market-data request failed (HTTP ${response.status}).`);
  }
  const candles = payload.values.map((v) => ({
    datetime: v.datetime,
    open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close)
  })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  if (candles.length < 10) throw new Error("The data provider returned too few usable candles.");
  return candles;
}

// Provisional heuristics matching the current website prototype; not a validated SLK signal engine.
function detectLevels(data, mode = "candle") {
  const out = [];
  const val = (c, k) => mode === "line" ? c.close : c[k];
  for (let i = 3; i < data.length - 3; i++) {
    const c = data[i], left = data.slice(i - 3, i), right = data.slice(i + 1, i + 4);
    const peak = left.every(x => val(c, "high") > val(x, "high")) && right.every(x => val(c, "high") >= val(x, "high"));
    const trough = left.every(x => val(c, "low") < val(x, "low")) && right.every(x => val(c, "low") <= val(x, "low"));
    const low = Math.min(c.open, c.close), high = Math.max(c.open, c.close);
    if (peak) out.push({ type: "A-shape", low, high, date: c.datetime, index: i, context: "Local peak candidate" });
    if (trough) out.push({ type: "V-shape", low, high, date: c.datetime, index: i, context: "Local trough candidate" });
  }
  for (let i = 10; i < data.length; i++) {
    const c = data[i], body = Math.abs(c.close - c.open);
    const recent = data.slice(i - 10, i).map(x => Math.abs(x.close - x.open)).sort((a, b) => a - b);
    const median = recent[Math.floor(recent.length / 2)] || 0;
    if (median > 0 && body >= median * 1.8) out.push({
      type: "Open-Close", low: Math.min(c.open, c.close), high: Math.max(c.open, c.close),
      date: c.datetime, index: i, context: "Large body candidate"
    });
  }
  const dedup = new Map();
  for (const item of out) dedup.set(item.type + "-" + item.index, item);
  return [...dedup.values()].sort((a, b) => b.index - a.index).slice(0, 100);
}

function detectFvgs(data, levels) {
  const found = [];
  for (let i = 2; i < data.length; i++) {
    const first = data[i - 2], third = data[i];
    let direction, low, high;
    if (first.high < third.low) { direction = "Bullish"; low = first.high; high = third.low; }
    else if (first.low > third.high) { direction = "Bearish"; low = third.high; high = first.low; }
    else continue;
    const overlaps = levels.filter(l => l.high >= low && l.low <= high);
    found.push({ direction, low, high, date: third.datetime, index: i, overlaps });
  }
  return found.sort((a, b) => b.index - a.index).slice(0, 100);
}

async function getScan(symbol = DEFAULT_SYMBOL) {
  const cacheKey = symbol + "|" + INTERVAL;
  const cached = scanCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 60_000) return cached.data;
  const candles = await loadCandles(symbol);
  const levels = detectLevels(candles);
  const fvgs = detectFvgs(candles, levels);
  const data = { symbol, candles, levels, fvgs, price: candles[candles.length - 1].close, date: candles[candles.length - 1].datetime };
  scanCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function intro() {
  return [
    "<b>SLK Radar · Telegram</b>",
    "Multi-market scanner companion",
    "",
    "<b>Supported:</b> " + Object.keys(SYMBOLS).join(", "),
    "",
    "/scan [symbol] — scan one market (default XAU/USD)",
    "/levels [symbol] — candidate key levels",
    "/fvg [symbol] — FVGs and candidate-level overlaps",
    "/alert [symbol] — toggle provisional overlap alerts",
    "/alerts — show alert subscriptions",
    "/help — show commands",
    "",
    "<i>Candidate detections are provisional, not trade signals.</i>"
  ].join("\n");
}

bot.onText(/^\/(start|help)(?:@\w+)?$/, async (msg) => {
  bot.sendMessage(msg.chat.id, intro(), { parse_mode: "HTML" }).catch(console.error);
});

bot.onText(/^\/scan(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const symbol = normalizeSymbol(match && match[1]);
  if (!symbol) return bot.sendMessage(chatId, "Unknown symbol. Use /help to see supported markets.");
  const waiting = await bot.sendMessage(chatId, "Scanning " + symbol + "…");
  try {
    const s = await getScan(symbol);
    const nearby = [...s.levels].sort((a, b) => Math.abs((a.low + a.high) / 2 - s.price) - Math.abs((b.low + b.high) / 2 - s.price))[0];
    const overlaps = s.fvgs.filter(g => g.overlaps.length).length;
    const text = [
      "<b>SLK Radar · Scan</b>",
      `Symbol: ${esc(symbol)} · Provider ticker: ${esc(SYMBOLS[symbol])} · Timeframe: ${esc(INTERVAL)}`,
      `Latest candle close: <b>${fmt(s.price)}</b>`,
      `Candle: ${esc(s.date)}`,
      `Candles scanned: ${s.candles.length}`,
      `Key-level candidates: ${s.levels.length}`,
      `FVGs detected: ${s.fvgs.length}`,
      `FVGs overlapping candidate levels: ${overlaps}`,
      nearby ? `Nearest candidate: ${esc(nearby.type)} ${fmt(nearby.low)}–${fmt(nearby.high)}` : "Nearest candidate: none",
      "",
      "<i>Overlap alone is not a confirmed SLK setup. Liquidity, reaction and external body-close break are not fully validated by this bot yet.</i>"
    ].join("\n");
    await bot.editMessageText(text, { chat_id: chatId, message_id: waiting.message_id, parse_mode: "HTML" });
  } catch (e) {
    await bot.editMessageText("Scan failed: " + esc(e.message), { chat_id: chatId, message_id: waiting.message_id, parse_mode: "HTML" }).catch(() => {});
  }
});

bot.onText(/^\/levels(?:@\w+)?$/, async (msg) => {
  try {
    const s = await getScan();
    const chosen = s.levels.slice(0, 12);
    if (!chosen.length) return bot.sendMessage(msg.chat.id, "No candidate levels detected in this scan.");
    const lines = chosen.map((l, i) => `${i + 1}. <b>${esc(l.type)}</b> · ${fmt(l.low)}–${fmt(l.high)}\n   ${esc(l.date)} · ${esc(l.context)}`);
    await bot.sendMessage(msg.chat.id, [`<b>Latest key-level candidates · ${esc(symbol)}</b>`, ...lines, "", "<i>Provisional heuristic detection; compare with your manual chart markings.</i>"].join("\n"), { parse_mode: "HTML" });
  } catch (e) {
    await bot.sendMessage(msg.chat.id, "Could not load levels: " + esc(e.message), { parse_mode: "HTML" });
  }
});

bot.onText(/^\/fvg(?:@\w+)?$/, async (msg) => {
  try {
    const s = await getScan();
    const chosen = s.fvgs.slice(0, 10);
    if (!chosen.length) return bot.sendMessage(msg.chat.id, "No three-candle FVGs detected in this scan.");
    const lines = chosen.map((g, i) => {
      const overlap = g.overlaps.length ? g.overlaps.map(l => l.type).join(", ") : "No candidate overlap";
      return `${i + 1}. <b>${g.direction}</b> · ${fmt(g.low)}–${fmt(g.high)}\n   ${esc(g.date)} · Overlap: ${esc(overlap)}`;
    });
    await bot.sendMessage(msg.chat.id, [`<b>Recent FVG candidates · ${esc(symbol)}</b>`, ...lines, "", "<i>This is geometry/overlap only. Reaction-based fill, liquidity and external-break confirmation are not yet automatically validated.</i>"].join("\n"), { parse_mode: "HTML" });
  } catch (e) {
    await bot.sendMessage(msg.chat.id, "Could not load FVGs: " + esc(e.message), { parse_mode: "HTML" });
  }
});


bot.onText(/^\\/alert(?:@\\w+)?(?:\\s+([^\\s]+))?$/, async (msg, match) => {
  const symbol = normalizeSymbol(match && match[1]);
  if (!symbol) return bot.sendMessage(msg.chat.id, "Unknown symbol. Use /help to see supported markets.");
  const chatId = msg.chat.id;
  if (!watchlists.has(chatId)) watchlists.set(chatId, new Set());
  const list = watchlists.get(chatId);
  if (list.has(symbol)) { list.delete(symbol); return bot.sendMessage(chatId, "Alerts disabled for " + symbol + "."); }
  list.add(symbol);
  return bot.sendMessage(chatId, "Alerts enabled for " + symbol + ". I will check for newly formed FVGs overlapping candidate key levels. These are provisional alerts, not confirmed SLK setups.");
});

bot.onText(/^\\/alerts(?:@\\w+)?$/, async (msg) => {
  const list = [...(watchlists.get(msg.chat.id) || [])];
  await bot.sendMessage(msg.chat.id, list.length ? "Alert subscriptions: " + list.join(", ") : "No alerts enabled. Use /alert XAU/USD (or another supported symbol).");
});

setInterval(async () => {
  for (const [chatId, symbols] of watchlists.entries()) {
    for (const symbol of symbols) {
      try {
        const s = await getScan(symbol);
        const latest = s.fvgs.find(g => g.overlaps.length);
        if (!latest) continue;
        const key = symbol + "|" + latest.date + "|" + latest.direction + "|" + latest.low + "|" + latest.high;
        if (alertedKeys.get(chatId + "|" + symbol) === key) continue;
        alertedKeys.set(chatId + "|" + symbol, key);
        await bot.sendMessage(chatId, [
          "<b>SLK Radar · Provisional overlap alert</b>",
          "Market: " + esc(symbol),
          "FVG: " + esc(latest.direction) + " · " + fmt(latest.low) + "–" + fmt(latest.high),
          "Formation candle: " + esc(latest.date),
          "Overlapping candidates: " + esc(latest.overlaps.map(l => l.type).join(", ")),
          "",
          "<i>This is an overlap alert only. Nearby liquidity, key-level reaction, and external body-close break are not confirmed.</i>"
        ].join("\\n"), { parse_mode: "HTML" });
      } catch (e) {
        console.error("Alert scan failed for " + symbol + ":", e.message);
      }
    }
  }
}, 5 * 60 * 1000);
\nbot.on("polling_error", (error) => console.error("Telegram polling error:", error.message));
console.log("SLK Radar Telegram bot started. Polling for Telegram updates.");
