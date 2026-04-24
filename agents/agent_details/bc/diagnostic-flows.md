# sap-bc-consultant — Diagnostic Flows

Referenced by `agents/sap-bc-consultant.md` → `<Diagnostic_Flows>`. Nine symptom-specific investigation flows. Follow the flow matching the routing-tree classification; **collect the listed evidence before recommending any fix**.

## Flow 1: ABAP Dump Analysis (ST22)

1. **ST22 → Select dump → Verify user and timestamp**
2. **Runtime Error name** classification:
   - `DBIF_RSQL_SQL_ERROR`: DB-level error → SQL Trace (ST05), check indexes
   - `CONVT_CODEPAGE`: Unicode conversion → check SAP Notes for CONVT_CODEPAGE
   - `MESSAGE_TYPE_X`: Unexpected X-type message → call stack analysis
   - `TIME_OUT`: Check `rdisp/max_wprun_time`, identify long-running SQL or loop
   - `TSV_TNEW_PAGE_ALLOC_FAILED`: Memory shortage → ST02 buffer parameters
   - `RABAX_STATE`: ABAP runtime framework error → kernel patch level check
3. **Source Code Position** + **Call Stack** collection
4. **Reproducibility** test in DEV system

## Flow 2: Work Process Hang (SM50/SM66)

1. **SM50 → Check Running status processes**
2. Focus on **Table**, **Action**, **Time** columns
3. **Same report/table in multiple processes** → deadlock or SQL tuning needed
4. **SM66** for all-server view (distributed systems)
5. **Terminate with Core** decision only after impact assessment
6. **ST05 SQL Trace** for deep analysis of stuck process

## Flow 3: Transport Failure (STMS)

1. **STMS → Import Queue → Failed request identification**
2. **Return Code** classification:
   - 0-4: Warning/info (ignorable)
   - 6: Warning (review recommended)
   - 8: Error (root cause analysis required)
   - 12: Abort (critical, system check needed)
3. **Transport logs**: `/usr/sap/trans/log/`
   - `ALOG<YY>.<SID>`: Full action log
   - `ULOG<YY>.<SID>`: User log
   - `SLOG<YY>.<SID>`: Short log
4. Common causes: dependent object missing, activation failure, lock conflict, namespace collision

## Flow 4: RFC Error (SM59)

1. **SM59 → Connection Test + Authorization Test**
2. **ICM_HTTP_CONNECTION_BROKEN** → network/firewall
3. **RFC_COMMUNICATION_FAILURE** → gateway settings, secinfo/reginfo
4. **Logon failure** → user type (System/Service), password expiry
5. **SAP Cloud Connector** → SCC log check if applicable

## Flow 5: Update Hang (SM13)

1. **SM13 → Status = Err or Init** count
2. **Err**: Update failed → manual reprocessing or deletion decision
3. **Init**: Update process stuck → SM50 UPD process status
4. Queue accumulation causes user impact (logon rejection)
5. **rdisp/vb_*** parameter review

## Flow 6: Lock Issues (SM12)

1. **SM12 → Owner, Table, Object identification**
2. Old locks (hours) → zombie lock from disappeared process
3. **Lock modes**: E (Exclusive), S (Shared), O (Optimistic), X (Exclusive Non-cumulative)
4. Lock deletion requires impact assessment (potential transaction rollback)

## Flow 7: Performance Analysis

1. **Isolate by time/user/TCode**
2. **ST05 SQL Trace** → identify expensive queries
3. **SAT Runtime Analysis** → program-level hotspots
4. **ST06** OS resources (CPU, I/O, memory)
5. **DB02** (Oracle) / HANA Studio session monitoring
6. **ST02** Buffer hit ratios
7. **SE30** Tips & Tricks for ABAP optimization guidance

## Flow 8: Kernel Issues

1. **disp+work.log** check (`/usr/sap/<SID>/<INST>/work/`)
2. **Kernel patch level**: `disp+work -v` or System → Status
3. Post-kernel-upgrade → consider rollback
4. Core dump present → SAP Support Incident

## Flow 9: Unknown Symptoms

1. **SM21 → 10 minutes before/after symptom occurrence**
2. **ST22** same timeframe dumps
3. **DB02/HANA** DB issues at that time
4. **CCMS RZ20** alert timeline
5. Cross-reference all four for correlation
