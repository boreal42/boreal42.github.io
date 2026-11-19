// IntroIA — Correction du projet de module à partir des rapports des équipes.
// Pour chaque cas : données de l'équipe régénérées à partir de son numéro, code de l'équipe et solution de
// référence réexécutés sur ces données, résultats clés et graphiques affichés côte à côte.
// La note vient de la grille : l'enseignant note chaque critère (demi-points permis).
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", demarrer);

  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arrondi = x => Math.round(10 * x) / 10;
  const somme = l => l.reduce((s, x) => s + x, 0);
  function nombre(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean" || v === null || v === undefined) return NaN;
    const t = String(v).trim().replace(/^np\.(float|int)\d*\((.*)\)$/, "$2").replace(",", ".");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  function lireRapport(texte) {
    const m = texte.match(/^# DONNEES: (\S+)\s*$/m);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return null; }
  }
  const montre = v => v === undefined ? "(non défini)" : v === null ? "None" : esc(typeof v === "number" ? String(Number(v.toPrecision(6))) : typeof v === "string" ? v : JSON.stringify(v));
  // Écart avec la référence : signale seulement les grands écarts (à examiner, pas une erreur en soi).
  function ecart(obtenu, ref) {
    const o = nombre(obtenu), r = nombre(ref);
    if (isNaN(r)) return obtenu === undefined || obtenu === null ? "absent" : (String(obtenu).trim().toLowerCase() === String(ref).trim().toLowerCase() ? "proche" : "different");
    if (isNaN(o)) return "absent";
    return Math.abs(o - r) <= Math.max(0.05, 0.25 * Math.abs(r)) ? "proche" : "different";
  }
  const pastille = { proche: "🟢 proche", different: "🟠 à examiner", absent: "🔴 absent" };

  function demarrer() {
    const cle = JSON.parse(document.getElementById("cle-correction").textContent);
    const avecCode = !!cle.generateur;      // projet du module 2 : code réexécuté; module 3 : rapport et grille seulement
    const entree = document.getElementById("rapports");
    const etat = document.getElementById("etat-correction");
    const zone = document.getElementById("resultats");
    const blocs = [...cle.cas.map(c => ({ id: c.id, titre: c.titre.split(" — ")[0], grille: c.grille, max: c.points })),
                   { id: "Q", titre: "Qualité", grille: cle.qualite.grille, max: somme(cle.qualite.grille.map(g => g[1])) }];
    let equipes = [];
    const cacheDonnees = {};

    entree.addEventListener("change", async () => {
      const fichiers = [...entree.files];
      equipes = [];
      zone.innerHTML = "";
      for (let i = 0; i < fichiers.length; i++) {
        const d = lireRapport(await fichiers[i].text());
        if (!d) { equipes.push({ fichier: fichiers[i].name, invalide: true }); continue; }
        if (d.chapitre !== cle.chapitre) { equipes.push({ fichier: fichiers[i].name, invalide: true, raison: `ce rapport vient d'une autre page (${d.chapitre}), pas de ce projet` }); continue; }
        equipes.push(await corriger(d, fichiers[i].name, (k, n) => {
          etat.textContent = `Rapport ${i + 1} / ${fichiers.length} (${fichiers[i].name}) : partie ${k} / ${n}… ${avecCode ? window.Cours.messageChargement("numpy pandas matplotlib") : ""}`;
        }));
      }
      etat.textContent = `${equipes.filter(e => !e.invalide).length} rapport(s) traité(s). Notez chaque critère dans le détail de chaque équipe, puis téléchargez les notes.`;
      afficher();
    });

    async function donnees(equipe) {
      if (!cacheDonnees[equipe]) {
        const g = await window.Cours.executerPy(cle.generateur + `\n_csv = generer(${equipe})`, null, null, ["_csv"]);
        cacheDonnees[equipe] = g.valeurs && g.valeurs._csv;
      }
      return { [cle.fichier]: cacheDonnees[equipe] };
    }

    async function corriger(d, fichier, progres) {
      const extras = d.extras || {};
      const equipe = Number(String(extras["Équipe"] || "").replace(/\D/g, "")) || 0;
      const resultat = { fichier, membres: d.nom || "(membres absents)", equipe, cas: [], notes: {}, extras };
      blocs.forEach(b => { resultat.notes[b.id] = b.grille.map(() => null); });
      if (!equipe && avecCode) { resultat.alerte = "Numéro d'équipe absent : les données ne peuvent pas être régénérées, le code n'est pas réexécuté."; }
      const fichiers = equipe && avecCode ? await donnees(equipe) : null;
      for (let k = 0; k < cle.cas.length; k++) {
        const c = cle.cas[k];
        progres(k + 1, cle.cas.length);
        const code = (d.exercices && d.exercices[c.id] && d.exercices[c.id].code) || "";
        const vars = (c.resultats || []).map(r => r[0]);
        const info = { id: c.id, titre: c.titre, code, variables: [] };
        if (fichiers) {
          const ref = await window.Cours.executerPy(c.reference, null, null, vars, fichiers);
          const r = await window.Cours.executerPy(code, null, null, vars, fichiers);
          info.erreur = r.erreur;
          info.erreurRef = ref.erreur;
          info.figures = r.figures || [];
          info.sortie = r.sortie || "";
          for (const [v, desc] of c.resultats) {
            const obtenu = r.valeurs ? r.valeurs[v] : undefined;
            const attendu = ref.valeurs ? ref.valeurs[v] : undefined;
            info.variables.push({ v, desc, obtenu, attendu, ecart: r.erreur ? "absent" : ecart(obtenu, attendu) });
          }
        }
        resultat.cas.push(info);
      }
      return resultat;
    }

    const definis = c => c.variables.some(x => x.obtenu !== undefined && x.obtenu !== null && x.obtenu !== "None");
    function noteBloc(e, b) { return arrondi(somme(e.notes[b.id].map(x => x || 0))); }
    function total(e) { return arrondi(somme(blocs.map(b => noteBloc(e, b)))); }
    function complet(e) { return blocs.every(b => e.notes[b.id].every(x => x !== null)); }

    function afficher() {
      const vus = {};
      equipes.forEach(e => { if (e.equipe) vus[e.equipe] = (vus[e.equipe] || 0) + 1; });
      const lignes = equipes.map((e, i) => {
        if (e.invalide) return `<tr><td colspan="${blocs.length + 2}">${esc(e.fichier)} : ${esc(e.raison || "ce fichier n'est pas un rapport valide.")}</td></tr>`;
        const doublon = e.equipe && vus[e.equipe] > 1 ? ` <strong class="alerte">numéro d'équipe en double!</strong>` : "";
        const executes = e.cas.filter(c => c.code.trim() && !c.erreur && definis(c)).length;
        const remplis = blocs.slice(0, -1).filter((b, k) => cle.cas[k].textes.some(t => (e.extras[t] || "").trim())).length;
        const etatCas = avecCode ? `${executes} / ${e.cas.length} cas exécutés avec résultats` : `${remplis} / ${e.cas.length} parties rédigées`;
        return `<tr data-i="${i}"><td><strong>Équipe ${e.equipe || "?"}</strong>${doublon}<br><small>${esc(e.membres)}</small><br><small>${esc(e.fichier)} · ${etatCas}</small></td>
          ${blocs.map(b => `<td class="num col-${b.id}">${noteBloc(e, b)} / ${b.max}</td>`).join("")}
          <td class="num total">${totalHtml(e)}</td></tr>
          <tr class="detail"><td colspan="${blocs.length + 2}">${detailHtml(e, i)}</td></tr>`;
      }).join("");
      zone.innerHTML = `<div class="actions"><button class="btn" id="csv" type="button">Télécharger les notes (CSV)</button></div>
        <div class="tablewrap"><table class="notes"><thead><tr><th>Équipe</th>${blocs.map(b => `<th>${esc(b.titre)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
      zone.querySelectorAll("input[data-b]").forEach(champ => champ.addEventListener("input", () => {
        const e = equipes[champ.dataset.i];
        const max = Number(champ.max);
        let v = champ.value.trim() === "" ? null : nombre(champ.value);
        if (v !== null && (isNaN(v) || v < 0 || v > max)) { champ.classList.add("invalide"); v = null; } else champ.classList.remove("invalide");
        e.notes[champ.dataset.b][champ.dataset.c] = v;
        const tr = zone.querySelector(`tr[data-i="${champ.dataset.i}"]`);
        const b = blocs.find(x => x.id === champ.dataset.b);
        tr.querySelector(".col-" + b.id).textContent = `${noteBloc(e, b)} / ${b.max}`;
        tr.querySelector(".total").innerHTML = totalHtml(e);
      }));
      document.getElementById("csv").addEventListener("click", csv);
    }
    const totalHtml = e => `<strong>${total(e)} / ${cle.total}</strong>${complet(e) ? "" : "<br><small>grille incomplète</small>"}`;

    function grilleHtml(e, i, b) {
      return `<div class="criteres">${b.grille.map(([lib, pts], k) => `<label class="critere"><input type="number" min="0" max="${pts}" step="0.5" data-i="${i}" data-b="${b.id}" data-c="${k}" value="${e.notes[b.id][k] ?? ""}" style="width:4.5em"> / ${pts} — ${esc(lib)}</label>`).join("")}</div>`;
    }
    const texteHtml = (e, cles) => cles.map(k => `<p><strong>${esc(k)} :</strong><br>${esc(e.extras[k] || "(vide)").replace(/\n/g, "<br>")}</p>`).join("");

    function detailHtml(e, i) {
      const cas = e.cas.map((c, k) => {
        const def = cle.cas[k];
        const vars = c.variables.length ? `<div class="tablewrap"><table><thead><tr><th>Résultat</th><th>Équipe</th><th>Référence</th><th>Écart</th></tr></thead><tbody>
            ${c.variables.map(x => `<tr><td><code>${esc(x.v)}</code><br><small>${esc(x.desc)}</small></td><td class="num">${montre(x.obtenu)}</td><td class="num">${montre(x.attendu)}</td><td>${pastille[x.ecart]}</td></tr>`).join("")}</tbody></table></div>` : "";
        const figures = (c.figures || []).map(f => `<img src="data:image/png;base64,${f}" alt="Graphique de l'équipe" style="max-width:48%;margin:.25em">`).join("");
        if (!avecCode) return `<section><h4>${esc(c.titre)}</h4>${texteHtml(e, def.textes)}${grilleHtml(e, i, blocs[k])}</section>`;
        return `<section><h4>${esc(c.titre)}</h4>
          ${!c.code.trim() ? "<p class=\"alerte\">Aucun code remis pour ce cas.</p>" : c.erreur ? `<p class="alerte">Erreur à l'exécution : ${esc(c.erreur.split("\n").slice(-1)[0])}</p>` : e.alerte ? "" : definis(c) ? "<p>✅ Le code s'exécute sans erreur sur les données de l'équipe.</p>" : "<p class=\"alerte\">Le code s'exécute, mais ne définit aucun résultat clé (code de départ?).</p>"}
          ${c.erreurRef ? `<p><em>La solution de référence a échoué : ${esc(c.erreurRef.split("\n").slice(-1)[0])}</em></p>` : ""}
          ${vars}
          ${figures ? `<details><summary>Graphiques de l'équipe (${c.figures.length})</summary>${figures}</details>` : ""}
          ${c.sortie ? `<details><summary>Sortie du code</summary><pre>${esc(c.sortie.slice(0, 6000))}</pre></details>` : ""}
          <details><summary>Code de l'équipe</summary><pre>${esc(c.code || "(vide)")}</pre></details>
          ${texteHtml(e, def.textes)}
          ${grilleHtml(e, i, blocs[k])}</section>`;
      }).join("");
      const qualite = `<section><h4>Qualité générale</h4>${texteHtml(e, cle.qualite.textes)}${grilleHtml(e, i, blocs[blocs.length - 1])}</section>`;
      return `<details><summary>Détail</summary>${e.alerte ? `<p class="alerte">${esc(e.alerte)}</p>` : ""}<div class="detail-grille">${cas}${qualite}</div></details>`;
    }

    function csv() {
      const entete = ["Équipe", "Membres", "Fichier", ...blocs.map(b => `${b.titre} (/${b.max})`), `Total sur ${cle.total}`, "Grille complète"];
      const lignes = equipes.filter(e => !e.invalide).map(e => [e.equipe, e.membres, e.fichier, ...blocs.map(b => noteBloc(e, b)), total(e), complet(e) ? "oui" : "non"]);
      const texte = "﻿" + [entete, ...lignes].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
      a.download = `notes_${cle.chapitre}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  }
})();
