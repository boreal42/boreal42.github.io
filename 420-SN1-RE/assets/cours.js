// 420-SN1-RE — Python dans la page : exemples, exercices vérifiés, sauvegarde et rapport.
(function () {
  "use strict";
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
  const CHAPITRE = document.body.dataset.chapitre || "";
  const CLE = "420sn1re:";
  let pyPromise = null;

  // ---------- Stockage local (peut être indisponible) ----------
  const stock = {
    lire(k) { try { return JSON.parse(localStorage.getItem(CLE + k)); } catch (e) { return null; } },
    ecrire(k, v) { try { localStorage.setItem(CLE + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---------- Python ----------
  const OUTILS = `
import hashlib, json
def _empreinte(v):
    if isinstance(v, bool) or v is None:
        texte = repr(v)
    elif isinstance(v, (int, float)):
        texte = f"{round(float(v), 4):.4f}"
        if texte == "-0.0000":
            texte = "0.0000"
    else:
        texte = repr(v)
    return hashlib.sha256(texte.encode()).hexdigest()[:12]

def _indice(v, h):
    # Indices ciblés pour les erreurs de débutant les plus fréquentes.
    if isinstance(v, tuple):
        if len(v) == 2 and all(isinstance(x, int) for x in v):
            try:
                if _empreinte(float(f"{v[0]}.{v[1]}")) == h:
                    return f"Ta valeur est bonne, mais tu as écrit une virgule. En Python, le séparateur décimal est le point : {v[0]}.{v[1]}"
            except ValueError:
                pass
        return "C'est un tuple : plusieurs valeurs séparées par une virgule. As-tu écrit une virgule au lieu d'un point décimal?"
    if isinstance(v, str):
        try:
            nombre = float(v.replace(",", "."))
            if _empreinte(nombre) == h or _empreinte(int(nombre)) == h:
                return "Ta valeur est bonne, mais c'est du texte : enlève les guillemets pour en faire un nombre."
        except ValueError:
            pass
        if _empreinte(v.strip()) == h:
            return "Presque : enlève les espaces au début ou à la fin du texte."
        for cand in (True, False):
            if v.strip().lower() in (repr(cand).lower(), "vrai" if cand else "faux") and _empreinte(cand) == h:
                return f"Bonne idée, mais True et False s'écrivent sans guillemets : {cand}"
    return ""

def _verifier(ns, checks):
    res = []
    for nom, h in checks:
        v = ns.get(nom, None)
        ok = None if v is None else _empreinte(v) == h
        res.append([nom, ok, repr(v), "" if ok in (None, True) else _indice(v, h)])
    return json.dumps(res)
`;

  function chargerPython() {
    if (!pyPromise) {
      pyPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = PYODIDE;
        s.onload = () => loadPyodide().then(async py => { await py.runPythonAsync(OUTILS); resolve(py); }, reject);
        s.onerror = () => reject(new Error("Impossible de charger Python. Vérifie ta connexion Internet, puis réessaie."));
        document.head.appendChild(s);
      });
    }
    return pyPromise;
  }

  function nettoyerErreur(message) {
    const lignes = String(message).trim().split("\n");
    const debut = lignes.findIndex(l => l.includes('File "<exec>"'));
    const utiles = debut >= 0 ? lignes.slice(debut) : lignes.slice(-1);
    return utiles.map(l => l.replace('File "<exec>", ', "")).join("\n");
  }

  // Exécute du code dans un espace de noms. Retourne {sortie, erreur}.
  async function executer(py, code, ns) {
    let sortie = "";
    py.setStdout({ batched: s => { sortie += s + "\n"; } });
    py.setStderr({ batched: s => { sortie += s + "\n"; } });
    try {
      await py.runPythonAsync(code, { globals: ns });
      return { sortie, erreur: null };
    } catch (err) {
      return { sortie, erreur: nettoyerErreur(err.message || err) };
    }
  }

  function ajuster(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 4 + "px"; }

  function brancherEditeur(zone, lancer) {
    ajuster(zone);
    zone.addEventListener("input", () => ajuster(zone));
    zone.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const d = zone.selectionStart;
        zone.value = zone.value.slice(0, d) + "    " + zone.value.slice(zone.selectionEnd);
        zone.selectionStart = zone.selectionEnd = d + 4;
        zone.dispatchEvent(new Event("input"));
      }
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); lancer(); }
    });
  }

  // ---------- Exemples de la théorie (espace de noms partagé par la page) ----------
  let nsExemples = null;
  document.querySelectorAll(".runner:not(.exo-runner)").forEach(bloc => {
    const zone = bloc.querySelector("textarea");
    const sortie = bloc.querySelector("output");
    const etat = bloc.querySelector(".status");
    const original = zone.value;
    const lancer = async () => {
      sortie.className = ""; sortie.textContent = "";
      etat.textContent = pyPromise ? "Exécution…" : "Chargement de Python (une seule fois, quelques secondes)…";
      try {
        const py = await chargerPython();
        if (!nsExemples) nsExemples = py.globals.get("dict")();
        const r = await executer(py, zone.value, nsExemples);
        sortie.textContent = r.sortie + (r.erreur || "") || "(aucun affichage)";
        sortie.className = r.erreur ? "err" : "";
        etat.textContent = r.erreur ? "Erreur" : "";
      } catch (e) { sortie.textContent = e.message; sortie.className = "err"; etat.textContent = ""; }
    };
    brancherEditeur(zone, lancer);
    bloc.querySelector(".run").addEventListener("click", lancer);
    bloc.querySelector(".reset").addEventListener("click", () => {
      zone.value = original; ajuster(zone); sortie.textContent = ""; sortie.className = ""; etat.textContent = "";
    });
  });

  // ---------- Exercices ----------
  const exercices = [...document.querySelectorAll(".exo")];

  function etatExo(exo) {
    return {
      code: exo.querySelector("textarea.code").value,
      fiche: Object.fromEntries([...exo.querySelectorAll(".fiche textarea")].map(t => [t.dataset.champ, t.value])),
      reussi: exo.dataset.reussi === "1",
    };
  }
  function sauver(exo) { stock.ecrire(CHAPITRE + ":" + exo.dataset.id, etatExo(exo)); majProgression(); }
  function marquer(exo, reussi) {
    exo.dataset.reussi = reussi ? "1" : "0";
    const b = exo.querySelector(".badge");
    b.textContent = reussi ? "✅ Réussi" : "À faire";
    b.className = "badge" + (reussi ? " ok" : "");
  }

  exercices.forEach(exo => {
    const zone = exo.querySelector("textarea.code");
    const sortie = exo.querySelector("output");
    const verdict = exo.querySelector(".verdict");
    const etat = exo.querySelector(".status");
    const depart = zone.value;
    const checks = JSON.parse(exo.dataset.checks);

    const sauve = stock.lire(CHAPITRE + ":" + exo.dataset.id);
    if (sauve) {
      if (typeof sauve.code === "string") zone.value = sauve.code;
      exo.querySelectorAll(".fiche textarea").forEach(t => { if (sauve.fiche && sauve.fiche[t.dataset.champ]) t.value = sauve.fiche[t.dataset.champ]; });
      marquer(exo, !!sauve.reussi);
    } else { marquer(exo, false); }

    let minuterie = null;
    const sauverPlusTard = () => { clearTimeout(minuterie); minuterie = setTimeout(() => sauver(exo), 400); };
    zone.addEventListener("input", sauverPlusTard);
    exo.querySelectorAll(".fiche textarea").forEach(t => {
      t.addEventListener("input", sauverPlusTard);
      ajuster(t); t.addEventListener("input", () => ajuster(t));
    });

    async function lancer(avecVerif) {
      sortie.className = ""; sortie.textContent = ""; verdict.innerHTML = "";
      etat.textContent = pyPromise ? "Exécution…" : "Chargement de Python (une seule fois, quelques secondes)…";
      let py;
      try { py = await chargerPython(); } catch (e) { sortie.textContent = e.message; sortie.className = "err"; etat.textContent = ""; return; }
      const ns = py.globals.get("dict")();
      const r = await executer(py, zone.value, ns);
      sortie.textContent = r.sortie + (r.erreur || "");
      if (r.erreur) sortie.className = "err";
      etat.textContent = "";
      if (!avecVerif) return;
      if (r.erreur) {
        verdict.innerHTML = '<p class="v-non">Corrige d\'abord l\'erreur ci-dessus, puis vérifie de nouveau.</p>';
        marquer(exo, false); sauver(exo); return;
      }
      const verifier = py.globals.get("_verifier");
      const res = JSON.parse(verifier(ns, py.toPy(checks)));
      const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const lignes = res.map(([nom, ok, valeur, indice]) => {
        if (ok === null) return `<li class="v-attente">⏳ <code>${nom}</code> : pas encore de réponse.</li>`;
        if (ok) return `<li class="v-oui">✅ <code>${nom}</code> : correct.</li>`;
        const v = valeur.length > 60 ? valeur.slice(0, 57) + "…" : valeur;
        return `<li class="v-non">❌ <code>${nom}</code> : pas encore. Tu as obtenu <code>${esc(v)}</code>.`
          + (indice ? `<br><span class="indice">💡 ${esc(indice)}</span>` : "") + `</li>`;
      });
      const tout = res.every(x => x[1] === true);
      verdict.innerHTML = `<ul>${lignes.join("")}</ul>` + (tout ? '<p class="v-oui"><strong>Exercice réussi.</strong></p>' : "");
      marquer(exo, tout); sauver(exo);
    }

    brancherEditeur(zone, () => lancer(false));
    exo.querySelector(".run").addEventListener("click", () => lancer(false));
    exo.querySelector(".check").addEventListener("click", () => lancer(true));
    exo.querySelector(".reset").addEventListener("click", () => {
      if (zone.value !== depart && !window.confirm("Effacer ton code et revenir au code de départ?")) return;
      zone.value = depart; ajuster(zone); sortie.textContent = ""; verdict.innerHTML = "";
      marquer(exo, false); sauver(exo);
    });
  });

  // ---------- Progression, nom, rapport, importation ----------
  const champNom = document.getElementById("nom-etudiant");
  if (champNom) {
    champNom.value = stock.lire("nom") || "";
    champNom.addEventListener("input", () => stock.ecrire("nom", champNom.value.trim()));
  }

  function majProgression() {
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    document.querySelectorAll(".progression").forEach(el => { el.textContent = `${n} / ${exercices.length} exercices réussis`; });
    document.querySelectorAll(".barre > span").forEach(el => { el.style.width = (exercices.length ? 100 * n / exercices.length : 0) + "%"; });
  }
  majProgression();

  function rapport() {
    const nom = (champNom && champNom.value.trim()) || "";
    const date = new Date();
    const donnees = { cours: "420-SN1-RE", chapitre: CHAPITRE, nom, date: date.toISOString(), exercices: {} };
    const parties = [];
    exercices.forEach(exo => {
      const e = etatExo(exo);
      donnees.exercices[exo.dataset.id] = e;
      let bloc = `# ${"=".repeat(60)}\n# Exercice ${exo.dataset.id} — ${e.reussi ? "RÉUSSI" : "non réussi"}\n# ${"=".repeat(60)}\n`;
      const f = Object.entries(e.fiche).filter(([, v]) => v.trim());
      if (f.length) bloc += "# Fiche de planification\n" + f.map(([k, v]) => `#   ${k} : ` + v.trim().replace(/\n/g, "\n#     ")).join("\n") + "\n#\n";
      parties.push(bloc + e.code + "\n");
    });
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    const entete = [
      `# 420-SN1-RE · Programmation en sciences`,
      `# Rapport du chapitre ${CHAPITRE}`,
      `# Étudiant : ${nom || "(nom non indiqué)"}`,
      `# Généré le : ${date.toLocaleString("fr-CA")}`,
      `# Résultat : ${n} / ${exercices.length} exercices réussis`,
      ``,
    ].join("\n");
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(donnees))));
    return entete + "\n" + parties.join("\n") + `\n# DONNEES: ${b64}\n`;
  }

  function telecharger() {
    const nom = ((champNom && champNom.value.trim()) || "etudiant").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_");
    const blob = new Blob([rapport()], { type: "text/x-python;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `420-SN1-RE_ch${CHAPITRE}_${nom}.py`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importer(fichier, message) {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const m = String(lecteur.result).match(/^# DONNEES: (\S+)\s*$/m);
      if (!m) { message.textContent = "Ce fichier n'est pas un rapport du cours."; return; }
      let d;
      try { d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { message.textContent = "Ce rapport est illisible."; return; }
      if (d.chapitre !== CHAPITRE) { message.textContent = `Ce rapport est celui du chapitre ${d.chapitre}. Ouvre la page de ce chapitre pour l'importer.`; return; }
      exercices.forEach(exo => {
        const e = d.exercices[exo.dataset.id];
        if (!e) return;
        const zone = exo.querySelector("textarea.code");
        zone.value = e.code; ajuster(zone);
        exo.querySelectorAll(".fiche textarea").forEach(t => { t.value = (e.fiche && e.fiche[t.dataset.champ]) || ""; ajuster(t); });
        marquer(exo, !!e.reussi); sauver(exo);
      });
      if (d.nom && champNom && !champNom.value) { champNom.value = d.nom; stock.ecrire("nom", d.nom); }
      message.textContent = "Travail importé.";
    };
    lecteur.readAsText(fichier);
  }

  document.querySelectorAll(".telecharger").forEach(b => b.addEventListener("click", telecharger));
  document.querySelectorAll(".importer").forEach(inp => inp.addEventListener("change", () => {
    if (inp.files[0]) importer(inp.files[0], document.getElementById("msg-import"));
    inp.value = "";
  }));

  // ---------- Table des matières ----------
  const liens = [...document.querySelectorAll(".toc a[href^='#']")];
  if (liens.length && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) liens.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    liens.forEach(a => { const h = document.getElementById(a.getAttribute("href").slice(1)); if (h) obs.observe(h); });
  }
})();
