**Scope notes.** Every OpenRouter point was read on the docs on 2026-11-10 unless marked. The CORS and catalogue figures come from read-only curl probes of the public API. Clarkesworld's submissions page contains hidden text addressed to LLM bots; I ignored it.

## Conclusions

1. **Design:** the best-regarded pattern is writer-directed, small-grain generation with context the writer can see and edit. User-sentiment evidence is weak (secondary roundups only).
2. **Evidence:** the studies support ideas and options on demand better than drafted prose. No controlled trial of AI, or of freewriting, for blocked fiction writers was found.
3. **Rules:** every rule reduces to one feature: a per-span provenance record (human-typed, AI-generated, AI-generated then edited) that survives editing and can be exported.
4. **OpenRouter:** a pure browser PWA is workable. The limits are that the app cannot set a spend limit in the browser PKCE flow, the credits endpoint needs a management key, and assistant prefill is model-dependent.

## 1. Products

- **Sudowrite** (credits; $10/$22/$44 a month; no BYOK shown, [pricing](https://www.sudowrite.com/pricing)):
  - Features: Write (Auto, Guided, Tone Shift), Describe, Rewrite, Expand, Brainstorm, Story Bible to outline to draft, Chat, Feedback, plugins ([docs](https://docs.sudowrite.com/)).
  - Context: Write reads up to 20,000 words before the cursor, up to 20,000 more from linked earlier chapters, and Story Bible fields.
  - Output: 1–6 cards the writer inserts; inserted text stays purple until edited ([Write](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY)).
  - A "Saliency Engine" auto-selects character and world cards; the docs admit it can leak a hidden motive early ([docs](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/saliency-engine/4KL8gFeLZNvk8CEeXpfwB2)).
- **Novelcrafter** ($4–$20 a month, BYOK only, AI from the $8 tier, [pricing](https://www.novelcrafter.com/pricing)):
  - Features: scene beats, workshop chat, text replacement, summarisation, character extraction, custom prompts, prompt preview ([features](https://www.novelcrafter.com/features)).
  - Each Codex entry is set to always, when detected, don't when detected, or never.
  - Assembly order: mentions, manual scene references, POV character, global entries, then child entries ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting)).
- **NovelAI** ($10/$15/$25, unlimited generation, up to 28,672 tokens of context, [tiers](https://docs.novelai.net/en/subscription/)):
  - Pure continuation with a lorebook: activation keys, search range, token budgets, insertion order, and a context viewer ([lorebook](https://docs.novelai.net/en/text/lorebook/)).
  - Text is coloured by origin (prompt, AI, edited AI, typed), with branching history and retry ([editor](https://docs.novelai.net/en/text/editor/)).
- **Raptor Write:** free; the OpenRouter key and the work are stored in the browser. Unverified on a primary source ([review](https://www.codingem.com/raptorwrite-ai-review/)).
- **Lex:** feedback-first, with chat, inline "Ask Lex" comments, Checks, style guides and knowledge bases ([FAQ](https://lex.page/faq)). Pricing unverified.
- **Screenwriting tools:**
  - WriterDuet sells ScreenplayProof, AI proofreading with accept/reject per suggestion at $20–$30 a script ([help](https://writerduet.helpscoutdocs.com/article/386-screenplayproof-paid-feature)).
  - Arc Studio has an AI research assistant beside the script ([blog](https://arcstudiopro.com/blog/notes-and-ai-research-assistant)).
  - Final Draft's homepage advertises no generative AI ([site](https://www.finaldraft.com/)).
  - Ellipsus commits to no generative AI on its platform ([stance](https://ellipsus.com/generative-ai)).
- **Open source:** Writingway and [magicNovel](https://github.com/evilrender23/magicNovel) surfaced in search; maintenance and licence are unverified.
- **Praise and complaints** (secondary only, [example](https://diyai.io/ai-tools/reddit/best-ai-writing-tools-on-reddit/)): Sudowrite is easy but credits run out; Novelcrafter gives control but needs prompt work; all tools draw complaints about flat, repetitive prose; mainstream models refuse dark or explicit fiction.
- **Best versus gimmick** (my synthesis, not a measured consensus):
  - Best: beats to prose, several candidate cards, inline describe/rewrite, prompt preview or context viewer, per-entry context rules, origin colouring.
  - Gimmick-prone: one-click chapter drafting, and opaque automatic context selection.

## 2. Evidence

| Study | Sample | Finding |
|---|---|---|
| Ippolito et al. 2022, Wordcraft ([arXiv](https://arxiv.org/abs/2211.05030)) | 13 professional writers | Useful for ideas, details, worldbuilding and research; failed at keeping voice and understanding the story. |
| Yuan et al., IUI 2022 ([DOI](https://doi.org/10.1145/3490099.3511105)) | sample unverified | Abstract reports suggestions helped writers past blocks. |
| Lee et al., CoAuthor, CHI 2022 ([DOI](https://doi.org/10.1145/3491102.3502030)) | 63 writers, 1,445 sessions | A dataset paper; whether GPT-3 counts as a good collaborator depends on the definition used. |
| Doshi & Hauser 2024 ([DOI](https://doi.org/10.1126/sciadv.adn5290)) | 293 writers, 600 evaluators | Five AI ideas raised rated novelty 8.1% and usefulness 9.0% (preprint figures); abstract says gains were largest for less creative writers and stories became more alike. Writers' self-ratings did not change. |
| Padmakumar & He, ICLR 2024 ([arXiv](https://arxiv.org/abs/2309.05196)) | sample unverified | Co-writing with InstructGPT reduced diversity, driven by the model's text. |
| Dhillon et al., CHI 2024 ([arXiv](https://arxiv.org/abs/2402.11723)) | 131 | Paragraph suggestions improved essay quality, sentence suggestions did not; ownership and satisfaction fell moderately. |
| Zhang, Bu & Dhillon 2026, preprint ([arXiv](https://arxiv.org/abs/2601.10236)) | 176 | Ownership fell about 0.85–1.0 on a 7-point scale; style personalisation restored about 0.43. |
| Hwang et al. 2024 ([arXiv](https://arxiv.org/abs/2411.13032)) | 19 writers, 30 readers | Writers locate authenticity in process; readers were less concerned. |
| Ahmed & Güss 2022 ([DOI](https://doi.org/10.1080/10400419.2022.2031436)) | 146 writers, survey | Four self-reported causes and twelve solutions; not an intervention test. |
| Boice 1983, via Krashen 2002 ([PDF](https://www.sdkrashen.com/content/articles/optimal_levels.pdf)) | academics, N unverified | Scheduled writing tripled output and raised new ideas versus writing "when they felt like it". |
| Haught-Tromp 2016 | 64 and 46 students (secondary summary) | Constraints raised creativity of short rhymes. |

**Thin spots:** the essay studies are not fiction, and most are single sessions. The writer's-block evidence consists of a survey, one small 1983 study of academics and one student experiment. I found no trial of freewriting or timed sessions for blocked fiction writers.

## 3. Rules

- **WGA:** AI output is not literary material. A writer may use AI only with company consent, and companies must disclose AI-generated material they hand over. The 2026 MBA keeps this and adds notice when scripts are licensed for training ([WGA](https://www.wga.org/contracts/know-your-rights/artificial-intelligence)).
- **US Copyright Office:** applicants must disclose AI-generated content that is more than de minimis, exclude it, and claim only human authorship ([guidance](https://www.copyright.gov/ai/ai_policy_guidance.pdf)). Prompts alone do not give sufficient control ([Part 2](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)).
- **Amazon KDP:** AI-generated text must be disclosed "even if you applied substantial edits afterwards". AI-assisted work (brainstorming, editing your own text) needs no disclosure ([KDP](https://kdp.amazon.com/en_US/help/topic/G200672390)).
- **Nicholl 2026–27:** scripts with AI-generated "dialogue, characters, or scene description" are ineligible ([rules PDF](https://www.oscars.org/nicholl-fellowships-screenwriting-program-details)).
- **Clarkesworld:** reported as refusing AI-written or AI-assisted work and banning offenders. Unverified on its own page ([NPR 2023](https://www.npr.org/2023/02/23/1159118948/sci-fi-magazine-stops-submissions-after-flood-of-ai-generated-stories)).
- **SFWA Nebulas:** works wholly or partly LLM-written are ineligible. Unverified on a primary source ([TechCrunch](https://techcrunch.com/2026/01/25/science-fiction-writers-comic-con-say-goodbye-to-ai/)).
- **Publishers and agents:** the Authors Guild's April 2026 model clause limits publishers' AI use ([AG](https://authorsguild.org/news/use-of-ai-in-publishing-and-new-model-contract-clause/)). Hachette requiring author disclosure is unverified. Duotrope's reported 91.2% "No AI" among listings with a known policy comes from a search snippet ([Duotrope](https://duotrope.com/about/ai-policy.aspx)).
- **EU AI Act Article 50:** applies from 2 August 2026. Providers must mark output machine-readably; deployers must label AI text only when it informs the public on matters of public interest and lacks human editorial review ([Commission](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)). Sources disagree on whether marking for existing systems was deferred to 2 December 2026 ([Ropes & Gray](https://www.ropesgray.com/en/insights/viewpoints/102nfqm/you-talkin-to-me-operationalising-the-eu-ai-acts-transparency-obligations) versus [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)). My reading is that fiction falls outside the deployer duty; whether a BYOK client counts as a provider is unverified.
- **What the app needs:** provenance that persists after edits (KDP requires it; "purple until edited" loses it), a model and prompt log per generation, an idea-versus-text distinction, a per-project "no AI" lock, and an exportable disclosure report.

## 4. OpenRouter API

**Auth**
- PKCE: send the user to `https://openrouter.ai/auth` with `callback_url`, `code_challenge`, `code_challenge_method=S256`, and optionally `key_label` and `state`. Then `POST /api/v1/auth/keys` with `code` and `code_verifier`; it returns `key` and `user_id`. Codes expire in 10 minutes ([guide](https://openrouter.ai/docs/guides/overview/auth/oauth.md), [exchange](https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key.md)).
- Spend limits: keys support credit limits with daily, weekly or monthly resets. But `limit`, `usage_limit_type` and `expires_at` belong to `POST /auth/keys/code`, which needs a management key ([ref](https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code.md)). Whether the consent screen lets the user set a limit is unverified.
- Plain keys: bearer tokens; the docs advise keeping unlimited keys out of client code ([auth](https://openrouter.ai/docs/api_reference/authentication.md)).
- CORS: not stated in the docs. A preflight returned `access-control-allow-origin: *` and allowed `Authorization`, `HTTP-Referer` and `X-OpenRouter-Title`.

**Chat completions**
- Streaming is SSE with `: OPENROUTER PROCESSING` comment lines and a final `[DONE]`. Errors after the stream starts arrive as a chunk with `finish_reason: "error"` under HTTP 200.
- Aborting the connection stops billing only on supported providers: OpenAI, Anthropic, DeepSeek and others, but not Google, Bedrock, Groq or Mistral ([streaming](https://openrouter.ai/docs/api_reference/streaming.md)).
- Structured output uses `response_format` of type `json_schema`; support is per endpoint, so pair it with `provider.require_parameters` ([docs](https://openrouter.ai/docs/guides/features/structured-outputs.md)).
- Tools are OpenAI-style and must be resent on every request ([docs](https://openrouter.ai/docs/guides/features/tool-calling.md)).
- Reasoning takes `effort` or `max_tokens`, plus `exclude`. Reasoning tokens bill as output and can consume `max_tokens`, leaving empty content ([docs](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md)).
- Prefill: end `messages` with an assistant message ([overview](https://openrouter.ai/docs/api_reference/overview.md)). The docs index says the Claude 5.5 migration guide notes prefill was removed, so treat it as model-dependent ([guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-5-5.md), not read in full).
- Caching ([docs](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md)):
  - Automatic for OpenAI, Gemini 2.5+ and others.
  - Anthropic needs `cache_control: {"type":"ephemeral"}`, either top-level or on up to 4 blocks; TTL is 5 minutes or `1h`.
  - Sticky routing keeps the cache warm; setting `provider.order` disables it.
- Every response carries `usage` with `cost` and `cached_tokens`, in the last stream chunk; `/api/v1/generation` gives the same later.

**Catalogue**
- `GET /api/v1/models` returns context length, pricing (including cache read/write), modalities, `supported_parameters`, a `reasoning` object and `top_provider.is_moderated` ([ref](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties.md)).
- The spec lists auth, but the endpoint answered without a key.
- Free models: 13 `:free` ids on the read date. Limits are 20 requests a minute, and 50 a day, or 1,000 a day once 10 credits have been bought ([limits](https://openrouter.ai/docs/api_reference/limits.md)).

**Routing**
- `provider` takes `order`, `only`, `ignore`, `sort`, `max_price` and `allow_fallbacks` ([docs](https://openrouter.ai/docs/guides/routing/provider-selection.md)).
- A `models` array falls back on any error, including moderation refusals, and bills the model actually used ([docs](https://openrouter.ai/docs/guides/routing/model-fallbacks.md)).
- `openrouter/auto` picks the model with no extra fee ([docs](https://openrouter.ai/docs/guides/routing/routers/auto-router.md)).
- Presets (`@preset/slug`) are account-scoped ([docs](https://openrouter.ai/docs/guides/features/presets.md)), so presumably not shareable across users' keys.

**Privacy**
- OpenRouter does not store prompts by default ([docs](https://openrouter.ai/docs/guides/privacy/data-collection.md)).
- Per request, `provider.data_collection: "deny"` and `provider.zdr: true` restrict providers; they can only tighten the user's account settings ([ZDR](https://openrouter.ai/docs/guides/features/zdr.md)).
- If no provider qualifies, the request fails with 503.

**Operations**
- Attribution: `HTTP-Referer`, `X-OpenRouter-Title`, and `X-OpenRouter-Categories` with values such as `creative-writing` or `writing-assistant` ([docs](https://openrouter.ai/docs/app-attribution.md)).
- Key info: `GET /api/v1/key` returns limit, remaining and usage. `GET /credits` needs a management key ([ref](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits.md)).
- Errors to handle: 401, 402, 403 (moderation, with `reasons` and `flagged_input`), 408, 429, 502, 503, and `finish_reason: content_filter` ([errors](https://openrouter.ai/docs/api_reference/errors-and-debugging.md)).
- Moderation: 139 of 469 catalogue models were flagged `is_moderated`, mostly OpenAI (82) and Anthropic (31). The old `:beta` self-moderated variant is no longer documented ([variants](https://openrouter.ai/docs/guides/routing/model-variants/overview.md)).
- SDKs: `@openrouter/sdk` is ESM-only and described as for "any JS or TS runtime"; browser support is not stated explicitly ([docs](https://openrouter.ai/docs/client-sdks/typescript/overview.md)). Python and Go SDKs also exist.

## 5. Models for creative writing and roleplay (read 2026-11-10)

The category leaderboard on [the rankings page](https://openrouter.ai/rankings) did not render for me. The figures below are from `GET /api/v1/models?category=roleplay`; its sort order is undocumented.

| Model | Input $/M | Output $/M |
|---|---|---|
| DeepSeek V4.1 Flash | 0.15–0.30 | 0.60–1.20 |
| DeepSeek V4 Flash | 0.09 | 0.18 |
| GLM 5.3 Flash | 0.15 | 0.50 |
| MiMo v2.6 Pro | 0.44 | 0.87 |
| Gemini 3.8 Flash | 0.75 | 3.75 |
| Gemma 4 31B | 0.20 | 0.40 |
| GPT-6 Luna (moderated) | 0.10 | 0.50 |
| Gemini 4 Argon | 2 | 10 |

Most of the list sits at $0.04–$0.75 input and $0.10–$3.75 output. No Claude model appeared in this category list, and I did not read Claude prices.