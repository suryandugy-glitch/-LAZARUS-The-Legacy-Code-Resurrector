/* LAZARUS — app glue: UI wiring, translation dispatch, local-AI refinement */
/* global window, document, fetch, navigator */
(function () {
  "use strict";

  const L = window.LAZARUS;

  const srcLang = document.getElementById("srcLang");
  const dstLang = document.getElementById("dstLang");
  const sampleSel = document.getElementById("sampleSel");
  const srcCode = document.getElementById("srcCode");
  const dstCode = document.getElementById("dstCode");
  const explanation = document.getElementById("explanation");
  const resurrectBtn = document.getElementById("resurrectBtn");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const aiBtn = document.getElementById("aiBtn");
  const aiUrl = document.getElementById("aiUrl");
  const aiStatus = document.getElementById("aiStatus");

  const LANG_LABEL = { cobol: "COBOL", pascal: "Pascal", vb6: "Visual Basic 6", basic: "BASIC" };
  const DST_LABEL = { python: "Python 3", javascript: "JavaScript" };

  // ---- populate samples for selected language ----
  function refreshSamples() {
    const lang = srcLang.value;
    sampleSel.innerHTML = '<option value="">— choose a sample —</option>';
    (L.samples[lang] || []).forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = s.name;
      sampleSel.appendChild(opt);
    });
  }
  srcLang.addEventListener("change", refreshSamples);
  sampleSel.addEventListener("change", () => {
    const s = (L.samples[srcLang.value] || [])[Number(sampleSel.value)];
    if (s) srcCode.value = s.code;
  });
  refreshSamples();

  // ---- resurrect! ----
  function resurrect() {
    const src = srcCode.value;
    if (!src.trim()) {
      dstCode.innerHTML = "<code>// The grave is empty. Paste some dead code first…</code>";
      return;
    }
    const translator = L[srcLang.value];
    if (!translator) return;

    let result;
    try {
      result = translator(src, dstLang.value);
    } catch (err) {
      dstCode.textContent = "// Resurrection failed: " + err.message;
      return;
    }

    dstCode.textContent = result.code;
    dstCode.classList.remove("risen");
    void dstCode.offsetWidth; // restart animation
    dstCode.classList.add("risen");

    // explanation panel
    const items = result.notes.map(n => `<li>${n}</li>`).join("");
    explanation.innerHTML =
      `<p><strong>${LANG_LABEL[srcLang.value]}</strong> (†) resurrected as <strong>${DST_LABEL[dstLang.value]}</strong>:</p>
       <ul>${items}</ul>
       <p class="muted">Rule-based translation — review TODO lines before running in production. For a deeper rewrite, try the local-AI refinement below.</p>`;
  }

  resurrectBtn.addEventListener("click", resurrect);
  srcCode.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") resurrect();
  });

  // ---- copy / clear ----
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(dstCode.textContent);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    } catch { /* clipboard unavailable */ }
  });
  clearBtn.addEventListener("click", () => { srcCode.value = ""; sampleSel.value = ""; });

  // ---- optional local AI refinement via GPT4All-compatible API ----
  aiBtn.addEventListener("click", async () => {
    const src = srcCode.value.trim();
    const draft = dstCode.textContent;
    if (!src) { setAi("Paste some source code first.", false); return; }

    setAi("Summoning local model…", null);
    aiBtn.disabled = true;
    try {
      const res = await fetch(aiUrl.value, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "any",
          max_tokens: 1024,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content:
                `You are a legacy code modernization expert. Translate this ${LANG_LABEL[srcLang.value]} program to idiomatic ${DST_LABEL[dstLang.value]}. ` +
                `A rule-based draft translation is provided; improve it (fix TODOs, make it idiomatic) and output ONLY the final code, no explanation.\n\n` +
                `--- ORIGINAL ${LANG_LABEL[srcLang.value]} ---\n${src}\n\n--- DRAFT ---\n${draft}`
            }
          ]
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (!text.trim()) throw new Error("empty response");
      // strip markdown fences if the model added them
      const cleaned = text.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
      dstCode.textContent = cleaned;
      dstCode.classList.remove("risen"); void dstCode.offsetWidth; dstCode.classList.add("risen");
      setAi("Refined by local AI ✓", true);
    } catch (err) {
      setAi("Could not reach local model (" + err.message + "). Is GPT4All's API server running?", false);
    } finally {
      aiBtn.disabled = false;
    }
  });

  function setAi(msg, ok) {
    aiStatus.textContent = msg;
    aiStatus.className = "ai-status" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  // ---- demo mode via URL params (used for screenshots/demos) ----
  // ?lang=cobol&sample=0&dst=python&auto=1
  const qp = new URLSearchParams(location.search);
  if (qp.get("lang")) {
    srcLang.value = qp.get("lang");
    refreshSamples();
    if (qp.get("dst")) dstLang.value = qp.get("dst");
    if (qp.get("sample") !== null) {
      sampleSel.value = qp.get("sample");
      const s = (L.samples[srcLang.value] || [])[Number(qp.get("sample"))];
      if (s) srcCode.value = s.code;
    }
    if (qp.get("auto")) resurrect();
  }
})();
