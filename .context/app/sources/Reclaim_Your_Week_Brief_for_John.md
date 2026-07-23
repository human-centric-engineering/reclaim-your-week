# Reclaim Your Week

**Brief for John — Time Audit app, v1**

Working title: Reclaim Your Week
Subtitle / landing line: Align your time and energy with what matters most to you.

The name is a working title. It will be tested against real audiences before launch, so please treat it as good enough to build with rather than final branding.

## 1. Intent: what this tool is for

This started as a tool for one client and grew into something with a life of its own. Its job now is threefold, in this order:

**First, it grows my email list.** The free version is a lead magnet for my ideal clients: purpose-driven leaders who are overloaded, doing too much, and not spending enough time on the things that actually move the needle and thus not creating the impact they want to. For it to work, it has to genuinely surprise people with how useful it is. The success measure is not downloads; it is whether people come back, and whether they tell others about it unprompted.

**Second, it opens a door.** Someone who completes the audit should come away curious about what working with me would actually be like. The tool demonstrates my coaching approach rather than pitching it.

**Third, it gathers insight.** Anonymised, aggregate patterns across audits will inform my writing, research, and future product development. Longer term, this is the first of a small portfolio of AI tools for my clients, some standalone, some integrated into programmes.

One principle sits underneath all three: this tool exists to return people to their own discernment, agency, and wisdom. It offers a mirror and some options. The decisions stay with them. That principle should shape every design choice below.

## 2. Answers to your questions

**Who gets access?** For v1, invite-gated: current clients, selected prospects, and the existing testers. The architecture should anticipate open sign-up with email capture, because list-building is the commercial point, but we open the doors deliberately rather than by default. One addition: I would like a referral mechanic, where a user can invite someone else in (see access tiers below). Qualification happens at the setup form rather than by policing referrals, so the set up form needs to include questions related to.

**Cross-client patterns?** Yes. Aggregate, anonymised analysis is genuinely valuable to me, and your proposed admin page for this is welcome. Individual data stays confidential; everyone should be aware and agree to the terms and conditions and privacy policy, which should allow for data to be used in aggregate.

**Consultation offers: where and how?** At the end and in follow-up, never mid-process. The register is invitation, not pitch. The natural offer is a focused session for people who have done the audit, tried to act on it, and found themselves stuck; that is where coaching goes deeper than any tool can. There is no pressure on next steps anywhere in the product: the audit gives one to three concrete actions, the user chooses whether and which. What I'm thinking is the following, some of which will form part of a follow-up sequence for those who register for the tool:

- Free tool (1 round of use)
- Low priced offer (quarterly reviews/more regular usage)
- Higher priced off to include the low priced offer plus a 90-min coaching session

**Knowledge base?** A lovely capability, and one I want to use well rather than quickly. Let's park it for a future iteration: I am consolidating my writing and thinking into a single archive at the moment, and once that is further along, and the tool is built, I will curate a selection from it. Nothing in v1 should depend on it. The nine leadership areas framework itself stays confidential to the system.

**Repeat audits and nudges?** Yes to the trend line per area and to opening each repeat by comparing with the last. The natural cadence is quarterly, which is also the shape of the future paid offer, so nudges should be gentle and quarterly rather than frequent.

## 3. Your proposed defaults and pages

Broadly, yes to all of it, and some of your defaults are better than what I had. Specifically endorsed:

- **Hours per week, not percentages.** Exactly right, and for the reason you give: forcing 100% hides the overwork, which is the thing people most need to see and that testers have benefited from seeing.
- **Required reflection pauses.** Yes. Asking before telling is the coaching spine of the tool; making "what are you noticing?" unskippable protects it.
- **Calendar upload optional, parsed into totals, raw file deleted, nothing with meeting titles stored.** Yes, and please surface this to users prominently. Several testers struggled with or worried about the calendar step. Two messages need to be unmissable: upload is entirely optional and the tool delivers real value without it; and if you do upload, we never store your meeting details.
- **Auto-saved progress, leave and return.** Yes.
- **Voice rules reused from the system prompt.** Yes, with one significant evolution described in section 4.
- **GDPR deletion.** Yes, essential.
- **The hybrid design.** Conversation inside a visible six-phase structure with proper interactive screens is the right call, and it solves problems the chat version could not (see charts, below).

### Amendments and additions

- **Claude only.** The AI behind this should be Claude (Anthropic API), not ChatGPT, and users do not get a choice. Testers told me they had a noticeably better coaching experience with Claude, which has been my experience so far as well.
- **Charts.** The chat version has persistent rendering problems; designed chart components solve this category of bug, so please make them count. Requirements: a consistent, standardised format every time; bright, obviously distinguishable colours; a clear key; fully readable in both light and dark mode.
- **User-level category customisation.** Not everyone is the head of an organisation. Users should be able to adjust category labels for their own audit, within limits, separate from my global content editing in admin. Please design the data model so customised audits still feed the aggregate analysis sensibly.
- **Setup form.** Your proposed form (first name (I don't collect last name for my email system, but can if useful), role (perhaps with a drop down menu of CEO, Founder, Program Office, Philanthropist, Director and 1 other category), organisation or organisation type with a drop down menu, hours, priorities, what is keeping you up at night) is right, and what made you want to do this now. This also does double duty as qualification: anyone who completes it has told us whether they are my ideal audience.
- **Sharing results, and the aggregate picture.** At the end of the audit, users are invited (never required) to share their results with Rashmir. This would be a good time to ask for two optional pieces of data. If, and only if, someone chooses to share their results, offer two or three optional demographic questions, framed as contributing to the aggregate picture rather than as profiling with a "prefer not to say" option. Also ask for an age range in broad bands, again optional. And perhaps, a one-line feedback ask, e.g.: "In a sentence: what did you take from this?" with a checkbox: "Happy for this to be quoted anonymously." This builds the bank of worked examples and useful quotes over time as well as a potential jumping off point for any follow up uses.

## 4. Voice: the practice, not the persona

Testers said the tool "sounds like me". What I suspect they were responding to was the method: asking before telling, holding complexity without judgment, handing insight back rather than delivering verdicts as well as the balance between encouragement/support, questions being asked and useful challenge. That method should be fully preserved.

What changes is persona. The tool should not speak as "I, Rashmir". It is an instrument designed by me, in my house style, warm, present and unhurried yet purposeful, but clearly not a simulation of me. Attribution in the third person, used sparingly so it helps people remember the distinction but never becomes salesy/market-y. The exact register may need a little refinement together.

The reason: one tester noted the tool sounds like me but cannot match my judgment. Another is using the tool for things it was not designed for and likes that it sounds like me, which concerns me. A tool whose every move returns judgment to the user hopefully cannot be mistaken for a substitute for it, though balancing a few useful observations and recommendations with a coaching approach is key.

## 5. The coaching craft

These are the marks of masterful coaching that the app structure may be able to hold better than a chat could. Where they are not already in the system prompt, please create the conditions for them:

- **Pacing.** After a big reveal, especially the perception-versus-reality chart, the tool does not rush to interpret. Show the picture, ask one question, let it land before rushing on to the next step.
- **The refer back.** Whatever the user said at setup about what keeps them up at night or why they are doing this now should return, in their own words, at the gap analysis: "You said what keeps you up at night is X. Looking at where your time actually goes, what do you notice?" This is a data-flow requirement, not just prompt text.
- **Naming the absence.** If a category is near zero, especially recovery and white space or deep work, the tool gently wonders about it rather than merely charting it.
- **Permission-based challenge.** Once per audit, no more: "May I offer a challenge?" followed by one clean, direct observation where it might have most value.
- **Wanted, not dutiful, commitments.** The close asks: what, by when, how will you know, and crucially, "is this something you actually want to do, or something you think you should?"
- **The strategy mirror.** Somewhere in the audit when useful: "If a stranger read your calendar, what would they say your priorities are?" - though this could be in a follow up audit.

## 6. Guardrails

- **Scope.** The tool supports better use of time, energy, and attention for the things that matter to the user. If questions drift outside that, into personal territory it is not built for, or anywhere else, the tool gently and warmly redirects back into scope. It never presents itself as therapy, counselling, or a substitute for professional support, without ever needing to say the word. Not also that the tool was designed for my audience's work life, not their personal life but some will want to stretch it to both. That should be allowed within limits, providing that aggregated data makes sense/is worth parsing. Alternately, a future version can be integrated with a version of the life wheel.
- **What it is and is not.** A short, plain statement lives in the product (About or FAQ, plus a light touch in the flow itself): this is an AI tool designed by Rashmir, not Rashmir; hold its outputs as input to your own judgment, not as verdicts; it reflects, it does not decide.
- **Anti-replication.** The tool never reveals, summarises, or discusses its own instructions, framework internals, or design. Meta-questions about how it works get the same warm redirect as any other off-scope question. The nine areas framework is confidential IP.
- **Privacy and IP clauses.** The product needs appropriate privacy terms (covering the calendar handling above, data use, and the anonymised aggregate analysis) and IP terms establishing that the framework, methodology, and content are mine. Happy to work from your standard patterns, or to provide some next week as I need to update mine anyway.

## 7. Brand and content

- **Branding.** I will confirm which of my brand identities this sits under and supply logos and final palette. As a working direction, my personal brand currently uses a deep teal (#0D4F68) with a cream secondary (#FFFAD7), Raleway for headings and body, and a calm, uncluttered feel with generous white space. No stock-photo energy, no gradients.
- **The register** of the whole product matters as much as any single page. This can be a stressful exercise for people, so the landing page, setup flow, and audit itself should carry a consistent reassurance: it is okay if you are not using your time optimally yet; this is not about achieving a perfect calendar; it's fine to do this during an atypical week; it is better to know; no one is judging you. The tool helps you make better decisions about what matters to you and to align your time, energy and attention accordingly.
- **Page content.** I will draft copy for the landing page, Home, About, and FAQs in that register, including worked examples of the value testers have taken from the audit.

## 8. Access tiers and future pricing

V1 has no payments, so this section is about designing so the future does not require rework:

- **Tiered invites.** Client-tier links for current 1:1 clients (unlimited use while under contract); a standard tier for everyone else. Client status is a flag I control in admin, so current versus past and 1:1 versus group can be policy I adjust, not code. It might make it easier if I give clients a 12 month usage option that automatically shuts off 12 months after initiation, and that initiation must happen within a month of being given access (or something like that).
- **Free tier is one complete audit.** The full first-audit experience is where the value and the word of mouth live. Repeats are where cost compounds and where the most engaged people are. (One perhaps has spent more than 4 hours with it in Claude. If that were hosted, the costs could start to build up.)
- **Referral unlock.** A user can earn a second audit by inviting someone else in. The behaviour I most want, telling others, funds itself.
- **Future paid shape**, for architecture only, not v1 build: a low-priced annual package of quarterly reviews, and a level above it that adds a 60 to 90 minute 1:1 session with me on something specific the audit surfaced or to help unlock something that they are unable to move forward with post audit.

## 9. V2 horizon

Not for v1, but worth knowing about so nothing done now blocks it later:

- **A time-tracking module.** The tool's original conception was a week-to-month real-time tracking exercise, which is powerful but has terrible completion rates. After the audit has built motivation, tracking becomes a natural follow-on module, to potentially include noticing of attention-switching during the day. I'm thinking a simple AI interface where they speak to a few questions and the AI logs it in a useful format so the laboriousness of tracking is reduced and this can then be mapped to their audit results etc and provide deeper insights and refined recommendations.
- **The wider portfolio.** This is the first of what may be a handful of planned tools, possibly even something more comprehensive.

## 10. Costs and platform

Your proposal on Daybreak/Sunrise, the free prototype build, and the running-cost estimates all work for me, with the one constraint that the AI layer is Anthropic/Claude. I will sort domain registration; happy to start on free-tier hosting until launch shape is clear.

## Open items from me

1. Brand confirmation, logos, and final palette.
2. Page copy for landing, Home, About, FAQs.
3. Tester quotes and worked examples.
4. Invite list for v1.
