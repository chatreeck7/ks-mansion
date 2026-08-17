---
name: review-subtask
description: Use before marking a KS Mansion Build Task done — runs code review on the diff/PR and cross-checks it against the task's acceptance criteria in the intake spec
---

# Reviewing a Build Task

Two independent checks: code quality (via the existing `code-review` skill)
and spec compliance (via the intake doc). Do both — a clean diff that
misses an acceptance criterion is still not done.

1. Resolve which task is under review: an explicit Task ID/title, or infer
   it from the current branch name / open PR if not given.
2. Fetch the task's Notion card (properties + content) from the Build Tasks
   data source (`collection://299d0be8-b7a8-49a8-ade7-00d4b0ea9c30`) for its
   `Spec ref` (e.g. `AC-8.1`, `NFR-1.2`) and any prior engineering-update
   notes.
3. Fetch the intake spec — Google Doc `1fEmb7wXR4uDrn9ea42U9bhuEAcHvnJGyidVp7lQO5LE`
   ("ks-mansion-admin-console-intake.md",
   https://docs.google.com/document/d/1fEmb7wXR4uDrn9ea42U9bhuEAcHvnJGyidVp7lQO5LE/edit)
   via the Drive MCP's `read_file_content`, and locate the section(s)
   matching the Spec ref exactly (`AC-x.y` / `NFR-x.y` entries live under
   each feature's "Decided" / "Constraints / Scope" lists).
4. Invoke the `code-review` skill against the diff or PR for correctness,
   simplification, and efficiency issues as normal.
5. Cross-check the diff against each acceptance criterion from step 3 — not
   just "does it compile" but "does it match what the AC actually
   specifies." Business-rule details in this spec are exact, not
   approximate (e.g. AC-2.5's owed-vs-deposit sign convention, AC-1.3's
   26th/10th billing cycle) — check them literally against the doc text,
   don't rely on memory of what the AC "probably" says.
6. Report: which ACs are satisfied, which are missing or partial, plus the
   code-review findings. This skill is read-only against Notion — it
   reports gaps, it does not change the card's Status. Use `ship-subtask`
   once review is clean.
