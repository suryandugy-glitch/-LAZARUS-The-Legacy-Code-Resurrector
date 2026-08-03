/* Test harness for LAZARUS translators (Node) */
global.window = {};
require("../js/cobol.js");
require("../js/pascal.js");
require("../js/vb6.js");
require("../js/basic.js");
require("../js/samples.js");
const L = global.window.LAZARUS;

let failures = 0;
function section(t) { console.log("\n" + "=".repeat(60) + "\n" + t + "\n" + "=".repeat(60)); }
function check(name, cond) {
  console.log((cond ? "  PASS " : "  FAIL ") + name);
  if (!cond) failures++;
}

// run every sample through both target languages — must not throw
for (const [lang, samples] of Object.entries(L.samples)) {
  for (const s of samples) {
    for (const dst of ["python", "javascript"]) {
      section(`${lang} / "${s.name}" → ${dst}`);
      let r;
      try {
        r = L[lang](s.code, dst);
        console.log(r.code);
        check("produces non-empty code", r.code.trim().length > 20);
      } catch (e) {
        check("throws: " + e.message, false);
      }
    }
  }
}

// Execute the JS outputs to verify they actually run
section("EXECUTION TESTS (JavaScript outputs)");
const logs = [];
const origLog = console.log;

function runJs(code) {
  logs.length = 0;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    // eslint-disable-next-line no-eval
    eval(code);
    console.log = origLog;
    return { ok: true, logs: [...logs] };
  } catch (e) {
    console.log = origLog;
    return { ok: false, err: e.message };
  }
}

// COBOL payroll
{
  const r = L.cobol(L.samples.cobol[0].code, "javascript");
  const res = runJs(r.code + "\nmainPara();");
  check("COBOL payroll runs: " + JSON.stringify(res.logs || res.err), res.ok && res.logs.some(l => l.includes("NET PAY")));
  check("COBOL payroll math (gross 1020)", res.ok && res.logs.some(l => l.includes("1020")));
}
// COBOL counter
{
  const r = L.cobol(L.samples.cobol[1].code, "javascript");
  const res = runJs(r.code);
  check("COBOL counter runs: " + (res.err || res.logs.length + " lines"), res.ok && res.logs.filter(l => l.includes("COUNT IS")).length === 10);
}
// Pascal fibonacci
{
  const r = L.pascal(L.samples.pascal[0].code, "javascript");
  const res = runJs(r.code);
  check("Pascal fib runs: " + (res.err || res.logs.join(",")), res.ok && res.logs.includes("34"));
}
// Pascal repeat/until
{
  const r = L.pascal(L.samples.pascal[1].code, "javascript");
  const res = runJs(r.code);
  check("Pascal guess runs: " + (res.err || res.logs[res.logs.length - 1]), res.ok && res.logs.some(l => l.includes("7")));
}
// VB6 grade — uses alert; shim it
{
  const r = L.vb6(L.samples.vb6[0].code, "javascript");
  const res = runJs("const alerts=[]; const alert=m=>alerts.push(m);\n" + r.code + "\ncalculateGrade();\nconsole.log(alerts[0]);");
  check("VB6 grade runs: " + (res.err || res.logs[0]), res.ok && String(res.logs[0]).includes("B"));
}
// VB6 interest
{
  const r = L.vb6(L.samples.vb6[1].code, "javascript");
  const res = runJs("const alert=()=>{};\n" + r.code + "\ncompoundInterest();");
  check("VB6 interest runs: " + (res.err || res.logs.length + " lines"), res.ok && res.logs.length === 10 && res.logs[9].includes("10"));
}
// BASIC countdown (GOTO)
{
  const r = L.basic(L.samples.basic[0].code, "javascript");
  const res = runJs(r.code);
  check("BASIC GOTO countdown runs: " + (res.err || res.logs.join("|")), res.ok && res.logs.includes("LIFTOFF!") && res.logs.filter(l => l.includes("T-MINUS")).length === 10);
}
// BASIC times table
{
  const r = L.basic(L.samples.basic[1].code, "javascript");
  const res = runJs(r.code);
  check("BASIC times table runs: " + (res.err || res.logs.length + " lines"), res.ok && res.logs.some(l => l.includes("84")));
}

// Python outputs: syntax-check via python -c compile
const { execSync, writeFileSync } = { execSync: require("child_process").execSync, writeFileSync: require("fs").writeFileSync };
section("SYNTAX TESTS (Python outputs)");
let pyOk = true;
try { execSync("python --version", { stdio: "pipe" }); } catch { pyOk = false; console.log("  SKIP python not found"); }
if (pyOk) {
  for (const [lang, samples] of Object.entries(L.samples)) {
    samples.forEach((s, i) => {
      const r = L[lang](s.code, "python");
      const f = require("path").join(__dirname, `_tmp_${lang}_${i}.py`);
      writeFileSync(f, r.code);
      try {
        execSync(`python -m py_compile "${f}"`, { stdio: "pipe" });
        check(`${lang}[${i}] python compiles`, true);
      } catch (e) {
        console.log(r.code);
        check(`${lang}[${i}] python compiles: ${e.stderr}`, false);
      }
      try { require("fs").unlinkSync(f); } catch {}
    });
  }
}

console.log("\n" + (failures ? `${failures} FAILURE(S)` : "ALL TESTS PASSED"));
process.exit(failures ? 1 : 0);
