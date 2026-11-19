// IntroIA — Correction de l'évaluation de module à partir des rapports des étudiants.
// Partie A (planification) et justification : critères cochés par l'enseignant.
// Partie B : chaque fonction est appelée avec des tests cachés.
// Partie C : données de l'étudiant régénérées à partir de son matricule; son programme et le programme
//            de référence sont exécutés sur ces données, puis comparés (résultats et graphique).
// Partie D : questions de validation, dont certaines dépendent des données de l'étudiant.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", demarrer);

  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arrondi = x => Math.round(10 * x) / 10;
  function nombre(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean" || v === null || v === undefined) return NaN;
    const t = String(v).trim().replace(/^np\.(float|int)\d*\((.*)\)$/, "$2").replace(",", ".");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  function normaliser(t) {
    return String(t).trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  }
  // Égalité : tolérance relative pour les nombres, exacte pour le reste (texte, booléens, None).
  function egal(obtenu, attendu, tolRel) {
    if (attendu === null || attendu === "None") return obtenu === null || obtenu === "None";
    const a = nombre(attendu);
    if (typeof attendu !== "boolean" && !isNaN(a)) {
      const o = nombre(obtenu);
      return typeof obtenu !== "boolean" && !isNaN(o) && Math.abs(o - a) <= Math.max(1e-6, (tolRel || 1e-6) * Math.abs(a));
    }
    if (typeof attendu === "boolean") return obtenu === attendu;
    return obtenu !== null && obtenu !== undefined && normaliser(obtenu) === normaliser(attendu);
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
    const somme = l => l.reduce((s, x) => s + x, 0);
    const colonnes = [
      { id: "planif", titre: "A Planif.", max: somme(cle.planification.criteres.map(c => c[1])) },
      { id: "fonctions", titre: "B Fonctions", max: somme(cle.fonctions.map(f => f.points)) },
      { id: "prog", titre: "C Résultats", max: somme(Object.values(cle.programme.variables)) },
      { id: "graph", titre: "C Graphique", max: somme(cle.programme.graphique.map(g => g[1])) },
      { id: "quest", titre: "D Questions", max: somme(cle.questions.map(q => q.points)) },
      { id: "justif", titre: "D Justif.", max: somme(cle.justification.criteres.map(c => c[1])) },
    ];
    const grilles = { planif: cle.planification, justif: cle.justification };
    let etudiants = [];

    entree.addEventListener("change", async () => {
      const fichiers = [...entree.files];
      etudiants = [];
      zone.innerHTML = "";
      for (let i = 0; i < fichiers.length; i++) {
        etat.textContent = `Correction ${i + 1} / ${fichiers.length} : ${fichiers[i].name} (${window.Cours.messageChargement("numpy pandas matplotlib")})`;
        const d = lireRapport(await fichiers[i].text());
        if (!d) { etudiants.push({ fichier: fichiers[i].name, invalide: true }); continue; }
        if (d.chapitre !== cle.chapitre) { etudiants.push({ fichier: fichiers[i].name, invalide: true, raison: `ce rapport vient d'une autre page (${d.chapitre}), pas de cette évaluation` }); continue; }
        etudiants.push(await corriger(d, fichiers[i].name));
      }
      const corriges = etudiants.filter(e => !e.invalide);
      etat.textContent = `${corriges.length} rapport(s) corrigé(s). Coche les critères de planification et de justification dans le détail de chaque étudiant, puis télécharge les notes.`;
      afficher();
    });

    async function corriger(d, fichier) {
      const sections = { planif: 0, fonctions: 0, prog: 0, graph: 0, quest: 0, justif: 0 };
      const ex = id => (d.exercices && d.exercices[id] && d.exercices[id].code) || "";
      const detail = { fonctions: [], variables: [], graphique: [], questions: [] };

      // Partie B : fonctions et tests cachés.
      for (const f of cle.fonctions) {
        const code = ex(f.id);
        const r = await window.Cours.executerPy(code, null, null, f.appels.map(a => a.expr));
        const essais = f.appels.map(a => {
          const obtenu = r.valeurs ? r.valeurs[a.expr] : undefined;
          return { libelle: a.expr, attendu: a.attendu, obtenu, ok: !r.erreur && egal(obtenu, a.attendu), vide: a.vide };
        });
        // Un appel réussi par le code de départ (ex. None) ne compte que si un vrai appel réussit aussi.
        if (!essais.some(e => e.ok && !e.vide)) essais.forEach(e => { if (e.vide && e.ok) { e.ok = false; e.note = " (aussi obtenu par le code de départ)"; } });
        const reussis = essais.filter(e => e.ok).length;
        sections.fonctions += f.points * reussis / essais.length;
        detail.fonctions.push({ titre: f.titre, code, erreur: r.erreur, essais, reussis });
      }

      // Partie C : le programme, sur les données régénérées à partir du matricule.
      const matricule = String((d.extras && (d.extras["Numéro de participant"] || d.extras.Matricule)) || "").replace(/\D/g, "");
      detail.matricule = matricule;
      detail.code = ex(cle.programme.id);
      detail.refValeurs = {};
      if (matricule.length < 5) {
        detail.alerte = "Numéro de participant absent ou invalide : les données du participant ne peuvent pas être régénérées. Le programme et les questions personnalisées ne sont pas corrigés.";
      } else {
        const g = await window.Cours.executerPy(cle.generateur + `\n_csv = generer(${Number(matricule)})`, null, null, ["_csv"]);
        const fichiers = { [cle.fichier]: g.valeurs && g.valeurs._csv };
        const vars = Object.keys(cle.programme.variables);
        const persos = cle.questions.filter(q => q.perso).map(q => q.perso);
        const ref = await window.Cours.executerPy(cle.reference, null, null, [...vars, ...persos], fichiers);
        const exprsGraph = cle.programme.graphique.map(x => x[0]);
        const r = await window.Cours.executerPy(detail.code, null, null, [...vars, ...exprsGraph], fichiers);
        detail.erreur = r.erreur;
        if (ref.erreur) detail.alerte = "Le programme de référence a échoué sur ces données : " + ref.erreur.split("\n").slice(-1)[0];
        for (const v of vars) {
          const attendu = ref.valeurs ? ref.valeurs[v] : undefined;
          const obtenu = r.valeurs ? r.valeurs[v] : undefined;
          const ok = attendu !== undefined && egal(obtenu, attendu, 0.001);
          detail.variables.push({ libelle: v, attendu, obtenu, ok, points: cle.programme.variables[v] });
          if (ok) sections.prog += cle.programme.variables[v];
        }
        for (const [expr, pts, lib] of cle.programme.graphique) {
          const ok = !!(r.valeurs && r.valeurs[expr] === true);
          detail.graphique.push({ libelle: lib, ok, points: pts });
          if (ok) sections.graph += pts;
        }
        detail.refValeurs = ref.valeurs || {};
      }

      // Partie D : questions de validation.
      const reps = (d.quiz && d.quiz.reponses) || [];
      cle.questions.forEach((q, i) => {
        const valeur = reps[i] ? reps[i].valeur : "";
        let attendu = q.attendu, ok = false;
        if (q.perso) attendu = nombre(detail.refValeurs[q.perso]);
        if (q.choix) ok = normaliser(valeur) === normaliser(attendu);
        else {
          const v = nombre(valeur);
          ok = !isNaN(v) && !isNaN(nombre(attendu)) && Math.abs(v - nombre(attendu)) <= (q.tolerance || 0) + 1e-9;
        }
        detail.questions.push({ id: q.id, valeur, attendu, ok, points: q.points });
        if (ok) sections.quest += q.points;
      });

      for (const k of ["fonctions", "prog", "graph"]) sections[k] = arrondi(sections[k]);
      const extras = Object.entries(d.extras || {});
      return {
        fichier, nom: d.nom || "(nom absent)", matricule, sections, detail,
        coches: { planif: cle.planification.criteres.map(() => false), justif: cle.justification.criteres.map(() => false) },
        textes: {
          planif: extras.filter(([k]) => k.startsWith(cle.planification.prefixe)),
          justif: extras.filter(([k]) => k.startsWith(cle.justification.prefixe)),
        },
      };
    }

    function total(e) {
      for (const g of ["planif", "justif"]) e.sections[g] = grilles[g].criteres.reduce((s, c, k) => s + (e.coches[g][k] ? c[1] : 0), 0);
      return arrondi(colonnes.reduce((s, c) => s + e.sections[c.id], 0));
    }

    function afficher() {
      const vus = {};
      etudiants.forEach(e => { if (e.matricule) vus[e.matricule] = (vus[e.matricule] || 0) + 1; });
      const lignes = etudiants.map((e, i) => {
        if (e.invalide) return `<tr><td colspan="${colonnes.length + 2}">${esc(e.fichier)} : ${esc(e.raison || "ce fichier n'est pas un rapport valide.")}</td></tr>`;
        const t = total(e);
        const doublon = e.matricule && vus[e.matricule] > 1 ? ` <strong class="alerte">numéro en double!</strong>` : "";
        return `<tr data-i="${i}"><td><strong>${esc(e.nom)}</strong>${e.matricule ? `<br><small>numéro ${esc(e.matricule)}</small>` : ""}${doublon}<br><small>${esc(e.fichier)}</small></td>
          ${colonnes.map(c => `<td class="num col-${c.id}">${e.sections[c.id]} / ${c.max}</td>`).join("")}
          <td class="num total"><strong>${t} / ${cle.total}</strong></td></tr>
          <tr class="detail"><td colspan="${colonnes.length + 2}">${detailHtml(e, i)}</td></tr>`;
      }).join("");
      zone.innerHTML = `<div class="actions"><button class="btn" id="csv" type="button">Télécharger les notes (CSV)</button></div>
        <div class="tablewrap"><table class="notes"><thead><tr><th>Participant</th>${colonnes.map(c => `<th>${esc(c.titre)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
      zone.querySelectorAll("input[data-c]").forEach(cb => cb.addEventListener("change", () => {
        const e = etudiants[cb.dataset.i]; e.coches[cb.dataset.g][cb.dataset.c] = cb.checked;
        const t = total(e); const tr = zone.querySelector(`tr[data-i="${cb.dataset.i}"]`);
        for (const g of ["planif", "justif"]) tr.querySelector(".col-" + g).textContent = `${e.sections[g]} / ${colonnes.find(c => c.id === g).max}`;
        tr.querySelector(".total").innerHTML = `<strong>${t} / ${cle.total}</strong>`;
      }));
      document.getElementById("csv").addEventListener("click", csv);
    }

    const marque = ok => ok ? "✅" : "❌";
    const montre = v => v === undefined ? "(rien)" : esc(typeof v === "string" ? v : typeof v === "number" ? String(Number(v.toPrecision(8))) : typeof v === "boolean" ? (v ? "True" : "False") : v === null ? "None" : JSON.stringify(v));

    function grilleHtml(e, i, g, titre) {
      const prefixe = grilles[g].prefixe;
      const texte = e.textes[g].map(([k, v]) => `<p><strong>${esc(k.replace(prefixe, "").replace(/^ — /, "") || k)} :</strong><br>${esc(v || "(vide)").replace(/\n/g, "<br>")}</p>`).join("");
      const criteres = grilles[g].criteres.map(([lib, pts], k) => `<label class="critere"><input type="checkbox" data-i="${i}" data-g="${g}" data-c="${k}"${e.coches[g][k] ? " checked" : ""}> ${esc(lib)} (${pts} pts)</label>`).join("");
      return `<section><h4>${esc(titre)} : texte du participant</h4>${texte || "<p>(vide)</p>"}<div class="criteres">${criteres}</div></section>`;
    }

    function detailHtml(e, i) {
      const D = e.detail;
      const fonctions = D.fonctions.map(f => `<h4>${esc(f.titre)} : ${f.reussis} test(s) réussi(s) sur ${f.essais.length}</h4>
          ${f.erreur ? `<p><em>Erreur à l'exécution : ${esc(f.erreur.split("\n").slice(-1)[0])}</em></p>` : ""}
          <ul>${f.essais.map(t => `<li>${marque(t.ok)} <code>${esc(t.libelle)}</code> → attendu ${montre(t.attendu)}, obtenu ${montre(t.obtenu)}${t.note || ""}</li>`).join("")}</ul>
          <details><summary>Code du participant</summary><pre>${esc(f.code || "(vide)")}</pre></details>`).join("");
      const programme = `<section><h4>Partie C — programme (données du numéro ${esc(D.matricule || "?")})</h4>
          ${D.alerte ? `<p class="alerte">${esc(D.alerte)}</p>` : ""}
          ${D.erreur ? `<p><em>Erreur à l'exécution : ${esc(D.erreur.split("\n").slice(-1)[0])}</em></p>` : ""}
          <ul>${D.variables.map(v => `<li>${marque(v.ok)} <code>${esc(v.libelle)}</code> (${v.points} pts) → attendu ${montre(v.attendu)}, obtenu ${montre(v.obtenu)}</li>`).join("")}</ul>
          <h4>Partie C — graphique</h4><ul>${D.graphique.map(g => `<li>${marque(g.ok)} ${esc(g.libelle)} (${g.points} pts)</li>`).join("")}</ul>
          <details><summary>Code du participant</summary><pre>${esc(D.code || "(vide)")}</pre></details></section>`;
      const questions = `<section><h4>Partie D — questions</h4><ul>${D.questions.map(q => `<li>${marque(q.ok)} ${esc(q.id)} (${q.points} pts) → réponse <code>${esc(q.valeur || "(vide)")}</code>, attendu ${montre(q.attendu)}</li>`).join("")}</ul></section>`;
      return `<details><summary>Détail</summary><div class="detail-grille">${grilleHtml(e, i, "planif", "Partie A — planification")}
        <section><h4>Partie B — fonctions</h4>${fonctions}</section>${programme}${questions}${grilleHtml(e, i, "justif", "Partie D — justification")}</div></details>`;
    }

    function csv() {
      const entete = ["Nom", "Numéro", "Fichier", ...colonnes.map(c => `${c.titre} (/${c.max})`), `Total sur ${cle.total}`];
      const lignes = etudiants.filter(e => !e.invalide).map(e => {
        const t = total(e);
        return [e.nom, e.matricule, e.fichier, ...colonnes.map(c => e.sections[c.id]), t];
      });
      const texte = "﻿" + [entete, ...lignes].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
      a.download = `notes_${cle.chapitre}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  }
})();
