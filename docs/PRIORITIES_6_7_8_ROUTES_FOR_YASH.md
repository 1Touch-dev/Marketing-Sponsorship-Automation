# Priorities 6, 7 and 8: what exists, so you can build the screens

For Yash. Migrations 0073 and 0074 must be applied. Everything below is built, tested and was run against the real database. Decisions still open with James are marked.

## Priority 7: the sponsor sees the approved version

No new route. These already answer from the frozen revision (`proposals.approved_revision_id`), not the live text:

- the sponsor portal (`GET /api/portal/proposals`, `/api/portal/proposals/<id>`)
- the public link `/proposals/view/<token>`

Each proposal the sponsor gets carries `approval_frozen` (false for a proposal approved before revisions existed) and `approved_revision_number`. Show the revision number rather than the live `version`; the portal already sends the right one in `version`.

Visibility: approved, sent, active contract, **and** a proposal being re-reviewed after an edit *if it has an approved revision* (the sponsor keeps the approved version, decision P7-02). A draft, or one never approved, is a 404 to everyone except a signed-in member of that club, who can preview it on the public link.

**Staff action:** `POST /api/proposals/freeze-approved` `{ dry_run?, limit? }` (permission `approve_proposal`). Freezes the wording that older approved proposals have now. Run `dry_run` first. It is a person saying "this is what was approved", so there is no button that does it silently.

## Priority 6: campaign revisions

- `POST /api/campaigns/<id>/preapprove` `{ preapproved: true }` now also freezes the campaign's wording and package as a revision and returns `revision_number`.
- `GET /api/campaigns/<id>/revisions` → `{ revisions: [...newest first], approval: { state, valid, message, revision_number? } }`. `state` is `not_preapproved`, `valid`, `expired` (it changed since) or `unfrozen` (pre-approved before this existed).
- `PATCH /api/campaigns/<id>/inventory` returns `preapproval_expired: true` when the change ended a pre-approval.
- The batch runner (`POST /api/agents/outreach/batch`) refuses with 409 and `approval_state` unless the state is `valid`. The campaign page already shows the reason and drops the "pre-approved" badge.

## Priority 8

**A match on an obligation** (does not move any date; decision T16-02 is James's)
- `PATCH /api/obligations/<id>` `{ match_id: <uuid> | null }`
- `GET /api/obligations?match_id=<uuid>` and `?group_by=match` (adds `groups: [{ match, obligations }]`, soonest match first, work with no match last)

**Proof that is a stored file**
- `POST /api/obligations/<id>/proof-files` (multipart, field `file`): PDF, PNG, JPEG, WebP, GIF or MP4, up to 15 MB. Returns `{ id, file_name, content_type, size_bytes, sha256 }`. The type is read from the bytes, not from what the browser says.
- Then record it: `POST /api/obligations/<id>/events` `{ action: "evidence", evidence_kind: "file", evidence_ref: "<that id>" }`. A `file` proof is now always an uploaded file's id (a link is `evidence_kind: "link"`).
- `GET /api/obligations/<id>/proof-files` lists them; `GET /api/obligations/<id>/proof-files/<fileId>` gives a 5-minute download address.

**What the sponsor sees** (`GET /api/portal/delivery`): each item now has
- `proof_detail`: `{ kind: "link"|"statement"|"file", link?, statement?, file?: { id, name, size_bytes, content_type, sha256 }, recorded_at }`, only once the club's second person has accepted it (until then `proof: "pending"`, `proof_detail: null`)
- `match`: `{ id, opponent, match_date, competition, home_away }` or null
- `sponsor_acceptance`: `{ accepted_at, accepted_by, note }` or null, and `can_accept`
- `GET /api/portal/delivery/<id>/proof/<fileId>` → `{ url, expires_in_seconds, name, sha256 }`
- `GET /api/portal/delivery/pack/<contractId>` → a zip (`index.json` and the files)

**A sponsor accepting** (decision T16-04 is James's: it is recorded separately and changes no status)
- `POST /api/portal/delivery/<id>/accept` `{ note? }` with `Content-Type: application/json`, from the portal's own pages. Accepting twice returns the first record with `already: true`. It accepts the proof as it stands: if the work is reopened and proven again, the sponsor accepts again.
- Staff pack, same contents: `GET /api/contracts/<id>/proof-pack`.

**Artwork versions**
- `GET /api/companies/<id>/logo-versions` → `{ versions: [...], images: { current_version, current, stale: [{ job_id, display_label, used_version, ... }], unknown } }`. `stale` are images made from a logo that has since been replaced; `unknown` were made before versions were recorded.
- `POST /api/companies/<id>/logo-versions` copies any version not yet copied into storage (the original address can stop working).
- Replacing a logo by any route records the next version automatically (the database does it).
