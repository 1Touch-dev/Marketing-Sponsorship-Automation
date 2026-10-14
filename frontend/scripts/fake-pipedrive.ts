/**
 * Runs the Pipedrive stand-in (tests/helpers/fake-pipedrive.ts) as a local server, so the app can be checked end to end
 * without touching the real Pipedrive account:
 *
 *   npx tsx scripts/fake-pipedrive.ts 4010
 *   PIPEDRIVE_BASE_URL=http://127.0.0.1:4010/v1 PIPEDRIVE_API_KEY=test-key npx next start
 *
 * GET /__calls shows everything it was asked; POST /__reset clears it; POST /__fail-next {count,status,error} makes the next
 * calls fail; POST /__key {key} changes the key it accepts.
 */
import { FakePipedrive } from "../tests/helpers/fake-pipedrive";

const port = Number(process.argv[2] ?? 4010);
new FakePipedrive().listen(port).then(() => console.log(`Pipedrive stand-in listening on http://127.0.0.1:${port}/v1 (key: test-key)`));
