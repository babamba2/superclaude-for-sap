# Intent Router — knowledge vs lookup vs action

Shared by `/sc4sap:assist` and `/sc4sap:ask-consultant` (and the web front end, which has no slash commands). One user sentence is classified once, then handed to the skill that owns it. Neither skill asks the user to retype the request in the other skill.

## 1. Classes

| Class | The user wants | Owner | Examples |
|---|---|---|---|
| `knowledge` | how / why / where to configure, process advice, design choice | `ask-consultant` | "How is the GR/IR account determined?", "왜 출하 블록이 걸려?" in general, "Which BAdI for PO checks?" |
| `lookup` | data of specific documents or master records in the connected system | `assist` | "Open POs due today", "미결 PO 알려줘", "Status of order 1000012" |
| `action` | change a specific document / record in the connected system | `assist` | "Set delivery complete on PO 4500…", "출고 전기해줘", "청구 보류 해제" |

Mixed sentences: "Why is PO 4500… blocked and release it" = `lookup` + `knowledge` + `action` → `assist` runs the lookup and the PRECHECK; the explanation comes from the module consultant (§4); the action follows only after the user confirms.

## 2. Signals (in this order)

1. **Document or record reference** — a number that looks like a document (PO, sales order, delivery, billing, FI document, production / internal order, cost center, shipment, handling unit, transfer order / requirement) together with a verb → `lookup` or `action`.
2. **Catalog match** — run `node scripts/assist/catalog.mjs match "<sentence>"`. Any candidate → `lookup` (kind `query`) or `action` (kind `write`). `ambiguities` → the action is not chosen yet; ask the listed question.
3. **Imperative verb on business data** — create / change / post / release / block / cancel / reverse, KO 처리해줘 / 바꿔줘 / 전기 / 해제 / 취소 → `action`.
4. **Question words without a document** — how / why / what is / best practice / configure, KO 어떻게 / 왜 / 설정 / 방법 → `knowledge`.
5. Still unclear → one question: "Do you want me to look at or change data in <system>, or explain how it works?"

## 3. Module detection

Same keyword map as `ask-consultant` § Module_Routing (PO → MM, sales order / delivery / billing → SD, FI document / G/L / vendor item → FI, cost center / internal order → CO, production order → PP, shipment / shipment cost / picking / packing / handling unit → LE, transfer order / transfer requirement / storage bin / warehouse number / quant → WM, maintenance order / maintenance notification / equipment / functional location / maintenance plan → PM, warehouse task / warehouse order / EWM stock / handling unit in EWM → EWM, inspection lot / usage decision / results recording / quality notification / inspection plan → QM; LE, WM and PM are ECC only — on S/4 shipments belong to TM (not offered) and warehouse requests to EWM (lookups only); PM stays hidden on S/4 until verified there; QM is verified on S/4 only; a bare "notification" is asked: maintenance (PM) or quality (QM)). For `lookup` / `action` the action id prefix (`MM.`, `SD.` …) is the module.

## 4. Handoffs

| From → to | When | How |
|---|---|---|
| `ask-consultant` → `assist` | the question names documents or asks for a change | Say one line ("This is a document action — handing over to assist") and continue with the `assist` workflow in the same turn, reusing the sentence. |
| `assist` → `ask-consultant` | the user asks how / why / configuration in the middle of an action | Answer through `ask-consultant`, then return to the open action (keep its parameters). |
| `assist` → module consultant | a PRECHECK or PREVIEW blocks (configuration, status, period, number range, customer validation) | Dispatch `sc4sap:sap-<module>-consultant` with the blocking messages and facts in a `<sap-data>` block; ask for the cause and the configuration / master-data fix. `assist` never changes configuration itself. |

## 5. Never

- Never route a `knowledge` question into a business tool call.
- Never run an `action` from `ask-consultant`; it hands over.
- A slash command typed by the user wins over the router.
