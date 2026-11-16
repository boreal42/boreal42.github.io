// 420-SN1-RE — Python dans la page : exemples, exercices vérifiés, sauvegarde et rapport.
(function () {
  "use strict";
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
  const CHAPITRE = document.body.dataset.chapitre || "";
  const TYPE = document.body.dataset.type || "chapitre";
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

  function init() {
  // ---------- Champs libres inclus au rapport (coéquipier, billet de sortie) ----------
  const champsExtras = [...document.querySelectorAll("[data-rapport]")];
  function lireExtras() { return Object.fromEntries(champsExtras.map(c => [c.dataset.rapport, c.value])); }
  function ecrireExtras(d) {
    champsExtras.forEach(c => { if (d[c.dataset.rapport] !== undefined) { c.value = d[c.dataset.rapport]; if (c.tagName === "TEXTAREA") ajuster(c); } });
    stock.ecrire(CHAPITRE + ":extras", lireExtras());
  }
  const extrasSauves = stock.lire(CHAPITRE + ":extras");
  if (extrasSauves) ecrireExtras(extrasSauves);
  champsExtras.forEach(c => {
    if (c.tagName === "TEXTAREA") { ajuster(c); c.addEventListener("input", () => ajuster(c)); }
    c.addEventListener("input", () => stock.ecrire(CHAPITRE + ":extras", lireExtras()));
  });

  // ---------- Quiz d'entrée (une seule validation) ----------
  const quiz = document.querySelector(".quiz");
  function normaliser(t) {
    return String(t).trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  }
  async function empreinteTexte(t) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normaliser(t)));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  }
  function valeurQuestion(q) {
    const choix = q.querySelector("input[type=radio]:checked");
    if (q.querySelector("input[type=radio]")) return choix ? choix.value : "";
    return q.querySelector("input[type=text]").value;
  }
  function etatQuiz() {
    if (!quiz) return null;
    const qs = [...quiz.querySelectorAll(".q")];
    const reponses = qs.map(q => ({ valeur: valeurQuestion(q), ok: q.dataset.ok === "1" ? true : q.dataset.ok === "0" ? false : null }));
    return { valide: quiz.dataset.valide === "1", score: reponses.filter(r => r.ok === true).length, total: qs.length, reponses };
  }
  function afficherQuiz() {
    const e = etatQuiz();
    quiz.querySelectorAll(".q").forEach(q => {
      const m = q.querySelector(".q-verdict");
      m.textContent = q.dataset.ok === "1" ? "✅" : q.dataset.ok === "0" ? "❌" : "";
    });
    if (e.valide) {
      quiz.querySelectorAll("input").forEach(i => { i.disabled = true; });
      quiz.querySelector(".valider-quiz").disabled = true;
      quiz.querySelector(".score").textContent = `Résultat : ${e.score} / ${e.total}. Les réponses seront revues en classe.`;
    }
  }
  if (quiz) {
    const sauve = stock.lire(CHAPITRE + ":quiz");
    if (sauve) {
      const qs = [...quiz.querySelectorAll(".q")];
      sauve.reponses.forEach((r, i) => {
        const q = qs[i]; if (!q) return;
        const radio = [...q.querySelectorAll("input[type=radio]")].find(x => x.value === r.valeur);
        if (radio) radio.checked = true;
        const txt = q.querySelector("input[type=text]"); if (txt) txt.value = r.valeur;
        if (r.ok !== null) q.dataset.ok = r.ok ? "1" : "0";
      });
      if (sauve.valide) quiz.dataset.valide = "1";
      afficherQuiz();
    }
    quiz.addEventListener("input", () => { if (quiz.dataset.valide !== "1") stock.ecrire(CHAPITRE + ":quiz", etatQuiz()); });
    quiz.querySelector(".valider-quiz").addEventListener("click", async () => {
      const qs = [...quiz.querySelectorAll(".q")];
      if (qs.some(q => !valeurQuestion(q).trim()) && !window.confirm("Certaines questions sont sans réponse. Valider quand même? Tu ne pourras plus modifier tes réponses.")) return;
      if (!qs.some(q => !valeurQuestion(q).trim()) && !window.confirm("Valider tes réponses? Tu ne pourras plus les modifier.")) return;
      for (const q of qs) {
        const attendues = JSON.parse(q.dataset.h);
        q.dataset.ok = attendues.includes(await empreinteTexte(valeurQuestion(q))) ? "1" : "0";
      }
      quiz.dataset.valide = "1";
      stock.ecrire(CHAPITRE + ":quiz", etatQuiz());
      afficherQuiz();
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
    const extras = lireExtras();
    donnees.extras = extras;
    donnees.quiz = etatQuiz();
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    const lignesExtras = Object.entries(extras).filter(([, v]) => v.trim()).map(([k, v]) => `# ${k} : ` + v.trim().replace(/\n/g, "\n#   "));
    const lignesQuiz = donnees.quiz ? [`# Quiz d'entrée : ${donnees.quiz.score} / ${donnees.quiz.total}` + (donnees.quiz.valide ? "" : " (non validé)"),
      ...donnees.quiz.reponses.map((r, i) => `#   Q${i + 1} ${r.ok === true ? "✓" : r.ok === false ? "✗" : "·"} ${r.valeur}`)] : [];
    const entete = [
      `# 420-SN1-RE · Programmation en sciences`,
      `# Rapport ${TYPE === "labo" ? "du labo " + CHAPITRE.replace("L", "") : "du chapitre " + CHAPITRE}`,
      `# Étudiant : ${nom || "(nom non indiqué)"}`,
      `# Généré le : ${date.toLocaleString("fr-CA")}`,
      `# Résultat : ${n} / ${exercices.length} exercices réussis`,
      ...lignesQuiz,
      ...lignesExtras,
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
    a.download = `420-SN1-RE_${TYPE === "labo" ? "labo" + CHAPITRE.replace("L", "") : "ch" + CHAPITRE}_${nom}.py`;
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
      if (d.extras) ecrireExtras(d.extras);
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
  }

  // ---------- Verrou des laboratoires : le contenu est chiffré avec le code d'accès ----------
  // Le code tapé peut contenir des espaces, des majuscules ou des guillemets copiés : on les ignore.
  function normaliserCode(c) { return String(c).toLowerCase().replace(/[\s`'"«»“”‘’]/g, ""); }
  function b64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  async function dechiffrer(code, paquet) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normaliserCode(code)), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(paquet.sel), iterations: paquet.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(paquet.iv) }, cle, b64(paquet.donnees));
    return new TextDecoder().decode(clair);
  }
  const verrou = document.getElementById("verrou");
  if (verrou && !(window.crypto && crypto.subtle)) {
    verrou.querySelector(".msg").textContent = "Ce navigateur ne peut pas ouvrir le labo. Utilise une version récente de Chrome, Firefox, Edge ou Safari.";
  } else if (verrou) {
    const paquet = JSON.parse(document.getElementById("labo-chiffre").textContent);
    const form = verrou.querySelector("form");
    const champ = verrou.querySelector("input");
    const msg = verrou.querySelector(".msg");
    const ouvrir = async (code, silencieux) => {
      try {
        const html = await dechiffrer(code, paquet);
        document.getElementById("contenu-labo").innerHTML = html;
        verrou.hidden = true;
        document.querySelectorAll(".apres-verrou").forEach(e => { e.hidden = false; });
        stock.ecrire(CHAPITRE + ":code", normaliserCode(code));
        init();
        if (location.hash) { const cible = document.getElementById(location.hash.slice(1)); if (cible) cible.scrollIntoView(); }
      } catch (e) {
        if (!silencieux) { msg.textContent = "Ce code ne fonctionne pas. Vérifie-le avec ton enseignant."; champ.select(); }
      }
    };
    form.addEventListener("submit", e => { e.preventDefault(); msg.textContent = "Ouverture…"; ouvrir(champ.value, false); });
    const connu = stock.lire(CHAPITRE + ":code");
    if (connu) ouvrir(connu, true);
  } else {
    init();
  }
})();
