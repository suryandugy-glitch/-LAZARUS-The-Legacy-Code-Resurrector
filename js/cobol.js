/* LAZARUS — COBOL → Python / JavaScript translator (rule-based) */
/* global window */
(function () {
  "use strict";

  // Convert a COBOL identifier (WS-TOTAL-AMOUNT) to snake_case / camelCase
  function pyName(id) {
    return id.trim().toLowerCase().replace(/-/g, "_");
  }
  function jsName(id) {
    const parts = id.trim().toLowerCase().split("-");
    return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }

  // Parse a PIC clause into a default value + type note
  function picInfo(pic) {
    pic = pic.toUpperCase();
    if (/V|\./.test(pic)) return { py: "0.0", js: "0.0", type: "decimal number" };
    if (/^S?9/.test(pic)) return { py: "0", js: "0", type: "integer" };
    if (/^X/.test(pic)) return { py: '""', js: '""', type: "string" };
    if (/^A/.test(pic)) return { py: '""', js: '""', type: "alphabetic string" };
    return { py: "None", js: "null", type: "unknown" };
  }

  // Translate a COBOL expression / operand
  function expr(raw, lang) {
    if (raw == null) return "";
    let e = raw.trim();
    // string literals: COBOL uses ' or "
    if (/^'.*'$/.test(e)) return '"' + e.slice(1, -1).replace(/''/g, "'") + '"';
    if (/^".*"$/.test(e)) return e;
    if (/^-?\d+(\.\d+)?$/.test(e)) return e;
    if (/^ZERO(S|ES)?$/i.test(e)) return "0";
    if (/^SPACES?$/i.test(e)) return '""';
    // identifier
    if (/^[A-Za-z][A-Za-z0-9-]*$/.test(e)) return lang === "python" ? pyName(e) : jsName(e);
    // arithmetic expression — translate each identifier inside
    return e.replace(/[A-Za-z][A-Za-z0-9-]*/g, m =>
      /^(AND|OR|NOT)$/i.test(m) ? m.toLowerCase() : (lang === "python" ? pyName(m) : jsName(m))
    );
  }

  function condition(raw, lang) {
    let c = " " + raw.trim() + " ";
    c = c.replace(/\bIS\s+/gi, "")
         .replace(/\bNOT\s+EQUAL\s+TO?\b/gi, "!=")
         .replace(/\bEQUAL\s+TO?\b/gi, "==")
         .replace(/\bGREATER\s+THAN\s+OR\s+EQUAL\s+TO?\b/gi, ">=")
         .replace(/\bLESS\s+THAN\s+OR\s+EQUAL\s+TO?\b/gi, "<=")
         .replace(/\bGREATER\s+THAN\b/gi, ">")
         .replace(/\bLESS\s+THAN\b/gi, "<")
         .replace(/\bAND\b/gi, lang === "python" ? "and" : "&&")
         .replace(/\bOR\b/gi, lang === "python" ? "or" : "||")
         .replace(/\bNOT\b/gi, lang === "python" ? "not" : "!")
         .replace(/(^|[^<>=!])=([^=]|$)/g, "$1==$2");
    // translate identifiers & literals
    c = c.replace(/'[^']*'|"[^"]*"|[A-Za-z][A-Za-z0-9-]*|\d+(\.\d+)?/g, tok => {
      if (/^['"]/.test(tok) || /^\d/.test(tok)) return expr(tok, lang);
      if (/^(and|or|not)$/i.test(tok)) return tok;
      return expr(tok, lang);
    });
    return c.trim();
  }

  function translateCOBOL(src, lang) {
    const isPy = lang === "python";
    const IND = isPy ? "    " : "  ";
    const out = [];
    const notes = [];
    const vars = [];        // {name, pic, init}
    const paragraphs = {};  // name -> lines
    let currentPara = null;
    let inData = false, inProc = false;
    let indent = 0;
    const body = [];        // main body lines (before first paragraph)
    let blocks = [];        // stack for IF/PERFORM UNTIL end tracking

    function emit(line) {
      const target = currentPara ? paragraphs[currentPara] : body;
      target.push(IND.repeat(indent + (isPy ? 1 : 1)) + line);
    }

    const lines = src.split(/\r?\n/);

    for (let raw of lines) {
      // strip sequence numbers (cols 1-6) & comment indicator if fixed format
      let line = raw;
      if (/^\d{6}/.test(line)) line = line.slice(6);
      line = line.trim();
      if (!line) continue;
      if (line.startsWith("*") || line.startsWith("*>")) {
        emitComment(line.replace(/^\*>?/, "").trim());
        continue;
      }

      const U = line.toUpperCase();

      // divisions & sections
      if (/DIVISION\s*\.?$/.test(U)) {
        inData = /DATA\s+DIVISION/.test(U);
        inProc = /PROCEDURE\s+DIVISION/.test(U);
        if (/IDENTIFICATION/.test(U)) notes.push("Dropped <code>IDENTIFICATION DIVISION</code> — modern languages don't need program metadata blocks.");
        if (inData) notes.push("<code>DATA DIVISION</code> → variable declarations with inferred types from PIC clauses.");
        if (inProc) notes.push("<code>PROCEDURE DIVISION</code> → the program's main body; paragraphs become functions.");
        continue;
      }
      if (/SECTION\s*\.?$/.test(U)) continue;
      if (/^PROGRAM-ID/.test(U)) {
        const name = line.split(/[.\s]+/)[1] || "PROGRAM";
        notes.push(`Program <code>${name}</code> — name preserved as a header comment.`);
        out.push((isPy ? "# " : "// ") + "Resurrected from COBOL program: " + name);
        continue;
      }
      if (/^(AUTHOR|DATE-WRITTEN|ENVIRONMENT|CONFIGURATION|SOURCE-COMPUTER|OBJECT-COMPUTER|WORKING-STORAGE)/.test(U)) {
        if (/WORKING-STORAGE/.test(U)) inData = true;
        continue;
      }

      // DATA DIVISION: level-number entries
      if (inData && !inProc) {
        const m = line.match(/^(\d{2})\s+([A-Za-z][A-Za-z0-9-]*)(?:\s+PIC(?:TURE)?\s+(\S+?))?(?:\s+VALUE\s+(.+?))?\s*\.?\s*$/i);
        if (m) {
          let [, , name, pic, value] = m;
          if (pic) pic = pic.replace(/\.$/, "");
          if (name.toUpperCase() === "FILLER") continue;
          let init, typeNote;
          if (value !== undefined) {
            init = expr(value.trim(), lang);
            typeNote = "initialised from VALUE clause";
          } else if (pic) {
            const info = picInfo(pic);
            init = isPy ? info.py : info.js;
            typeNote = `PIC ${pic} → ${info.type}`;
          } else {
            init = isPy ? "None" : "null";
            typeNote = "group item";
          }
          vars.push({ name: isPy ? pyName(name) : jsName(name), init, typeNote, orig: name });
          continue;
        }
        continue;
      }

      if (!inProc) continue;

      // PROCEDURE DIVISION statements ----------------------------------
      // paragraph label?  e.g.  MAIN-PARA.
      const paraM = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*\.\s*$/);
      if (paraM && !/^(STOP|EXIT|GOBACK)$/i.test(paraM[1])) {
        currentPara = isPy ? pyName(paraM[1]) : jsName(paraM[1]);
        paragraphs[currentPara] = [];
        indent = 0;
        notes.push(`Paragraph <code>${paraM[1]}</code> → function <code>${currentPara}()</code>.`);
        continue;
      }

      // a line may contain multiple sentences; handle common single statements
      const stmts = line.replace(/\.\s*$/, "").split(/\.\s+/);
      for (let stmt of stmts) {
        stmt = stmt.trim();
        if (!stmt) continue;
        translateStmt(stmt);
      }
    }

    function emitComment(text) {
      emit((isPy ? "# " : "// ") + text);
    }

    function translateStmt(stmt) {
      const U = stmt.toUpperCase();
      let m;

      if ((m = stmt.match(/^DISPLAY\s+(.+)$/i))) {
        // DISPLAY 'A' B 'C'  → print("A", b, "C")
        const parts = splitOperands(m[1]);
        const args = parts.map(p => expr(p, lang)).join(", ");
        emit(isPy ? `print(${args})` : `console.log(${args});`);
        return;
      }
      if ((m = stmt.match(/^ACCEPT\s+([A-Za-z][A-Za-z0-9-]*)/i))) {
        const v = expr(m[1], lang);
        emit(isPy ? `${v} = input()` : `${v} = prompt("${m[1]}?");`);
        notes.push(`<code>ACCEPT</code> → ${isPy ? "<code>input()</code>" : "<code>prompt()</code>"} (interactive read).`);
        return;
      }
      if ((m = stmt.match(/^MOVE\s+(.+?)\s+TO\s+(.+)$/i))) {
        const val = expr(m[1], lang);
        for (const t of splitOperands(m[2])) emit(`${expr(t, lang)} = ${val}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^COMPUTE\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(.+)$/i))) {
        emit(`${expr(m[1], lang)} = ${expr(m[2], lang)}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^ADD\s+(.+?)\s+TO\s+([A-Za-z][A-Za-z0-9-]*)(?:\s+GIVING\s+([A-Za-z][A-Za-z0-9-]*))?$/i))) {
        if (m[3]) emit(`${expr(m[3], lang)} = ${expr(m[2], lang)} + ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        else emit(`${expr(m[2], lang)} += ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^SUBTRACT\s+(.+?)\s+FROM\s+([A-Za-z][A-Za-z0-9-]*)(?:\s+GIVING\s+([A-Za-z][A-Za-z0-9-]*))?$/i))) {
        if (m[3]) emit(`${expr(m[3], lang)} = ${expr(m[2], lang)} - ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        else emit(`${expr(m[2], lang)} -= ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^MULTIPLY\s+(.+?)\s+BY\s+([A-Za-z][A-Za-z0-9-]*)(?:\s+GIVING\s+([A-Za-z][A-Za-z0-9-]*))?$/i))) {
        if (m[3]) emit(`${expr(m[3], lang)} = ${expr(m[2], lang)} * ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        else emit(`${expr(m[2], lang)} *= ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^DIVIDE\s+(.+?)\s+(?:INTO|BY)\s+([A-Za-z][A-Za-z0-9-]*)(?:\s+GIVING\s+([A-Za-z][A-Za-z0-9-]*))?$/i))) {
        if (m[3]) emit(`${expr(m[3], lang)} = ${expr(m[2], lang)} / ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        else emit(`${expr(m[2], lang)} /= ${expr(m[1], lang)}` + (isPy ? "" : ";"));
        return;
      }
      if ((m = stmt.match(/^IF\s+(.+?)(?:\s+THEN)?$/i)) && !/END-IF/i.test(stmt)) {
        emit(isPy ? `if ${condition(m[1], lang)}:` : `if (${condition(m[1], lang)}) {`);
        indent++;
        blocks.push("if");
        return;
      }
      if (/^ELSE$/i.test(U)) {
        indent--;
        emit(isPy ? "else:" : "} else {");
        indent++;
        return;
      }
      if (/^END-IF$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        blocks.pop();
        return;
      }
      if ((m = stmt.match(/^PERFORM\s+([A-Za-z][A-Za-z0-9-]*)\s+(\d+)\s+TIMES$/i))) {
        const fn = isPy ? pyName(m[1]) : jsName(m[1]);
        if (isPy) { emit(`for _ in range(${m[2]}):`); emit(IND + `${fn}()`); }
        else { emit(`for (let i = 0; i < ${m[2]}; i++) {`); emit(IND + `${fn}();`); emit(`}`); }
        return;
      }
      if ((m = stmt.match(/^PERFORM\s+UNTIL\s+(.+)$/i))) {
        const c = condition(m[1], lang);
        emit(isPy ? `while not (${c}):` : `while (!(${c})) {`);
        indent++;
        blocks.push("perform");
        notes.push("<code>PERFORM UNTIL</code> → <code>while not(…)</code> — COBOL loops until true, modern loops while true.");
        return;
      }
      if (/^END-PERFORM$/i.test(U)) {
        indent = Math.max(0, indent - 1);
        if (!isPy) emit("}");
        blocks.pop();
        return;
      }
      if ((m = stmt.match(/^PERFORM\s+([A-Za-z][A-Za-z0-9-]*)$/i))) {
        const fn = isPy ? pyName(m[1]) : jsName(m[1]);
        emit(`${fn}()` + (isPy ? "" : ";"));
        return;
      }
      if (/^(STOP\s+RUN|GOBACK|EXIT\s+PROGRAM)\.?$/i.test(U)) {
        emit(isPy ? "return" : "return;");
        notes.push("<code>STOP RUN</code> → <code>return</code> from main.");
        return;
      }
      if ((m = stmt.match(/^STRING\s+(.+?)\s+DELIMITED\s+BY\s+SIZE\s+INTO\s+([A-Za-z][A-Za-z0-9-]*)/i))) {
        const parts = splitOperands(m[1]).map(p => expr(p, lang));
        emit(isPy ? `${expr(m[2], lang)} = ${parts.join(" + ")}`
                  : `${expr(m[2], lang)} = ${parts.join(" + ")};`);
        return;
      }
      if ((m = stmt.match(/^INITIALIZE\s+(.+)$/i))) {
        for (const t of splitOperands(m[1])) emit(`${expr(t, lang)} = ${isPy ? "0" : "0"}` + (isPy ? "" : ";"));
        return;
      }
      // fallback: keep as comment so nothing is silently lost
      emit((isPy ? "# TODO(cobol): " : "// TODO(cobol): ") + stmt);
      notes.push(`Untranslated statement kept as TODO: <code>${escapeHtml(stmt.slice(0, 60))}</code>`);
    }

    // split DISPLAY-style operand lists, respecting quotes
    function splitOperands(s) {
      const parts = [];
      let cur = "", inQ = null;
      for (const ch of s) {
        if (inQ) { cur += ch; if (ch === inQ) inQ = null; }
        else if (ch === "'" || ch === '"') { cur += ch; inQ = ch; }
        else if (/\s/.test(ch)) { if (cur) { parts.push(cur); cur = ""; } }
        else cur += ch;
      }
      if (cur) parts.push(cur);
      return parts;
    }

    // -------- assemble output --------
    // if the main body is empty but paragraphs exist, COBOL falls through
    // into the first paragraph — replicate that by calling it from main
    const paraNames = Object.keys(paragraphs);
    if (!body.length && paraNames.length) {
      body.push(IND + paraNames[0] + "()" + (isPy ? "" : ";"));
    }

    const header = out.slice();
    const res = [];
    res.push(...header);
    if (isPy) {
      res.push('"""Resurrected by LAZARUS — COBOL → Python."""', "");
      if (vars.length) {
        for (const v of vars) res.push(`${v.name} = ${v.init}  # ${v.typeNote}`);
        res.push("");
      }
      for (const [name, lines2] of Object.entries(paragraphs)) {
        res.push(`def ${name}():`);
        if (vars.length) res.push(`    global ${vars.map(v => v.name).join(", ")}`);
        res.push(...(lines2.length ? lines2 : ["    pass"]));
        res.push("");
      }
      res.push("def main():");
      res.push(...(body.length ? body : ["    pass"]));
      res.push("", 'if __name__ == "__main__":', "    main()");
    } else {
      res.push("// Resurrected by LAZARUS — COBOL → JavaScript.", "");
      if (vars.length) {
        for (const v of vars) res.push(`let ${v.name} = ${v.init}; // ${v.typeNote}`);
        res.push("");
      }
      for (const [name, lines2] of Object.entries(paragraphs)) {
        res.push(`function ${name}() {`);
        res.push(...lines2);
        res.push("}", "");
      }
      res.push("function main() {");
      res.push(...body);
      res.push("}", "", "main();");
    }

    if (vars.length) notes.unshift(`${vars.length} WORKING-STORAGE variable(s) declared with types inferred from PIC clauses.`);
    notes.unshift(`COBOL identifiers converted to ${isPy ? "snake_case" : "camelCase"} (e.g. <code>WS-TOTAL</code> → <code>${isPy ? "ws_total" : "wsTotal"}</code>).`);

    return { code: res.join("\n"), notes };
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.LAZARUS = window.LAZARUS || {};
  window.LAZARUS.cobol = translateCOBOL;
})();
