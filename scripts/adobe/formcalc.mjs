// sc4sap:adobe-preview — the form scripts a preview can run: a FormCalc subset and a few JavaScript idioms, on the
// merged form tree of adobe-layout.mjs (no I/O, no eval).
//
//   runScripts(layout, form, phase, report, pages?)
//     phase 'form'   : initialize, calculate, ready $form events (after the merge, before the layout)
//     phase 'layout' : ready $layout events (after pagination; page numbers)
//
// FormCalc subset: var, assignment, if / then / elseif / else / endif, for … upto | downto … step … do … endfor,
// while … do … endwhile, expressions (+ - * / & | and or not, eq ne lt gt le ge == <> < > <= >=), strings, numbers,
// calls Concat Len Upper Lower Left Right Substr Sum Abs Round Floor Ceil Max Min Num2Str Str HasValue Exists,
// SOM references ($, $form, names, name[i], .all, .length, .rawValue, .presence, .break.before / startNew,
// .occur.min, .instanceManager.removeInstance(i) / .count).
// JavaScript: this.rawValue = xfa.layout.page(this) / xfa.layout.pageCount(); anything else is reported as an
// approximation (not run).

import { kids, kid, textOf } from './read-adobe.mjs';

// ── tokens ──
function lex(src) {
  const out = [];
  const re = /\s+|\/\/[^\n]*|;[^\n]*|"((?:[^"]|"")*)"|(\d+(?:\.\d+)?)|(\$[A-Za-z_]*|[A-Za-z_][A-Za-z0-9_]*)|(==|<>|<=|>=|[-+*\/&|<>=().,\[\]])/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) out.push({ t: 'str', v: m[1].replace(/""/g, '"') });
    else if (m[2] !== undefined) out.push({ t: 'num', v: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
    else if (m[4] !== undefined) out.push({ t: 'op', v: m[4] });
  }
  return out;
}

const KW = new Set(['var', 'if', 'then', 'elseif', 'else', 'endif', 'for', 'upto', 'downto', 'step', 'do', 'endfor', 'while', 'endwhile', 'and', 'or', 'not', 'eq', 'ne', 'lt', 'gt', 'le', 'ge', 'break', 'continue', 'return']);

class Parser {
  constructor(toks) { this.k = toks; this.i = 0; }
  peek(o = 0) { return this.k[this.i + o]; }
  isKw(w, o = 0) { const t = this.peek(o); return t && t.t === 'id' && t.v.toLowerCase() === w; }
  isOp(v) { const t = this.peek(); return t && t.t === 'op' && t.v === v; }
  next() { return this.k[this.i++]; }
  expectKw(w) { if (!this.isKw(w)) throw new Error(`FormCalc: '${w}' expected at ${this.i}`); this.i++; }
  block(ends) {
    const list = [];
    while (this.peek() && !ends.some((e) => this.isKw(e))) list.push(this.stmt());
    return list;
  }
  stmt() {
    if (this.isKw('var')) { this.next(); const name = this.next().v; let init = null; if (this.isOp('=')) { this.next(); init = this.expr(); } return { s: 'var', name, init }; }
    if (this.isKw('if')) {
      this.next(); const branches = []; let cond = this.expr(); this.expectKw('then');
      let body = this.block(['elseif', 'else', 'endif']); branches.push({ cond, body });
      let other = null;
      while (this.isKw('elseif')) { this.next(); cond = this.expr(); this.expectKw('then'); body = this.block(['elseif', 'else', 'endif']); branches.push({ cond, body }); }
      if (this.isKw('else')) { this.next(); other = this.block(['endif']); }
      this.expectKw('endif');
      return { s: 'if', branches, other };
    }
    if (this.isKw('for')) {
      this.next(); const name = this.next().v; if (this.isOp('=')) this.next(); const from = this.expr();
      const dir = this.isKw('downto') ? -1 : 1; this.next(); const to = this.expr();
      let step = null; if (this.isKw('step')) { this.next(); step = this.expr(); }
      this.expectKw('do'); const body = this.block(['endfor']); this.expectKw('endfor');
      return { s: 'for', name, from, to, dir, step, body };
    }
    if (this.isKw('while')) { this.next(); const cond = this.expr(); this.expectKw('do'); const body = this.block(['endwhile']); this.expectKw('endwhile'); return { s: 'while', cond, body }; }
    const e = this.expr();
    if (this.isOp('=')) { this.next(); return { s: 'set', target: e, value: this.expr() }; }
    return { s: 'expr', e };
  }
  expr() { return this.or(); }
  or() { let l = this.and(); while (this.isKw('or') || this.isOp('|')) { this.next(); l = { op: 'or', l, r: this.and() }; } return l; }
  and() { let l = this.eq(); while (this.isKw('and') || this.isOp('&')) { this.next(); l = { op: 'and', l, r: this.eq() }; } return l; }
  eq() {
    let l = this.rel();
    for (;;) {
      if (this.isKw('eq') || this.isOp('==')) { this.next(); l = { op: 'eq', l, r: this.rel() }; }
      else if (this.isKw('ne') || this.isOp('<>')) { this.next(); l = { op: 'ne', l, r: this.rel() }; }
      else return l;
    }
  }
  rel() {
    let l = this.add();
    for (;;) {
      const m = ['lt', 'gt', 'le', 'ge'].find((w) => this.isKw(w)) || ['<', '>', '<=', '>='].find((o) => this.isOp(o));
      if (!m) return l;
      this.next();
      l = { op: { '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge' }[m] || m, l, r: this.add() };
    }
  }
  add() { let l = this.mul(); while (this.isOp('+') || this.isOp('-')) { const o = this.next().v; l = { op: o, l, r: this.mul() }; } return l; }
  mul() { let l = this.unary(); while (this.isOp('*') || this.isOp('/')) { const o = this.next().v; l = { op: o, l, r: this.unary() }; } return l; }
  unary() {
    if (this.isOp('-')) { this.next(); return { op: 'neg', l: this.unary() }; }
    if (this.isKw('not')) { this.next(); return { op: 'not', l: this.unary() }; }
    return this.primary();
  }
  primary() {
    const t = this.next();
    if (!t) throw new Error('FormCalc: unexpected end');
    if (t.t === 'num') return { lit: t.v };
    if (t.t === 'str') return { lit: t.v };
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.next(); return e; }
    if (t.t === 'id' && !KW.has(t.v.toLowerCase())) {
      // function call or SOM path
      if (this.isOp('(') && !t.v.startsWith('$')) {
        this.next(); const args = [];
        while (!this.isOp(')')) { args.push(this.expr()); if (this.isOp(',')) this.next(); }
        this.next();
        return { call: t.v, args };
      }
      const path = [{ name: t.v }];
      for (;;) {
        if (this.isOp('[')) { this.next(); const idx = this.expr(); this.next(); path[path.length - 1].idx = idx; continue; }
        if (this.isOp('.')) {
          this.next(); const n = this.next();
          path.push({ name: n.v });
          if (this.isOp('(')) { this.next(); const args = []; while (!this.isOp(')')) { args.push(this.expr()); if (this.isOp(',')) this.next(); } this.next(); path[path.length - 1].args = args; }
          continue;
        }
        break;
      }
      return { path };
    }
    throw new Error(`FormCalc: unexpected '${t.v}'`);
  }
}

// ── evaluation on the form tree ──
const isNode = (v) => v && typeof v === 'object' && 'kind' in v && 't' in v;

function nodeValue(L, n) {
  if (n.over.rawValue !== undefined) return n.over.rawValue;
  if (n.kind === 'field') {
    if (n.data) return n.data.rich ? n.data.rich.map((p) => p.text).join('\n') : n.data.value ?? '';
    const v = kids(kid(n.t, 'value'))[0];
    return v ? textOf(v) : '';
  }
  return '';
}

function scalar(L, v) {
  if (isNode(v)) return nodeValue(L, v);
  if (v && v.list) return v.list.length;
  return v;
}

function cmp(a, b) {
  const na = Number(a), nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = String(a ?? ''), sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

class Interp {
  constructor(L, self, report, page) { this.L = L; this.self = self; this.report = report; this.page = page; this.vars = [new Map()]; }
  get(name) { for (let i = this.vars.length - 1; i >= 0; i--) if (this.vars[i].has(name)) return { v: this.vars[i].get(name), scope: this.vars[i] }; return null; }
  run(stmts) { for (const s of stmts) this.exec(s); }
  exec(s) {
    switch (s.s) {
      case 'var': this.vars[this.vars.length - 1].set(s.name, s.init ? scalarKeep(this.eval(s.init)) : ''); return;
      case 'if': {
        for (const b of s.branches) if (truthy(scalar(this.L, this.eval(b.cond)))) { this.run(b.body); return; }
        if (s.other) this.run(s.other);
        return;
      }
      case 'for': {
        const from = Number(scalar(this.L, this.eval(s.from)));
        const to = Number(scalar(this.L, this.eval(s.to)));
        const step = s.step ? Number(scalar(this.L, this.eval(s.step))) : 1;
        this.vars[this.vars.length - 1].set(s.name, from);
        let guard = 0;
        for (let i = from; s.dir > 0 ? i <= to : i >= to; i += s.dir * step) {
          this.set({ path: [{ name: s.name }] }, i);
          this.run(s.body);
          if (++guard > 100000) break;
        }
        return;
      }
      case 'while': { let g = 0; while (truthy(scalar(this.L, this.eval(s.cond))) && g++ < 100000) this.run(s.body); return; }
      case 'set': this.set(s.target, scalar(this.L, this.eval(s.value))); return;
      default: this.eval(s.e);
    }
  }
  eval(e) {
    if ('lit' in e) return e.lit;
    if (e.call) return this.call(e.call, e.args.map((a) => scalar(this.L, this.eval(a))));
    if (e.path) return this.resolve(e.path);
    const l = () => scalar(this.L, this.eval(e.l));
    const r = () => scalar(this.L, this.eval(e.r));
    switch (e.op) {
      case 'or': return truthy(l()) || truthy(r()) ? 1 : 0;
      case 'and': return truthy(l()) && truthy(r()) ? 1 : 0;
      case 'eq': return cmp(l(), r()) === 0 ? 1 : 0;
      case 'ne': return cmp(l(), r()) !== 0 ? 1 : 0;
      case 'lt': return cmp(l(), r()) < 0 ? 1 : 0;
      case 'gt': return cmp(l(), r()) > 0 ? 1 : 0;
      case 'le': return cmp(l(), r()) <= 0 ? 1 : 0;
      case 'ge': return cmp(l(), r()) >= 0 ? 1 : 0;
      case '+': return Number(l()) + Number(r());
      case '-': return Number(l()) - Number(r());
      case '*': return Number(l()) * Number(r());
      case '/': return Number(l()) / Number(r());
      case 'neg': return -Number(l());
      case 'not': return truthy(l()) ? 0 : 1;
      default: return '';
    }
  }
  call(name, a) {
    switch (name.toLowerCase()) {
      case 'concat': return a.map((x) => String(x ?? '')).join('');
      case 'len': return String(a[0] ?? '').length;
      case 'upper': return String(a[0] ?? '').toUpperCase();
      case 'lower': return String(a[0] ?? '').toLowerCase();
      case 'left': return String(a[0] ?? '').slice(0, Number(a[1]));
      case 'right': return String(a[0] ?? '').slice(-Number(a[1]));
      case 'substr': return String(a[0] ?? '').substr(Number(a[1]) - 1, Number(a[2]));
      case 'sum': return a.reduce((s, x) => s + (Number(x) || 0), 0);
      case 'abs': return Math.abs(Number(a[0]));
      case 'round': { const p = 10 ** (Number(a[1]) || 0); return Math.round(Number(a[0]) * p) / p; }
      case 'floor': return Math.floor(Number(a[0]));
      case 'ceil': return Math.ceil(Number(a[0]));
      case 'max': return Math.max(...a.map(Number));
      case 'min': return Math.min(...a.map(Number));
      case 'num2str': case 'str': return String(a[0] ?? '');
      case 'hasvalue': return String(a[0] ?? '').trim() ? 1 : 0;
      case 'exists': return a[0] !== undefined && a[0] !== '' ? 1 : 0;
      default: throw new Error(`FormCalc: function ${name} not supported`);
    }
  }
  /** A SOM path → a node, a list ({ list }), a property holder ({ node, prop }) or a value. */
  resolve(path, forSet = false) {
    let cur;
    let i = 0;
    const head = path[0].name;
    if (head === '$') cur = this.self;
    else if (head === '$form') cur = { root: true };
    else if (head === '$record' || head === '$data') { this.unsupported(`${head} in a script`); return ''; }
    else if (head === 'xfa') { this.unsupported('xfa.* in FormCalc'); return ''; }
    else {
      const v = this.get(head);
      if (v && path.length === 1) return v.v;
      cur = v ? v.v : this.findName(head);
    }
    if (path[0].idx !== undefined && isNode(cur)) cur = this.sibling(cur, Number(scalar(this.L, this.eval(path[0].idx))));
    for (i = 1; i < path.length; i++) {
      const seg = path[i];
      const nm = seg.name;
      if (cur && cur.root) {
        // $form.<root subform name>
        cur = this.L.form.name === nm ? this.L.form : null;
        if (seg.idx !== undefined && cur) cur = this.sibling(cur, Number(scalar(this.L, this.eval(seg.idx))));
        continue;
      }
      if (cur && cur.prop) { cur = { node: cur.node, prop: `${cur.prop}.${nm}`, args: seg.args }; if (seg.args) return this.method(cur); continue; }
      if (cur && cur.list) {
        if (nm === 'length') return cur.list.length;
        cur = cur.list[0];
      }
      if (!isNode(cur)) return '';
      if (nm === 'all') { cur = { list: this.siblings(cur) }; continue; }
      if (nm === 'rawValue' || nm === 'presence' || nm === 'formattedValue') { cur = { node: cur, prop: nm }; continue; }
      if (['break', 'occur', 'instanceManager', 'keep', 'border', 'font', 'para'].includes(nm)) { cur = { node: cur, prop: nm }; continue; }
      if (nm === 'index') return cur.index || 0;
      if (nm === 'name') return cur.name;
      const kids2 = cur.children.filter((c) => c.name === nm && !c.removed);
      if (!kids2.length) { this.report.approximations.push(`script: ${nm} not found`); return ''; }
      cur = kids2[seg.idx !== undefined ? Number(scalar(this.L, this.eval(seg.idx))) : 0];
      if (seg.args) return this.method({ node: cur, prop: nm, args: seg.args });
    }
    if (!forSet && cur && cur.prop && !cur.args) return this.readProp(cur);
    return cur;
  }
  siblings(n) { const p = n.parent; return p ? p.children.filter((c) => c.t === n.t && !c.removed) : [n]; }
  sibling(n, i) { return this.siblings(n)[i] || null; }
  findName(name) {
    // a name resolves from the current node upwards
    for (let p = this.self; p; p = p.parent) {
      if (p.name === name) return p;
      const hit = p.children.find((c) => c.name === name && !c.removed);
      if (hit) return hit;
    }
    return null;
  }
  readProp({ node, prop }) {
    if (prop === 'rawValue' || prop === 'formattedValue') return nodeValue(this.L, node);
    if (prop === 'presence') return node.presence;
    if (prop === 'instanceManager.count') return this.siblings(node).length;
    if (prop === 'occur.min') return node.over.occurMin ?? '';
    if (prop === 'break.before') return node.over.breakBefore ?? 'auto';
    return '';
  }
  method({ node, prop, args }) {
    const a = (args || []).map((x) => scalar(this.L, this.eval(x)));
    if (prop === 'instanceManager.removeInstance') {
      const list = this.siblings(node);
      const victim = list[Number(a[0]) || 0];
      if (victim) { victim.removed = true; victim.presence = 'inactive'; }
      return '';
    }
    if (prop === 'instanceManager.count') return this.siblings(node).length;
    this.unsupported(`${prop}()`);
    return '';
  }
  set(target, value) {
    if (target.path && target.path.length === 1 && !target.path[0].idx) {
      const v = this.get(target.path[0].name);
      if (v) { v.scope.set(target.path[0].name, value); return; }
    }
    const holder = this.resolve(target.path, true);
    if (isNode(holder)) { holder.over.rawValue = value; return; }
    if (!holder || !holder.prop) { this.unsupported('assignment target'); return; }
    const n = holder.node;
    switch (holder.prop) {
      case 'rawValue': n.over.rawValue = value; break;
      case 'presence': n.presence = String(value); break;
      case 'break.before': n.over.breakBefore = String(value); break;
      case 'break.startNew': n.over.startNew = String(value) === '1'; break;
      case 'occur.min': n.over.occurMin = Number(value); break;
      default: this.unsupported(`set ${holder.prop}`);
    }
  }
  unsupported(what) { this.report.approximations.push(`script: ${what} not run`); }
}

const truthy = (v) => !(v === 0 || v === '0' || v === '' || v === null || v === undefined || v === false);
const scalarKeep = (v) => v;

function scriptsOf(t) {
  const out = [];
  for (const ev of kids(t, 'event')) {
    const sc = kid(ev, 'script');
    if (!sc) continue;
    out.push({ activity: ev.attrs.activity || '', ref: ev.attrs.ref || '$', lang: /javascript/i.test(sc.attrs.contentType || '') ? 'js' : 'formcalc', code: textOf(sc) });
  }
  const calc = kid(t, 'calculate');
  const cs = kid(calc, 'script');
  if (cs) out.push({ activity: 'calculate', ref: '$', lang: /javascript/i.test(cs.attrs.contentType || '') ? 'js' : 'formcalc', code: textOf(cs) });
  return out;
}

function runOne(L, n, s, report, pages) {
  if (s.lang === 'js') {
    const code = s.code.trim();
    if (/^this\.rawValue\s*=\s*xfa\.layout\.page\(\s*this\s*\);?$/.test(code)) { n.over.rawValue = n.page ? n.page.index + 1 : 1; return; }
    if (/^this\.rawValue\s*=\s*xfa\.layout\.pageCount\(\s*\);?$/.test(code)) { n.over.rawValue = pages ? pages.length : 1; return; }
    if (/^this\.rawValue\s*=\s*xfa\.layout\.(?:absPage|sheet)\(\s*this\s*\)\s*\+\s*1;?$/.test(code)) { n.over.rawValue = n.page ? n.page.index + 1 : 1; return; }
    report.approximations.push(`JavaScript on ${L.som(n) || n.name || 'a node'} not run`);
    return;
  }
  try {
    const p = new Parser(lex(s.code));
    const prog = p.block([]);
    new Interp(L, n, report).run(prog);
  } catch (e) {
    report.approximations.push(`FormCalc on ${L.som(n) || n.name}: ${String(e.message || e).slice(0, 120)}`);
  }
}

/** Run the scripts of a phase over the form tree (and the master content of the pages in the layout phase). */
export function runScripts(L, form, phase, report, pages) {
  const want = (s) => (phase === 'form'
    ? (s.activity === 'initialize' || s.activity === 'calculate' || (s.activity === 'ready' && s.ref === '$form'))
    : (s.activity === 'ready' && s.ref === '$layout') || s.activity === 'layoutReady');
  const walk = (n, pages0) => {
    for (const s of scriptsOf(n.t)) if (want(s)) runOne(L, n, s, report, pages0);
    for (const c of n.children) walk(c, pages0);
  };
  if (phase === 'form') walk(form);
  else {
    // flowed content: each node's page is known after drawing; masters per page
    for (const p of pages || []) for (const m of p.masters) walk(m, pages);
    walk(form, pages);
  }
}
