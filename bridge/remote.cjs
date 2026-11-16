/**
 * sc4sap MCP bridge — remote mode (a stdio ↔ HTTP pipe to an MCP relay).
 *
 * Used when SC4SAP_MCP_REMOTE_URL and SC4SAP_MCP_REMOTE_TOKEN are both set (mcp-server.cjs checks first): the
 * session holds no SAP secrets, a backend relay owns the real connection. Nothing is read from sap.env, profiles or
 * the project; no vendor build, no child process.
 *
 *   stdin  — newline-delimited JSON-RPC (the MCP stdio framing); one message or a batch array per line
 *   POST   — <URL>, Content-Type: application/json, Accept: application/json, Authorization: Bearer <token>,
 *            body = the message as received. The relay is a plain JSON-RPC-over-POST endpoint: one JSON reply per
 *            POST, no Server-Sent Events, no Mcp-Session-Id (not the MCP SDK Streamable HTTP transport); an
 *            event-stream reply is answered with an error.
 *   URL    — https to any host; plain http only to a private host: loopback (localhost, 127.x, ::1), a single-label
 *            name (a Docker service such as http://backend:3102), an RFC 1918 address (10.x, 172.16–31.x, 192.168.x)
 *            or an IPv6 ULA (fd00::/8). Anything else is refused: the bearer token never crosses a public network
 *            unencrypted. (The relay of the web backend is src/server/mcp-relay.ts: 200 JSON, 202, 401 / 403 { error }.)
 *   200    — the JSON-RPC response (or array), written to stdout as one line
 *   202/204 — nothing written (notifications)
 *   failure (network, timeout, non-2xx, a 200 that is not JSON) — each request id gets
 *            { jsonrpc: "2.0", id, error: { code: -32000, message: "SAP relay: …" } }; a notification gets nothing.
 *            401 / 403: "SAP relay refused this call (<relay error>)"; another status with a JSON body that names an
 *            error (JSON-RPC error.message or { error: "…" }): "SAP relay: HTTP <status> (<that message>)".
 *
 * Order: up to 4 requests in flight, sent in arrival order; a notification waits until everything before it has
 * finished and is finished before anything after it starts (initialize → initialized → tools/list stays in order).
 * Not carried: messages the server starts itself (progress / logging notifications, sampling, roots) — request /
 * response HTTP has no channel back. Timeout per POST: SC4SAP_MCP_REMOTE_TIMEOUT_MS (default 600000).
 * stderr: one line per failure; the token and message bodies are never written.
 */

'use strict';

const MAX_IN_FLIGHT = 4;
const ERR = -32000;

const hasId = (m) => m && typeof m === 'object' && !Array.isArray(m) && Object.prototype.hasOwnProperty.call(m, 'id') && m.id !== null && m.id !== undefined;
const idsOf = (msg) => (Array.isArray(msg) ? msg.filter(hasId).map((m) => m.id) : hasId(msg) ? [msg.id] : []);

/** A host plain http may reach: loopback, a single-label name (Docker service), RFC 1918, IPv6 loopback / ULA fd00::/8. */
function privateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '[::1]') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some((x) => Number(x) > 255)) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (h.startsWith('[')) return /^\[fd[0-9a-f]{2}:/.test(h);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(h); // one label, no dots: a service name on the local network
}

function run({ env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, exit = defaultExit } = {}) {
  const url = String(env.SC4SAP_MCP_REMOTE_URL || '');
  const token = String(env.SC4SAP_MCP_REMOTE_TOKEN || '');
  const timeoutMs = Number(env.SC4SAP_MCP_REMOTE_TIMEOUT_MS) > 0 ? Number(env.SC4SAP_MCP_REMOTE_TIMEOUT_MS) : 600000;
  const mask = (s) => (token.length >= 8 ? String(s).split(token).join('***') : String(s));
  const log = (s) => stderr.write(`[sc4sap remote] ${mask(s).replace(/[\r\n]+/g, ' ').slice(0, 400)}\n`);
  let target;
  try { target = new URL(url); } catch { target = null; }
  if (!target || !/^https?:$/.test(target.protocol)) { log('SC4SAP_MCP_REMOTE_URL must be an http(s) URL'); exit(1); return Promise.resolve(); }
  if (target.protocol === 'http:' && !privateHost(target.hostname)) {
    log('SC4SAP_MCP_REMOTE_URL must be https (plain http only to loopback, a single-label service name, RFC 1918 or fd00::/8)'); exit(1); return Promise.resolve();
  }

  const write = (obj) => stdout.write(`${JSON.stringify(obj)}\n`);
  const fail = (msg, message) => {
    const ids = idsOf(msg);
    if (!ids.length) return;
    const errs = ids.map((id) => ({ jsonrpc: '2.0', id, error: { code: ERR, message } }));
    write(Array.isArray(msg) ? errs : errs[0]);
  };

  async function post(msg) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(msg), signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      const reason = ac.signal.aborted ? `timeout after ${timeoutMs} ms` : (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || 'network error';
      log(`request failed: ${reason}`);
      return fail(msg, `SAP relay: ${reason}`);
    }
    let text = '';
    try { text = await res.text(); } catch (e) {
      clearTimeout(timer);
      const reason = ac.signal.aborted ? `timeout after ${timeoutMs} ms` : 'reply cut off';
      log(`reading the reply failed: ${reason}`);
      return fail(msg, `SAP relay: ${reason}`);
    } finally { clearTimeout(timer); }
    if (res.status === 202 || res.status === 204) return undefined;
    if (res.status === 401 || res.status === 403) {
      let why = '';
      try { const b = JSON.parse(text); why = typeof b?.error === 'string' ? b.error : b?.error?.message || ''; } catch { why = ''; }
      why = String(why || `HTTP ${res.status}`).slice(0, 300);
      log(`relay refused a call (HTTP ${res.status})`);
      return fail(msg, `SAP relay refused this call (${why})`);
    }
    if (res.status < 200 || res.status >= 300) {
      // a JSON body names the reason (JSON-RPC { error: { message } }, or { error: "…" }): the model sees it, stderr does not
      let why = '';
      try { const b = JSON.parse(text); const e = Array.isArray(b) ? b[0]?.error : b?.error; why = typeof e === 'string' ? e : typeof e?.message === 'string' ? e.message : ''; } catch { why = ''; }
      log(`relay answered HTTP ${res.status}`);
      return fail(msg, `SAP relay: HTTP ${res.status}${why ? ` (${why.replace(/[\r\n]+/g, ' ').slice(0, 300)})` : ''}`);
    }
    if (/text\/event-stream/i.test(res.headers.get('content-type') || '')) { log('relay answered with an event stream'); return fail(msg, 'SAP relay: streaming replies are not supported'); }
    if (!text.trim()) { if (idsOf(msg).length) { log('relay answered 200 without a body'); fail(msg, 'SAP relay: empty response'); } return undefined; }
    let body;
    try { body = JSON.parse(text); } catch { log('relay answered 200 with a body that is not JSON'); return fail(msg, 'SAP relay: bad response'); }
    write(body); // re-serialised: one line whatever the relay's formatting
    return undefined;
  }

  // ---------- ordering: requests pipelined (max 4), notifications as barriers ----------
  const queue = [];
  const inflight = new Set();
  let ended = false, pumping = false, done;
  const finished = new Promise((r) => { done = r; });

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const msg = queue[0];
      if (idsOf(msg).length) {
        if (inflight.size >= MAX_IN_FLIGHT) await Promise.race(inflight);
        queue.shift();
        const p = post(msg).catch((e) => { log(`unexpected: ${e && e.message}`); fail(msg, 'SAP relay: internal error'); }).finally(() => inflight.delete(p));
        inflight.add(p);
      } else {
        await Promise.all(inflight);
        queue.shift();
        await post(msg).catch((e) => log(`unexpected: ${e && e.message}`));
      }
    }
    pumping = false;
    if (ended) { await Promise.all(inflight); done(); }
  }

  let buf = '';
  const take = (line) => {
    const s = line.replace(/\r$/, '').trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch { log('a line on stdin is not JSON'); write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    queue.push(msg);
  };
  stdin.setEncoding && stdin.setEncoding('utf8');
  stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    pump();
  });
  stdin.on('end', () => {
    if (buf) { take(buf); buf = ''; }
    ended = true;
    pump();
  });
  // No process.exit() while keep-alive sockets are closing (Windows libuv asserts): close the fetch pool, then let the
  // event loop end with exit code 0.
  return finished.then(async () => {
    const pool = globalThis[Symbol.for('undici.globalDispatcher.1')];
    try { if (pool && typeof pool.close === 'function') await pool.close(); } catch { /* the loop ends on its own */ }
    done0();
  });
  function done0() { if (exit === defaultExit) process.exitCode = 0; else exit(0); }
}
const defaultExit = (c) => process.exit(c);

module.exports = { run, idsOf, privateHost };
