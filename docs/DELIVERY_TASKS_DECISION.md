# Where delivery tasks live

For Yash and James. Written 13 Oct 2026. Covers item 0c, and follows `TASK_SOURCE_HANDOVER_FOR_YASH.md` (decision X-13).

## The decision

**The delivery work lives in the tables Coxa already owns: obligations, with the screens you are building for them. No second task system is started now.** Whichever tool is ever added, the obligation stays in Coxa; the tool would hold a working copy, as the task-source adapter already provides.

I would revisit this only if the delivery team will not work in Coxa day to day and asks for boards or notifications in a tool they already use. If that happens, the first candidate is **Pipedrive Projects**, not Plane, because it needs no new system and the add-on appears to be enabled on the club's account (see below).

## Why

1. **It already does what the delivery team needs, and it is tested.** An obligation has an owner, a due date in force (with the history of moves), proof (link, stored file or statement), a second person's acceptance, a match to group the work around, the sponsor's own acceptance, a proof pack, and the status the sponsor sees. All of that was built and run on the real database on 12 Oct. An outside tool would show a copy of a few of those fields and still need Coxa for the rest.
2. **A second place to look is the risk the task-source work was built to avoid.** The guards in `tests/db/task-sync.test.ts` fail the build if a second task store appears. Starting one now would mean the match-week and proof screens depend on a tool's quirks.
3. **The options are not ready to depend on.**

| | Pipedrive Projects | Plane | Tables Coxa owns |
|---|---|---|---|
| Already running | The Projects endpoint answers on the club's account (an empty list: no projects yet) | No workspace exists | Yes |
| API maturity | Launched as a **public beta** in Oct 2023; Pipedrive's announcement says endpoints may change before full release. Needs the Projects add-on. A task belongs to exactly one project | Work items can carry `external_id` and `external_source` (seen in Plane's community MCP server; the official reference was not confirmed) | Ours |
| Safe to repeat a create | **Not known.** No idempotency key was found; the adapter would keep our key in a custom field and look it up first | **Not known.** Whether a duplicate `external_id` is refused, upserted or allowed was not found | Yes (unique source key per contract) |
| Change feed | Not checked | Webhooks v2, with fields meant for de-duplication | Not needed |
| What it adds to run | Nothing new; same login as the CRM | Another service to host, back up and secure (or a paid cloud plan; price not checked) | Nothing |

## The short test

**Run:**
- The task-source contract (create twice makes one task; an update to a missing task fails loudly; changes come back oldest first with stable ids; an outside change never edits an obligation) passes against the in-memory adapter. It is in `tests/db/task-sync.test.ts` and runs with the rest of `npm run test:db`.
- The whole Priority 8 flow (match, proof, accepts, pack) ran on the real database with no second task system.
- A read-only call to the club's Pipedrive confirmed the Projects endpoint is reachable.

**Not run, and why:** creating a project and a task in Pipedrive Projects would write to the club's real CRM, so it needs someone to say yes. Plane has no workspace to test against. Neither was tested; the table above says so where something is unknown.

**The test to run if the question comes back** (about an hour once a sandbox project exists): in a throwaway Pipedrive project, (1) create a task twice with the same key and see whether one or two appear; (2) update it; (3) complete it inside Pipedrive and see the event arrive in the inbox; (4) delete it inside Pipedrive and see it reported, not applied; (5) run `adapterContractCases` against the new adapter. Pass means all five. A failure at step 1 means the adapter must keep our key in a custom field and look it up first, which is workable but should be known before committing.

## Needs James / Yash

- Confirm the decision (it closes X-13 for now).
- If you want the Pipedrive Projects test run, say so, and it will be done in a project named so it is obvious, and removed afterwards.
