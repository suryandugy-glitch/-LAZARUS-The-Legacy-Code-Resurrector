# ⚰️ LAZARUS — The Legacy Code Resurrector

> Bring dead languages back to life. 
>
> **Created by [Suryandu Ganguly](https://github.com/suryandugy-glitch)** · 🔴 **[Live Demo](https://suryandugy-glitch.github.io/-LAZARUS-The-Legacy-Code-Resurrector/)**

LAZARUS takes code written in **dead / legacy languages** — COBOL, Pascal, Visual Basic 6, and retro line-numbered BASIC — and *resurrects* it as modern, runnable **Python 3** or **JavaScript**, with line-by-line "Necromancer's Notes" explaining every transformation.

**Zero dependencies. Zero build step. 100% offline.** Open `index.html` in any browser and start resurrecting.

## ✨ Features

- **4 dead languages** → 2 modern targets (8 translation paths), fully rule-based transpilers written in vanilla JS
- **GOTO resurrection** — spaghetti BASIC with `GOTO`/`GOSUB` is transformed into a *program-counter trampoline* (a `while` + `switch` state machine) so even unstructured code runs correctly in a structured language
- **Type inference from the grave** — COBOL `PIC 9(3)V99` clauses and VB6 `Dim x As Double` become sensible typed defaults
- **Necromancer's Notes** — every resurrection explains *what* was translated and *why* (e.g. "Pascal `for..to` is inclusive — range adjusted")
- **Nothing silently lost** — statements the transpiler can't handle are preserved as `TODO` comments, never dropped
- **Optional local-AI refinement** — if you run [GPT4All](https://gpt4all.io)'s local API server, one click asks a fully-offline LLM to polish the rule-based draft into idiomatic modern code. No code ever leaves your machine
- **Sample corpses included** — mainframe payroll COBOL, Turbo Pascal Fibonacci, VB6 grade calculator, GOTO-riddled BASIC countdown

## 🚀 Run it

```
# no install, no build:
start index.html          # Windows
# or just double-click index.html
```

## 🧪 Tests

A Node test harness translates every sample through both targets, **executes** the JavaScript outputs and asserts on their actual printed results, and syntax-checks every Python output with `py_compile`:

```
node test/run-tests.js
# → ALL TESTS PASSED  (34 checks)
```

## 🏗️ How it works

```
index.html          UI (graveyard theme)
css/style.css
js/cobol.js         COBOL  → Python/JS   (divisions, PIC clauses, PERFORM, paragraphs→functions)
js/pascal.js        Pascal → Python/JS   (begin/end, repeat..until, function-name returns)
js/vb6.js           VB6    → Python/JS   (Sub/Function, Select Case, Do While/Until, MsgBox)
js/basic.js         BASIC  → Python/JS   (line numbers, GOTO trampoline, A$ string vars)
js/samples.js       sample legacy programs
js/app.js           UI glue + optional GPT4All local-API refinement
test/run-tests.js   executable test harness
```

Each transpiler is a line-oriented parser + statement pattern-matcher that rebuilds the program in the target language: identifiers are re-cased (`WS-TOTAL` → `ws_total`), operators mapped (`:=`→`=`, `<>`→`!=`, `&`→`+`), inclusive loop bounds adjusted, and paragraph/procedure structure converted to functions.

## 💀 Why "resurrection"?

An estimated **800 billion lines of COBOL** still run in production. Every legacy language here powers systems whose original authors are long gone. LAZARUS is a small, transparent, fully-offline take on the real problem of legacy modernization — showing its work on every line instead of being a black box.

---

## 👤 Author

**Suryandu Ganguly**

*Built solo in one session for Port Mortem 2026.*
