# CRM decision: Pipedrive stays; Twenty is a later, small pilot

For James and Yash. Written 13 Oct 2026. Covers item 0a.

## The decision

- **Pipedrive stays the sales CRM.** Nothing is replaced.
- **Twenty is a small internal pilot, later, and only now that the Pipedrive adapter exists** (step 3, below). It is not the first task.
- `frontend/lib/pipedrive/` and `/crm-sync` stay where they are. No Twenty client has been written.

James recommended this first step; this records it so it is not re-argued.

## Why this order

The platform could not safely talk to *any* CRM before. It found a deal by searching Pipedrive for the same title, saved no ID, created no organization when a company was created, could send a `DELETE` to Pipedrive, and reported "synced" even when Pipedrive refused the call. Swapping the CRM underneath that would have moved the same faults to a new system. What was missing was the stored link between a Coxa record and its ID in the CRM, a log of what was sent and who was allowed to send it, and one honest connection status. Those are built, tested and now sit between Coxa and Pipedrive:

| Piece | Where |
|---|---|
| The link (Coxa record, system, kind of object, the CRM's ID) | `external_refs` (migration 0069, kind of object added in 0075) |
| Who was allowed to trigger a push | `integration_actions` (0075) |
| What each call did and how it ended | `integration_events` (0075) |
| One connection record all screens read | `integration_health` (0075) |
| The adapter: update by stored ID, create and store the ID, a delete only marks the link removed | `frontend/lib/pipedrive/adapter.ts` |

A second CRM is another adapter with the same shape (`pushOrganization`, `pushPerson`, `pushDeal`, `removeLinks`, `logCrmActivity`), writing links with `system = "twenty"`. The field-ownership table already knows `twenty` as a system name (`lib/sync/field-ownership.ts`).

## What was checked about Twenty (read on 13 Oct 2026)

From Twenty's own LICENSE file and pricing page:

- **Licence.** The core is **AGPLv3**, with an extra permission ("Twenty Application Exception") for applications that talk to it through its published interfaces. **Files marked `/* @license Enterprise */` are not AGPL**: they fall under Twenty's Commercial License, which allows production use only with a valid Enterprise subscription (copying and modifying for development and testing needs none). Some packages (the CLI, SDKs, `twenty-ui`) are MIT.
- **No free hosted plan.** Pricing page: Pro $9 per user per month, Organization $19, Enterprise from $50,000 a year; a free trial, and "self-host the open source core for free".
- **Where the features Yash named sit.** User roles and field-level permissions are in Pro. **Row-level permissions, audit logs and single sign-on are only in Organization and above.** REST and GraphQL API are in every plan, rate-limited (50 calls a minute on Pro, 100 on Organization).

**Not verified, and it matters:** which of those features are in the free self-hosted open core and which are the `@license Enterprise` files. The licence file does not list them. Before the pilot relies on permissions or audit, someone must look in the repository for those markers on the permission and audit code. Until then: **assume permissions and audit are not available for free.**

## The pilot, when it happens

Only after James agrees, and only inside the team.

1. Write a `twenty` adapter with the same five functions, writing `external_refs` with `system = "twenty"`. No change to the link, log or health tables.
2. Push **a few companies and deals** through it: about 5 companies and 10 deals, chosen by hand. Never all companies at once.
3. Judge it on: no duplicate created on a repeated push; a push that fails is shown as failed; a deleted record leaves a removed link and no deleted object; the API limit is not hit by a normal day's pushes; what the team actually gets from it that Pipedrive does not give them.
4. Decide on that evidence. Pipedrive keeps running throughout; the pilot reads nothing from it and changes nothing in it.

## Checked against the club's real Pipedrive (13 Oct 2026, read-only)

Nothing was created or changed in Pipedrive. These are the findings, and they shaped the build:

- **The API key works** (Pipedrive answered who it belongs to: the account "Coritiba"). The Projects add-on appears to be enabled: the Projects endpoint answered with an empty list.
- **None of the 44 deal IDs stored in Coxa exist in Pipedrive** (42 in a column, 2 in JSON; every one answers "not found"). Pipedrive holds 1,105 deals and not one of those IDs. Copying them blindly as links would have made every later push of those proposals fail, so the migration copies no data. A person runs the checking tool instead (`POST /api/crm/link-existing`): it links only IDs Pipedrive confirms, and the rest simply get a new deal the next time something pushes them.
- **All 35 stored organization IDs exist; 31 carry the same name as the Coxa company, 4 do not** (for example "Banco Itaú" is organization "Banco Itaú Test", "Ambev SA" is "Ambev"). The tool links the 31 and lists the 4 for a person to decide.
- **Pipedrive has 747 organizations; Coxa has 565 companies and only 35 with an organization ID. 17 companies without one already exist in Pipedrive under their exact name** (for example WEG Automação, Sicredi Paraná, Pipefy). If the adapter simply created an organization for each, the club's real CRM would get duplicates. So the tool only *suggests* those pairs; a person confirms each one.

## Needs James

- Confirm: Pipedrive stays, Twenty is a later pilot as described.
- Have someone run the link-checking tool once (dry run first), look at the 4 differently-named organizations and the 17 suggested pairs, and confirm which are the same company. Do this **before** pushes go live on the production server, or each of those companies gets a second organization the first time one of its proposals is pushed.
- Everything in this change was tested against a stand-in for Pipedrive and against the real database; the first supervised push to the real Pipedrive has not been made.

Sources: Twenty's [LICENSE](https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE) and [pricing page](https://twenty.com/pricing), read 13 Oct 2026.
