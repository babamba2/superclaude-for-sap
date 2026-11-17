import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { privateHost } = createRequire(__filename)('../../bridge/remote.cjs');

const BRIDGE = join(__dirname, '..', '..', 'bridge', 'mcp-server.cjs');
const TOKEN = 'tok-REMOTE-SECRET-123';

// mock relay: records what arrives; answers per JSON-RPC method / tool name
type Seen = { auth: string; accept: string; body: any; at: number };
let server: Server, url = '', seen: Seen[] = [], live = 0, maxLive = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw);
      seen.push({ auth: String(req.headers.authorization || ''), accept: String(req.headers.accept || ''), body, at: Date.now() });
      const send = (status: number, obj?: any, pretty = false) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj, null, pretty ? 2 : 0)); };
      if (Array.isArray(body)) return send(200, body.filter((m: any) => 'id' in m).map((m: any) => ({ jsonrpc: '2.0', id: m.id, result: { batch: true } })));
      if (!('id' in body)) { await new Promise((r) => setTimeout(r, 150)); return send(202); } // a slow notification
      const name = body.params?.name;
      if (body.method === 'initialize') return send(200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'relay', version: '1' } } }, true);
      if (body.method === 'tools/list') return send(200, { jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'GetTable' }] } });
      if (name === 'deny') return send(403, { error: 'no permission ticket for GetTableContents' });
      if (name === 'boom') return send(500, { error: 'server exploded' });
      if (name === 'bad400') return send(400, { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'unknown argument table_nam' } });
      if (name === 'bad400b') return send(400, { error: 'arguments too large' });
      if (name === 'bad400c') { res.writeHead(400); return res.end('nope'); }
      if (name === 'notjson') { res.writeHead(200); return res.end('<html>oops</html>'); }
      if (name === 'hold') { live++; maxLive = Math.max(maxLive, live); await new Promise((r) => setTimeout(r, 250)); live--; return send(200, { jsonrpc: '2.0', id: body.id, result: {} }); }
      if (name === 'sse') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} })}\n\n`); }
      if (name === 'slowbody') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"jsonrpc":'); await new Promise((r) => setTimeout(r, 1500)); return res.end(`"2.0","id":${body.id},"result":{}}`); }
      if (name === 'slow') { await new Promise((r) => setTimeout(r, 1500)); return send(200, { jsonrpc: '2.0', id: body.id, result: {} }); }
      return send(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `ok ${name}` }] } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as any).port}/mcp`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** runs the bridge with the lines on stdin; returns stdout lines (parsed), stderr text and the exit code */
function runBridge(lines: string[], env: Record<string, string>, cwd: string) {
  return new Promise<{ out: any[]; err: string; code: number | null }>((resolve) => {
    const child = spawn(process.execPath, [BRIDGE], { cwd, env: { PATH: process.env.PATH || '', SYSTEMROOT: process.env.SYSTEMROOT || '', ...env } });
    let out = '', err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => resolve({ out: out.split('\n').filter(Boolean).map((l) => JSON.parse(l)), err, code }));
    child.stdin.end(lines.map((l) => `${l}\n`).join(''));
  });
}

describe('bridge remote mode (stdio ↔ HTTP relay)', () => {
  // a cwd whose active profile is OFFLINE: the normal bridge would read it and stop — remote mode must not read it
  const cwd = mkdtempSync(join(tmpdir(), 'bridge-remote-'));
  const home = join(cwd, 'no-such-home');
  mkdirSync(join(cwd, '.sc4sap'), { recursive: true });
  writeFileSync(join(cwd, '.sc4sap', 'active-profile.txt'), 'OFF');
  writeFileSync(join(cwd, '.sc4sap', 'sap.env'), 'SAP_CONNECTION=offline\nSC4SAP_MCP_AUTOBUILD=1\n');
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));
  const env = () => ({ SC4SAP_MCP_REMOTE_URL: url, SC4SAP_MCP_REMOTE_TOKEN: TOKEN, SC4SAP_HOME_DIR: home });

  it('initialize → initialized → tools/list → tools/call round trip, in order, with the bearer token; no reply to the notification', async () => {
    seen = [];
    const r = await runBridge([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'GetTable', arguments: { table_name: 'MARA' } } }),
      JSON.stringify([{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'a' } }, { jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }]),
    ], env(), cwd);
    expect(r.code).toBe(0);
    expect(r.out.map((m: any) => (Array.isArray(m) ? m.map((x: any) => x.id) : m.id)).sort()).toEqual([1, 2, 3, [4]].sort());
    expect(r.out.find((m: any) => m.id === 1).result.serverInfo.name).toBe('relay'); // a pretty-printed body still comes out as one line
    expect(r.out.find((m: any) => m.id === 3).result.content[0].text).toBe('ok GetTable');
    expect(seen.every((s) => s.auth === `Bearer ${TOKEN}` && s.accept === 'application/json')).toBe(true);
    const order = seen.map((s) => (Array.isArray(s.body) ? 'batch' : s.body.method));
    expect(order.indexOf('notifications/initialized')).toBeGreaterThan(order.indexOf('initialize'));
    expect(order.indexOf('tools/list')).toBeGreaterThan(order.indexOf('notifications/initialized')); // the notification is a barrier
    expect(r.err).not.toContain(TOKEN);
    // nothing of the profile was read or created: the OFFLINE profile did not stop it, the home dir is still missing
    expect(r.err).not.toMatch(/OFFLINE/);
    expect(existsSync(home)).toBe(false);
  });

  it('403 / 500 / non-JSON 200 / timeout → a JSON-RPC error with the same id; the relay reason reaches the model; token never in stderr', async () => {
    const call = (id: number, name: string) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name } });
    const r = await runBridge([call(10, 'deny'), call(11, 'boom'), call(12, 'notjson'), call(13, 'slow'), call(14, 'bad400'), call(15, 'bad400b'), call(16, 'bad400c')], { ...env(), SC4SAP_MCP_REMOTE_TIMEOUT_MS: '400' }, cwd);
    expect(r.code).toBe(0);
    const by = (id: number) => r.out.find((m: any) => m.id === id);
    expect(by(10).error).toEqual({ code: -32000, message: 'SAP relay refused this call (no permission ticket for GetTableContents)' });
    expect(by(11).error.message).toBe('SAP relay: HTTP 500 (server exploded)');
    expect(by(14).error.message).toBe('SAP relay: HTTP 400 (unknown argument table_nam)');
    expect(by(15).error.message).toBe('SAP relay: HTTP 400 (arguments too large)');
    expect(by(16).error.message).toBe('SAP relay: HTTP 400');
    expect(by(12).error.message).toBe('SAP relay: bad response');
    expect(by(13).error.message).toMatch(/^SAP relay: timeout after 400 ms$/);
    expect(r.err.split('\n').filter(Boolean).length).toBe(7); // one line per failure
    expect(r.err).not.toContain(TOKEN);
    expect(r.err).not.toContain('server exploded'); // bodies are not logged (the model sees the reason, stderr does not)
    expect(r.err).not.toContain('table_nam');
  });

  it('network error → error for requests, nothing for notifications; a bad URL stops at once', async () => {
    const r = await runBridge([JSON.stringify({ jsonrpc: '2.0', id: 'a', method: 'tools/list' }), JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })],
      { ...env(), SC4SAP_MCP_REMOTE_URL: 'http://127.0.0.1:1/mcp' }, cwd);
    expect(r.code).toBe(0);
    expect(r.out).toHaveLength(1);
    expect(r.out[0]).toMatchObject({ jsonrpc: '2.0', id: 'a', error: { code: -32000 } });
    expect(r.out[0].error.message).toMatch(/^SAP relay: /);
    const bad = await runBridge([], { ...env(), SC4SAP_MCP_REMOTE_URL: 'file:///etc/passwd' }, cwd);
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/must be an http\(s\) URL/);
  });

  it('plain http only to private hosts (loopback, Docker service name, RFC 1918, fd00::/8); https anywhere', async () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', 'backend', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '[fd12:3456::1]']) expect(privateHost(new URL(`http://${h}/`).hostname), h).toBe(true);
    for (const h of ['relay.example.com', 'backend.internal', '8.8.8.8', '172.32.0.1', '172.15.0.1', '11.0.0.1', '[2001:db8::1]', '[fe80::1]']) expect(privateHost(new URL(`http://${h}/`).hostname), h).toBe(false);
    const pub = await runBridge([], { ...env(), SC4SAP_MCP_REMOTE_URL: 'http://relay.example.com/mcp' }, cwd);
    expect(pub.code).toBe(1);
    expect(pub.err).toMatch(/must be https/);
    // a Docker service name over plain http is allowed: the bridge tries the relay (no such host here → an error reply)
    const svc = await runBridge([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })], { ...env(), SC4SAP_MCP_REMOTE_URL: 'http://sc4sap-no-such-service:3102/mcp', SC4SAP_MCP_REMOTE_TIMEOUT_MS: '3000' }, cwd);
    expect(svc.code).toBe(0);
    expect(svc.out[0].error.message).toMatch(/^SAP relay: /);
  });

  it('more than 4 requests: at most 4 in flight, sent in arrival order; an event-stream reply and a body cut by the timeout are errors', async () => {
    seen = []; maxLive = 0;
    const call = (id: number, name: string) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name } });
    const r = await runBridge([1, 2, 3, 4, 5, 6, 7].map((i) => call(i, 'hold')), env(), cwd);
    expect(r.out.map((m: any) => m.id).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maxLive).toBe(4);
    // started in arrival order: the first four go out before any of the rest (requests in flight may reach the relay in any order)
    const got = seen.map((x) => x.body.id);
    expect(got.slice(0, 4).sort()).toEqual([1, 2, 3, 4]);
    expect(got.slice(4).sort()).toEqual([5, 6, 7]);
    const s = await runBridge([call(20, 'sse'), call(21, 'slowbody')], { ...env(), SC4SAP_MCP_REMOTE_TIMEOUT_MS: '400' }, cwd);
    expect(s.out.find((m: any) => m.id === 20).error.message).toBe('SAP relay: streaming replies are not supported');
    expect(s.out.find((m: any) => m.id === 21).error.message).toBe('SAP relay: timeout after 400 ms');
  });

  it('without the token the remote variables are ignored (normal mode runs: here the OFFLINE profile stops it)', async () => {
    const r = await runBridge([], { SC4SAP_MCP_REMOTE_URL: url, SC4SAP_HOME_DIR: home }, cwd);
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/OFFLINE/);
  });
});
