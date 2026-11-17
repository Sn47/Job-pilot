# Job Pilot design

Operate surface. One person, laptop, evening. Two destinations: **Jobs** and **Profile**. Everything that
happens to a job happens on the Jobs page; everything the app knows about you lives on Profile. First run
goes through `/setup` (four steps) and then never again.

## Tokens (`frontend/styles/globals.css`, Tailwind names in `tailwind.config.js`)

| Token | Value | Used for |
|---|---|---|
| `ground` | #141416 | page |
| `panel` | #1B1B1E | selected row, inputs, document sheets, active step |
| `panel-2` | #242428 | hover, bar track |
| `text` | #E8E6E0 | body |
| `muted` | #8E8D88 | secondary text, labels, hints |
| `rule` / `rule-2` | #2C2C30 / #3E3E43 | hairlines / borders on controls |
| `gold` | #D4A448 | fit bars, primary button, done-step mark; the only accent |
| `good` / `warn` / `stop` | #6EBE8C / #E0AA58 / #E27060 | score ≥8, warnings, set-aside and errors |

Light mode is not offered. No gradients, no glow, no shadows: depth is a one-step panel and a hairline.

## Type

System UI stack for everything. `Source Serif 4` (`font-doc`) only where a document is shown: the
wordmark, resume previews, cover letters. Scores and counts use tabular numerals (`.tnum`).
Section headings inside a job are 13px uppercase muted with a hairline; page titles are 22–24px semibold.

## Layout

- Header: wordmark, two links, "Finish set-up →" when the profile is incomplete. Max width 1280.
- Jobs: stage filters (Inbox · Kit ready · Applied · Interview · Closed, with counts) left, **Find jobs**
  right with last-scan result beside it. Below, 340px list + detail. Under 1024px the list and detail swap
  on tap.
- Job detail, in reading order: title block with score; the **path** (three cells: Review the fit →
  Tailor the kit → Apply; the active cell is raised and carries that step's buttons); Fit sheet; Posting
  (clamped, "Show all"); the kit sections once tailored (Resume, Cover letter, Answers, each with
  PDF/DOCX/Copy/Rewrite/Edit on its heading line); Notes; Delete.
- Profile: single column 760px, sections with a one-line hint each; chips for list inputs with
  suggestions drawn from the resume; "Sources and writer" status at the end (read-only).

## Components (`frontend/components`)

`Score`, `FitSheet` (bars + You have / They ask), `Chips`, `Choice`, `Empty`, `Icon` (authored 24-grid
strokes), `JobDetail` (path + sections), `Shell`.

## Motion

One authored moment: fit bars fill on selection (320ms, exponential ease-out). Section entrance is a
160ms rise. Both off under `prefers-reduced-motion`.

## Keyboard

`j`/`k` move, `t` tailor, `a` mark applied, `x` set aside, all when focus is not in a field.

## Copy rules

Buttons name the action (Find jobs, Tailor, Open posting, Applied). Hints say what will happen and how
long it takes. Set-aside jobs always show the rule that caught them. No eyebrows, no badges where a
word in the meta line will do.
