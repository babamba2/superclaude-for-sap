// sc4sap:graph — repository facts that source parsing cannot see, turned into edges.
//
//   TCodes  (TSTC / TSTCP via GetTransaction) → TRAN launches PROG, or the SM30 view / t-code
//           a parameter transaction opens
//   DDIC    (DD03L / DD04L rows via GetSqlQuery) → TABL/STRU/VIEW types DTEL (field typing),
//           TABL/STRU types STRU (.INCLUDE / .APPEND), DTEL types DOMA
//
// Only customer objects (Z*, Y*, /namespace/) and listed members become DDIC targets: a
// standard data element on a Z table adds nothing to "which CBO objects are used".
//
// Shapes accepted:
//   tcodes: [{ tcode, program }] · { TCODE: PROGRAM } · GetTransaction result
//           ({ transactions: [{ tcode, program, kind, target_tcode, parameters }] } or one such object)
//   ddic:   { fields: [{ TABNAME, FIELDNAME, ROLLNAME, PRECFIELD }], dtels: [{ ROLLNAME, DOMNAME }] }
//           — GetSqlQuery results ({ rows: [...] }) are unwrapped

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

/**
 * @param g        GraphBuilder (node / edge)
 * @param ddic     { fields, dtels }
 * @param members  Map name → type (member list)
 * @param idOf     (type, name) → id
 */
export function addDdicEdges(g, ddic, members, idOf) {
  if (!ddic) return { fields: 0, dtels: 0 };
  const take = (name) => members.has(name) || isCustomName(name);
  const typeFor = (name, dflt) => {
    const t = members.get(name);
    return t && ['TABL', 'VIEW', 'STRU', 'TTYP', 'DTEL', 'DOMA'].includes(t) ? t : dflt;
  };
  let fields = 0;
  for (const r of rowsOf(ddic.fields)) {
    const tab = up(r.TABNAME);
    const field = up(r.FIELDNAME);
    if (!tab || !take(tab)) continue;
    const from = idOf(typeFor(tab, 'TABL'), tab);
    if (field.startsWith('.')) {
      // .INCLUDE / .APPEND: the included structure sits in PRECFIELD
      const inc = up(r.PRECFIELD);
      if (!inc || !take(inc)) continue;
      g.node(from);
      g.edge(from, idOf(typeFor(inc, 'STRU'), inc), 'types', { unit: 'DD03L', line: 0, text: `${tab} ${field} ${inc}` });
      fields++;
      continue;
    }
    const roll = up(r.ROLLNAME);
    if (!roll || !take(roll)) continue;
    g.node(from);
    g.edge(from, idOf('DTEL', roll), 'types', { unit: 'DD03L', line: 0, text: `${tab}-${field} TYPE ${roll}` });
    fields++;
  }
  let dtels = 0;
  for (const r of rowsOf(ddic.dtels)) {
    const roll = up(r.ROLLNAME);
    const dom = up(r.DOMNAME);
    if (!roll || !dom || !take(roll) || !take(dom)) continue;
    g.edge(idOf('DTEL', roll), idOf('DOMA', dom), 'types', { unit: 'DD04L', line: 0, text: `${roll} DOMAIN ${dom}` });
    dtels++;
  }
  return { fields, dtels };
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
 * Step G3 checker output → the `ddic` shape. Lines:
 *   FACT obj=ZTAB kind=TABL key="types" value="FIELD=ZDE_X/ZDO_X"   (domain part optional)
 *   FACT obj=ZDE_X kind=DTEL key="domain" value="ZDO_X"
 */
export function parseDdicFacts(text) {
  const fields = [];
  const dtels = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^FACT obj=(\S+) kind=(\S+) key="(types|domain)" value="([^"]*)"/.exec(line.trim());
    if (!m) continue;
    const [, obj, , key, value] = m;
    if (key === 'domain') {
      if (value && value !== '-') dtels.set(up(obj), up(value));
      continue;
    }
    const t = /^([^=\s]+)=([^/\s]*)(?:\/(\S+))?$/.exec(value.trim());
    if (!t) continue;
    const [, field, roll, dom] = t;
    fields.push({ TABNAME: up(obj), FIELDNAME: up(field), ROLLNAME: up(roll) });
    if (roll && dom && !dtels.has(up(roll))) dtels.set(up(roll), up(dom));
  }
  return { fields, dtels: [...dtels].map(([ROLLNAME, DOMNAME]) => ({ ROLLNAME, DOMNAME })) };
}
