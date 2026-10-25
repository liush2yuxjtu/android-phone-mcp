------------------------------ MODULE Spec ------------------------------
(*************************************************************************)
(* Minimal model of android-phone-mcp ADB exclusivity on one serial.     *)
(*                                                                       *)
(* Product map (README / PhoneSession / tools):                          *)
(*   Device selected via ANDROID_SERIAL or phone_connect(device=...).    *)
(*   Ops: connect / observe / tap / swipe / type / key / launch          *)
(*   abstracted as Op. Desired safety: at most one in-flight ADB op      *)
(*   per serial; other callers rejected when busy or disconnected.       *)
(*************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Clients,   \* concurrent MCP callers, e.g. {"c1","c2"}
  Ops        \* {"connect","observe","tap","swipe","type","key","launch"}

ASSUME Clients # {} /\ Ops # {}

VARIABLES
  connected,   \* BOOLEAN — device online after successful connect
  inflight,    \* Client \union {Free} — who holds the exclusive ADB slot
  lastReject   \* reason of last rejected attempt, or "ok"

Free == "Free"
Vars == <<connected, inflight, lastReject>>

TypeOK ==
  /\ connected \in BOOLEAN
  /\ inflight \in Clients \union {Free}
  /\ lastReject \in {"ok","busy","disconnected"}

Init ==
  /\ connected = FALSE
  /\ inflight = Free
  /\ lastReject = "ok"

\* phone_connect succeeds → device online; occupies exclusive slot.
StartConnect(c) ==
  /\ inflight = Free
  /\ inflight' = c
  /\ connected' = TRUE
  /\ lastReject' = "ok"

\* Non-connect Op requires connected and free slot.
StartOp(c, op) ==
  /\ op \in Ops \ {"connect"}
  /\ connected
  /\ inflight = Free
  /\ inflight' = c
  /\ lastReject' = "ok"
  /\ UNCHANGED connected

Finish(c) ==
  /\ inflight = c
  /\ inflight' = Free
  /\ UNCHANGED <<connected, lastReject>>

\* Reject when another op is in flight.
RejectBusy(c, op) ==
  /\ op \in Ops
  /\ inflight # Free
  /\ lastReject' = "busy"
  /\ UNCHANGED <<connected, inflight>>

\* Reject non-connect ops when disconnected.
RejectDisconnected(c, op) ==
  /\ op \in Ops \ {"connect"}
  /\ ~connected
  /\ inflight = Free
  /\ lastReject' = "disconnected"
  /\ UNCHANGED <<connected, inflight>>

\* Device drops (ADB offline) — only when idle.
DisconnectIdle ==
  /\ connected
  /\ inflight = Free
  /\ connected' = FALSE
  /\ UNCHANGED <<inflight, lastReject>>

Next ==
  \/ \E c \in Clients : StartConnect(c)
  \/ \E c \in Clients, op \in Ops : StartOp(c, op)
  \/ \E c \in Clients : Finish(c)
  \/ \E c \in Clients, op \in Ops : RejectBusy(c, op)
  \/ \E c \in Clients, op \in Ops : RejectDisconnected(c, op)
  \/ DisconnectIdle

Spec == Init /\ [][Next]_Vars

(*************************************************************************)
(* Invariants                                                             *)
(*************************************************************************)

\* ¬(two concurrent ops on same serial)
Inv_AtMostOneInflight ==
  inflight = Free \/ inflight \in Clients

\* no op when disconnected: disconnected ⇒ idle
Inv_DisconnectedImpliesIdle ==
  ~connected => inflight = Free

\* Reject reasons are only the modeled ones.
Inv_RejectReason ==
  lastReject \in {"ok","busy","disconnected"}

\* If someone is in flight and it was not a connect-in-progress that
\* just set connected, connected must be TRUE. StartConnect sets both
\* in one step, so: inflight # Free ⇒ connected.
Inv_InflightImpliesConnected ==
  inflight # Free => connected

=============================================================================
