#!/usr/bin/env node
// sc4sap HUD statusline — runs per statusLine refresh (~300ms cadence).
// Protocol: Claude Code pipes a JSON payload on stdin and reads stdout as the line to render.
// Payload (partial): { session_id, transcript_path, cwd, model:{id,display_name}, workspace:{current_dir,project_dir}, version }

import { join } from 'path';
import { priceFor, costOf } from './lib/pricing.mjs';
import { latestUsage, contextSize, collectBlockUsage, collectWeeklyUsage, activityState, mcpConnectionState } from './lib/transcript.mjs';
import { readConfig, sapEnvPresent, mcpInstalled, systemInfo, activeTransport, activeProfile } from './lib/sc4sap-status.mjs';
import { color, paint, humanTokens, humanUsd, humanDuration, pctColor } from './lib/format.mjs';
import { readCache, writeCache, hudCacheDir } from './lib/cache.mjs';
import { getUsage } from './lib/usage-api.mjs';
import { probeMcpState } from './lib/mcp-probe.mjs';

// Fallback USD limits when the OAuth usage API is unreachable (no token, offline,
// API KO, etc.). When the API works, these are ignored — we just render the real
// utilization percentages Anthropic reports.
const FIVEH_LIMIT_USD  = Number(process.env.SC4SAP_5H_LIMIT_USD        || 0);
const WEEKLY_LIMIT_USD = Number(process.env.SC4SAP_WEEKLY_LIMIT_USD    || 0);
const WEEKLY_EXTRA_USD = Number(process.env.SC4SAP_WEEKLY_EXTRA_LIMIT_USD || 0);

async function readStdinJson(maxMs = 300) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve({});
    let buf = '';
    const t = setTimeout(() => resolve(tryParse(buf)), maxMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => { clearTimeout(t); resolve(tryParse(buf)); });
    process.stdin.on('error', () => { clearTimeout(t); resolve({}); });
  });
}

function tryParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

function segment(label, value, labelColor = color.gray) {
  if (!value) return '';
  return paint(label, labelColor, color.dim) + ' ' + value;
}

// Locale detection for the context-capacity warning line.
// Priority:
//   1. SC4SAP_HUD_LANG       — explicit override (e.g. `ko`, `ja`, `en`)
//   2. OS locale env vars     — LC_ALL / LANG / LANGUAGE
//   3. Intl.DateTimeFormat    — Node.js-resolved system locale
//   4. 'en' fallback
function detectHudLang() {
  const explicit = (process.env.SC4SAP_HUD_LANG || '').trim().toLowerCase();
  if (explicit) return explicit.slice(0, 2);
  const sysEnv = process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || '';
  if (sysEnv) {
    const s = sysEnv.toLowerCase();
    if (s.startsWith('ko')) return 'ko';
    if (s.startsWith('ja')) return 'ja';
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('de')) return 'de';
  }
  try {
    const loc = (Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
    if (loc.startsWith('ko')) return 'ko';
    if (loc.startsWith('ja')) return 'ja';
    if (loc.startsWith('zh')) return 'zh';
    if (loc.startsWith('de')) return 'de';
  } catch { /* ignore */ }
  return 'en';
}

// Context-capacity warning shown as a third HUD line when ctx usage reaches 70%+.
// Two variants, keyed on the same threshold pctColor uses for color (90%):
//   • 70–89% (yellow / "approaching"): "about to full" — soft heads-up
//   • 90%+   (red / "full"):           "is full" — actionable alert
// Localized by OS/explicit locale; color follows pctColor.
const CTX_WARN_THRESHOLD = 70;
const CTX_WARN_FULL_THRESHOLD = 90;
const CTX_WARN_MESSAGES_APPROACHING = {
  en: 'your context capacity is about to full, consider /compact',
  ko: '컨텍스트 한도에 곧 도달합니다 — /compact 를 고려하세요',
  ja: 'コンテキスト容量がまもなく満杯になります — /compact の実行を検討してください',
  zh: '上下文容量即将满 — 请考虑 /compact',
  de: 'Kontext ist fast voll — /compact in Erwägung ziehen',
};
const CTX_WARN_MESSAGES_FULL = {
  en: 'your context capacity is full, consider /compact',
  ko: '컨텍스트 한도에 도달했습니다 — /compact 를 고려하세요',
  ja: 'コンテキスト容量が満杯です — /compact の実行を検討してください',
  zh: '上下文容量已满 — 请考虑 /compact',
  de: 'Kontext ist voll — /compact in Erwägung ziehen',
};
function ctxWarningLine(ctxPct) {
  if (ctxPct < CTX_WARN_THRESHOLD) return '';
  const lang = detectHudLang();
  const dict = ctxPct >= CTX_WARN_FULL_THRESHOLD
    ? CTX_WARN_MESSAGES_FULL
    : CTX_WARN_MESSAGES_APPROACHING;
  const msg = dict[lang] || dict.en;
  return paint('⚠ ' + msg, pctColor(ctxPct));
}

async function main() {
  const input = await readStdinJson();
  try {
    const ws = input.workspace?.current_dir || input.cwd || process.cwd();
    const transcript = input.transcript_path;
    const modelId = input.model?.id || '';
    const modelName = input.model?.display_name || modelId || 'model';

    const price = priceFor(modelId);
    const cfg = readConfig(ws);

    // Try the real Anthropic OAuth usage API first. Cached 60s on success / 15s on error.
    // On API error (e.g. 429) we preserve the previously fetched `data`; keep using it
    // instead of falling back to the rough transcript-based estimate, which tends to
    // over-report (often hitting 100% on long sessions).
    const usage = await getUsage(ws);
    const hasData = !!usage?.data && (usage.data.fiveHour != null || usage.data.sevenDay != null);
    const apiOk = hasData;
    const apiStale = hasData && !usage?.ok; // real numbers, but last fetch failed

    // Context %
    const last = transcript ? latestUsage(transcript) : null;
    const ctxUsed = contextSize(last?.usage);
    const ctxWindow = price.ctx;
    const ctxPct = ctxWindow ? Math.min(100, (ctxUsed / ctxWindow) * 100) : 0;
    const ctxStr = `${humanTokens(ctxUsed)}/${humanTokens(ctxWindow)} ${paint(ctxPct.toFixed(0) + '%', pctColor(ctxPct))}`;

    // 5h & 7d usage — prefer the real Anthropic OAuth API. Fall back to
    // transcript-derived dollar estimates (with optional env-configured limits)
    // when the API is unavailable.
    let costStr = paint('—', color.dim);
    let blockStr = paint('—', color.dim);
    let weekStr = paint('—', color.dim);
    let extraStr = '';

    if (apiOk) {
      const d = usage.data;
      // When the latest fetch failed but cached data is reused, tag values with a
      // trailing `~` so the user can tell the reading may be stale.
      const staleTag = apiStale ? '~' : '';
      if (d.fiveHour != null) {
        const p = Math.min(100, d.fiveHour);
        costStr = paint(p.toFixed(0) + '%' + staleTag, pctColor(p));
      }
      if (d.fiveHourResetsAt) {
        const remain = Math.max(0, new Date(d.fiveHourResetsAt).getTime() - Date.now());
        const rc = remain < 30 * 60 * 1000 ? color.red : remain < 60 * 60 * 1000 ? color.yellow : color.cyan;
        blockStr = paint(humanDuration(remain), rc);
      }
      if (d.sevenDay != null) {
        const base = Math.min(100, d.sevenDay);
        weekStr = paint(base.toFixed(0) + '%' + staleTag, pctColor(base));
        // Anthropic's `seven_day.utilization` caps at 100 (or reports >100 on overage).
        if (d.sevenDay > 100) {
          const over = d.sevenDay - 100;
          extraStr = paint('+' + over.toFixed(0) + '% extra', pctColor(Math.min(100, over)));
        }
      }
    } else if (transcript) {
      // Fallback: transcript-based cost estimate
      const { costUsd, oldestMs } = collectBlockUsage(transcript, priceFor, costOf);
      if (FIVEH_LIMIT_USD > 0) {
        const pct = Math.min(100, (costUsd / FIVEH_LIMIT_USD) * 100);
        costStr = paint(pct.toFixed(0) + '%', pctColor(pct));
      } else {
        costStr = paint(humanUsd(costUsd), color.green);
      }
      const elapsed = Date.now() - oldestMs;
      const remain = Math.max(0, 5 * 60 * 60 * 1000 - elapsed);
      const rc = remain < 30 * 60 * 1000 ? color.red : remain < 60 * 60 * 1000 ? color.yellow : color.cyan;
      blockStr = paint(humanDuration(remain), rc);

      const wcp = join(hudCacheDir(), '.hud-week.json');
      let weekly = readCache(wcp, 60_000);
      if (!weekly) {
        const r = collectWeeklyUsage(transcript, priceFor, costOf);
        weekly = { costUsd: r.costUsd };
        writeCache(wcp, weekly);
      }
      const w = weekly.costUsd;
      if (WEEKLY_LIMIT_USD > 0) {
        const base = Math.min(100, (w / WEEKLY_LIMIT_USD) * 100);
        weekStr = paint(base.toFixed(0) + '%', pctColor(base));
        if (w > WEEKLY_LIMIT_USD) {
          const over = w - WEEKLY_LIMIT_USD;
          if (WEEKLY_EXTRA_USD > 0) {
            const ePct = Math.min(100, (over / WEEKLY_EXTRA_USD) * 100);
            extraStr = paint('+' + ePct.toFixed(0) + '% extra', pctColor(ePct));
          } else {
            extraStr = paint('+' + humanUsd(over) + ' extra', color.red);
          }
        }
      } else {
        weekStr = paint(humanUsd(w), color.green);
      }
    }

    // Health dots — MCP reflects runtime connection. Active process probe is the
    // primary signal (cached 30s so we don't shell out per refresh); a recent
    // tool_error in the transcript (<2m) still forces red even if the process
    // is alive, because a live server that's returning errors is not "ok".
    //   green  = mcp-server process alive and no recent tool errors
    //   red    = process missing, OR recent transcript error, OR launcher not installed
    //   yellow = probe indeterminate (no PowerShell / pgrep)
    const probe = probeMcpState(ws);
    const transcriptState = transcript ? mcpConnectionState(transcript, 'mcp__plugin_sc4sap_sap__', 2 * 60 * 1000) : 'unknown';
    let mcp;
    if (transcriptState === 'error')      mcp = paint('●', color.red);
    else if (probe === 'ok')              mcp = paint('●', color.green);
    else if (probe === 'error')           mcp = paint('●', color.red);
    else                                  mcp = mcpInstalled() ? paint('●', color.yellow) : paint('●', color.red);
    const env = sapEnvPresent(ws)   ? paint('●', color.green) : paint('●', color.red);

    // Agent activity — does the transcript suggest an in-flight turn, and if
    // so, which tool / subagent is running?
    const act = activityState(transcript);
    let actStr;
    if (act.working) {
      const stripNs = (s) => String(s).replace(/^[a-z0-9_-]+:/i, '');
      const trim = (s, n = 24) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
      const labels = (act.pending || []).map((b) => {
        if (b.name === 'Task' || b.name === 'Agent') {
          return b.subagent ? trim(stripNs(b.subagent)) : 'agent';
        }
        return b.name;
      });
      const uniq = [...new Set(labels)];
      const label = uniq.length === 0 ? 'working'
                  : uniq.length <= 2  ? uniq.join('+')
                                      : `${uniq[0]}+${uniq.length - 1}`;
      actStr = paint('⚡ ' + label, color.yellow);
    } else {
      actStr = paint('✓ idle', color.dim);
    }

    // Assemble — compact one-liner
    const sep = paint(' │ ', color.gray);
    const parts = [
      paint('sc4sap', color.bold, color.cyan),
      `MCP${mcp} ENV${env}`,
      actStr,
      segment('ctx', ctxStr),
      segment('5h', costStr),
      segment('7d', weekStr),
      extraStr,
      segment('⏳', blockStr),
      paint(modelName, color.dim),
    ].filter(Boolean);

    // Line 2 — compact SAP system info (profile · tier · SID · client · user · CTS).
    const ap = activeProfile(ws);
    const si = systemInfo(ws);
    const at = activeTransport(ws);
    let line2 = '';
    if (ap || si || at) {
      const bits = [];
      if (ap?.alias) {
        const lock = ap.readonly ? ' 🔒' : '';
        bits.push(
          paint(ap.alias, color.cyan) + ' ' + paint(`[${ap.tier}]${lock}`, color.gray, color.dim),
        );
      } else if (ap && ap.legacy && ap.readonly) {
        bits.push(paint(`(legacy) [${ap.tier}] 🔒`, color.gray, color.dim));
      }
      if (si?.sid)    bits.push(paint('SID',    color.gray, color.dim) + ' ' + paint(si.sid, color.magenta));
      if (si?.client) bits.push(paint('client', color.gray, color.dim) + ' ' + paint(si.client, color.cyan));
      if (si?.user)   bits.push(paint('user',   color.gray, color.dim) + ' ' + paint(si.user, color.cyan));
      if (at?.trkorr) bits.push(paint('CTS',    color.gray, color.dim) + ' ' + paint(at.trkorr, color.yellow));
      if (bits.length > 0) line2 = bits.join(sep);
    } else {
      line2 = paint('SAP not configured — run /sc4sap:setup', color.gray, color.dim);
    }

    const ctxWarn = ctxWarningLine(ctxPct);
    const out = parts.join(sep) + '\n' + line2 + (ctxWarn ? '\n' + ctxWarn : '');
    process.stdout.write(out);
  } catch {
    process.stdout.write(paint('sc4sap', color.cyan) + ' ' + paint('hud error', color.red));
  }
}

main();
