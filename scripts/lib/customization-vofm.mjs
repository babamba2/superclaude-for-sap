// VOFM routines (requirements, formulas, data transfer) — customer routines only.
//
// Sources:
//   TFRM  — routine registry: GRPZE (group), GRPNO (number), AKTIV ('X' = active),
//           KAPPL (condition application, only on condition-technique groups)
//   TFRMT — descriptions: SPRAS, GRPZE, GRPNO, BEZEI
// Both are client-independent customizing tables.
//
// Customer routines are told apart by number only: their includes sit in SAP
// packages (VKON, VA, VF, …), so the package says nothing. The ranges and the
// include names come from transaction VOFM itself (SAPMV80H, FORM
// xd0200_include_namen_setzen / xd0200_user_grpno_first / _last): numbers
// 600–999 are the customer's, except PSTK / TDAT (50–99) and FOFU (900–999).
// SAP routines below that range are never reported — modified SAP routines
// are modifications, not VOFM customizing.

// group → [customer include prefix, default module, label]
export const VOFM_GROUPS = {
  ABED: ['RV45B', 'SD', 'Copying requirements in the order'],
  LBED: ['RV50B', 'SD', 'Copying requirements in the delivery'],
  FBED: ['RV60B', 'SD', 'Copying requirements in the billing document'],
  CASB: ['RV43A', 'SD', 'Copying requirements for sales activities'],
  TBED: ['RV45T', 'SD', 'Copying requirements for texts'],
  ADAT: ['RV45C', 'SD', 'Data transfer in the order'],
  LDAT: ['RV50C', 'SD', 'Data transfer in the delivery'],
  FDAT: ['RV60C', 'SD', 'Data transfer in the billing document'],
  CASC: ['RV44A', 'SD', 'Data transfer for sales activities'],
  TDAT: ['RV45TE', 'SD', 'Data transfer involving texts'],
  VSEL: ['RV51A', 'SD', 'Data transfer for shipping units'],
  TRAU: ['RV56C', 'SD', 'Data transfer transport'],
  TNAM: ['RV70T', 'SD', 'Text names for word processing'],
  TXNM: ['RV46T', 'SD', 'Text names for copying modules'],
  PBED: ['RV61A', 'SD', 'Pricing requirements'],
  PBEF: ['RV61D', 'SD', 'Material determination requirements'],
  PBEK: ['RV61C', 'SD', 'Account determination requirements'],
  PBEL: ['RV61G', 'SD', 'Material listing requirements'],
  PBEN: ['RV61B', 'SD', 'Output control requirements'],
  PBNA: ['RV62N', 'SD', 'Free goods requirements'],
  CMPD: ['RV623', 'SD', 'Requirements for campaign determination'],
  POFO: ['RV61M', 'SD', 'Pricing requirements (POFO)'],
  PACK: ['RV61P', 'SD', 'Packing instruction determination'],
  PFRA: ['RV63A', 'SD', 'Pricing formulas: condition basis'],
  PFRM: ['RV64A', 'SD', 'Pricing formulas: condition value'],
  PFRS: ['RV62A', 'SD', 'Pricing formulas: scale basis'],
  PSTK: ['RV65A', 'SD', 'Structure of scale key for pricing'],
  PRUN: ['RV13Z', 'SD', 'Pricing formulas: rounding'],
  PNAT: ['RV61N', 'SD', 'Pricing formulas: free goods'],
  VKMP: ['RVKMP', 'SD', 'Credit check requirements'],
  RISK: ['RRISK', 'SD', 'Risk management (payment guarantee)'],
  EXKO: ['RV52E', 'SD', 'Export requirements'],
  FOFU: ['RV07A', 'SD', 'Subsequent functions'],
  VCAU: ['RVCAU', 'SD', 'Authorization requirements for payment cards'],
  VFCL: ['RV57A', 'SD', 'Multi-dimensional scales'],
  REAK: ['AKUSR', 'SD', 'Archiving for orders'],
  RERK: ['RKUSR', 'SD', 'Archiving for billing documents'],
  RELK: ['DKUSR', 'SD', 'Archiving for deliveries'],
  REKA: ['KAUSR', 'SD', 'Archiving for sales activities'],
  LST1: ['RV77U', 'SD', 'Info blocks for SD reporting'],
  MCV1: ['FMCV1', 'SD', 'SIS requirements'],
  MCV2: ['FMCV2', 'SD', 'SIS formulas'],
  CHBE: ['R080M', 'MM', 'Batch search strategies'],
  CHRG: ['RV01F', 'MM', 'Batch requirements'],
  CHMV: ['RMDBF', 'MM', 'Stock requirements'],
  MCE1: ['FMCE1', 'MM', 'PURCHIS requirements'],
  MCE2: ['FMCE2', 'MM', 'PURCHIS formulas'],
  MCB1: ['FMCB1', 'MM', 'Stock control requirements'],
  MCB2: ['FMCB2', 'MM', 'Stock control formulas'],
  MCF1: ['FMCF1', 'PP', 'SFIS requirements'],
  MCF2: ['FMCF2', 'PP', 'SFIS formulas'],
  MCI1: ['FMCI1', 'PM', 'PM requirements'],
  MCI2: ['FMCI2', 'PM', 'PM formulas'],
  MCQ1: ['FMCQ1', 'QM', 'QMIS requirements'],
  MCQ2: ['FMCQ2', 'QM', 'QMIS formulas'],
};

/** Modules that can receive VOFM routines (group defaults + KAPPL targets). */
export const VOFM_MODULES = new Set([...Object.values(VOFM_GROUPS).map((g) => g[1]), 'MM', 'FI']);

const SHORT_RANGE = new Set(['PSTK', 'TDAT']);

export function customerRange(group) {
  if (SHORT_RANGE.has(group)) return [50, 99];
  if (group === 'FOFU') return [900, 999];
  return [600, 999];
}

/** Include holding one customer routine: prefix + number (TDAT: 2 digits, others 3). */
export function vofmInclude(group, number) {
  const g = VOFM_GROUPS[group];
  if (!g) return null;
  const n = Number(number);
  return `${g[0]}${String(n).padStart(group === 'TDAT' ? 2 : 3, '0')}`;
}

/**
 * Module of a routine: condition-technique groups carry KAPPL (V… = sales /
 * shipping / billing, F = shipment costs, M… / E… = purchasing, TX = taxes);
 * otherwise the group decides.
 */
export function vofmModule(group, kappl) {
  const k = String(kappl || '').trim().toUpperCase();
  if (k) {
    if (k.startsWith('V') || k === 'F') return 'SD';
    if (k.startsWith('M') || k.startsWith('E')) return 'MM';
    if (k === 'TX') return 'FI';
  }
  return VOFM_GROUPS[group]?.[1] || null;
}

const val = (row, key) => String(row?.[key] ?? row?.[key.toLowerCase()] ?? '').trim();

/** Description in English when there is one, else any language. */
function texts(textRows) {
  const by = new Map();
  for (const r of textRows || []) {
    const key = `${val(r, 'GRPZE').toUpperCase()}/${Number(val(r, 'GRPNO'))}`;
    const text = val(r, 'BEZEI');
    if (!text) continue;
    if (!by.has(key) || val(r, 'SPRAS').toUpperCase() === 'E') by.set(key, text);
  }
  return by;
}

/**
 * Customer routines from TFRM rows. Groups outside the catalog (industry
 * solutions, retail) are counted in `unmapped`, never dropped silently; their
 * customer range is not known, so that count assumes 600–999 and is only a hint.
 */
export function vofmRoutines(tfrmRows, textRows) {
  const desc = texts(textRows);
  const routines = [];
  const unmapped = new Map();
  for (const r of tfrmRows || []) {
    const group = val(r, 'GRPZE').toUpperCase();
    const number = Number(val(r, 'GRPNO'));
    if (!group || !Number.isFinite(number)) continue;
    const [first, last] = customerRange(group);
    if (number < first || number > last) continue;
    const module = vofmModule(group, val(r, 'KAPPL'));
    if (!VOFM_GROUPS[group] || !module) {
      unmapped.set(group, (unmapped.get(group) || 0) + 1);
      continue;
    }
    routines.push({
      group,
      groupText: VOFM_GROUPS[group][2],
      number: String(number).padStart(3, '0'),
      description: desc.get(`${group}/${number}`) || '',
      application: val(r, 'KAPPL').toUpperCase(),
      active: val(r, 'AKTIV').toUpperCase() === 'X',
      include: vofmInclude(group, number),
      module,
    });
  }
  return { routines, unmapped: Object.fromEntries(unmapped) };
}

export function vofmForModule(routines, mod) {
  return (routines || []).filter((r) => r.module === mod);
}
