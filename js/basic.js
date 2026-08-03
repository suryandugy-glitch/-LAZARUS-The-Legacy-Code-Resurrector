/* LAZARUS — Retro line-numbered BASIC → JavaScript / Python translator */
/* Handles GOTO via a program-counter loop (the classic trampoline trick). */
/* global window */
(function () {
  "use strict";

  function translateBASIC(src, lang) {
    const isPy = lang === "python";
    const notes = [];
    const pushNote = n => { if (!notes.includes(n)) notes.push(n); };

    // ---- parse numbered lines ----
    const prog = []; // {num, stmt}
    let hasGoto = false;
    for (let raw of src.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(\d+)\s+(.*)$/);
      if (!m) { prog.push({ num: null, stmt: line }); continue; }
      // split multiple statements on ':'
      const stmts = splitColon(m[2]);
      stmts.forEach((s, i) => prog.push({ num: i === 0 ? parseInt(m[1], 10) : null, stmt: s.trim() }));
      if (/\bGO\s?TO\b/i.test(m[2]) || /\bGOSUB\b/i.test(m[2]) || /\bTHEN\s+\d+\s*$/i.test(m[2])) hasGoto = true;
    }

    function splitColon(s) {
      const parts = []; let cur = "", inQ = false;
      for (const ch of s) {
        if (ch === '"') inQ = !inQ;
        if (ch === ":" && !inQ) { parts.push(cur); cur = ""; continue; }
        cur += ch;
      }
      parts.push(cur);
      return parts.filter(p => p.trim());
    }

    function expr(e) {
      if (e == null) return "";
      // protect string literals from keyword/variable rewriting
      const strings = [];
      let r = (" " + e.trim() + " ").replace(/"[^"]*"/g, s => {
        strings.push(s);
        return "§" + (strings.length - 1) + "§";
      });
      r = r.replace(/<>/g, "!=");
      r = r.replace(/(^|[^<>=!])=([^=]|$)/g, "$1==$2");
      r = r.replace(/\bAND\b/gi, isPy ? "and" : "&&");
      r = r.replace(/\bOR\b/gi, isPy ? "or" : "||");
      r = r.replace(/\bNOT\b/gi, isPy ? "not " : "!");
      r = r.replace(/\bRND\s*\(\s*\d*\s*\)/gi, isPy ? "random.random()" : "Math.random()");
      r = r.replace(/\bINT\s*\(/gi, isPy ? "int(" : "Math.floor(");
      r = r.replace(/\bABS\s*\(/gi, isPy ? "abs(" : "Math.abs(");
      r = r.replace(/\bSQR\s*\(/gi, isPy ? "math.sqrt(" : "Math.sqrt(");
      r = r.replace(/\bLEN\s*\(/gi, isPy ? "len(" : "String(");
      // variable names: A$ → a_s (string vars)
      r = r.replace(/\b([A-Za-z][A-Za-z0-9]*)\$/g, (_, v) => v.toLowerCase() + "_s");
      // lone uppercase vars → lowercase (avoid keywords/functions already replaced)
      r = r.replace(/\b([A-Z][A-Z0-9]*)\b(?!\s*\()/g, m2 =>
        /^(AND|OR|NOT|THEN|TO|STEP|Math|String)$/.test(m2) ? m2 : m2.toLowerCase());
      // restore string literals untouched
      r = r.replace(/§(\d+)§/g, (_, i) => strings[Number(i)]);
      return r.trim();
    }

    // ---- simple mode (no GOTO): straight translation ----
    // ---- goto mode: trampoline with program counter ----
    const usesRandom = /\bRND\b/i.test(src);

    const out = [];
    if (isPy) {
      out.push('"""Resurrected by LAZARUS — BASIC → Python."""');
      if (usesRandom) out.push("import random");
      if (/\bSQR\s*\(/i.test(src)) out.push("import math");
      out.push("");
    } else {
      out.push("// Resurrected by LAZARUS — BASIC → JavaScript.", "");
    }

    if (!hasGoto) {
      // straightforward structured translation
      const IND = isPy ? "    " : "  ";
      let indent = 0;
      const forStack = [];
      const emit = l => out.push(IND.repeat(indent) + l);

      if (isPy) { out.push("def main():"); indent = 1; }
      else { out.push("function main() {"); indent = 1; }

      let emitted = 0;
      for (const { stmt } of prog) {
        const t = translateStmt(stmt);
        if (t === null) continue;
        for (const l of t) { emit(l); emitted++; }
      }
      if (!emitted) emit(isPy ? "pass" : "// (empty program)");

      if (isPy) out.push("", 'if __name__ == "__main__":', "    main()");
      else out.push("}", "", "main();");

      function translateStmt(s) {
        let m;
        const U = s.toUpperCase().trim();
        if ((m = s.match(/^REM\s*(.*)$/i))) return [(isPy ? "# " : "// ") + m[1]];
        if ((m = s.match(/^PRINT\s*(.*)$/i))) {
          if (!m[1].trim()) return [isPy ? "print()" : "console.log();"];
          const args = m[1].split(/[;,]/).map(a => expr(a)).filter(Boolean).join(isPy ? ", " : ", ");
          return [isPy ? `print(${args})` : `console.log(${args});`];
        }
        if ((m = s.match(/^INPUT\s+(?:"([^"]*)"\s*[;,]\s*)?([A-Za-z][A-Za-z0-9]*\$?)$/i))) {
          const promptTxt = m[1] ? `"${m[1]}"` : '""';
          const v = expr(m[2]);
          pushNote("<code>INPUT</code> → interactive prompt.");
          return [isPy ? `${v} = input(${promptTxt})` : `${v} = prompt(${promptTxt});`];
        }
        if ((m = s.match(/^LET\s+(.+?)\s*=\s*(.+)$/i))) return [`${expr(m[1])} = ${expr(m[2])}` + (isPy ? "" : ";")];
        if ((m = s.match(/^FOR\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(-?\d+))?$/i))) {
          const [, v, a, b, st] = m;
          const step = st ? parseInt(st, 10) : 1;
          forStack.push(v.toLowerCase());
          const vv = v.toLowerCase();
          // emit header at current indent, then indent the body
          if (isPy) emit(step === 1 ? `for ${vv} in range(${expr(a)}, ${expr(b)} + 1):` : `for ${vv} in range(${expr(a)}, ${expr(b)} ${step > 0 ? "+ 1" : "- 1"}, ${step}):`);
          else emit(step > 0 ? `for (let ${vv} = ${expr(a)}; ${vv} <= ${expr(b)}; ${vv} += ${step}) {` : `for (let ${vv} = ${expr(a)}; ${vv} >= ${expr(b)}; ${vv} -= ${-step}) {`);
          emitted++;
          indent++;
          pushNote("BASIC <code>FOR..TO</code> is inclusive — bounds adjusted.");
          return [];
        }
        if (/^NEXT\b/i.test(U)) { indent = Math.max(1, indent - 1); forStack.pop(); return isPy ? [] : ["}"]; }
        if ((m = s.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i))) {
          const inner = translateStmt(m[2]);
          const res = [isPy ? `if ${expr(m[1])}:` : `if (${expr(m[1])}) {`];
          for (const l of (inner || [expr(m[2])])) res.push((isPy ? "    " : "  ") + l);
          if (!isPy) res.push("}");
          return res;
        }
        if (/^END\s*$/i.test(U) || /^STOP\s*$/i.test(U)) return [isPy ? "return" : "return;"];
        if ((m = s.match(/^([A-Za-z][A-Za-z0-9]*\$?)\s*=\s*(.+)$/))) return [`${expr(m[1])} = ${expr(m[2])}` + (isPy ? "" : ";")];
        pushNote(`Untranslated statement kept as TODO: <code>${esc(s.slice(0, 60))}</code>`);
        return [(isPy ? "# TODO(basic): " : "// TODO(basic): ") + s];
      }
    } else {
      // ---------- GOTO trampoline ----------
      pushNote("<code>GOTO</code>/<code>GOSUB</code> detected → resurrected as a <em>program-counter loop</em>: each BASIC line becomes a labelled block, jumps set the counter. Spaghetti preserved, but runnable!");
      const IND = isPy ? "    " : "  ";
      // group statements by line number
      const blocks = [];
      let cur = null;
      for (const p of prog) {
        if (p.num !== null) { cur = { num: p.num, stmts: [] }; blocks.push(cur); }
        if (cur) cur.stmts.push(p.stmt);
      }
      const nums = blocks.map(b => b.num);

      function nextLine(n) {
        const i = nums.indexOf(n);
        return i >= 0 && i + 1 < nums.length ? nums[i + 1] : -1;
      }

      function jsStmt(s, num) {
        let m;
        const U = s.toUpperCase().trim();
        if ((m = s.match(/^REM\s*(.*)$/i))) return [(isPy ? "# " : "// ") + m[1]];
        if ((m = s.match(/^GO\s?TO\s+(\d+)$/i))) return [pcSet(m[1]), br()];
        if ((m = s.match(/^GOSUB\s+(\d+)$/i))) return [pushRet(nextLine(num)), pcSet(m[1]), br()];
        if (/^RETURN\s*$/i.test(U)) return [isPy ? "pc = stack.pop()" : "pc = stack.pop();", br()];
        if ((m = s.match(/^IF\s+(.+?)\s+THEN\s+(\d+)\s*$/i)))
          return [isPy ? `if ${expr(m[1])}:` : `if (${expr(m[1])}) {`,
                  IND + pcSet(m[2]), IND + br(), ...(isPy ? [] : ["}"])];
        if ((m = s.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i))) {
          const inner = jsStmt(m[2], num);
          const res = [isPy ? `if ${expr(m[1])}:` : `if (${expr(m[1])}) {`];
          for (const l of inner) res.push(IND + l);
          if (!isPy) res.push("}");
          return res;
        }
        if ((m = s.match(/^PRINT\s*(.*)$/i))) {
          if (!m[1].trim()) return [isPy ? "print()" : "console.log();"];
          const args = m[1].split(/[;,]/).map(a => expr(a)).filter(Boolean).join(", ");
          return [isPy ? `print(${args})` : `console.log(${args});`];
        }
        if ((m = s.match(/^INPUT\s+(?:"([^"]*)"\s*[;,]\s*)?([A-Za-z][A-Za-z0-9]*\$?)$/i))) {
          const promptTxt = m[1] ? `"${m[1]}"` : '""';
          return [isPy ? `${expr(m[2])} = input(${promptTxt})` : `${expr(m[2])} = prompt(${promptTxt});`];
        }
        if ((m = s.match(/^LET\s+(.+?)\s*=\s*(.+)$/i))) return [`${expr(m[1])} = ${expr(m[2])}` + (isPy ? "" : ";")];
        if (/^END\s*$/i.test(U) || /^STOP\s*$/i.test(U)) return [isPy ? "pc = -1" : "pc = -1;", br()];
        if ((m = s.match(/^([A-Za-z][A-Za-z0-9]*\$?)\s*=\s*(.+)$/))) return [`${expr(m[1])} = ${expr(m[2])}` + (isPy ? "" : ";")];
        pushNote(`Untranslated statement kept as TODO: <code>${esc(s.slice(0, 60))}</code>`);
        return [(isPy ? "# TODO(basic): " : "// TODO(basic): ") + s];
      }
      function pcSet(n) { return isPy ? `pc = ${n}` : `pc = ${n};`; }
      function br() { return isPy ? "continue" : "break;"; }
      function pushRet(n) { return isPy ? `stack.append(${n})` : `stack.push(${n});`; }

      // collect variables
      const varSet = new Set();
      for (const b of blocks) for (const s of b.stmts) {
        const mm = s.match(/^(?:LET\s+)?([A-Za-z][A-Za-z0-9]*\$?)\s*=/i);
        if (mm) varSet.add(expr(mm[1]));
        const im = s.match(/^INPUT\s+(?:"[^"]*"\s*[;,]\s*)?([A-Za-z][A-Za-z0-9]*\$?)/i);
        if (im) varSet.add(expr(im[1]));
      }

      if (isPy) {
        for (const v of varSet) out.push(`${v} = 0`);
        out.push("stack = []", "");
        out.push(`pc = ${nums[0] ?? -1}`);
        out.push("while pc != -1:");
        let first = true;
        for (const b of blocks) {
          out.push(`    ${first ? "if" : "elif"} pc == ${b.num}:`);
          first = false;
          const lines2 = [];
          for (const s of b.stmts) lines2.push(...jsStmt(s, b.num));
          // default fallthrough to next line
          const hasJump = lines2.some(l => /^(pc = |continue)/.test(l.trim()));
          for (const l of lines2) out.push("        " + l);
          out.push(`        pc = ${nextLine(b.num)}`);
        }
        out.push("    else:", "        pc = -1");
      } else {
        for (const v of varSet) out.push(`let ${v} = 0;`);
        out.push("const stack = [];", "");
        out.push(`let pc = ${nums[0] ?? -1};`);
        out.push("while (pc !== -1) {");
        out.push("  switch (pc) {");
        for (const b of blocks) {
          out.push(`    case ${b.num}: {`);
          const lines2 = [];
          for (const s of b.stmts) lines2.push(...jsStmt(s, b.num));
          for (const l of lines2) out.push("      " + l);
          out.push(`      pc = ${nextLine(b.num)};`);
          out.push("      break;");
          out.push("    }");
        }
        out.push("    default: pc = -1;");
        out.push("  }");
        out.push("}");
      }
    }

    function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    notes.unshift("Line numbers removed; string variables like <code>A$</code> renamed to <code>a_s</code>.");
    return { code: out.join("\n"), notes };
  }

  window.LAZARUS = window.LAZARUS || {};
  window.LAZARUS.basic = translateBASIC;
})();
