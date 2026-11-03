# Email delivery through Amazon SES

Written 3 Nov 2026. Before this, the newsletter's "Send Now" saved a row marked "sent" and delivered nothing, and the unsubscribe link could not be opened by a logged-out reader. This is the delivery engine that replaces that.

## What it does

| Mail | How it goes out | From | Replies go to |
|---|---|---|---|
| Newsletter (`/newsletter`) | One message per person through SES, each with that person's own signed unsubscribe link and one-click `List-Unsubscribe` headers. "Schedule for later" is honoured (time without a zone = Brasília). | `Coritiba FC Patrocínios <patrocinio@mail.sponsorship.coritiba.com.br>` | `MAIL_REPLY_TO` (the club's shared mailbox); until it is set, the person who sent it |
| Sponsor portal login link | SES when `MAIL_PROVIDER=ses`, otherwise the connected Gmail as before | `nao-responda@mail.sponsorship.coritiba.com.br` | none |
| Bounces and complaints | Amazon SES → SNS topic `sponsorship-ses-feedback` → `POST /api/ses/events` | | |

- A **permanent bounce** or a **complaint** puts the address on the do-not-contact list (reason `bounce` / `complaint`), so no newsletter, outreach or sequence mails it again. A person who **unsubscribes** is put on the same list (`asked_to_stop`).
- A newsletter says **sent** only when Amazon SES accepted the mail. A recipient SES refused is `failed` (the newsletter is `partial`); if none is accepted it is `failed`. Per recipient: `queued → accepted → delivered / bounced / complained`, or `failed` / `skipped`.
- Outreach emails ("Mark as Sent in Pipedrive") are unchanged: they still only log in the CRM. Sending those is a separate decision.

## Settings (`frontend/.env.local`)

| Setting | Value |
|---|---|
| `MAIL_PROVIDER` | `ses` switches real sending on. **Leave it empty until the domain is verified** (the newsletter then answers 503 "not switched on" instead of pretending). |
| `MAIL_FROM_DOMAIN` | `mail.sponsorship.coritiba.com.br` (the default) |
| `MAIL_REPLY_TO` | the club's shared mailbox, for example `patrocinio@coritiba.com.br` (must exist) |
| `SES_SNS_TOPIC_ARN` | `arn:aws:sns:us-east-1:180536781258:sponsorship-ses-feedback` (the default) |
| `UNSUBSCRIBE_SECRET` | optional; defaults to `SESSION_SECRET` |

Credentials are **not** settings: the app asks the server's IAM role (`sponsorship-ses-send-role`) directly. The old `AWS_ACCESS_KEY_ID` in `.env.local` is dead and must not be used for SES; the code ignores it. The role may only send from `*@mail.sponsorship.coritiba.com.br`, which is why every From address is on that subdomain.

## Switching it on (in this order)

1. **Database.** Run `supabase/migrations/0077_mail_delivery.sql` in the Supabase SQL editor (new columns on `newsletters`, tables `newsletter_deliveries` and `mail_feedback_events`).
2. **DNS.** Coritiba IT adds the 3 DKIM CNAMEs and the MX and TXT records for `bounce.mail.sponsorship…`. Check the identity shows **Verified** in SES.
3. **Deploy**, set `MAIL_PROVIDER=ses` and `MAIL_REPLY_TO`, restart.
4. **Scheduler.** Add one line to the server's crontab so scheduled newsletters (and a send cut off by a restart) are picked up every minute:
   `* * * * * curl -s -m 280 -X POST -H "x-internal-secret: $(grep ^INTERNAL_API_SECRET= /home/ubuntu/Market_Sponsorship_Automation/frontend/.env.local | cut -d= -f2-)" http://127.0.0.1:3000/api/internal/newsletter-dispatch > /dev/null`
5. **Bounce handler.** In SNS, subscribe `https://<the app's public address>/api/ses/events` (HTTPS) to the topic `sponsorship-ses-feedback`. The app confirms the subscription by itself (it opens Amazon's confirmation link, after verifying Amazon's signature). Check the subscription shows **Confirmed**. If the address changes later (ngrok → the club domain), subscribe the new one and delete the old.
6. **Ask Rushendra** to also send **Delivery**, **Reject** and **Delivery Delay** events to the topic. Today only bounces and complaints arrive, so a recipient can reach `accepted` but never `delivered`.
7. **Test:** send a newsletter to two inboxes you own; check both arrive, from the right name, with a working unsubscribe link; click it, confirm, and send again: the second send skips that address.

## Safety notes

- `/api/ses/events` has no login (Amazon cannot have one). It accepts only a message whose signature verifies against a certificate on an `sns.<region>.amazonaws.com` host **and** whose topic is ours; everything else is refused before any data is read.
- The unsubscribe link is signed (HMAC) and names one address in one club, so it cannot be edited to remove someone else. Opening it only shows a page; the person confirms with a button (mail programs and scanners open every link). It works from a logged-out browser (it was not reachable before).
- A recipient who unsubscribed or bounced after a newsletter was queued is skipped at send time.
- Two runs at once cannot send the same person twice; a restart in the middle resumes after 5 minutes and mails only those still queued.

## Tests

`npm run test:mail` (SES request shape against a stand-in server, retries, the signature checks with a throwaway certificate, bounces and complaints against a real Postgres engine, and the public-surface list).
