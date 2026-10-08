# Agent runtime: what we adopted (LangGraph, Langfuse), what we did not (Temporal), and why

For the people who decide how the platform's agents run, and the engineers who maintain them. Covers task 31.
Everything described as built was tested; the evidence is named. Where I am unsure, it says so.

## The decision in one table

| Tool | Decision | For what | Where it lives |
|---|---|---|---|
| **LangGraph.js** | **Adopted** | Each agent is a graph of steps; progress is saved after every step; a run can wait for a person for days and be carried on after a crash. | `frontend/lib/agents/langgraph/` |
| **Our own Postgres** | **Adopted, and it is the source of truth** | The saved steps, the run registry, and (separately) the approval state machine for anything with an outside effect. | migrations 0070, 0072 |
| **Langfuse** | **Adopted, off until keys are set** | A trace per agent run, a span per step, every model call, and scores for what people decide and how gates went. | `frontend/lib/observability/` |
| **Temporal** | **Not adopted** | Would add durable timers, retries and workflow versioning. Nothing we run needs them yet. Triggers for revisiting are listed below. | n/a |
| **n8n** | **Unchanged: internal schedulers only** | Calls our `/api/*` endpoints with the shared secret. Not exposed to customers. | n/a |

## Why LangGraph, and what exactly it does here

The platform's agents are not one long conversation. They are short chains of steps with a long pause in the middle: research,
draft a proposal, *wait for a person to approve it (hours or days)*, draft the email, make a send plan, *wait for a person again*.
Before this work the Outreach Agent was a model loop told to call three tools in order, with the "waiting" done by hand-managed status
columns, and the other four agents ran start to finish in one go: if the process died, they started over.

What LangGraph gives us, and what we use:

- **A step is a unit that is saved.** After each step the whole state is written down. A run that dies resumes from its last finished step.
- **`interrupt()`** pauses a graph at a question and resumes it, in a later request, with the answer. The two approvals are real interrupts now.
- **A thread id** names a run. Ours is `<tenant>:<agent>:<subject>`, so one club can never read another club's run.

What we did **not** take from it:

- **Its Postgres or SQLite checkpointer packages.** We wrote our own (`SupabaseCheckpointSaver`) over our own tables. The state of a club's runs stays in the club's database, under the same access rules, backups and tenant isolation as everything else; no new service, no new connection string.
- **The idea that checkpointing makes an outside effect safe.** It does not, and the research this task came from says so. A checkpoint lets a run resume, which means a step can run **twice**. So no graph step ever sends an email. The send is a *plan* a person approves, and it runs through the action broker, whose database rules guarantee it runs at most once and that an unknown outcome is never run again. The graph only waits for that decision.

### What was built

- `postgres-saver.ts`: the checkpointer, bound to one tenant when it is made (not read from the request).
- `runtime.ts`: starting a run, answering its question, carrying on a failed run, cancelling, and finding runs whose process died. A run has a status the **database** guards: a cancelled or finished run cannot be resumed, even by buggy code.
- `outreach-graph.ts`: the Outreach Agent as a graph with two waits. Its tool order is now fixed in code rather than asked of a model. That removes one prompt-injection route (research text cannot redirect which tool runs next) and one model call per run.
- The four other agents (renewal, reporting, pipeline hygiene, negotiation) were restructured to one step per contract or per item, so a crash costs at most one item instead of the whole job.
- `/api/agent-graphs/*`: list runs, inspect one, carry a failed one on, cancel with a reason, sweep stuck ones.

### Evidence (all run on a real Postgres engine)

- A run saves state in our tables after each step and waits when it asks (`tests/db/langgraph-runtime.test.ts`).
- Answering carries on without redoing finished steps; a new process, new graph and new connection pick a waiting run up.
- A step that dies leaves the run `failed` with the reason; carrying on redoes only that step (`one` ran once, the failing one twice).
- Two requests cannot resume one run: exactly one proceeds. Starting the same subject twice is the same run.
- A cancelled run cannot be resumed, restarted or written to, and its record stays.
- One club's checkpointer cannot read, write, list or delete another's run, and the database refuses the rows too.
- The Outreach Agent: pause, announce, resume, plan, wait; a process that dies right after making the proposal does **not** make a second one when carried on (`tests/db/outreach-graph.test.ts`).
- Run on the real stack with real logins: see the register for the live-test list.

### Things that behaved unexpectedly (so you do not repeat them)

- **A step that asks a question runs again from its top when answered.** Anything before the `interrupt()` call in that step happens twice. We keep the announcing (saving the status, telling Slack) in a separate step before the one that only asks.
- **Records created inside a step can be created twice** if the process dies between creating the record and saving the checkpoint. The proposal and email-draft steps first look for the one an interrupted attempt already made. The window is small and only ever covers *drafts*, never sends.
- **The checkpointer contract has details** (special writes are replaced, ordinary ones are not; pending sends in older checkpoints). The saver follows the reference implementation and is tested for round-trips, ordering and limits.
- Each approval had to be tied to the question that is open: a late "approve the proposal" must never answer the send plan's question. It is checked.

### Costs and risks of adopting it

- **Version coupling.** We depend on `@langchain/langgraph` 1.4.x and `@langchain/langgraph-checkpoint` 1.1.x, and on their serialized checkpoint format. A major upgrade needs a read of the changelog and the saver tests.
- **Growth.** Every step stores the full state. There is no retention yet (register item): decide how long a finished run's steps are kept.
- **A second way to run an agent exists** (the earlier loop in `orchestrator-legacy.ts`), kept only until migration 0072 has been live for a release. Remove it then.

## Why not Temporal (yet)

Temporal is a workflow engine: code that survives restarts by replaying its history, with durable timers, activity retries and workflow
versioning. It is the right tool when a process must keep running for days *by itself*. Ours do not: they stop and wait for a **person**,
and the person's click is the thing that restarts them. That is exactly an interrupt-and-resume, which LangGraph plus Postgres already does.

What Temporal would give us that we do not have today, and whether we need it:

| Temporal gives | Do we need it now? |
|---|---|
| Durable timers ("remind the approver after 2 days, escalate after 5") | **Not yet.** The 2-day review deadline is detected by a scan (`/api/approvals/recovery/scan`) that is not scheduled yet (register T25-01). A scheduler is a far smaller step than a workflow engine. |
| Automatic retry of a failing external call with backoff | Our external effects are one (send an email) and are deliberately **not** retried automatically when the outcome is unknown. Temporal's retries would be a risk there, not a help. |
| Saga-style compensation across several systems | We have no multi-system transaction. |
| Versioning running workflows across code changes | Our runs are short and waiting runs are few. A version change today fails in-flight *plans* on purpose (an approved plan must not run under different code). |
| Visibility, search, history UI | We have lists and a trace in Langfuse. |

What Temporal would cost: a server and its database to run and back up (or Temporal Cloud, usage-priced; check current pricing), an
extra deployment target on a single small EC2 box, a second programming model (deterministic workflow code), and a second place to
reason about "did it run?" next to the one in Postgres that the audit trail and the approval rules already use.

**Revisit Temporal when any of these becomes true:**

1. An agent must act on its own after a long wait, with no person to restart it (for example "if no answer in 7 days, follow up").
2. We add a second outside effect that needs the first to be undone if the second fails.
3. Runs waiting at once number in the thousands and the sweeper/scan approach is slow or noisy.
4. We need to change the steps of runs that are already waiting, without failing them.

The migration path is open: the approval state machine and the audit trail are in Postgres and do not depend on the agent framework,
so a workflow engine would drive the same tables.

## Langfuse: what is traced, and the privacy line

Langfuse is a trace viewer for model work. It is **off** until `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set; with no keys no
call is made and no code path changes. When on, it never throws and never waits on the network: a Langfuse outage cannot slow or break an agent.

**What a trace is:** one agent run (trace id = the run's thread id, so a run carried on after a crash continues the same trace) with

- a **span per graph step**, with what the step produced;
- a **generation per model call**: model, tokens, cost, latency (every call attached to the run it was made in, without passing anything around);
- an **event when the run waits for a person**, with what it is waiting for;
- **scores**: whether a person approved the proposal, whether the send went out, and how each evaluation gate went.

**The privacy line.** Prompts and replies contain real people (a sponsor's contact, the email they wrote back). Before anything leaves the
platform, `redact.ts` replaces email addresses, phone numbers, CNPJ/CPF numbers and anything shaped like a key or token with a short
fingerprint (the same person gets the same fingerprint, so patterns remain visible and identities do not), and cuts long text.
`LANGFUSE_CAPTURE` chooses how much: `metadata` (no text at all), `redacted` (the default), `full` (only for a Langfuse the club hosts and has
agreed may hold personal data). **Decision for James:** is a cloud Langfuse acceptable at `redacted`, or must it be self-hosted? Until
decided, leave it off or use `metadata`.

**How to use it for quality**, which is the point of the instrument: look at *runs that a person rejected or edited*, and at the evaluation
cases that failed, read what the model actually wrote, and turn what you learn into a fixture in `lib/evals/fixtures/`. Do not judge the
agents on demo prompts; the evaluation fixtures are real commercial situations (see `AGENT_EVALUATION_GATES.md`).

## n8n

Unchanged and fine as an internal scheduler that calls our endpoints with the shared secret. Its Sustainable Use License is not OSI open source,
so **if a customer ever configures it directly** (rather than the club's own staff running an internal job), it needs a real license review first.
Nothing in the platform exposes it to customers.

## Open decisions and follow-ups

- Langfuse hosting and capture level (above). James.
- Retention for finished runs' saved steps. James / Abhishek.
- Schedule for the sweeps (stuck runs, stuck actions, blocked approvals, expired idempotency keys). One scheduler job; register T20-05, T25-01, T28-02.
- Remove the earlier orchestrator after 0072 has been live for a release.
- Port the remaining agents' external effects (CRM notes, paid enrichment) onto the broker if they should need approval (register T26-05).
