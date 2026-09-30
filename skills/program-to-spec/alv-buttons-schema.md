# Program → Spec — Output-Screen Buttons and Per-Button Flows

Referenced by `workflow-steps.md` (Steps 1, 3, 3.5) and `spec-templates.md`. It covers every report whose output screen has buttons: GUI-status function codes handled in PAI, and ALV toolbar buttons handled in the ALV `USER_COMMAND` event. The goal has two parts:

1. The ALV image shows the buttons.
2. Every button that does business work gets its own process flow.

A single "toolbar button" arrow in the main flow is not enough.

## 1. Inventory — collect every button (Step 1 + analyst)

| Source | Where it comes from | What to record |
|---|---|---|
| **PAI** (GUI status) | `GetGuiStatus` for each status from `GetGuiStatusList` (application toolbar function codes, texts, icons) + the PAI `CASE ok_code` / `sy-ucomm` routing | `code`, text, icon, handler FORM/method |
| **ALV toolbar** | The `TOOLBAR` event handler (`APPEND … TO e_object->mt_toolbar`: `function`, `text`, `icon`, `butn_type` 3 = separator), or `SET PF-STATUS` in a `REUSE_ALV_GRID_DISPLAY` callback | `code`, text, icon, which grid, handler |
| **Handler logic** | The `USER_COMMAND` / PAI branch for each code | Checks (with message numbers), BAPIs/updates, commits, follow-up refresh |

The analyst returns one row per button in the spec's screen section (Code · Text · Handler · Business action). It also returns one **business flow per button** that changes data or starts processing. Pure navigation buttons (`BACK`, `EXIT`, `CANC`, plain `REFRESH`) and standard ALV functions (sort, filter, export) get a table row only, with no flow.

## 2. image-spec.json — `alv` additions

All fields are optional. A spec without them renders exactly as before.

```jsonc
"alv": {
  "screen": {                                   // GUI status → drawn as title bar + PAI bar
    "title": "<screen title (TITLEBAR text)>",
    "status": "S0100",
    "buttons": [ { "code": "REFRESH", "label": "<text in lang>", "icon": "refresh", "flow": false } ]
  },
  "toolbar": [                                  // single grid: ALV toolbar buttons, in order
    { "code": "ICREATE", "label": "<text>", "icon": "create" },
    { "code": "ICANCEL", "icon": "cancel" },    // no label → icon-only, as in SAP
    "|"                                         // separator (butn_type 3)
  ],
  "standardToolbar": true,                      // prepend generic ALV icons (details/sort/filter/sum/export)
  "panes": [ { "title": "…", "toolbar": [ … ], "standardToolbar": true, "columns": […] } ]  // multi-grid: toolbar per pane
}
```

- `icon` takes a keyword such as `create`, `delete`, `cancel`, `refresh`, `exit`, `back`, `execute`, `undo`, `save`, `check`, `print`, `export`, `upload`, `filter`, `sort`, `sum`, `detail`, `mail`, `edit`, or `copy`. A single glyph also works. Map SAP icons by meaning: `ICON_CREATE` → `create`, `ICON_CANCEL` → `cancel`.
- `label` follows the spec `lang` rule. Keep the SAP text when it is a product term (`HQ Inquiry Create`).
- `"flow": false` marks a navigation-only button, and so does the string shorthand (`"BACK"`). Every other button must have a usable `buttonFlows` entry — its own, or a shared one that lists it in `codes` (§3) — or `render-md-images.mjs` (and `build-spec.mjs`) prints a `⚠` warning. A code must be unique within one toolbar. The same code on two grids (each with its own REFRESH) shares one flow. A PAI and an ALV button may share a code, and the flow's `source` then says which one it belongs to.
- Order `toolbar` as the handler appends it, so the image matches the real screen.

## 3. image-spec.json — `buttonFlows`

```jsonc
"buttonFlows": [
  { "code": "ICREATE", "source": "alv",           // "alv" | "pai"
    "label": "<business name in lang>",
    "flow": { "nodes": [ … ], "edges": [ … ] } },  // same graph form as processFlow
  { "code": "ZPOB", "source": "pai",               // one flow for a whole business stage
    "codes": ["ZPOB_BA", "ZPOB_BA_C",              // same bar as the flow
              { "code": "ZUPPO", "source": "alv" }],  // a button on the other bar
    "label": "…", "flow": { … } }
]
```

- Array order is the button number. The ALV image draws the same number as an orange badge on the button, and on every button in its `codes`.
- **Stage grouping.** When a screen has many buttons per business stage (online / batch / cancel variants of one step), draw one flow per stage: `code` = the representative button (online code if it exists; it names the flow file), `codes` = the other buttons of that stage. Show the variants as branches inside the flow (a first decision "which button?"). Each code may belong to one flow only; a code claimed twice, or a linked code with no button, prints a `⚠`.
- Each flow starts at the click (`start`) and checks what the handler checks (`decision`, naming the condition in words). The messages it raises go in the `io` side node, one per line, as `CODE (English text)` — e.g. `M07 (Already FD Done)`; see `workflow-steps.md` § Message references. It then does the business work in `process` nodes, with the BAPI or table named, and ends at the result shown (`end`).
- Keep each flow to **5–10 nodes**. Business wording first, and the SAP name only as the second line of a node.
- The **main `processFlow`** stops at the ALV output. Add one node such as "User selects a button → per-button flows ①–⑧" instead of merging the button logic into it. A batch path that runs a button automatically points to that button's number.

## 4. Rendering and placement (Step 3.5)

`render-md-images.mjs <image-spec.json> <out-dir>` writes `alv.png` with the buttons and badges, plus `flow-<n>-<CODE>.png` for each button flow. Check its output for `⚠` lines and fix the spec before finalizing.

In the Markdown spec, put the button flows in §4 after the main flow:

```markdown
### 4.2 Per-button flows

#### ① [ALV] ICREATE — HQ Inquiry creation
![ICREATE flow](_assets/<OBJECT>-<YYYYMMDD>-<lang>/flow-1-ICREATE.png)

1. Checks … (E04, E05)  2. Creates … <span class="tech">(INQUIRY_CREATE_GO, L2028–2701)</span>
```

- Number the headings with the badge number (`①`). For a stage flow, name the linked codes after the representative: `#### ① [PAI] ZPOB (+ ZPOB_BA, ZPOB_BA_C) — PO(B) I/R`. The render manifest lists them per flow as `codes`.
- Follow the heading with the image, then two to five numbered steps.
- The screen section's button table lists every button, including the navigation ones.

**Excel**: `alv.png` with buttons flows into Sheet 3 automatically. The template has one flow slot, so button flows appear in Markdown and HTML only. For Excel, list them as rows in the Sheet 4 step table.
