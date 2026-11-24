// IntroOps — Pages de cours sans code : quiz, exercices de classement, réponses chiffrées,
// rédaction, explorateur de données, sauvegarde locale et rapport de remise (.md).
(function () {
  "use strict";
  const CHAPITRE_PAGE = document.body.dataset.chapitre || "";
  let CHAPITRE = CHAPITRE_PAGE;
  const TYPE = document.body.dataset.type || "chapitre";
  const CLE = "introops:";
  window.Cours = window.Cours || {};

  // ---------- Stockage local (peut être indisponible) ----------
  const stock = {
    lire(k) { try { return JSON.parse(localStorage.getItem(CLE + k)); } catch (e) { return null; } },
    ecrire(k, v) { try { localStorage.setItem(CLE + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---------- Normalisation et empreintes (identiques à outils/gabarit.py) ----------
  function sansAccents(t) { return String(t).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function normaliserTexte(t) {
    return sansAccents(t).trim().toLowerCase().replace(/^["'`«»“”]+|["'`«»“”]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  }
  function canonNombre(t, dec) {
    const s = String(t).replace(/[\s  $%]/g, "").replace(/(heures?|h|minutes?|min)$/i, "").replace(/,/g, ".");
    if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n.toFixed(dec) : null;
  }
  async function sha12(t) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  }
  function ajuster(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 4 + "px"; }
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ---------- Fichiers de données de la page (CSV) ----------
  let FICHIERS = {};
  function lireFichiers() {
    try { const f = document.getElementById("fichiers-donnees"); if (f) FICHIERS = JSON.parse(f.textContent); } catch (e) {}
  }
  function parserCSV(texte) {
    const lignes = [];
    let champ = "", ligne = [], guill = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (guill) {
        if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
        else if (c === '"') guill = false;
        else champ += c;
      } else if (c === '"') guill = true;
      else if (c === ",") { ligne.push(champ); champ = ""; }
      else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
      else if (c !== "\r") champ += c;
    }
    if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    const [entetes, ...corps] = lignes;
    return { entetes, lignes: corps.filter(l => l.length === entetes.length) };
  }

  // ---------- Explorateur de données (remplace le tableur) ----------
  function brancherExplorateur(bloc) {
    const nom = bloc.dataset.fichier;
    if (!FICHIERS[nom]) { bloc.innerHTML = "<p>Fichier introuvable : " + esc(nom) + "</p>"; return; }
    const { entetes, lignes } = parserCSV(FICHIERS[nom]);
    const estNombre = entetes.map((_, j) => lignes.every(l => l[j] === "" || /^-?\d+(\.\d+)?$/.test(l[j])) && lignes.some(l => l[j] !== ""));
    const distincts = entetes.map((_, j) => [...new Set(lignes.map(l => l[j]))].sort((a, b) => a.localeCompare(b, "fr")));
    const categ = entetes.map((_, j) => !estNombre[j] && distincts[j].length <= 25);
    const filtrables = entetes.map((h, j) => j).filter(j => categ[j] || estNombre[j]);
    const nombres = entetes.map((h, j) => j).filter(j => estNombre[j] && entetes[j] !== "id");

    let html = `<div class="explo-tete"><strong>${esc(nom)}</strong> <span class="explo-taille">${lignes.length} lignes, ${entetes.length} colonnes</span></div>`;
    html += '<div class="explo-filtres">';
    filtrables.forEach(j => {
      if (categ[j]) {
        html += `<label>${esc(entetes[j])}<select data-col="${j}"><option value="*">(toutes)</option>`
          + distincts[j].map(v => `<option value="${esc(v)}">${v === "" ? "(vide)" : esc(v)}</option>`).join("") + "</select></label>";
      } else {
        html += `<label>${esc(entetes[j])}<span class="explo-bornes"><input type="text" inputmode="decimal" data-min="${j}" placeholder="min"><input type="text" inputmode="decimal" data-max="${j}" placeholder="max"></span></label>`;
      }
    });
    html += '</div><div class="explo-calcul"><label>Grouper par<select class="explo-groupe"><option value="">(aucun)</option>'
      + entetes.map((h, j) => categ[j] ? `<option value="${j}">${esc(h)}</option>` : "").join("") + '</select></label>'
      + '<label>Colonne à résumer<select class="explo-col">' + nombres.map(j => `<option value="${j}">${esc(entetes[j])}</option>`).join("") + '</select></label>'
      + '<button class="btn ghost explo-raz" type="button">Effacer les filtres</button></div>'
      + '<div class="explo-resume" aria-live="polite"></div><div class="tablewrap explo-table"></div>';
    bloc.innerHTML = html;

    // Notation code partout : point décimal, pas de séparateur de milliers.
    const fmt = x => (x === null || Number.isNaN(x)) ? "—" : String(Math.round(x * 100) / 100);
    function stats(rangees, j) {
      const v = rangees.map(l => l[j]).filter(x => x !== "").map(Number).sort((a, b) => a - b);
      const somme = v.reduce((a, b) => a + b, 0);
      const med = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
      return { n: v.length, vides: rangees.length - v.length, somme, moyenne: v.length ? somme / v.length : null, mediane: med,
               min: v.length ? v[0] : null, max: v.length ? v[v.length - 1] : null };
    }
    let limite = 20;
    function maj() {
      const filtres = [...bloc.querySelectorAll("select[data-col]")].filter(s => s.value !== "*").map(s => [Number(s.dataset.col), s.value]);
      const bornes = [...bloc.querySelectorAll("input[data-min],input[data-max]")].map(i => {
        const j = Number(i.dataset.min ?? i.dataset.max);
        const val = canonNombre(i.value, 6);
        return val === null ? null : [j, i.dataset.min !== undefined ? "min" : "max", Number(val)];
      }).filter(Boolean);
      const rangees = lignes.filter(l => filtres.every(([j, v]) => l[j] === v)
        && bornes.every(([j, sens, b]) => l[j] !== "" && (sens === "min" ? Number(l[j]) >= b : Number(l[j]) <= b)));
      const jc = Number(bloc.querySelector(".explo-col").value);
      const s = stats(rangees, jc);
      bloc.querySelector(".explo-resume").innerHTML =
        `<span><b>${rangees.length}</b> lignes</span><span>${esc(entetes[jc])} : somme <b>${fmt(s.somme)}</b></span>`
        + `<span>moyenne <b>${fmt(s.moyenne)}</b></span><span>médiane <b>${fmt(s.mediane)}</b></span>`
        + `<span>min <b>${fmt(s.min)}</b> · max <b>${fmt(s.max)}</b></span><span>vides <b>${s.vides}</b></span>`;
      const g = bloc.querySelector(".explo-groupe").value;
      const zone = bloc.querySelector(".explo-table");
      if (g !== "") {
        const jg = Number(g);
        const groupes = {};
        rangees.forEach(l => { (groupes[l[jg]] = groupes[l[jg]] || []).push(l); });
        const cles = Object.keys(groupes).sort((a, b) => groupes[b].length - groupes[a].length);
        zone.innerHTML = `<table><thead><tr><th>${esc(entetes[jg])}</th><th>Lignes</th><th>% des lignes</th><th>Somme ${esc(entetes[jc])}</th><th>Moyenne</th><th>Médiane</th></tr></thead><tbody>`
          + cles.map(k => { const t = stats(groupes[k], jc);
              return `<tr><td>${k === "" ? "(vide)" : esc(k)}</td><td class="num">${groupes[k].length}</td><td class="num">${fmt(100 * groupes[k].length / rangees.length)} %</td>`
                + `<td class="num">${fmt(t.somme)}</td><td class="num">${fmt(t.moyenne)}</td><td class="num">${fmt(t.mediane)}</td></tr>`; }).join("")
          + "</tbody></table>";
      } else {
        const vues = rangees.slice(0, limite);
        zone.innerHTML = `<table><thead><tr>${entetes.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>`
          + vues.map(l => "<tr>" + l.map((v, j) => `<td${estNombre[j] ? ' class="num"' : ""}>${v === "" ? '<span class="vide">—</span>' : esc(v)}</td>`).join("") + "</tr>").join("")
          + "</tbody></table>"
          + (rangees.length > limite ? `<p class="explo-plus"><button class="btn ghost" type="button">Afficher 50 lignes de plus</button> (${rangees.length - limite} non affichées)</p>` : "");
        const plus = zone.querySelector(".explo-plus button");
        if (plus) plus.addEventListener("click", () => { limite += 50; maj(); });
      }
    }
    bloc.querySelectorAll("select,input").forEach(el => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => { limite = 20; maj(); }));
    bloc.querySelector(".explo-raz").addEventListener("click", () => {
      bloc.querySelectorAll("select[data-col]").forEach(s => { s.value = "*"; });
      bloc.querySelectorAll("input").forEach(i => { i.value = ""; });
      bloc.querySelector(".explo-groupe").value = "";
      limite = 20; maj();
    });
    maj();
  }

  function init() {
    lireFichiers();
    document.querySelectorAll(".explorateur").forEach(brancherExplorateur);

    // ---------- Champs libres inclus au rapport (coéquipiers, atelier, billet de sortie) ----------
    const champsExtras = [...document.querySelectorAll("[data-rapport]")];
    const lireExtras = () => Object.fromEntries(champsExtras.map(c => [c.dataset.rapport, c.value]));
    const extrasSauves = stock.lire(CHAPITRE + ":extras");
    if (extrasSauves) champsExtras.forEach(c => { if (extrasSauves[c.dataset.rapport] !== undefined) c.value = extrasSauves[c.dataset.rapport]; });
    champsExtras.forEach(c => {
      if (c.tagName === "TEXTAREA") { ajuster(c); c.addEventListener("input", () => ajuster(c)); }
      c.addEventListener("input", () => stock.ecrire(CHAPITRE + ":extras", lireExtras()));
    });

    // ---------- Quiz (une seule validation hors évaluation) ----------
    const quiz = document.querySelector(".quiz");
    function etatQuiz() {
      if (!quiz) return null;
      const qs = [...quiz.querySelectorAll(".q")];
      const s = stock.lire(CHAPITRE + ":quiz") || {};
      const reponses = qs.map(q => {
        const r = q.querySelector("input:checked");
        return { valeur: r ? r.value : "", ok: s.resultats ? s.resultats[qs.indexOf(q)] : null };
      });
      return { reponses, score: s.score || 0, total: qs.length, valide: !!s.valide };
    }
    if (quiz) {
      const qs = [...quiz.querySelectorAll(".q")];
      const s = stock.lire(CHAPITRE + ":quiz");
      if (s && s.reponses) qs.forEach((q, i) => { const r = q.querySelector(`input[value="${s.reponses[i]}"]`); if (r) r.checked = true; });
      const sauverQuiz = extra => {
        const ancien = stock.lire(CHAPITRE + ":quiz") || {};
        stock.ecrire(CHAPITRE + ":quiz", Object.assign(ancien, { reponses: qs.map(q => { const r = q.querySelector("input:checked"); return r ? r.value : ""; }) }, extra || {}));
      };
      quiz.querySelectorAll("input").forEach(i => i.addEventListener("change", () => sauverQuiz()));
      const montrer = res => {
        qs.forEach((q, i) => { q.querySelector(".q-verdict").textContent = res[i] ? "✅" : "❌"; });
        quiz.querySelectorAll("input").forEach(i => { i.disabled = true; });
      };
      if (s && s.valide && s.resultats) { montrer(s.resultats); quiz.querySelector(".score").textContent = `Résultat : ${s.score} / ${qs.length}`; }
      const valider = quiz.querySelector(".valider-quiz");
      if (valider) valider.addEventListener("click", async () => {
        const res = [];
        for (const q of qs) {
          const r = q.querySelector("input:checked");
          res.push(!!r && JSON.parse(q.dataset.h).includes(await sha12(normaliserTexte(r.value))));
        }
        const score = res.filter(Boolean).length;
        sauverQuiz({ valide: true, resultats: res, score });
        montrer(res);
        quiz.querySelector(".score").textContent = `Résultat : ${score} / ${qs.length}`;
      });
    }

    // ---------- Exercices ----------
    const exercices = [...document.querySelectorAll(".exo")];
    function champs(exo) { return [...exo.querySelectorAll("[data-k]")]; }
    function etatExo(exo) {
      return { valeurs: Object.fromEntries(champs(exo).map(c => [c.dataset.k, c.value])), reussi: exo.dataset.reussi === "1" };
    }
    function sauver(exo) { stock.ecrire(CHAPITRE + ":" + exo.dataset.id, etatExo(exo)); majProgression(); }
    function marquer(exo, reussi) {
      exo.dataset.reussi = reussi ? "1" : "0";
      const b = exo.querySelector(".badge");
      b.textContent = reussi ? (exo.dataset.genre === "redaction" ? "✅ Complété" : "✅ Réussi") : "À faire";
      b.className = "badge" + (reussi ? " ok" : "");
    }
    function complet(exo) { return champs(exo).every(c => c.value.trim().length >= Number(c.dataset.min || 1)); }

    exercices.forEach(exo => {
      const checks = JSON.parse(exo.dataset.checks || "{}");
      const verdict = exo.querySelector(".verdict");
      const sauve = stock.lire(CHAPITRE + ":" + exo.dataset.id);
      if (sauve && sauve.valeurs) champs(exo).forEach(c => { if (sauve.valeurs[c.dataset.k] !== undefined) c.value = sauve.valeurs[c.dataset.k]; });
      marquer(exo, !!(sauve && sauve.reussi));
      champs(exo).forEach(c => {
        if (c.tagName === "TEXTAREA") { ajuster(c); c.addEventListener("input", () => ajuster(c)); }
        c.addEventListener(c.tagName === "SELECT" ? "change" : "input", () => {
          c.closest(".ligne-choix, .champ-reponse") && c.closest(".ligne-choix, .champ-reponse").classList.remove("bon", "faux");
          if (exo.dataset.genre === "redaction") marquer(exo, complet(exo));
          else if (exo.dataset.reussi === "1") marquer(exo, false);
          sauver(exo);
        });
      });

      async function verifier() {
        const res = [];
        for (const c of champs(exo)) {
          const k = c.dataset.k;
          const cible = c.closest(".ligne-choix, .champ-reponse");
          let canon = null;
          if (c.tagName === "SELECT") canon = c.value === "" ? null : c.value;
          else if (c.dataset.dec !== undefined) canon = canonNombre(c.value, Number(c.dataset.dec));
          else canon = c.value.trim() === "" ? null : normaliserTexte(c.value);
          let ok = null;
          if (canon !== null) ok = (checks[k] || []).includes(await sha12(exo.dataset.id + "|" + k + "|" + canon));
          if (cible) { cible.classList.toggle("bon", ok === true); cible.classList.toggle("faux", ok === false); }
          res.push([k, ok, c.value.trim() !== "" && canon === null]);
        }
        const bons = res.filter(r => r[1] === true).length;
        const vides = res.filter(r => r[1] === null && !r[2]).length;
        const illisibles = res.filter(r => r[2]).length;
        const tout = bons === res.length;
        let msg = tout ? '<p class="v-oui"><strong>Exercice réussi.</strong></p>'
          : `<p class="v-non">${bons} / ${res.length} bonnes réponses.`
            + (vides ? ` ${vides} sans réponse.` : "")
            + (illisibles ? ` ${illisibles} réponse(s) à écrire comme un nombre (ex. 12.5).` : "")
            + " Les lignes en bleu sont à revoir.</p>";
        verdict.innerHTML = msg;
        marquer(exo, tout); sauver(exo);
      }
      const bv = exo.querySelector(".check");
      if (bv) bv.addEventListener("click", verifier);
      const reset = exo.querySelector(".reset");
      if (reset) reset.addEventListener("click", () => {
        if (!window.confirm("Effacer tes réponses à cet exercice?")) return;
        champs(exo).forEach(c => { c.value = ""; if (c.tagName === "TEXTAREA") ajuster(c); });
        exo.querySelectorAll(".bon,.faux").forEach(e => e.classList.remove("bon", "faux"));
        verdict.innerHTML = ""; marquer(exo, false); sauver(exo);
      });
    });

    // ---------- Progression, nom, rapport ----------
    const champNom = document.getElementById("nom-etudiant");
    if (champNom) {
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

    function texteChamp(c) {
      if (c.tagName === "SELECT") { const o = c.selectedOptions[0]; return c.value === "" ? "(sans réponse)" : o.textContent; }
      return c.value.trim() || "(vide)";
    }
    function rapport() {
      const enEval = TYPE === "evaluation";
      const nom = (champNom && champNom.value.trim()) || "";
      const date = new Date();
      const titre = ((document.querySelector("article h1") || {}).textContent || document.title).trim();
      const donnees = { cours: "IntroOps", chapitre: CHAPITRE, nom, date: date.toISOString(), exercices: {}, quiz: etatQuiz(), extras: lireExtras() };
      const n = exercices.filter(e => e.dataset.reussi === "1").length;
      let md = `# IntroOps · ${titre}\n\n- Participant : ${nom || "(nom non indiqué)"}\n- Généré le : ${date.toLocaleString("fr-CA")}\n`;
      if (!enEval) md += `- Résultat sur le site : ${n} / ${exercices.length} exercices réussis\n`;
      const q = donnees.quiz;
      if (q) md += enEval ? `\n## Questions\n\n` + q.reponses.map((r, i) => `${i + 1}. ${r.valeur || "(sans réponse)"}`).join("\n") + "\n"
        : `- Quiz d'entrée : ${q.score} / ${q.total}${q.valide ? "" : " (non validé)"}\n`;
      exercices.forEach(exo => {
        const e = etatExo(exo);
        donnees.exercices[exo.dataset.id] = e;
        const t = (exo.querySelector(".exo-head h3") || {}).textContent || exo.dataset.id;
        md += `\n## ${t.trim()}${enEval ? "" : e.reussi ? " — réussi" : " — à faire"}\n\n`;
        champs(exo).forEach(c => {
          const nomChamp = c.dataset.etiquette || c.dataset.k;
          md += c.tagName === "TEXTAREA" ? `**${nomChamp}**\n\n${texteChamp(c)}\n\n` : `- ${nomChamp} : ${texteChamp(c)}\n`;
        });
      });
      const extras = Object.entries(donnees.extras).filter(([, v]) => v.trim());
      if (extras.length) md += "\n## Notes de séance\n\n" + extras.map(([k, v]) => `**${k}**\n\n${v.trim()}\n`).join("\n");
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(donnees))));
      return md + `\n<!-- DONNEES: ${b64} -->\n`;
    }
    function telecharger() {
      const nom = ((champNom && champNom.value.trim()) || "participant").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_");
      const blob = new Blob([rapport()], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const prefixe = TYPE === "labo" ? "labo" + CHAPITRE.replace("L", "") : TYPE === "evaluation" ? "eval" + CHAPITRE.replace("E", "") : "cours" + CHAPITRE;
      a.download = `IntroOps_${prefixe}_${nom}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    window.Cours.rapport = rapport;
    document.querySelectorAll(".telecharger, .exporter").forEach(b => b.addEventListener("click", telecharger));

    // ---------- Table des matières ----------
    const liens = [...document.querySelectorAll(".toc a[href^='#']")];
    if (liens.length && "IntersectionObserver" in window) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) liens.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id)); });
      }, { rootMargin: "-20% 0px -70% 0px" });
      liens.forEach(a => { const h = document.getElementById(a.getAttribute("href").slice(1)); if (h) obs.observe(h); });
    }
  }

  // ---------- Verrou : le contenu est chiffré avec le code d'accès ----------
  function normaliserCode(c) { return sansAccents(c).toLowerCase().replace(/[\s`'"«»“”‘’]/g, ""); }
  function b64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  async function dechiffrer(code, paquet) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normaliserCode(code)), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(paquet.sel), iterations: paquet.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(paquet.iv) }, cle, b64(paquet.donnees)));
  }
  window.Cours.dechiffrer = dechiffrer;
  const verrou = document.getElementById("verrou");
  if (verrou && !(window.crypto && crypto.subtle)) {
    verrou.querySelector(".msg").textContent = "Ce navigateur ne peut pas ouvrir cette page. Utilise une version récente de Chrome, Firefox, Edge ou Safari.";
  } else if (verrou) {
    const CLE_CODE = document.body.dataset.verrou === "site" ? "site:code" : CHAPITRE_PAGE + ":code";
    const cadrePorte = document.body.dataset.verrou === "site" ? verrou.closest(".layout") : null;
    const montrerPorte = oui => { verrou.hidden = !oui; if (cadrePorte) cadrePorte.style.display = oui ? "" : "none"; };
    const lu = JSON.parse(document.getElementById("labo-chiffre").textContent);
    const paquets = Array.isArray(lu) ? lu : [lu];
    if (TYPE === "evaluation") {
      const debut = stock.lire(CHAPITRE_PAGE + ":ouverture");
      const limite = (Number(document.body.dataset.duree || 90) + 20) * 60000;
      if (debut && Date.now() - debut > limite) {
        try { Object.keys(localStorage).filter(k => k.startsWith(CLE + CHAPITRE_PAGE)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      }
    }
    const form = verrou.querySelector("form");
    const champ = verrou.querySelector("input");
    const msg = verrou.querySelector(".msg");
    const ouvrir = async (code, silencieux) => {
      try {
        let html = null;
        for (const p of paquets) { try { html = await dechiffrer(code, p); break; } catch (e) { /* version suivante */ } }
        if (html === null) throw new Error("code");
        document.getElementById("contenu-labo").innerHTML = html;
        montrerPorte(false);
        document.querySelectorAll(".apres-verrou").forEach(e => { e.hidden = false; });
        stock.ecrire(CLE_CODE, normaliserCode(code));
        if (TYPE === "evaluation" && !silencieux) {
          if (!stock.lire(CHAPITRE_PAGE + ":ouverture")) stock.ecrire(CHAPITRE_PAGE + ":ouverture", Date.now());
          try {
            const duree = Number(document.body.dataset.duree || 90) * 60000;
            const actuel = JSON.parse(localStorage.getItem(CLE + "examen") || "null");
            if (!actuel || actuel.url !== location.pathname || Date.now() > actuel.fin)
              localStorage.setItem(CLE + "examen", JSON.stringify({ url: location.pathname, fin: Date.now() + duree }));
          } catch (e) {}
        }
        init();
        document.dispatchEvent(new Event("contenu-ouvert"));
        if (location.hash) { const cible = document.getElementById(location.hash.slice(1)); if (cible) cible.scrollIntoView(); }
      } catch (e) {
        if (!silencieux) { msg.textContent = "Ce code ne fonctionne pas. Vérifie-le avec ton formateur."; champ.select(); }
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
