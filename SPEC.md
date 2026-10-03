# NSB Reader

NSB Reader provides high-school National Science Bowl practice through QBReader's interface. The layout, typography, colors, controls, and keyboard shortcuts follow QBReader. Unused pages are removed.

## Reading and answers

Questions appear progressively. Each multiple-choice option occupies its own line. Players buzz before entering an answer, including on multiple-choice questions. Accept the correct W/X/Y/Z letter or correct choice text; when both are supplied, both must agree. Short answers use automatic checking with a grading override.

Solo practice supports tossups, bonuses, and paired questions. Paired practice shows the bonus after a missed tossup by default, with an earned-only option. Question selection supports random practice, categories, sets, and packets. Question history and reports remain available.

## Multiplayer

Private rooms support individual free-for-all play without accounts. Each player gets one attempt per tossup unless rebuzz is enabled. Correct tossups score 4 points. Wrong interruptions score -4; wrong answers after the question finishes score 0.

Bonuses are optional and disabled by default. When enabled, only the player who answers the tossup correctly may answer its paired bonus. A correct bonus scores 10 points; a missed bonus scores 0.

The room creator controls settings, question advancement, and grading corrections, and may transfer control. Rooms retain QBReader-style typed-answer timers without match clocks. Teams, captains, competition simulation, audio reading, and host-led in-person play are outside this scope.

## Questions and storage

PostgreSQL/Supabase stores questions and reports. NSB sample PDFs are converted to a common packet format with question numbers, categories, prompts, choices, answers, and paired bonuses. Import validation identifies missing answers, incomplete choices, and pairing problems. Reports accept a reason and description.

Practice requires no account. Preferences and lightweight personal progress use browser storage; room statistics are session-based.

## Acceptance checks

- A multiple-choice question reads with four separate option lines, freezes on buzz, and accepts the correct letter or choice text.
- Solo paired practice follows the selected bonus eligibility setting.
- Competing multiplayer buzzes admit one answerer; an ineligible player cannot answer the bonus or change room settings.
- Scores and grading overrides use the individual 4/-4/0 and bonus 10/0 values.
- Reports are saved with the question and reason.
- Search and packet browsing display imported questions, and removed pages have no remaining navigation links.
