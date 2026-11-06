// sc4sap:graph — repository facts that source parsing cannot see, turned into edges.
//
//   TCodes  (TSTC / TSTCP via GetTransaction) → TRAN launches PROG, or the SM30 view / t-code
//           a parameter transaction opens
//   DDIC    (DD* rows via GetSqlQuery output:"file", or Step G3 checker FACT lines as fallback)
//           types      TABL/STRU/VIEW → DTEL (DD03L), TABL/STRU → STRU (.INCLUDE / .APPEND), DTEL → DOMA (DD04L)
//           checks     TABL → check table (DD03L CHECKTABLE, DD08L cardinality, DD05S field map)
//           searchHelp DTEL → SHLP (DD04L), TABL field → SHLP (DD35L)
//           valueTable DOMA → TABL (DD01L ENTITYTAB)       rowType  TTYP → STRU/TABL/DTEL (DD40L)
//           basedOn    VIEW → TABL (DD26S)                  selects  SHLP → TABL/VIEW (DD30L SELMETHOD)
//           contains   collective SHLP → SHLP (DD31S)
//
// Only customer objects (Z*, Y*, /namespace/) and listed members become DDIC targets: a
// standard data element on a Z table adds nothing to "which CBO objects are used".
//
// Shapes accepted:
//   tcodes: [{ tcode, program }] · { TCODE: PROGRAM } · GetTransaction result
//           ({ transactions: [{ tcode, program, kind, target_tcode, parameters }] } or one such object)
//   ddic:   { fields: DD03L rows, dtels: DD04L, domains: DD01L, fks: DD08L, fkFields: DD05S, shlpFields: DD35L,
//             ttyps: DD40L, viewBases: DD26S, shlps: DD30L, shlpIncludes: DD31S } — any subset;
//           GetSqlQuery results ({ rows: [...] }) are unwrapped

const up = (s) => String(s ?? '').trim().toUpperCase();
export const isCustomName = (n) => /^[ZY]/.test(n) || /^\/(?!SAP|BEV|BA1|BIC|BI0|1BEA|1BS|SCWM|SCMB|SAPAPO|SAPSLL|SAPTRX|IWBEP|UI2|UI5|BOBF|AIF)[A-Z0-9_]+\//.test(n);

/** → [{ tcode, program?, view?, target?, via? }] */
export function normalizeTcodes(t) {
  if (!t) return [];
  let list = t;
  if (!Array.isArray(list) && typeof list === 'object') {
    if (Array.isArray(list.transactions)) list = list.transactions;
    else if (list.tcode) list = [list];
    else return Object.entries(list).map(([tcode, program]) => ({ tcode: up(tcode), program: up(program) }));
  }
  const out = [];
  for (const x of list) {
    if (!x || !x.tcode || x.found === false) continue;
    const tcode = up(x.tcode);
    if (x.program) out.push({ tcode, program: up(x.program) });
    else if (x.kind === 'parameter' && x.parameters?.VIEWNAME) out.push({ tcode, view: up(x.parameters.VIEWNAME), via: up(x.target_tcode) });
    else if (x.kind === 'parameter' && x.target_tcode) out.push({ tcode, target: up(x.target_tcode), via: up(x.target_tcode) });
  }
  return out;
}

const rowsOf = (x) => (Array.isArray(x) ? x : Array.isArray(x?.rows) ? x.rows : []);

/** Edge kinds this module adds besides `types` and `launches`. */
export const DDIC_EDGE_KINDS = ['checks', 'valueTable', 'searchHelp', 'rowType', 'basedOn', 'selects', 'contains'];

/** DD table → key in the `ddic` shape */
export const DD_TABLE_KEYS = {
  DD03L: 'fields',
  DD04L: 'dtels',
  DD01L: 'domains',
  DD08L: 'fks',
  DD05S: 'fkFields',
  DD35L: 'shlpFields',
  DD40L: 'ttyps',
  DD26S: 'viewBases',
  DD30L: 'shlps',
  DD31S: 'shlpIncludes',
};

const isName = (n) => /^[A-Z0-9_/]+$/.test(n) && n !== '*';

/**
 * @param g        GraphBuilder (node / edge)
 * @param ddic     { fields, dtels, domains, fks, fkFields, shlpFields, ttyps, viewBases, shlps, shlpIncludes }
 *                 — rows of the DD table named in DD_TABLE_KEYS (any subset)
 * @param members  Map name → type (member list)
 * @param idOf     (type, name) → id
 */
export function addDdicEdges(g, ddic, members, idOf) {
  const stats = { fields: 0, dtels: 0, checks: 0, valueTables: 0, searchHelps: 0, rowTypes: 0, viewBases: 0, shlps: 0 };
  if (!ddic) return stats;
  const take = (name) => isName(name) && (members.has(name) || isCustomName(name));
  const typeFor = (name, dflt) => {
    const t = members.get(name);
    return t && ['TABL', 'VIEW', 'STRU', 'TTYP', 'DTEL', 'DOMA', 'SHLP'].includes(t) ? t : dflt;
  };
  const tabId = (tab) => idOf(typeFor(tab, 'TABL'), tab);

  // foreign key headers (DD08L) and field maps (DD05S), keyed by table|field
  const fkHead = new Map();
  for (const r of rowsOf(ddic.fks)) fkHead.set(`${up(r.TABNAME)}|${up(r.FIELDNAME)}`, r);
  const fkMap = new Map();
  for (const r of rowsOf(ddic.fkFields)) {
    const k = `${up(r.TABNAME)}|${up(r.FIELDNAME)}`;
    if (!fkMap.has(k)) fkMap.set(k, []);
    fkMap.get(k).push(r);
  }
  // check table key fields (DD03L KEYFLAG, by POSITION): DD05S has no CHECKFIELD on ECC 7.31 / 7.40, so the
  // check-side field is the PRIMPOS-th key field of the check table, or #<PRIMPOS> when its DD03L rows were not read
  const keysOf = new Map();
  for (const r of rowsOf(ddic.fields)) {
    const f = up(r.FIELDNAME);
    if (up(r.KEYFLAG) !== 'X' || !f || f.startsWith('.')) continue;
    const t = up(r.TABNAME);
    if (!keysOf.has(t)) keysOf.set(t, []);
    keysOf.get(t).push({ pos: Number(r.POSITION ?? 0), f });
  }
  for (const list of keysOf.values()) list.sort((a, b) => a.pos - b.pos);
  const checkField = (chk, p) => {
    if (up(p.CHECKFIELD)) return up(p.CHECKFIELD);
    const pos = Number(p.PRIMPOS ?? 0);
    return keysOf.get(chk)?.[pos - 1]?.f || `#${pos}`;
  };
  const checkEdge = (tab, field, chk) => {
    if (!tab || !take(tab) || !chk || !take(chk)) return false;
    const k = `${tab}|${field}`;
    const h = fkHead.get(k);
    const pairs = (fkMap.get(k) || [])
      .sort((a, b) => Number(a.PRIMPOS ?? 0) - Number(b.PRIMPOS ?? 0))
      .filter((p) => up(p.FORTABLE) !== '*' && (up(p.FORKEY) || up(p.FORTABLE).startsWith("'")))
      .map((p) => {
        const fortab = up(p.FORTABLE);
        const left = fortab.startsWith("'") ? fortab : `${fortab || tab}-${up(p.FORKEY)}`;
        return `${left}=${checkField(chk, p)}`;
      });
    const card = h && (up(h.CARDLEFT) || up(h.CARD)) ? `${up(h.CARDLEFT) || '?'}:${up(h.CARD) || '?'}` : undefined;
    g.node(tabId(tab));
    g.edge(tabId(tab), idOf(typeFor(chk, 'TABL'), chk), 'checks',
      { unit: h ? 'DD08L' : 'DD03L', line: 0, text: `${tab}-${field} CHECK ${chk}${pairs.length ? ` (${pairs.join(', ')})` : ''}` },
      { card, frkart: h ? up(h.FRKART) || undefined : undefined });
    return true;
  };

  const checked = new Set();
  for (const r of rowsOf(ddic.fields)) {
    const tab = up(r.TABNAME);
    const field = up(r.FIELDNAME);
    if (!tab || !take(tab)) continue;
    const from = tabId(tab);
    if (field.startsWith('.')) {
      // .INCLUDE / .APPEND: the included structure sits in PRECFIELD
      const inc = up(r.PRECFIELD);
      if (!inc || !take(inc)) continue;
      g.node(from);
      g.edge(from, idOf(typeFor(inc, 'STRU'), inc), 'types', { unit: 'DD03L', line: 0, text: `${tab} ${field} ${inc}` });
      stats.fields++;
      continue;
    }
    const chk = up(r.CHECKTABLE);
    if (chk && checkEdge(tab, field, chk)) {
      checked.add(`${tab}|${field}`);
      stats.checks++;
    }
    const roll = up(r.ROLLNAME);
    if (!roll || !take(roll)) continue;
    g.node(from);
    g.edge(from, idOf('DTEL', roll), 'types', { unit: 'DD03L', line: 0, text: `${tab}-${field} TYPE ${roll}` });
    stats.fields++;
  }
  // DD08L rows whose DD03L row was not read (other chunk, fallback facts)
  for (const [k, h] of fkHead) {
    if (checked.has(k)) continue;
    const [tab, field] = k.split('|');
    if (checkEdge(tab, field, up(h.CHECKTABLE))) stats.checks++;
  }

  for (const r of rowsOf(ddic.dtels)) {
    const roll = up(r.ROLLNAME);
    if (!roll || !take(roll)) continue;
    const dom = up(r.DOMNAME);
    if (dom && take(dom)) {
      g.edge(idOf('DTEL', roll), idOf('DOMA', dom), 'types', { unit: 'DD04L', line: 0, text: `${roll} DOMAIN ${dom}` });
      stats.dtels++;
    }
    const sh = up(r.SHLPNAME);
    if (sh && take(sh)) {
      g.edge(idOf('DTEL', roll), idOf('SHLP', sh), 'searchHelp', { unit: 'DD04L', line: 0, text: `${roll} SEARCH HELP ${sh}${up(r.SHLPFIELD) ? `-${up(r.SHLPFIELD)}` : ''}` });
      stats.searchHelps++;
    }
  }
  for (const r of rowsOf(ddic.shlpFields)) {
    const tab = up(r.TABNAME);
    const sh = up(r.SHLPNAME);
    if (!take(tab) || !sh || !take(sh)) continue;
    g.node(tabId(tab));
    g.edge(tabId(tab), idOf('SHLP', sh), 'searchHelp', { unit: 'DD35L', line: 0, text: `${tab}-${up(r.FIELDNAME)} SEARCH HELP ${sh}` });
    stats.searchHelps++;
  }
  for (const r of rowsOf(ddic.domains)) {
    const dom = up(r.DOMNAME);
    const vt = up(r.ENTITYTAB);
    if (!take(dom) || !vt || !take(vt)) continue;
    g.edge(idOf('DOMA', dom), idOf(typeFor(vt, 'TABL'), vt), 'valueTable', { unit: 'DD01L', line: 0, text: `${dom} VALUE TABLE ${vt}` });
    stats.valueTables++;
  }
  for (const r of rowsOf(ddic.ttyps)) {
    const tt = up(r.TYPENAME);
    const row = up(r.ROWTYPE);
    if (!take(tt) || !row || !take(row)) continue;
    const kind = up(r.ROWKIND);
    const to = kind === 'E' ? idOf('DTEL', row) : idOf(typeFor(row, 'STRU'), row);
    g.edge(idOf('TTYP', tt), to, 'rowType', { unit: 'DD40L', line: 0, text: `${tt} ROW TYPE ${row}${kind ? ` (${kind})` : ''}` });
    stats.rowTypes++;
  }
  for (const r of rowsOf(ddic.viewBases)) {
    const v = up(r.VIEWNAME);
    const tab = up(r.TABNAME);
    if (!take(v) || !tab || !take(tab)) continue;
    g.edge(idOf('VIEW', v), tabId(tab), 'basedOn', { unit: 'DD26S', line: 0, text: `${v} BASE TABLE ${tab}` });
    stats.viewBases++;
  }
  for (const r of rowsOf(ddic.shlps)) {
    const sh = up(r.SHLPNAME);
    const sel = up(r.SELMETHOD);
    if (!take(sh) || !sel || !take(sel)) continue;
    g.edge(idOf('SHLP', sh), idOf(typeFor(sel, 'TABL'), sel), 'selects', { unit: 'DD30L', line: 0, text: `${sh} SELECTION METHOD ${sel}` });
    stats.shlps++;
  }
  for (const r of rowsOf(ddic.shlpIncludes)) {
    const sh = up(r.SHLPNAME);
    const sub = up(r.SUBSHLP);
    // elementary search helps can carry a DD31S row that points to themselves (seen on ECC 7.40)
    if (!take(sh) || !sub || sub === sh || !take(sub)) continue;
    g.edge(idOf('SHLP', sh), idOf('SHLP', sub), 'contains', { unit: 'DD31S', line: 0, text: `${sh} INCLUDES ${sub}` });
    stats.shlps++;
  }
  return stats;
}

/** Merge several `ddic` shapes (DD reads, ddic.json, checker facts) into one. */
export function mergeDdic(...parts) {
  const out = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      const rows = rowsOf(v);
      if (rows.length) out[k] = [...(out[k] || []), ...rows];
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Step G3 DD reads → the `ddic` shape. `reads` = ddic-reads.json:
 *   [{ id, table, path, rows, truncated } | { id, table, error }]
 * `load(path)` returns the file written by GetSqlQuery output:"file" ({ rows }).
 */
export function loadDdicReads(reads, load) {
  const ddic = {};
  const truncated = [];
  const failed = [];
  for (const r of Array.isArray(reads) ? reads : []) {
    const table = up(r.table);
    const key = DD_TABLE_KEYS[table];
    if (!key) continue;
    if (r.error || !r.path) {
      failed.push(r.id || table);
      continue;
    }
    let data;
    try {
      data = load(r.path);
    } catch {
      failed.push(r.id || table);
      continue;
    }
    if (r.truncated || data?.truncated) truncated.push(r.id || table);
    ddic[key] = [...(ddic[key] || []), ...rowsOf(data)];
  }
  return { ddic: Object.keys(ddic).length ? ddic : null, truncated, failed };
}

/** TRAN launches edges for every normalized TCode entry */
export function addTcodeEdges(g, tcodes, members, idOf) {
  for (const t of normalizeTcodes(tcodes)) {
    const target = t.program ? idOf('PROG', t.program) : t.view ? idOf('VIEW', t.view) : idOf('TRAN', t.target);
    const name = t.program || t.view || t.target;
    g.node(idOf('TRAN', t.tcode), { scope: members.has(t.tcode) || members.has(name) ? 'member' : undefined });
    g.edge(idOf('TRAN', t.tcode), target, 'launches', { unit: t.via ? 'TSTCP' : 'TSTC', line: 0, text: `TCODE ${t.tcode} → ${t.via ? `${t.via} ` : ''}${name}` }, t.via ? { via: t.via } : {});
  }
}

/**
 * Step G3 checker output (fallback when the DD reads fail) → the `ddic` shape. Lines:
 *   FACT obj=ZTAB kind=TABL key="types"   value="FIELD=ZDE_X/ZDO_X"   (domain part optional)
 *   FACT obj=ZTAB kind=TABL key="include" value="ZSTR"               (.INCLUDE / .APPEND structure)
 *   FACT obj=ZTAB kind=TABL key="check"   value="FIELD=ZCHECKTAB"
 *   FACT obj=ZTAB kind=TABL key="shlp"    value="FIELD=ZSH"
 *   FACT obj=ZDE_X kind=DTEL key="domain" value="ZDO_X"
 *   FACT obj=ZDE_X kind=DTEL key="shlp"   value="ZSH"
 *   FACT obj=ZDO_X kind=DOMA key="valtab" value="ZVALTAB"
 *   FACT obj=ZTT kind=TTYP key="rowtype"  value="ZSTR"
 *   FACT obj=ZV kind=VIEW key="base"      value="ZTAB"
 */
export function parseDdicFacts(text) {
  const fields = [];
  const dtels = new Map();
  const shlpOf = new Map();
  const out = { fields, shlpFields: [], domains: [], ttyps: [], viewBases: [] };
  const pair = (v) => /^([^=\s]+)=(\S+)$/.exec(v.trim());
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^FACT obj=(\S+) kind=(\S+) key="(types|domain|include|check|shlp|valtab|rowtype|base)" value="([^"]*)"/.exec(line.trim());
    if (!m) continue;
    const [, rawObj, kind, key, rawValue] = m;
    const obj = up(rawObj);
    const value = rawValue.trim();
    if (!value || value === '-') continue;
    if (key === 'domain') dtels.set(obj, up(value));
    else if (key === 'shlp' && up(kind) === 'DTEL') shlpOf.set(obj, up(value));
    else if (key === 'shlp') {
      const p = pair(value);
      if (p) out.shlpFields.push({ TABNAME: obj, FIELDNAME: up(p[1]), SHLPNAME: up(p[2]) });
    } else if (key === 'include') fields.push({ TABNAME: obj, FIELDNAME: '.INCLUDE', PRECFIELD: up(value) });
    else if (key === 'check') {
      const p = pair(value);
      if (p) fields.push({ TABNAME: obj, FIELDNAME: up(p[1]), CHECKTABLE: up(p[2]) });
    } else if (key === 'valtab') out.domains.push({ DOMNAME: obj, ENTITYTAB: up(value) });
    else if (key === 'rowtype') out.ttyps.push({ TYPENAME: obj, ROWTYPE: up(value) });
    else if (key === 'base') out.viewBases.push({ VIEWNAME: obj, TABNAME: up(value) });
    else {
      const t = /^([^=\s]+)=([^/\s]*)(?:\/(\S+))?$/.exec(value);
      if (!t) continue;
      const [, field, roll, dom] = t;
      fields.push({ TABNAME: obj, FIELDNAME: up(field), ROLLNAME: up(roll) });
      if (roll && dom && !dtels.has(up(roll))) dtels.set(up(roll), up(dom));
    }
  }
  const names = new Set([...dtels.keys(), ...shlpOf.keys()]);
  out.dtels = [...names].map((ROLLNAME) => ({ ROLLNAME, DOMNAME: dtels.get(ROLLNAME) || '', ...(shlpOf.has(ROLLNAME) ? { SHLPNAME: shlpOf.get(ROLLNAME) } : {}) }));
  return out;
}
