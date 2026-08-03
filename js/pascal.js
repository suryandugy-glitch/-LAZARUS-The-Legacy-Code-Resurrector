/* LAZARUS — Pascal → Python / JavaScript translator (rule-based) */
/* global window */
(function () {
  "use strict";

  function translatePascal(src, lang) {
    const isPy = lang === "python";
    const IND = isPy ? "    " : "  ";
    const notes = [];
    const out = [];
    let indent = 0;

    const pushNote = n => { if (!notes.includes(n)) notes.push(n); };

    function emit(line) { out.push(IND.repeat(indent) + line); }

    // translate a Pascal expression to target language
    function expr(e) {
      if (e == null) return "";
      let r = " " + e.trim() + " ";
      r = r.replace(/'/g, '"');                          // string quotes
      r = r.replace(/\bdiv\b/gi, isPy ? "//" : "/");     // integer division
      r = r.replace(/\bmod\b/gi, "%");
      r = r.replace(/\band\b/gi, isPy ? "and" : "&&");
      r = r.replace(/\bor\b/gi, isPy ? "or" : "||");
      r = r.replace(/\bnot\b/gi, isPy ? "not" : "!");
      r = r.replace(/<>/g, "!=");
      r = r.replace(/(^|[^:<>=!])=([^=]|$)/g, "$1==$2"); // = comparison
      r = r.replace(/\btrue\b/gi, isPy ? "True" : "true");
      r = r.replace(/\bfalse\b/gi, isPy ? "False" : "false");
      // built-ins
      r = r.replace(/\bLength\s*\(/gi, isPy ? "len(" : "String(").replace(/\bSqrt\s*\(/gi, "Math.sqrt(");
      if (isPy) r = r.replace(/\bMath\.sqrt\(/g, "math.sqrt(");
      return r.trim();
    }

    function defaultFor(type) {
      const t = type.toLowerCase();
      if (/integer|longint|byte|word|shortint/.test(t)) return "0";
      if (/real|double|single|extended/.test(t)) return "0.0";
      if (/string|char/.test(t)) return '""';
      if (/boolean/.test(t)) return isPy ? "False" : "false";
      return isPy ? "None" : "null";
    }

    // -------- tokenize into statements --------
    // Normalize: strip comments { } (* *) and //
    let code = src
      .replace(/\{[^}]*\}/g, "")
      .replace(/\(\*[\s\S]*?\*\)/g, "")
      .replace(/\/\/[^\n]*/g, "");

    const lines = code.split(/\r?\n/);
    let inVar = false, inConst = false;
    const blockStack = []; // 'begin' | 'repeat' | 'case'
    let pendingLoopClose = []; // for JS closing braces text

    const isJs = !isPy;
    if (isPy) out.push('"""Resurrected by LAZARUS — Pascal → Python."""', "");
    else out.push("// Resurrected by LAZARUS — Pascal → JavaScript.", "");

    let needMath = false;

    for (let raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      const U = line.toLowerCase();

      // program header
      let m;
      if ((m = line.match(/^program\s+([A-Za-z_][A-Za-z0-9_]*)/i))) {
        emit((isPy ? "# " : "// ") + "Program: " + m[1]);
        pushNote(`<code>program ${m[1]};</code> → header comment; modern scripts don't need a program declaration.`);
        continue;
      }
      if (/^uses\b/i.test(U)) {
        pushNote("<code>uses</code> clause dropped — replaced by native/standard library.");
        continue;
      }
      if (/^var\b/i.test(U)) { inVar = true; inConst = false; pushNote("<code>var</code> block → typed declarations become initialised variables."); if (U !== "var") line = line.replace(/^var\s+/i, ""); else continue; }
      if (/^const\b/i.test(U)) { inConst = true; inVar = false; if (U !== "const") line = line.replace(/^const\s+/i, ""); else continue; }

      // begin / end
      if (/^begin\b/i.test(U)) {
        if (blockStack.length === 0 && out.filter(l => /def main|function main/.test(l)).length === 0) {
          // main program begin
          emit(isPy ? "def main():" : "function main() {");
          indent++;
          blockStack.push("main");
        } else {
          blockStack.push("begin");
          // begin after if/for/while already opened the block — nothing to emit for Python
          if (isJs && !pendingLoopClose.pop()) { /* brace already emitted by control stmt */ }
        }
        continue;
      }
      if (/^end\s*\.\s*$/i.test(U)) {
        // final end.
        indent = Math.max(0, indent - 1);
        if (isJs) emit("}");
        emit("");
        emit(isPy ? 'if __name__ == "__main__":' : "main();");
        if (isPy) emit("    main()");
        blockStack.pop();
        continue;
      }
      if (/^end\s*;?\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (isJs) emit("}");
        blockStack.pop();
        continue;
      }
      if (/^end\s+else\b/i.test(U)) {
        indent = Math.max(0, indent - 1);
        emit(isPy ? "else:" : "} else {");
        indent++;
        continue;
      }

      // var declarations:  x, y : integer;
      if (inVar && (m = line.match(/^([A-Za-z_][A-Za-z0-9_,\s]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$/))) {
        const names = m[1].split(",").map(s => s.trim()).filter(Boolean);
        const dflt = defaultFor(m[2]);
        for (const n of names) emit((isPy ? "" : "let ") + n + " = " + dflt + (isPy ? "  # " : "; // ") + m[2]);
        continue;
      }
      // const declarations:  PI = 3.14;
      if (inConst && (m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);?\s*$/))) {
        emit((isPy ? "" : "const ") + m[1].toUpperCase() + " = " + expr(m[2]) + (isPy ? "  # const" : ";"));
        continue;
      }

      // once we hit a statement, var/const section is over
      // procedure / function
      if ((m = line.match(/^procedure\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*;/i))) {
        inVar = inConst = false;
        const params = (m[2] || "").split(";").map(p => p.split(":")[0]).join(",").split(",").map(s => s.trim().replace(/^var\s+/i, "")).filter(Boolean);
        emit("");
        emit(isPy ? `def ${m[1]}(${params.join(", ")}):` : `function ${m[1]}(${params.join(", ")}) {`);
        indent++;
        blockStack.push("proc");
        pushNote(`<code>procedure ${m[1]}</code> → ${isPy ? "def" : "function"} (no return value).`);
        continue;
      }
      if ((m = line.match(/^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*:\s*[A-Za-z_]+\s*;/i))) {
        inVar = inConst = false;
        const params = (m[2] || "").split(";").map(p => p.split(":")[0]).join(",").split(",").map(s => s.trim().replace(/^var\s+/i, "")).filter(Boolean);
        emit("");
        emit(isPy ? `def ${m[1]}(${params.join(", ")}):` : `function ${m[1]}(${params.join(", ")}) {`);
        indent++;
        blockStack.push("func:" + m[1]);
        pushNote(`<code>function ${m[1]}</code> → return-value assignment <code>${m[1]} := x</code> becomes <code>return x</code>.`);
        continue;
      }

      inVar = inConst = false;

      // writeln / write
      if ((m = line.match(/^writeln\s*\(\s*(.*)\)\s*;?\s*$/i)) || /^writeln\s*;?\s*$/i.test(U)) {
        const args = m && m[1] ? splitArgs(m[1]).map(expr).join(", ") : "";
        emit(isPy ? `print(${args})` : `console.log(${args});`);
        continue;
      }
      if ((m = line.match(/^write\s*\(\s*(.*)\)\s*;?\s*$/i))) {
        const args = splitArgs(m[1]).map(expr).join(", ");
        emit(isPy ? `print(${args}, end="")` : `process.stdout.write(String(${args}));`);
        pushNote("<code>write</code> (no newline) → " + (isPy ? '<code>print(…, end="")</code>' : "<code>process.stdout.write</code>") + ".");
        continue;
      }
      if ((m = line.match(/^readln\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*;?/i))) {
        emit(isPy ? `${m[1]} = input()` : `${m[1]} = prompt("${m[1]}?");`);
        pushNote("<code>readln</code> → interactive input.");
        continue;
      }

      // for loop:  for i := 1 to 10 do
      if ((m = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.+?)\s+(to|downto)\s+(.+?)\s+do\s*(begin)?\s*$/i))) {
        const [, v, a, dir, b, hasBegin] = m;
        const down = dir.toLowerCase() === "downto";
        if (isPy) {
          emit(down ? `for ${v} in range(${expr(a)}, ${expr(b)} - 1, -1):`
                    : `for ${v} in range(${expr(a)}, ${expr(b)} + 1):`);
        } else {
          emit(down ? `for (let ${v} = ${expr(a)}; ${v} >= ${expr(b)}; ${v}--) {`
                    : `for (let ${v} = ${expr(a)}; ${v} <= ${expr(b)}; ${v}++) {`);
        }
        indent++;
        if (!hasBegin) pendingLoopClose.push(true); else blockStack.push("begin"), pendingLoopClose.push(false);
        pushNote("Pascal <code>for..to</code> is inclusive of the end value — range adjusted accordingly.");
        // single-statement body handled by next line + auto-dedent
        if (!hasBegin) blockStack.push("single");
        continue;
      }

      // while
      if ((m = line.match(/^while\s+(.+?)\s+do\s*(begin)?\s*$/i))) {
        emit(isPy ? `while ${expr(m[1])}:` : `while (${expr(m[1])}) {`);
        indent++;
        if (!m[2]) { blockStack.push("single"); pendingLoopClose.push(true); }
        else { blockStack.push("begin"); pendingLoopClose.push(false); }
        continue;
      }

      // repeat / until
      if (/^repeat\s*$/i.test(U)) {
        emit(isPy ? "while True:" : "do {");
        indent++;
        blockStack.push("repeat");
        pushNote("<code>repeat..until</code> → " + (isPy ? "<code>while True</code> with a break on the until-condition" : "<code>do..while</code> with negated condition") + ".");
        continue;
      }
      if ((m = line.match(/^until\s+(.+?);?\s*$/i))) {
        if (isPy) {
          emit(`if ${expr(m[1])}:`);
          emit(IND + "break");
          indent = Math.max(0, indent - 1);
        } else {
          indent = Math.max(0, indent - 1);
          emit(`} while (!(${expr(m[1])}));`);
        }
        blockStack.pop();
        continue;
      }

      // if / else
      if ((m = line.match(/^if\s+(.+?)\s+then\s*(begin)?\s*$/i))) {
        emit(isPy ? `if ${expr(m[1])}:` : `if (${expr(m[1])}) {`);
        indent++;
        if (!m[2]) blockStack.push("single"); else blockStack.push("begin");
        continue;
      }
      if ((m = line.match(/^if\s+(.+?)\s+then\s+(.+?)(\s+else\s+(.+))?;?\s*$/i))) {
        // one-liner if
        emit(isPy ? `if ${expr(m[1])}:` : `if (${expr(m[1])}) {`);
        emit(IND + stmt1(m[2]));
        if (m[4]) { emit(isPy ? "else:" : "} else {"); emit(IND + stmt1(m[4])); }
        if (isJs) emit("}");
        continue;
      }
      if (/^else\s*(begin)?\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        emit(isPy ? "else:" : "} else {");
        indent++;
        continue;
      }

      // assignment  x := expr;
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.+?);?\s*$/))) {
        // function return value?
        const fnBlock = [...blockStack].reverse().find(b => b.startsWith("func:"));
        if (fnBlock && fnBlock.slice(5).toLowerCase() === m[1].toLowerCase()) {
          emit((isPy ? "return " : "return ") + expr(m[2]) + (isPy ? "" : ";"));
        } else {
          emit(`${m[1]} = ${expr(m[2])}` + (isPy ? "" : ";"));
        }
        closeSingles();
        continue;
      }

      // bare procedure call
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\(([^)]*)\))?\s*;?\s*$/))) {
        emit(`${m[1]}(${m[3] ? splitArgs(m[3]).map(expr).join(", ") : ""})` + (isPy ? "" : ";"));
        closeSingles();
        continue;
      }

      emit((isPy ? "# TODO(pascal): " : "// TODO(pascal): ") + line);
      pushNote(`Untranslated line kept as TODO: <code>${escapeHtml(line.slice(0, 60))}</code>`);
    }

    function stmt1(s) {
      s = s.trim().replace(/;$/, "");
      let mm;
      if ((mm = s.match(/^writeln\s*\(\s*(.*)\)\s*$/i))) return isPy ? `print(${splitArgs(mm[1]).map(expr).join(", ")})` : `console.log(${splitArgs(mm[1]).map(expr).join(", ")});`;
      if ((mm = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.+)$/))) return `${mm[1]} = ${expr(mm[2])}` + (isPy ? "" : ";");
      return expr(s) + (isPy ? "" : ";");
    }

    function closeSingles() {
      while (blockStack[blockStack.length - 1] === "single") {
        blockStack.pop();
        indent = Math.max(0, indent - 1);
        if (isJs) emit("}");
        pendingLoopClose.pop();
      }
    }

    function splitArgs(s) {
      const parts = [];
      let cur = "", depth = 0, inQ = false;
      for (const ch of s) {
        if (ch === "'" ) inQ = !inQ;
        if (!inQ) {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
        }
        cur += ch;
      }
      if (cur.trim()) parts.push(cur);
      // strip Pascal formatting  x:8:2
      return parts.map(p => p.replace(/:\s*\d+(\s*:\s*\d+)?\s*$/, ""));
    }

    function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    notes.unshift(`Pascal <code>:=</code> assignment → <code>=</code>; <code>=</code> comparison → <code>==</code>.`);
    return { code: out.join("\n"), notes };
  }

  window.LAZARUS = window.LAZARUS || {};
  window.LAZARUS.pascal = translatePascal;
})();
