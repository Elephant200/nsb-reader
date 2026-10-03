# NSB Reader

NSB Reader provides high-school National Science Bowl practice through QBReader's interface. The layout, typography, colors, controls, and keyboard shortcuts follow QBReader. Unused pages are removed.

## Reading and answers

Questions appear progressively, beginning with the category and “Multiple Choice” or “Short Answer” before the prompt. Each multiple-choice option occupies its own line. Players buzz before entering an answer, including on multiple-choice questions. Accept the correct W/X/Y/Z letter or correct choice text; when both are supplied, both must agree. Short answers use automatic checking with a grading override.

Solo practice supports tossups, bonuses, and paired questions. Bonuses are single questions, read progressively with a buzz button and typed answer box. Bonus results use a right/wrong grading correction without part numbers or checkboxes. Paired practice shows the bonus after a missed tossup by default, with an earned-only option. Question selection supports random practice, categories, sets, and packets. Question history and reports remain available.

## Multiplayer

Private rooms support individual free-for-all play without accounts. Each player gets one attempt per tossup unless rebuzz is enabled. Correct tossups score 4 points. Wrong interruptions score -4; wrong answers after the question finishes score 0.

Bonuses are optional and disabled by default. When enabled, only the player who answers the tossup correctly may answer its paired bonus. A correct bonus scores 10 points; a missed bonus scores 0.

The room creator controls settings, question advancement, and grading corrections, and may transfer control. Rooms retain QBReader-style typed-answer timers without match clocks.

## In-person practice

In-person practice is a separate reader-led mode. The reader creates a room with a six-digit numeric join code. Players enter the code and receive unique generated usernames, balanced team assignments, and a buzzer. Team positions are Captain, One, Two, Three, and onward. The reader can reorder players within or between teams using an insertion preview, kick players, and lock new arrivals. Usernames and individual statistics stay with each player when their position changes.

Players see only their own username, team position, connection status, and central buzzer, also activated by Space. Questions, answers, timers, scores, and other players' statistics are not sent to player connections. Reader access uses a separate private credential saved in the reader's browser.

The reader dashboard separates Question, Roster, Statistics, and Question selection. Questions are selected randomly by category or sequentially from a selected set and packet, without repeats during the room session. A tossup and its paired bonus use the same source packet and number. On a buzz, BUZZ and the player's position and username replace the prompt, preserving the panel height and keeping the answer visible. The reader judges every buzz. The Interrupt checkbox defaults on before the timer starts and off afterward, with manual override.

Correct tossups award 4 points; incorrect interruptions award 4 to the other team. Next opens the paired bonus after a correct tossup and the next tossup after a wrong answer. Bonuses require no buzz and have right/wrong controls beside the answer, awarding 10 or 0 team points. Judgments can be corrected until advancing. Bonus results belong to the team rather than an individual.

The reader starts, pauses, and resets a 5-second tossup or 20-second bonus response timer. Timer expiration does not automatically judge an answer. Session statistics show each player's buzzes, correct answers, misses, and interruptions, plus team bonus results. Kicked players' statistics remain visible. Reconnecting from the same browser restores identity; kicked credentials cannot rejoin. Empty rooms expire after one hour, and server restarts end sessions. There is no results download or cross-session history.

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
