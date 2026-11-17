// 420-SN1-RE — Correction de l'épreuve finale à partir des rapports déposés sur LÉA.
// Partie 1 : fonctions appelées avec des tests cachés; planification cochée par l'enseignant.
// Partie 2 : données de l'étudiant régénérées à partir de son matricule, son programme et le programme
//            de référence exécutés sur ces données, puis comparés; justification cochée par l'enseignant.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", demarrer);

  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arrondi = x => Math.round(10 * x) / 10;
  const virgule = n => String(n).replace(".", ",");
  function nombre(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean" || v === null || v === undefined) return NaN;
    const t = String(v).trim().replace(/^np\.(float|int)\d*\((.*)\)$/, "$2").replace(",", ".");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  function normaliser(t) {
    return String(t).trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  }
  // Égalité d'une valeur calculée : exacte pour le texte et les booléens, tolérance relative pour les nombres.
  function egal(obtenu, attendu, tolRel) {
    if (attendu === null) return obtenu === null || obtenu === "None";
    if (typeof attendu === "number") {
      const o = nombre(obtenu);
      return !isNaN(o) && Math.abs(o - attendu) <= Math.max(1e-6, (tolRel || 1e-6) * Math.abs(attendu));
    }
    if (typeof attendu === "boolean") return obtenu === attendu;
    return obtenu !== null && obtenu !== undefined && String(obtenu).trim() === String(attendu).trim();
  }
  function lireRapport(texte) {
    const m = texte.match(/^# DONNEES: (\S+)\s*$/m);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return null; }
  }

  function demarrer() {
    const cle = JSON.parse(document.getElementById("cle-correction").textContent);
    const entree = document.getElementById("rapports");
    const etat = document.getElementById("etat-correction");
    const zone = document.getElementById("resultats");
    // Trois versions (A, B, C) : même barème, clés différentes. Chaque rapport indique sa version.
    const versions = cle.versions;
    const ref0 = versions.A || Object.values(versions)[0];
    const versionDe = d => { const v = String((d.extras && d.extras.Version) || "").trim().toUpperCase(); return versions[v] ? v : null; };
    const ptsGrille = ref0.grille.criteres.reduce((s, c) => s + c[1], 0);
    let etudiants = [];

    // Colonnes du tableau des notes, selon la partie.
    const colonnes = cle.partie === 1
      ? [{ id: "grille", titre: "A Planif.", max: ptsGrille }, ...ref0.fonctions.map(f => ({ id: f.id, titre: f.id, max: f.points }))]
      : [{ id: "prog", titre: "A Programme", max: Object.values(ref0.programme.variables).reduce((s, x) => s + x, 0) },
         { id: "graph", titre: "B Graphique", max: ref0.programme.graphique.reduce((s, g) => s + g[1], 0) },
         { id: "quest", titre: "B Questions", max: ref0.questions.reduce((s, q) => s + q.points, 0) },
         { id: "grille", titre: "B Justif.", max: ptsGrille }];

    entree.addEventListener("change", async () => {
      const fichiers = [...entree.files];
      etudiants = [];
      zone.innerHTML = "";
      for (let i = 0; i < fichiers.length; i++) {
        etat.textContent = `Correction ${i + 1} / ${fichiers.length} : ${fichiers[i].name} (${window.Cours.messageChargement("numpy matplotlib")})`;
        const d = lireRapport(await fichiers[i].text());
        if (!d) { etudiants.push({ fichier: fichiers[i].name, invalide: true }); continue; }
        const v = versionDe(d);
        if (!v) { etudiants.push({ fichier: fichiers[i].name, invalide: true, raison: "version absente : ce rapport ne vient pas de l'épreuve finale" }); continue; }
        etudiants.push(cle.partie === 1 ? await corriger1(d, fichiers[i].name, v) : await corriger2(d, fichiers[i].name, v));
      }
      const corriges = etudiants.filter(e => !e.invalide);
      etat.textContent = `${corriges.length} rapport(s) corrigé(s). Coche les critères de la grille dans le détail de chaque étudiant, puis télécharge les notes.`;
      afficher();
    });

    async function corriger1(d, fichier, version) {
      const cv = versions[version];
      const sections = { grille: 0 };
      const fonctions = [];
      for (const f of cv.fonctions) {
        const code = (d.exercices && d.exercices[f.id] && d.exercices[f.id].code) || "";
        const r = await window.Cours.executerPy(code, null, null, f.appels.map(a => a.expr));
        const essais = f.appels.map(a => {
          const obtenu = r.valeurs ? r.valeurs[a.expr] : undefined;
          return { libelle: a.expr, attendu: a.attendu, obtenu, ok: !r.erreur && egal(obtenu, a.attendu) };
        });
        const reussis = essais.filter(e => e.ok).length;
        sections[f.id] = arrondi(f.points * reussis / essais.length);
        fonctions.push({ titre: f.titre, code, erreur: r.erreur, essais, reussis });
      }
      return base(d, fichier, sections, { fonctions }, version);
    }

    async function corriger2(d, fichier, version) {
      const cv = versions[version];
      const matricule = String((d.extras && d.extras.Matricule) || "").replace(/\D/g, "");
      const sections = { prog: 0, graph: 0, quest: 0, grille: 0 };
      const code = (d.exercices && d.exercices.P && d.exercices.P.code) || "";
      const detail = { matricule, code, variables: [], graphique: [], questions: [] };
      if (matricule.length < 5) {
        detail.alerte = "Matricule absent ou invalide : les données de l'étudiant ne peuvent pas être régénérées. Le programme et les questions personnalisées ne sont pas corrigés.";
      } else {
        const g = await window.Cours.executerPy(cv.generateur + `\n_csv = generer(${Number(matricule)})`, null, null, ["_csv"]);
        const fichiers = { [cv.fichier]: g.valeurs && g.valeurs._csv };
        const vars = Object.keys(cv.programme.variables);
        const persos = cv.questions.filter(q => q.perso).map(q => q.perso);
        const ref = await window.Cours.executerPy(cv.reference, null, null, [...vars, ...persos], fichiers);
        const exprsGraph = cv.programme.graphique.map(x => x[0]);
        const r = await window.Cours.executerPy(code, null, null, [...vars, ...exprsGraph], fichiers);
        detail.erreur = r.erreur;
        if (ref.erreur) detail.alerte = "Le programme de référence a échoué sur ces données : " + ref.erreur.split("\n").slice(-1)[0];
        for (const v of vars) {
          const attendu = ref.valeurs ? nombre(ref.valeurs[v]) : NaN;
          const obtenu = r.valeurs ? r.valeurs[v] : undefined;
          const ok = !isNaN(attendu) && egal(obtenu, attendu, 0.001);
          detail.variables.push({ libelle: v, attendu, obtenu, ok, points: cv.programme.variables[v] });
          if (ok) sections.prog += cv.programme.variables[v];
        }
        for (const [expr, pts, lib] of cv.programme.graphique) {
          const ok = !!(r.valeurs && r.valeurs[expr] === true);
          detail.graphique.push({ libelle: lib, ok, points: pts });
          if (ok) sections.graph += pts;
        }
        detail.refValeurs = ref.valeurs || {};
      }
      const reps = (d.quiz && d.quiz.reponses) || [];
      cv.questions.forEach((q, i) => {
        const valeur = reps[i] ? reps[i].valeur : "";
        let attendu = q.attendu, ok = false;
        if (q.perso) attendu = detail.refValeurs ? nombre(detail.refValeurs[q.perso]) : NaN;
        if (q.choix) ok = normaliser(valeur) === normaliser(attendu);
        else {
          const v = nombre(valeur);
          ok = !isNaN(v) && !isNaN(nombre(attendu)) && Math.abs(v - nombre(attendu)) <= (q.tolerance || 0) + 1e-9;
        }
        detail.questions.push({ id: q.id, texte: q.texte, valeur, attendu, ok, points: q.points });
        if (ok) sections.quest += q.points;
      });
      sections.prog = arrondi(sections.prog); sections.graph = arrondi(sections.graph);
      return base(d, fichier, sections, detail, version);
    }

    function base(d, fichier, sections, detail, version) {
      const grille = versions[version].grille;
      const texte = Object.entries(d.extras || {}).filter(([k]) => k.startsWith(grille.prefixe));
      return { fichier, version, grille, nom: d.nom || "(nom absent)", matricule: detail.matricule || "", sections, coches: grille.criteres.map(() => false), texte, detail };
    }

    function total(e) {
      e.sections.grille = e.grille.criteres.reduce((s, c, k) => s + (e.coches[k] ? c[1] : 0), 0);
      return arrondi(colonnes.reduce((s, c) => s + e.sections[c.id], 0));
    }

    function afficher() {
      const vus = {};
      etudiants.forEach(e => { if (e.matricule) vus[e.matricule] = (vus[e.matricule] || 0) + 1; });
      const lignes = etudiants.map((e, i) => {
        if (e.invalide) return `<tr><td colspan="${colonnes.length + 2}">${esc(e.fichier)} : ${esc(e.raison || "ce fichier n'est pas un rapport valide.")}</td></tr>`;
        const t = total(e);
        const doublon = e.matricule && vus[e.matricule] > 1 ? ` <strong class="alerte">matricule en double!</strong>` : "";
        return `<tr data-i="${i}"><td><strong>${esc(e.nom)}</strong><br><small>Version ${esc(e.version)}${e.matricule ? ` · matricule ${esc(e.matricule)}` : ""}</small>${doublon}<br><small>${esc(e.fichier)}</small></td>
          ${colonnes.map(c => `<td class="num col-${c.id}">${virgule(e.sections[c.id])} / ${c.max}</td>`).join("")}
          <td class="num total"><strong>${virgule(t)} / ${cle.total}</strong></td></tr>
          <tr class="detail"><td colspan="${colonnes.length + 2}">${detailHtml(e, i)}</td></tr>`;
      }).join("");
      zone.innerHTML = `<div class="actions"><button class="btn" id="csv" type="button">Télécharger les notes (CSV)</button></div>
        <div class="tablewrap"><table class="notes"><thead><tr><th>Étudiant</th>${colonnes.map(c => `<th>${esc(c.titre)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
      zone.querySelectorAll("input[data-c]").forEach(cb => cb.addEventListener("change", () => {
        const e = etudiants[cb.dataset.i]; e.coches[cb.dataset.c] = cb.checked;
        const t = total(e); const tr = zone.querySelector(`tr[data-i="${cb.dataset.i}"]`);
        tr.querySelector(".col-grille").textContent = `${virgule(e.sections.grille)} / ${ptsGrille}`;
        tr.querySelector(".total").innerHTML = `<strong>${virgule(t)} / ${cle.total}</strong>`;
      }));
      document.getElementById("csv").addEventListener("click", csv);
    }

    const marque = ok => ok ? "✅" : "❌";
    const montre = v => v === undefined ? "(rien)" : esc(typeof v === "string" ? v : typeof v === "number" ? String(Number(v.toPrecision(8))) : typeof v === "boolean" ? (v ? "True" : "False") : JSON.stringify(v));

    function detailHtml(e, i) {
      const texte = e.texte.map(([k, v]) => `<p><strong>${esc(k.replace(e.grille.prefixe, "").replace(/^ — /, "") || k)} :</strong><br>${esc(v || "(vide)").replace(/\n/g, "<br>")}</p>`).join("");
      const grille = e.grille.criteres.map(([lib, pts], k) => `<label class="critere"><input type="checkbox" data-i="${i}" data-c="${k}"${e.coches[k] ? " checked" : ""}> ${esc(lib)} (${pts} pts)</label>`).join("");
      const sGrille = `<section><h4>${esc(e.grille.titre)} : texte de l'étudiant</h4>${texte || "<p>(vide)</p>"}<div class="criteres">${grille}</div></section>`;
      let auto = "";
      const D = e.detail;
      if (cle.partie === 1) {
        auto = D.fonctions.map(f => `<h4>${esc(f.titre)} : ${f.reussis} test(s) réussi(s) sur ${f.essais.length}</h4>
          ${f.erreur ? `<p><em>Erreur à l'exécution : ${esc(f.erreur.split("\n").slice(-1)[0])}</em></p>` : ""}
          <ul>${f.essais.map(t => `<li>${marque(t.ok)} <code>${esc(t.libelle)}</code> → attendu ${montre(t.attendu)}, obtenu ${montre(t.obtenu)}</li>`).join("")}</ul>
          <details><summary>Code de l'étudiant</summary><pre>${esc(f.code || "(vide)")}</pre></details>`).join("");
        auto = `<section><h4>Partie B — fonctions</h4>${auto}</section>`;
      } else {
        auto = `<section><h4>Partie A — programme (données du matricule ${esc(D.matricule || "?")})</h4>
          ${D.alerte ? `<p class="alerte">${esc(D.alerte)}</p>` : ""}
          ${D.erreur ? `<p><em>Erreur à l'exécution : ${esc(D.erreur.split("\n").slice(-1)[0])}</em></p>` : ""}
          <ul>${D.variables.map(v => `<li>${marque(v.ok)} <code>${esc(v.libelle)}</code> (${v.points} pts) → attendu ${montre(v.attendu)}, obtenu ${montre(v.obtenu)}</li>`).join("")}</ul>
          <h4>Partie B — graphique</h4><ul>${D.graphique.map(g => `<li>${marque(g.ok)} ${esc(g.libelle)} (${g.points} pts)</li>`).join("")}</ul>
          <h4>Partie B — questions</h4><ul>${D.questions.map(q => `<li>${marque(q.ok)} ${esc(q.id)} (${q.points} pts) → réponse <code>${esc(q.valeur || "(vide)")}</code>, attendu ${montre(q.attendu)}</li>`).join("")}</ul>
          <details><summary>Code de l'étudiant</summary><pre>${esc(D.code || "(vide)")}</pre></details></section>`;
      }
      return `<details><summary>Détail</summary><div class="detail-grille">${cle.partie === 1 ? sGrille + auto : auto + sGrille}</div></details>`;
    }

    function csv() {
      const entete = ["Nom", "Matricule", "Version", "Fichier", ...colonnes.map(c => `${c.titre} (/${c.max})`), `Total sur ${cle.total}`, `Sur ${cle.poids} %`];
      const lignes = etudiants.filter(e => !e.invalide).map(e => {
        const t = total(e);
        return [e.nom, e.matricule, e.version, e.fichier, ...colonnes.map(c => virgule(e.sections[c.id])), virgule(t), virgule((cle.poids * t / cle.total).toFixed(2))];
      });
      const texte = "﻿" + [entete, ...lignes].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
      a.download = `notes_${document.body.dataset.chapitre}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  }
})();
