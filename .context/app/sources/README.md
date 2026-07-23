---
name: Reclaim Your Week — source documents (read-only)
description: The five original documents behind the build. Never edit these; they are the authority every other doc is checked against.
parent: ../README.md
---

# Source documents — read-only

These are the five documents the whole build derives from, checked in **byte-identical** to the
originals. **Never edit them.** They are not working documents; they are the authority.

| File                                  | Author  | What it is                                                                 |
| ------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `Reclaim_Your_Week_Brief_for_John.md` | Rashmir | **Authoritative.** Her answers to the proposal, plus amendments of her own |
| `Time_Audit_App_Notes.md`             | John    | The original proposal the Brief responds to — superseded where they differ |
| `Time_Audit_Tool_Prompt_Text.md`      | Rashmir | The Claude Project system prompt — the content and phase flow              |
| `Time_Audit_Tool_Setup_Guide.md`      | Rashmir | The user-facing setup guide — source of the reassurance register           |
| `Time_Audit_Tool_User_Prompts.md`     | Rashmir | The three copy-paste user prompts (first time / resuming / returning)      |

## Precedence

1. **The Brief wins over the system prompt** where they conflict. It is later, and it is Rashmir
   deciding rather than instructing an AI. The persona change (I1) is the clearest case: the system
   prompt is written in the first person as her; Brief §4 overrides it.
2. **The system prompt wins over the App Notes.** The Notes are John's proposal; the Brief is the
   answer to it. Where the Notes propose something the Brief did not endorse, the Brief governs.
3. **`sources/` wins over `content-source.md`.** That file is a working extract. If the two
   disagree, the extract is wrong.

## Why these are in the tree

Until 2026-07-23 these lived outside the repo, and `content-source.md` was the diff target for
every "verbatim" claim. That put the chain of custody one hop short: the F2 t-3 guard compared
`content-source.md` against `Module.config` and had nothing to anchor `content-source.md` itself
against. A machine diff run the day they were checked in found nine altered blockquotes, three of
them material, including fabricated Outlook export steps that appear in no source document.

All of those would have passed the guard green. With the sources in the tree the guard runs two
hops — `sources/` → `content-source.md` → `Module.config` — and I11 becomes mechanical rather than
aspirational.

## Checking

```bash
npm run leaf:content-diff    # 1. these files still match CHECKSUMS.txt
                             # 2. every blockquote in content-source.md is verbatim in one of them
```

`CHECKSUMS.txt` is what makes "read-only" enforced rather than requested. These files are also in
`.prettierignore`: a `prettier --write` across the tree came within one commit hook of reformatting
them, which would have moved the authority without anyone noticing.

Legitimate exceptions the check tolerates, and nothing else:

- **Bracketed substitutions** — `[The tool]` for "Claude", `[helps]` for "to help", marking a
  re-point from first to third person (I1). Always visible in the text.
- **Markdown emphasis** added for scanning (`**composite**`), which changes no words.
- **Marked truncation** with a trailing ellipsis.

A paraphrase is not an exception. If a passage needs rewording to be usable, quote it verbatim and
put the reworded version alongside it as commentary, clearly not a quote.

## If Rashmir sends a new version

Replace the file, regenerate the manifest, re-run the check, and reconcile `content-source.md`
against it:

```bash
cd .context/app/sources && shasum -a 256 *.md | grep -v ' README.md$' > CHECKSUMS.txt
```

Do not edit a source file in place to match the extract — that inverts the whole point.
