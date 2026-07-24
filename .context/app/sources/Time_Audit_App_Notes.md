# Time Audit App

**A few assumptions and clarifying questions for Rashmir**

Not everything needs to be fully clear before we begin. We can get to a v1 and then iterate, so the below is to expose any strong preferences or directives ahead of time to make v1 align with expectations.

Let me know if you have any thoughts or questions related to below.

## Build

We'll likely build this on Daybreak, our expert-led facilitation platform that is a framework that sits on our Agentic Orchestration platform, Sunrise. We won't need many of the things that Daybreak brings in the beginning, but it will offer everything we need should Time Audit become more of a serious commercial offering beyond v1.

## V1 Proof-of-concept

We'll assume v1 will be a fully functional and usable product for Rashmir's clients, prospects, or anyone else she invites. V1 will offer user sign-in, authentication and access to all features but won't have things like payments or subscriptions. We'll see it as a proof-of-concept to build out further if we decide it has real commercial potential.

## Design

- Right now the whole thing is one long chat. In an app we can keep that, or we can break it into screens, or do a bit of both.
- A hybrid approach might work best. The audit would still feel like a conversation, but it sits inside a visible six-phase structure with a progress bar, and a few things become proper interactive screens instead of typing numbers into chat: the nine leadership areas, the ideal week, the action plan.
- The coaching elements, the "what stands out to you here" pauses, stay conversational.
- Branding and colours - do you have any preferences or want to point us to something you like? Do you have logos etc you would like to use?
- Do you have content in mind for FAQs, About, Home - etc...?

## Possible User Pages

Initial thoughts - unless you have other ideas

- **Landing page.** What it is, what you get, how long it takes.
- **Home.** Past audits, progress over time, start a new one.
- **Setup.** Name, role, org, hours, priorities, what is keeping you up at night. Probably a short form rather than a bunch of questions in chat.
- **Current reality.** The nine key areas of leadership, one at a time, hours plus a box for what that time actually looks like.
  - Deep work
  - Learning & development
  - Strategic planning & review
  - Team development
  - Organisational oversight
  - Fundraising & capital
  - Relationship building
  - Delivery & operations
  - Recovery & white space
- **Calendar upload.** Optional. Drag and drop the .ics, we show what we found, they correct anything we got wrong.
- **Perception vs reality.** A chart for visualisation.
- **Energy.** Pick your peak windows on a week grid.
- **Ideal week.** Sliders, with the gap against current reality updating live.
- **Gap analysis and action plan.**
- **Summary Report.** Downloadable, shareable.

## Possible Admin Pages - e.g. for Rashmir

- **Client list:** who is signed up, who's mid-audit, who's abandoned at which phase, who never started
- **Access control:** inviting clients / prospective clients, revoking access, whether invite links expire
- **Shared results inbox:** audits clients have chosen to share with Rashmir
- **Cross-client patterns:** the aggregate analysis summaries etc.
- **Content editing:** e.g. make various things editable (9 areas of leadership titles/descriptions)
- **Export:** various data exports in a usable format
- **GDPR:** the ability to delete users and their details for GDPR compliance

## Things I would default to unless you say otherwise

- People can leave and come back. Auto-saved progress
- Hours per week, not percentages that have to add to 100. Forcing it to 100 hides the overwork, which is the thing you most want people to see.
- The voice rules from your system prompt can be easily re-used. No em dashes, no "leverage", no "optimise" etc.
- The reflection pauses become required rather than optional. You cannot click past "what are you noticing".
- Calendar stays as an .ics upload for now. Connecting live to Google or Outlook is nicer but adds a lot of complexity and privacy details to address - something to consider beyond v1.
- For security de-risking, we can parse the calendar into totals and then delete the raw file. Nothing with meeting titles in it gets stored - unless you would rather keep it.

## Repeat audits

The app can show a trend line per 9 leadership areas over the last year and open every repeat audit by comparing to the last one automatically. It's worth knowing whether you see it the same way and whether you want to nudge people to come back, and how often.

## A few questions

- Who gets access? Clients only, clients and prospects, or anyone?
- Do you want to see across all your clients at some point? Spot patterns etc?
- How do you want your consultation offers to appear - during the process, at the end?
- Our system offers the facility for the agents to access a knowledge base - e.g. your Intellectual Property, articles, books, thought pieces etc. which could be used to guide the questioning and also in writing reports for participants. Let me know if you have anything you would like to have in the system.

## Costs

- As discussed, we're happy to build this prototype free of charge as a showcase for our work and to use it as a stepping stone for potential future collaborations - either future versions of Time Audit or your coaching programmes.
- There will be some costs for you to consider:
  - Domain Name Registration
  - Hosting (e.g. both website and database) - various options are available - prob worth budgeting $15 - $25 per month but may vary. Initially we could host it all on a free tier before official launch and perhaps after launch, depending on popularity.
  - Cost of cloud AI APIs such as Anthropic or OpenAI subscriptions - difficult to estimate but might be $1 - $3 per audit, depending on how much time they spend in the system
  - Email APIs can be used to send 1,000s of free emails but there might be a cost further down the road.
- These costs are not prohibitive unless your app is open to the public and goes viral - but that would be a good problem to have as it would justify the app as a paid-for service.

---

This doc has been created by John with some AI assistance - the AI assistance was rooted in your initial docs for Time Audit.
