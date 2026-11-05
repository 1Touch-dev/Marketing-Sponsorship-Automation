# AI provider fallback (Bedrock → Anthropic → OpenAI)

Every text call to Claude goes through two functions in `frontend/lib/bedrock/client.ts`:
`invokeClaude` (plain) and `converseWithTools` (tool-use loops, used by the agents). Both now try, in order:

1. **AWS Bedrock** — `BEDROCK_MODEL_ID` (the AWS keys are dead on this deployment, so this normally fails once, then is skipped).
2. **Direct Anthropic API** — `ANTHROPIC_API_KEY`, `claude-sonnet-4-6`.
3. **OpenAI** — `OPENAI_API_KEY`. Plain calls: `OPENAI_TEXT_MODEL` (default `gpt-6.1-sol`). Tool turns: `OPENAI_TOOL_MODEL` (default `gpt-6.1-terra`).

A step is only used when it is configured. The **last** configured step is always tried, so a real error still reaches the caller.
A provider that just failed is skipped for 10 minutes (`ProviderBreaker`), so a disabled Anthropic org costs one failed call, not one per request.
If every step fails, the error lists each one (`All AI providers failed — aws_bedrock: … | anthropic_direct: … | openai_text: …`).

No caller changed: the fallback lives entirely in the shared client. Image generation is separate (`lib/media/openai-*`) and untouched.

## Why two OpenAI models
Found in a live test on 5 Nov 2026: `gpt-6.1-sol` and `gpt-6-astra` refuse function tools on the Chat Completions endpoint
(they only accept them on `/v1/responses`), and do not accept `reasoning_effort: none`. `gpt-6.1-terra`, `gpt-6-luna` and `gpt-5.5` accept tools.
Tool turns therefore use Terra with `reasoning_effort: none` (`OPENAI_TOOL_REASONING_EFFORT`). If OpenAI changes a model's rules, the client drops a
rejected `temperature` / `reasoning_effort` and retries once; set `OPENAI_TEXT_MODEL` / `OPENAI_TOOL_MODEL` to move to another model.

## Cost and the ledger
Each OpenAI call is written to `spend_ledger` with `category=bedrock_text` (so the daily cap and the dashboards count it), `provider=openai_text`,
`metadata.api=openai_fallback` and `metadata.model`. Rates per million tokens (input / output / cached input): Sol 2 / 10 / 0.10,
Terra 1 / 5 / 0.05, Luna 0.1 / 0.5 / 0.01, Astra 10 / 50 / 1 (`lib/ai/cost-controls.ts`; unknown models use `OPENAI_TEXT_*_PER_MTOK`).
Claude's prompt caching does not apply to OpenAI calls (OpenAI caches automatically; cached tokens are billed at the cached rate).

## Known differences
- A different model writes the answer, so wording and Portuguese quality can differ from Claude. Tool-using agents are the most sensitive.
- Agent loops that start on Claude and continue on OpenAI (after a failure mid-loop) carry over the tool history; ids are passed through unchanged.

## Tests
`npm run test:ai-fallback` (chain order, breaker, message/tool translation, retries, key scrubbing, cost). The unit tests use a mocked `fetch`;
the live behaviour was also checked against the real OpenAI API with Bedrock and Anthropic forced to fail.
