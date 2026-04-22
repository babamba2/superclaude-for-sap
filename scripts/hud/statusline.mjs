#!/usr/bin/env node
// sc4sap HUD statusline — runs per statusLine refresh (~300ms cadence).
// Protocol: Claude Code pipes a JSON payload on stdin and reads stdout as the line to render.
// Payload (partial): { session_id, transcript_path, cwd, model:{id,display_name}, workspace:{current_dir,project_dir}, version }

import { join } from 'path';
import { priceFor, costOf } from './lib/pricing.mjs';
import { latestUsage, contextSize, collectBlockUsage, collectWeeklyUsage, activityState, mcpConnectionState } from './lib/transcript.mjs';
import { readConfig, sapEnvPresent, mcpInstalled, systemInfo, activeTransport, activeProfile } from './lib/sc4sap-status.mjs';
import { color, paint, humanTokens, humanUsd, humanDuration, pctColor } from './lib/format.mjs';
import { readCache, writeCache } from './lib/cache.mjs';
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

      const wcp = join(ws, '.sc4sap', '.hud-week.json');
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

    process.stdout.write(parts.join(sep) + '\n' + line2);
  } catch {
    process.stdout.write(paint('sc4sap', color.cyan) + ' ' + paint('hud error', color.red));
  }
}

main();
