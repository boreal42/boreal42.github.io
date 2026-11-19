// IntroIA — Python dans la page : exemples, exercices vérifiés, sauvegarde et rapport.
(function () {
  "use strict";
  const CHAPITRE_PAGE = document.body.dataset.chapitre || "";
  let CHAPITRE = CHAPITRE_PAGE;   // + lettre de version (A, B, C) pour les épreuves en plusieurs versions
  const TYPE = document.body.dataset.type || "chapitre";
  const CLE = "introia:";

  // ---------- Stockage local (peut être indisponible) ----------
  const stock = {
    lire(k) { try { return JSON.parse(localStorage.getItem(CLE + k)); } catch (e) { return null; } },
    ecrire(k, v) { try { localStorage.setItem(CLE + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---------- Python ----------
  // ---------- Python, exécuté en arrière-plan (Web Worker) ----------
  // Un programme qui dépasse LIMITE_MS (boucle infinie) est arrêté : on détruit le worker et on en recrée un.
  const LIMITE_MS = 15000;
  const SCRIPT = document.currentScript ? document.currentScript.src : "";
  const URL_WORKER = SCRIPT.replace(/cours\.js/, "python-worker.js");
  let worker = null, pretP = null, pyPret = false, seq = 0;
  const attente = new Map();
  function demarrer() {
    worker = new Worker(URL_WORKER);
    pyPret = false;
    pretP = new Promise((resolve, reject) => {
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === "pret") { pyPret = true; resolve(); }
        else if (m.type === "echec") reject(new Error("Impossible de charger Python. Vérifie ta connexion Internet, puis réessaie."));
        else if (m.type === "debut") { const r = attente.get(m.id); if (r) { clearTimeout(r.minuterie); r.minuterie = setTimeout(r.depasse, LIMITE_MS); } }
        else if (m.type === "resultat") { const r = attente.get(m.id); if (r) { attente.delete(m.id); clearTimeout(r.minuterie); r.resolve(m); } }
      };
      worker.onerror = () => reject(new Error("Impossible de charger Python. Vérifie ta connexion Internet, puis réessaie."));
    });
  }
  // Fichiers de données de la page (CSV, texte), copiés dans le dossier de travail de Python à chaque exécution.
  let FICHIERS = null;
  try { const f = document.getElementById("fichiers-donnees"); if (f) FICHIERS = JSON.parse(f.textContent); } catch (e) {}

  // Affiche les graphiques Matplotlib renvoyés par Python sous la sortie d'un bloc.
  function afficherFigures(bloc, figures) {
    let zone = bloc.querySelector(".figures");
    if (!zone) { zone = document.createElement("div"); zone.className = "figures"; bloc.querySelector("output").after(zone); }
    zone.innerHTML = "";
    (figures || []).forEach(b64 => { const img = document.createElement("img"); img.src = "data:image/png;base64," + b64; img.alt = "Graphique produit par le code"; zone.appendChild(img); });
  }
  window.afficherFigures = afficherFigures;

  const modulesCharges = new Set();
  function messageChargement(code) {
    const lourds = ["numpy", "matplotlib"].filter(m => code && code.includes(m) && !modulesCharges.has(m));
    lourds.forEach(m => modulesCharges.add(m));
    if (lourds.length) return "Chargement de " + lourds.join(" et ") + " (une seule fois, environ 10 secondes)…";
    return pyPret ? "Exécution…" : "Chargement de Python (quelques secondes)…";
  }
  async function executerPy(code, espace, checks, valeurs, fichiers) {
    if (!worker) demarrer();
    try { await pretP; } catch (e) { worker.terminate(); worker = null; return { sortie: "", erreur: e.message }; }
    return new Promise(resolve => {
      const id = ++seq;
      const depasse = () => {
        attente.delete(id);
        worker.terminate(); worker = null;
        attente.forEach(r => r.resolve({ sortie: "", erreur: "Exécution interrompue." })); attente.clear();
        resolve({ sortie: "", erreur: `⏱ Ton programme tourne depuis plus de ${LIMITE_MS / 1000} secondes : il a été arrêté.\nAs-tu une boucle infinie? Sinon, réduis le calcul (moins d'époques, moins de données).` });
      };
      // Délai généreux pour charger un module (numpy, matplotlib); le délai de 5 s commence avec l'exécution.
      const minuterie = setTimeout(depasse, 120000);
      attente.set(id, { resolve, minuterie, depasse });
      worker.postMessage({ id, code, espace, checks, valeurs, fichiers: fichiers || FICHIERS });
    });
  }

  // Fichiers générés par la page (données personnalisées de l'épreuve finale).
  function definirFichiers(f) { FICHIERS = Object.assign({}, FICHIERS || {}, f); }
  window.Cours = { executerPy, definirFichiers, messageChargement: c => messageChargement(c) };
  // dechiffrer est ajouté plus bas (verrou des labos), pour l'auto-correction de l'épreuve à blanc.

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
      const bv = quiz.querySelector(".valider-quiz"); if (bv) bv.disabled = true;
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
    const boutonQuiz = quiz.querySelector(".valider-quiz");
    if (boutonQuiz) boutonQuiz.addEventListener("click", async () => {
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
  document.querySelectorAll(".runner:not(.exo-runner)").forEach(bloc => {
    const zone = bloc.querySelector("textarea");
    const sortie = bloc.querySelector("output");
    const etat = bloc.querySelector(".status");
    const original = zone.value;
    const lancer = async () => {
      sortie.className = ""; sortie.textContent = "";
      etat.textContent = messageChargement(zone.value);
      const r = await executerPy(zone.value, "exemples");
      afficherFigures(bloc, r.figures);
      sortie.textContent = r.sortie + (r.erreur || "") || ((r.figures && r.figures.length) ? "" : "(aucun affichage)");
      sortie.className = r.erreur ? "err" : "";
      etat.textContent = r.erreur ? "Erreur" : "";
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
    const checks = JSON.parse(exo.dataset.checks || "[]");

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
      etat.textContent = messageChargement(zone.value);
      const r = await executerPy(zone.value, null, avecVerif ? checks : null);
      afficherFigures(exo.querySelector(".exo-runner"), r.figures);
      sortie.textContent = r.sortie + (r.erreur || "");
      if (r.erreur) sortie.className = "err";
      etat.textContent = "";
      if (!avecVerif) { sauver(exo); return; }
      if (r.erreur) {
        verdict.innerHTML = '<p class="v-non">Corrige d\'abord l\'erreur ci-dessus, puis vérifie de nouveau.</p>';
        marquer(exo, false); sauver(exo); return;
      }
      const res = r.verifs || [];
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
    const boutonVerif = exo.querySelector(".check");
    if (boutonVerif) boutonVerif.addEventListener("click", () => lancer(true));
    exo.querySelector(".reset").addEventListener("click", () => {
      if (zone.value !== depart && !window.confirm("Effacer ton code et revenir au code de départ?")) return;
      zone.value = depart; ajuster(zone); sortie.textContent = ""; verdict.innerHTML = "";
      marquer(exo, false); sauver(exo);
    });
  });

  // ---------- Progression, nom, rapport, importation ----------
  const champNom = document.getElementById("nom-etudiant");
  if (champNom) {
    // Dans une épreuve, le nom est propre à la page : sur un poste partagé, il ne doit pas venir de l'étudiant précédent.
    const cleNom = TYPE === "evaluation" ? CHAPITRE + ":nom" : "nom";
    champNom.value = stock.lire(cleNom) || "";
    champNom.addEventListener("input", () => stock.ecrire(cleNom, champNom.value.trim()));
  }

  function majProgression() {
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    document.querySelectorAll(".progression").forEach(el => { el.textContent = `${n} / ${exercices.length} exercices réussis`; });
    document.querySelectorAll(".barre > span").forEach(el => { el.style.width = (exercices.length ? 100 * n / exercices.length : 0) + "%"; });
  }
  majProgression();

  function rapport() {
    const enEval = TYPE === "evaluation";
    const nom = (champNom && champNom.value.trim()) || "";
    const date = new Date();
    const donnees = { cours: "IntroIA", chapitre: CHAPITRE, nom, date: date.toISOString(), exercices: {} };
    const parties = [];
    exercices.forEach(exo => {
      const e = etatExo(exo);
      donnees.exercices[exo.dataset.id] = e;
      let bloc = `# ${"=".repeat(60)}\n# ${enEval ? "Problème " + exo.dataset.id : "Exercice " + exo.dataset.id + " — " + (e.reussi ? "RÉUSSI" : "non réussi")}\n# ${"=".repeat(60)}\n`;
      const f = Object.entries(e.fiche).filter(([, v]) => v.trim());
      if (f.length) bloc += "# Fiche de planification\n" + f.map(([k, v]) => `#   ${k} : ` + v.trim().replace(/\n/g, "\n#     ")).join("\n") + "\n#\n";
      parties.push(bloc + e.code + "\n");
    });
    const extras = lireExtras();
    donnees.extras = extras;
    donnees.quiz = etatQuiz();
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    const lignesExtras = Object.entries(extras).filter(([, v]) => v.trim()).map(([k, v]) => `# ${k} : ` + v.trim().replace(/\n/g, "\n#   "));
    const lignesQuiz = donnees.quiz ? [enEval ? "# Partie A — Traces et prédictions" : `# Quiz d'entrée : ${donnees.quiz.score} / ${donnees.quiz.total}` + (donnees.quiz.valide ? "" : " (non validé)"),
      ...donnees.quiz.reponses.map((r, i) => `#   ${enEval ? "A" : "Q"}${i + 1} ${enEval ? "" : (r.ok === true ? "✓" : r.ok === false ? "✗" : "·") + " "}${r.valeur}`)] : [];
    const entete = [
      `# IntroIA · Introduction à l’intelligence artificielle`,
      `# Rapport ${TYPE === "labo" ? "du labo " + CHAPITRE.replace("L", "") : TYPE === "evaluation" ? "de l'évaluation " + CHAPITRE.replace("E", "") : "du cours " + CHAPITRE}`,
      `# Étudiant : ${nom || "(nom non indiqué)"}`,
      `# Généré le : ${date.toLocaleString("fr-CA")}`,
      ...(enEval ? [] : [`# Résultat : ${n} / ${exercices.length} exercices réussis`]),
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
    const prefixe = TYPE === "labo" ? "labo" + CHAPITRE.replace("L", "") : TYPE === "evaluation" ? "eval" + CHAPITRE.replace("E", "") : "ch" + CHAPITRE;
    a.download = `IntroIA_${prefixe}_${nom}.py`;
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
      if (d.chapitre !== CHAPITRE) { message.textContent = `Ce rapport est celui du cours ${d.chapitre}. Ouvre la page de ce cours pour l’importer.`; return; }
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

  // ---------- Exportation en notebook (.ipynb), pour Google Colab ou Jupyter ----------
  function notebook() {
    const md = t => ({ cell_type: "markdown", metadata: {}, source: t });
    const py = t => ({ cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: t });
    const titre = ((document.querySelector("article h1") || document.querySelector("h1") || {}).textContent || document.title).trim();
    const n = exercices.filter(e => e.dataset.reussi === "1").length;
    const cellules = [];
    let entete = `# IntroIA · ${titre}\n\nCopie de ton travail, exportée du site du cours le ${new Date().toLocaleString("fr-CA")}.\n\n`
      + `**Résultat sur le site :** ${n} / ${exercices.length} exercices réussis.`;
    const q = etatQuiz();
    if (q) entete += `\n\n**Quiz d'entrée :** ${q.score} / ${q.total}`;
    const extras = Object.entries(lireExtras()).filter(([, v]) => v.trim());
    if (extras.length) entete += "\n\n" + extras.map(([k, v]) => `**${k} :** ${v.trim()}`).join("\n\n");
    entete += "\n\nLe bouton **Vérifier** n'existe que sur le site : pour valider une réponse, retourne sur la page du cours.";
    cellules.push(md(entete));
    let fichiers = FICHIERS;
    try { const f = document.getElementById("fichiers-donnees"); if (f) fichiers = JSON.parse(f.textContent); } catch (e) {}
    if (fichiers && Object.keys(fichiers).length) {
      cellules.push(md("## Fichiers de données\n\nExécute d'abord ces cellules : elles recréent les fichiers utilisés par les exercices."));
      Object.entries(fichiers).forEach(([nom, contenu]) => cellules.push(py(`%%writefile ${nom}\n${String(contenu).replace(/\n$/, "")}`)));
    }
    exercices.forEach(exo => {
      const e = etatExo(exo);
      const t = (exo.querySelector(".exo-head h3") || {}).textContent || exo.dataset.id;
      const enonce = ((exo.querySelector(".enonce") || {}).innerText || "").trim();
      let texte = `## ${t.trim()}\n\n${e.reussi ? "✅ Réussi sur le site." : "⬜ Pas encore réussi sur le site."}\n\n${enonce}`;
      const f = Object.entries(e.fiche || {}).filter(([, v]) => v.trim());
      if (f.length) texte += "\n\n**Fiche de planification**\n\n" + f.map(([k, v]) => `- **${k}** : ${v.trim()}`).join("\n");
      cellules.push(md(texte));
      cellules.push(py(e.code));
    });
    return { cells: cellules, metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } }, nbformat: 4, nbformat_minor: 4 };
  }
  function telechargerNotebook() {
    const blob = new Blob([JSON.stringify(notebook(), null, 1)], { type: "application/x-ipynb+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `IntroIA_${TYPE === "labo" ? "labo" + CHAPITRE.replace("L", "") : "cours" + CHAPITRE}.ipynb`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  document.querySelectorAll(".notebook").forEach(b => b.addEventListener("click", telechargerNotebook));

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
  function normaliserCode(c) { return String(c).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s`'"«»“”‘’]/g, ""); }
  function b64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  async function dechiffrer(code, paquet) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normaliserCode(code)), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(paquet.sel), iterations: paquet.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(paquet.iv) }, cle, b64(paquet.donnees));
    return new TextDecoder().decode(clair);
  }
  window.Cours.dechiffrer = dechiffrer;
  const verrou = document.getElementById("verrou");
  if (verrou && !(window.crypto && crypto.subtle)) {
    verrou.querySelector(".msg").textContent = "Ce navigateur ne peut pas ouvrir le labo. Utilise une version récente de Chrome, Firefox, Edge ou Safari.";
  } else if (verrou) {
    // Les chapitres s'ouvrent avec le code du cours, retenu une fois pour tout le site (partagé avec l'accueil).
    const CLE_CODE = document.body.dataset.verrou === "site" ? "site:code" : CHAPITRE_PAGE + ":code";
    const cadrePorte = document.body.dataset.verrou === "site" ? verrou.closest(".layout") : null;
    const montrerPorte = oui => { verrou.hidden = !oui; if (cadrePorte) cadrePorte.style.display = oui ? "" : "none"; };
    // Un seul paquet, ou une liste de paquets (une version par groupe, chacune avec son code).
    const lu = JSON.parse(document.getElementById("labo-chiffre").textContent);
    const paquets = Array.isArray(lu) ? lu : [lu];
    // Postes partagés : une épreuve ouverte par un autre étudiant, il y a plus longtemps que sa durée,
    // est effacée de ce navigateur (travail et code mémorisé) avant d'ouvrir la page.
    if (TYPE === "evaluation") {
      const debut = stock.lire(CHAPITRE_PAGE + ":ouverture");
      const limite = (Number(document.body.dataset.duree || 70) + 20) * 60000;
      if (debut && Date.now() - debut > limite) {
        try {
          Object.keys(localStorage).filter(k => k.startsWith(CLE + CHAPITRE_PAGE)).forEach(k => localStorage.removeItem(k));
        } catch (e) {}
      }
    }
    const form = verrou.querySelector("form");
    const champ = verrou.querySelector("input");
    const msg = verrou.querySelector(".msg");
    const ouvrir = async (code, silencieux) => {
      try {
        let html = null;
        for (const p of paquets) {
          try { html = await dechiffrer(code, p); break; } catch (e) { /* essaie la version suivante */ }
        }
        if (html === null) throw new Error("code");
        document.getElementById("contenu-labo").innerHTML = html;
        const version = document.querySelector("#contenu-labo [data-version]");
        CHAPITRE = CHAPITRE_PAGE + (version ? version.dataset.version : "");
        montrerPorte(false);
        document.querySelectorAll(".apres-verrou").forEach(e => { e.hidden = false; });
        stock.ecrire(CLE_CODE, normaliserCode(code));
        if (TYPE === "evaluation" && !silencieux && !stock.lire(CHAPITRE_PAGE + ":ouverture")) stock.ecrire(CHAPITRE_PAGE + ":ouverture", Date.now());
        // Mode examen : une épreuve ouverte avec son code ferme le reste du site dans ce navigateur (voir garde.js).
        if (TYPE === "evaluation" && !silencieux) {
          try {
            const duree = Number(document.body.dataset.duree || 70) * 60000;
            const actuel = JSON.parse(localStorage.getItem("introia:examen") || "null");
            if (!actuel || actuel.url !== location.pathname || Date.now() > actuel.fin)
              localStorage.setItem("introia:examen", JSON.stringify({ url: location.pathname, fin: Date.now() + duree }));
          } catch (e) {}
        }
        init();
        document.dispatchEvent(new Event("contenu-ouvert"));
        if (location.hash) { const cible = document.getElementById(location.hash.slice(1)); if (cible) cible.scrollIntoView(); }
      } catch (e) {
        if (!silencieux) { msg.textContent = "Ce code ne fonctionne pas. Vérifie-le avec ton enseignant."; champ.select(); }
        montrerPorte(true);
      }
    };
    form.addEventListener("submit", e => { e.preventDefault(); msg.textContent = "Ouverture…"; ouvrir(champ.value, false); });
    const connu = stock.lire(CLE_CODE);
    if (connu) { montrerPorte(false); ouvrir(connu, true); }
  } else {
    init();
  }
})();
