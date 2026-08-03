# LAZARUS — Hackathon Submission Text
(copy-paste into the Port Mortem 2026 submission form)

---

## Project name
LAZARUS — The Legacy Code Resurrector

## Tagline / one-liner
Paste dead code (COBOL, Pascal, VB6, retro BASIC) — get living, runnable Python or JavaScript back, with line-by-line notes explaining the resurrection.

## Inspiration
An estimated 800 billion lines of COBOL still run the world's banks and governments, and the developers who wrote them are retiring or gone. The hackathon's theme — Code Resurrection — is a real, unsolved industry problem. We wanted a tool that doesn't just "AI-magic" old code into new code, but shows its work: every transformation is explained, and anything it can't translate is preserved as a TODO instead of silently dropped.

## What it does
LAZARUS is a browser-based transpiler that resurrects four dead languages — COBOL (1959), Pascal (1970), Visual Basic 6 (1998), and line-numbered BASIC (1964) — into modern Python 3 or JavaScript (8 translation paths total). Alongside the code, a "Necromancer's Notes" panel explains each transformation: why `PERFORM UNTIL` became `while not(…)`, why Pascal's inclusive `for..to` needed its range adjusted, how `PIC 9(3)V99` was inferred as a decimal.

Its party trick: **GOTO resurrection**. Spaghetti BASIC full of `GOTO`/`GOSUB` can't be mapped to structured code line-by-line — so LAZARUS rebuilds it as a program-counter state machine (a `while` loop dispatching on line numbers) that runs the original control flow faithfully in a modern language.

Optionally, one click sends the rule-based draft to a **fully local LLM** (GPT4All's offline API) to be polished into idiomatic code — no code ever leaves your machine.

## How we built it
- Pure vanilla HTML/CSS/JS — zero dependencies, zero build step, works offline by double-clicking index.html
- Four hand-written rule-based transpilers (line-oriented parsers + statement pattern-matchers): identifier re-casing, operator mapping (`:=`→`=`, `<>`→`!=`, `&`→`+`), COBOL PIC-clause type inference, paragraph/procedure → function conversion, and the GOTO trampoline
- A Node test harness that doesn't just check syntax — it **executes** the generated JavaScript and asserts on the actual program output (payroll math, Fibonacci sequence, countdown), and compiles every generated Python file with `py_compile`. 34 checks, all passing.

## Challenges we ran into
- **GOTO**: unstructured jumps have no direct structured equivalent — solved with the program-counter trampoline
- **Inclusive loop bounds**: COBOL/Pascal/VB6/BASIC all include the loop end value; naive translation silently off-by-ones every loop
- **String literals vs keywords**: the BASIC translator initially rewrote keywords *inside* string literals ("T-MINUS" → "t-minus"); fixed with literal-protection sentinels — caught by the execution tests, which is exactly why we test real output, not just "it produced code"

## Accomplishments we're proud of
- Every sample program translates AND RUNS correctly in both target languages, verified by automated execution tests
- The tool is honest: untranslatable statements survive as TODOs, and every transformation is explained
- Runs anywhere a browser runs — nothing to install

## What we learned
Old languages encode real design lessons: COBOL's data division is type inference before types were cool; BASIC's GOTO shows exactly why structured programming won. Translating them mechanically teaches you more about language design than reading about it.

## What's next
- More corpses: Fortran 77, Perl 4, Flash ActionScript
- Deeper COBOL (file sections, REDEFINES, 88-levels)
- Side-by-side diff view between rule-based and AI-refined output
- Batch mode: point it at a whole legacy repo

## Built with
HTML, CSS, JavaScript (vanilla, no frameworks), Node.js (test harness only), optional GPT4All local API

---

## Suggested screenshots to attach
1. Main UI with COBOL payroll sample loaded and its Python resurrection + notes panel
2. BASIC GOTO countdown → JavaScript trampoline output (the wow shot)
3. Test run terminal showing "ALL TESTS PASSED"
