/* LAZARUS — Visual Basic 6 → JavaScript / Python translator (rule-based) */
/* global window */
(function () {
  "use strict";

  function translateVB6(src, lang) {
    const isPy = lang === "python";
    const IND = isPy ? "    " : "  ";
    const out = [];
    const notes = [];
    let indent = 0;
    const stack = []; // 'sub' | 'func:NAME' | 'if' | 'for' | 'do' | 'while' | 'select'

    const pushNote = n => { if (!notes.includes(n)) notes.push(n); };
    function emit(l) { out.push(IND.repeat(indent) + l); }

    function expr(e) {
      if (e == null) return "";
      let r = " " + e.trim() + " ";
      r = r.replace(/&/g, "+");                                // string concat
      r = r.replace(/\bAnd\b/gi, isPy ? "and" : "&&");
      r = r.replace(/\bOr\b/gi, isPy ? "or" : "||");
      r = r.replace(/\bNot\b/gi, isPy ? "not " : "!");
      r = r.replace(/<>/g, "!=");
      r = r.replace(/(^|[^<>=!])=([^=]|$)/g, "$1==$2");
      r = r.replace(/\bTrue\b/g, isPy ? "True" : "true");
      r = r.replace(/\bFalse\b/g, isPy ? "False" : "false");
      r = r.replace(/\bNothing\b/gi, isPy ? "None" : "null");
      r = r.replace(/\bvbCrLf\b/gi, isPy ? '"\\n"' : '"\\n"');
      r = r.replace(/\bLen\s*\(/gi, isPy ? "len(" : "String(");
      r = r.replace(/\bUCase\s*\(\s*([^)]+)\)/gi, isPy ? "$1.upper()".replace("$1", "$1") : "String($1).toUpperCase()");
      r = r.replace(/\bLCase\s*\(\s*([^)]+)\)/gi, isPy ? "$1.lower()" : "String($1).toLowerCase()");
      r = r.replace(/\bCStr\s*\(/gi, isPy ? "str(" : "String(");
      r = r.replace(/\bCInt\s*\(/gi, isPy ? "int(" : "parseInt(");
      r = r.replace(/\bCDbl\s*\(/gi, isPy ? "float(" : "parseFloat(");
      r = r.replace(/\bVal\s*\(/gi, isPy ? "float(" : "parseFloat(");
      return r.trim();
    }

    function condExpr(e) { return expr(e); }

    function defaultFor(type) {
      const t = (type || "Variant").toLowerCase();
      if (/integer|long|byte/.test(t)) return "0";
      if (/single|double|currency/.test(t)) return "0.0";
      if (/string/.test(t)) return '""';
      if (/boolean/.test(t)) return isPy ? "False" : "false";
      return isPy ? "None" : "null";
    }

    if (isPy) out.push('"""Resurrected by LAZARUS — VB6 → Python."""', "");
    else out.push("// Resurrected by LAZARUS — VB6 → JavaScript.", "");

    const lines = src.split(/\r?\n/);
    for (let raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      // comments
      let m;
      if ((m = line.match(/^(?:'|Rem\s)(.*)$/i))) { emit((isPy ? "# " : "// ") + m[1].trim()); continue; }
      // strip trailing comment
      line = stripTrailingComment(line);

      const U = line;

      if (/^Option\s+Explicit/i.test(U)) { pushNote("<code>Option Explicit</code> dropped — modern strict/let semantics cover it."); continue; }
      if (/^(Private|Public)?\s*Attribute\b/i.test(U)) continue;

      // Sub / Function
      if ((m = line.match(/^(?:Private\s+|Public\s+)?Sub\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i))) {
        const params = parseParams(m[2]);
        emit("");
        emit(isPy ? `def ${lc(m[1])}(${params.join(", ")}):` : `function ${lc(m[1])}(${params.join(", ")}) {`);
        indent++;
        stack.push("sub");
        pushNote(`<code>Sub ${m[1]}</code> → ${isPy ? "def" : "function"}.`);
        continue;
      }
      if ((m = line.match(/^(?:Private\s+|Public\s+)?Function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s+As\s+\w+)?/i))) {
        const params = parseParams(m[2]);
        emit("");
        emit(isPy ? `def ${lc(m[1])}(${params.join(", ")}):` : `function ${lc(m[1])}(${params.join(", ")}) {`);
        indent++;
        stack.push("func:" + m[1]);
        pushNote(`<code>Function ${m[1]}</code> → assignment to the function name becomes <code>return</code>.`);
        continue;
      }
      if (/^End\s+(Sub|Function)\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        stack.pop();
        continue;
      }

      // Dim
      if ((m = line.match(/^(?:Dim|Private|Public|Static)\s+(.+)$/i)) && !/\bSub\b|\bFunction\b/i.test(line)) {
        // Dim a As Integer, b As String
        const decls = m[1].split(",");
        for (const d of decls) {
          const dm = d.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+As\s+([A-Za-z_][A-Za-z0-9_]*))?/i);
          if (dm) emit((isPy ? "" : "let ") + lc(dm[1]) + " = " + defaultFor(dm[2]) + (isPy ? "  # " + (dm[2] || "Variant") : "; // " + (dm[2] || "Variant")));
        }
        pushNote("<code>Dim x As Type</code> → initialised variable; VB6 types map to natural defaults.");
        continue;
      }

      // Const
      if ((m = line.match(/^(?:Private\s+|Public\s+)?Const\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+As\s+\w+)?\s*=\s*(.+)$/i))) {
        emit((isPy ? "" : "const ") + m[1].toUpperCase() + " = " + expr(m[2]) + (isPy ? "  # const" : ";"));
        continue;
      }

      // MsgBox
      if ((m = line.match(/^(?:Call\s+)?MsgBox\s*\(?\s*(.+?)\)?\s*$/i))) {
        const arg = expr(m[1].split(",")[0]);
        emit(isPy ? `print(${arg})` : `alert(${arg});`);
        pushNote("<code>MsgBox</code> → " + (isPy ? "<code>print()</code>" : "<code>alert()</code>") + " (closest modern equivalent).");
        continue;
      }
      // InputBox
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*InputBox\s*\(\s*(.+?)\s*\)/i))) {
        emit(isPy ? `${lc(m[1])} = input(${expr(m[2].split(",")[0])})` : `${lc(m[1])} = prompt(${expr(m[2].split(",")[0])});`);
        pushNote("<code>InputBox</code> → interactive input.");
        continue;
      }
      // Debug.Print
      if ((m = line.match(/^Debug\.Print\s+(.+)$/i))) {
        emit(isPy ? `print(${expr(m[1])})` : `console.log(${expr(m[1])});`);
        continue;
      }

      // If / ElseIf / Else / End If
      if ((m = line.match(/^If\s+(.+?)\s+Then\s*$/i))) {
        emit(isPy ? `if ${condExpr(m[1])}:` : `if (${condExpr(m[1])}) {`);
        indent++; stack.push("if");
        continue;
      }
      if ((m = line.match(/^If\s+(.+?)\s+Then\s+(.+)$/i))) {
        // single-line if
        emit(isPy ? `if ${condExpr(m[1])}:` : `if (${condExpr(m[1])}) {`);
        emit(IND + inlineStmt(m[2]));
        if (!isPy) emit("}");
        continue;
      }
      if ((m = line.match(/^ElseIf\s+(.+?)\s+Then\s*$/i))) {
        indent = Math.max(0, indent - 1);
        emit(isPy ? `elif ${condExpr(m[1])}:` : `} else if (${condExpr(m[1])}) {`);
        indent++;
        continue;
      }
      if (/^Else\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        emit(isPy ? "else:" : "} else {");
        indent++;
        continue;
      }
      if (/^End\s+If\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        stack.pop();
        continue;
      }

      // For / Next
      if ((m = line.match(/^For\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(-?\d+))?\s*$/i))) {
        const [, v, a, b, step] = m;
        const s = step ? parseInt(step, 10) : 1;
        if (isPy) {
          emit(s === 1 ? `for ${lc(v)} in range(${expr(a)}, ${expr(b)} + 1):`
                       : `for ${lc(v)} in range(${expr(a)}, ${expr(b)} ${s > 0 ? "+ 1" : "- 1"}, ${s}):`);
        } else {
          emit(s > 0 ? `for (let ${lc(v)} = ${expr(a)}; ${lc(v)} <= ${expr(b)}; ${lc(v)} += ${s}) {`
                     : `for (let ${lc(v)} = ${expr(a)}; ${lc(v)} >= ${expr(b)}; ${lc(v)} -= ${-s}) {`);
        }
        indent++; stack.push("for");
        pushNote("VB6 <code>For..To</code> includes the end value — loop bounds adjusted.");
        continue;
      }
      if (/^Next\b/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        stack.pop();
        continue;
      }

      // Do While / Loop , Do Until / Loop
      if ((m = line.match(/^Do\s+While\s+(.+)$/i))) {
        emit(isPy ? `while ${condExpr(m[1])}:` : `while (${condExpr(m[1])}) {`);
        indent++; stack.push("do");
        continue;
      }
      if ((m = line.match(/^Do\s+Until\s+(.+)$/i))) {
        emit(isPy ? `while not (${condExpr(m[1])}):` : `while (!(${condExpr(m[1])})) {`);
        indent++; stack.push("do");
        pushNote("<code>Do Until</code> → <code>while not(…)</code>.");
        continue;
      }
      if (/^Loop\s*$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        stack.pop();
        continue;
      }
      if (/^Exit\s+(For|Do)\s*$/i.test(U)) { emit(isPy ? "break" : "break;"); continue; }
      if (/^Exit\s+(Sub|Function)\s*$/i.test(U)) { emit(isPy ? "return" : "return;"); continue; }

      // Select Case
      if ((m = line.match(/^Select\s+Case\s+(.+)$/i))) {
        stack.push("select:" + expr(m[1]));
        if (!isPy) { emit(`switch (${expr(m[1])}) {`); indent++; }
        pushNote("<code>Select Case</code> → " + (isPy ? "if/elif chain" : "<code>switch</code>") + ".");
        continue;
      }
      if ((m = line.match(/^Case\s+Else\s*$/i))) {
        const sel = [...stack].reverse().find(s2 => s2.startsWith("select:"));
        if (isPy) { if (stack[stack.length - 1] === "case") { indent = Math.max(0, indent - 1); } emit("else:"); indent++; if (stack[stack.length-1] !== "case") stack.push("case"); }
        else { emit("default:"); indent++; stack.push("case"); }
        continue;
      }
      if ((m = line.match(/^Case\s+(.+)$/i))) {
        const sel = [...stack].reverse().find(s2 => s2.startsWith("select:"));
        const selExpr = sel ? sel.slice(7) : "value";
        const first = !stack.includes("case");
        if (isPy) {
          if (!first) indent = Math.max(0, indent - 1);
          emit(`${first ? "if" : "elif"} ${selExpr} == ${expr(m[1])}:`);
          indent++;
          if (first) stack.push("case");
        } else {
          if (!first) { indent = Math.max(0, indent - 1); emit("break;"); indent = Math.max(0, indent - 1); }
          emit(`case ${expr(m[1])}:`);
          indent++;
          if (first) stack.push("case");
        }
        continue;
      }
      if (/^End\s+Select\s*$/i.test(U)) {
        if (stack[stack.length - 1] === "case") { stack.pop(); indent = Math.max(0, indent - 1); if (!isPy) { emit("break;"); } }
        const idx = stack.map(s2 => s2.startsWith("select:")).lastIndexOf(true);
        if (idx >= 0) stack.splice(idx, 1);
        if (!isPy) { indent = Math.max(0, indent - 1); emit("}"); }
        continue;
      }

      // Call statement
      if ((m = line.match(/^Call\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/i))) {
        emit(`${lc(m[1])}(${m[2] ? m[2].split(",").map(a => expr(a)).join(", ") : ""})` + (isPy ? "" : ";"));
        continue;
      }

      // assignment (function-name = value → return)
      if ((m = line.match(/^(?:Let\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+)$/))) {
        const fn = [...stack].reverse().find(s2 => s2.startsWith("func:"));
        if (fn && fn.slice(5).toLowerCase() === m[1].toLowerCase()) {
          emit("return " + expr(m[2]) + (isPy ? "" : ";"));
        } else {
          emit(`${lc(m[1])} = ${expr(m[2])}` + (isPy ? "" : ";"));
        }
        continue;
      }

      // bare call
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/)) && !/^(End|Wend)$/i.test(m[1])) {
        emit(`${lc(m[1])}(${m[2].split(",").map(a => expr(a)).join(", ")})` + (isPy ? "" : ";"));
        continue;
      }
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*$/))) {
        emit(`${lc(m[1])}()` + (isPy ? "" : ";"));
        continue;
      }

      emit((isPy ? "# TODO(vb6): " : "// TODO(vb6): ") + line);
      pushNote(`Untranslated line kept as TODO: <code>${escapeHtml(line.slice(0, 60))}</code>`);
    }

    function inlineStmt(s) {
      s = stripTrailingComment(s.trim());
      let mm;
      if ((mm = s.match(/^MsgBox\s+(.+)$/i))) return isPy ? `print(${expr(mm[1])})` : `alert(${expr(mm[1])});`;
      if ((mm = s.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+)$/))) return `${lc(mm[1])} = ${expr(mm[2])}` + (isPy ? "" : ";");
      if (/^Exit\s+(For|Do)/i.test(s)) return isPy ? "break" : "break;";
      if (/^Exit\s+(Sub|Function)/i.test(s)) return isPy ? "return" : "return;";
      return expr(s) + (isPy ? "" : ";");
    }

    function parseParams(p) {
      if (!p.trim()) return [];
      return p.split(",").map(x =>
        lc(x.trim().replace(/^(ByVal|ByRef|Optional)\s+/i, "").replace(/\s+As\s+\w+.*/i, ""))
      ).filter(Boolean);
    }

    function stripTrailingComment(l) {
      let inQ = false, res = "";
      for (const ch of l) {
        if (ch === '"') inQ = !inQ;
        if (ch === "'" && !inQ) break;
        res += ch;
      }
      return res.trim();
    }

    function lc(id) {
      // keep dotted names (obj.prop) but lowercase first letter of each part
      return id.split(".").map(p => p.charAt(0).toLowerCase() + p.slice(1)).join(".");
    }
    function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    notes.unshift("VB6 <code>&</code> string concatenation → <code>+</code>; identifiers converted to camelCase-style.");
    return { code: out.join("\n"), notes };
  }

  window.LAZARUS = window.LAZARUS || {};
  window.LAZARUS.vb6 = translateVB6;
})();
