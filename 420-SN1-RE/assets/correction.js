// 420-SN1-RE — Correction automatique d'une évaluation à partir des rapports déposés sur LÉA.
// Les parties A (traces) et C (programmes, réexécutés avec des tests cachés) sont corrigées ici;
// la partie B (planification) est cochée par l'enseignant.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", demarrer);

  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function normaliser(t) {
    return String(t).trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  }
  function egal(obtenu, attendu) {
    if (typeof attendu === "number") {
      return typeof obtenu === "number" && Math.abs(obtenu - attendu) <= 1e-6 * Math.max(1, Math.abs(attendu));
    }
    return obtenu !== null && obtenu !== undefined && String(obtenu).trim() === String(attendu).trim();
  }
  function litteral(v) { return typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(1) : String(v)) : JSON.stringify(v); }
  function substituer(code, intrants) {
    let c = code; const manquants = [];
    for (const [v, val] of Object.entries(intrants)) {
      const re = new RegExp("^[ \\t]*" + v + "[ \\t]*=.*$", "m");
      if (re.test(c)) c = c.replace(re, v + " = " + litteral(val));
      else { c = v + " = " + litteral(val) + "\n" + c; manquants.push(v); }
    }
    return { code: c, manquants };
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
    const totalA = cle.traces.length, totalB = cle.grille_b.length;
    const totalC = cle.problemes.reduce((s, p) => s + p.points, 0);
    const TOTAL = totalA + totalB + totalC;
    let etudiants = [];

    entree.addEventListener("change", async () => {
      const fichiers = [...entree.files];
      etudiants = [];
      zone.innerHTML = "";
      for (let i = 0; i < fichiers.length; i++) {
        etat.textContent = `Correction ${i + 1} / ${fichiers.length} : ${fichiers[i].name} (${window.Cours.messageChargement()})`;
        const d = lireRapport(await fichiers[i].text());
        if (!d) { etudiants.push({ fichier: fichiers[i].name, invalide: true }); continue; }
        etudiants.push(await corriger(d, fichiers[i].name));
      }
      etat.textContent = `${etudiants.filter(e => !e.invalide).length} rapport(s) corrigé(s). Coche la partie B dans le détail de chaque étudiant, puis télécharge les notes.`;
      afficher();
    });

    async function corriger(d, fichier) {
      const reps = (d.quiz && d.quiz.reponses) || [];
      const a = cle.traces.map((bonnes, i) => {
        const valeur = reps[i] ? reps[i].valeur : "";
        return { valeur, ok: bonnes.includes(normaliser(valeur)) };
      });
      const c = [];
      for (const p of cle.problemes) {
        const code = (d.exercices && d.exercices[p.id] && d.exercices[p.id].code) || "";
        const essais = [];
        if (p.appels) {
          // Problème de fonctions : on exécute le code une fois, puis on appelle les fonctions avec les tests cachés.
          const r = await window.Cours.executerPy(code, null, null, p.appels.map(a => a.expr));
          for (const a of p.appels) {
            const obtenu = r.valeurs ? r.valeurs[a.expr] : undefined;
            essais.push({ intrants: { appel: a.expr }, attendu: { valeur: a.attendu }, obtenu: { valeur: obtenu }, erreur: r.erreur,
                          ok: !r.erreur && egal(obtenu, a.attendu), manquants: [] });
          }
        }
        for (const t of (p.tests || [])) {
          const s = substituer(code, t.intrants);
          const r = await window.Cours.executerPy(s.code, null, null, Object.keys(t.attendu));
          const ok = !r.erreur && Object.entries(t.attendu).every(([k, v]) => egal(r.valeurs && r.valeurs[k], v));
          essais.push({ intrants: t.intrants, attendu: t.attendu, obtenu: r.valeurs, erreur: r.erreur, ok, manquants: s.manquants });
        }
        if (p.test_message) {
          const s = substituer(code, p.test_message.intrants);
          const r = await window.Cours.executerPy(s.code, null, null, ["message"]);
          const ok = !r.erreur && egal(r.valeurs && r.valeurs.message, p.test_message.attendu.message);
          essais.push({ intrants: p.test_message.intrants, attendu: p.test_message.attendu, obtenu: r.valeurs, erreur: r.erreur, ok, manquants: s.manquants });
        }
        // Points proportionnels au nombre de tests réussis, arrondis au dixième.
        const reussis = essais.filter(e => e.ok).length;
        c.push({ id: p.id, titre: p.titre, code, essais, reussis, points: Math.round(10 * p.points * reussis / essais.length) / 10 });
      }
      return { fichier, nom: d.nom || "(nom absent)", extras: d.extras || {}, a, b: cle.grille_b.map(() => false), c };
    }

    function score(e) {
      const A = e.a.filter(x => x.ok).length, B = e.b.filter(Boolean).length;
      const C = e.c.reduce((s, x) => s + x.points, 0);
      return { A, B, C, total: Math.round(10 * (A + B + C)) / 10 };
    }

    function afficher() {
      const lignes = etudiants.map((e, i) => {
        if (e.invalide) return `<tr><td colspan="7">${esc(e.fichier)} : ce fichier n'est pas un rapport valide.</td></tr>`;
        const s = score(e);
        return `<tr data-i="${i}"><td><strong>${esc(e.nom)}</strong><br><small>${esc(e.fichier)}</small></td>
          <td class="num">${s.A} / ${totalA}</td><td class="num note-b">${s.B} / ${totalB}</td>
          ${e.c.map(x => `<td class="num">${x.points} / ${cle.problemes.find(p => p.id === x.id).points}</td>`).join("")}
          <td class="num total"><strong>${s.total} / ${TOTAL}</strong></td></tr>
          <tr class="detail"><td colspan="${4 + e.c.length}">${detail(e, i)}</td></tr>`;
      }).join("");
      zone.innerHTML = `<div class="actions"><button class="btn" id="csv" type="button">Télécharger les notes (CSV)</button></div>
        <div class="tablewrap"><table class="notes"><thead><tr><th>Étudiant</th><th>A Traces</th><th>B Planif.</th>
        ${cle.problemes.map(p => `<th>${esc(p.id)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table></div>`;
      zone.querySelectorAll("input[data-b]").forEach(cb => cb.addEventListener("change", () => {
        const e = etudiants[cb.dataset.i]; e.b[cb.dataset.b] = cb.checked;
        const s = score(e); const tr = zone.querySelector(`tr[data-i="${cb.dataset.i}"]`);
        tr.querySelector(".note-b").textContent = `${s.B} / ${totalB}`;
        tr.querySelector(".total").innerHTML = `<strong>${s.total} / ${TOTAL}</strong>`;
      }));
      document.getElementById("csv").addEventListener("click", csv);
    }

    function detail(e, i) {
      const A = e.a.map((x, k) => `<li>${x.ok ? "✅" : "❌"} A${k + 1} — ${esc(cle.questions[k])} → <code>${esc(x.valeur || "(vide)")}</code></li>`).join("");
      const fiche = Object.entries(e.extras).filter(([k]) => k.startsWith("B —"))
        .map(([k, v]) => `<p><strong>${esc(k.replace("B — ", ""))} :</strong><br>${esc(v || "(vide)").replace(/\n/g, "<br>")}</p>`).join("");
      const B = cle.grille_b.map(([cleB, lib], k) => `<label class="critere"><input type="checkbox" data-i="${i}" data-b="${k}"${e.b[k] ? " checked" : ""}> ${esc(lib)}</label>`).join("");
      const C = e.c.map(x => `<h4>${esc(x.titre)} : ${x.reussis} test(s) réussi(s) sur ${x.essais.length}, ${x.points} point(s)</h4><ul>${x.essais.map(t =>
        `<li>${t.ok ? "✅" : "❌"} ${esc(t.intrants.appel ? t.intrants.appel : Object.entries(t.intrants).map(([k, v]) => k + " = " + v).join(", "))} → attendu ${esc(JSON.stringify(t.attendu))}, obtenu ${t.erreur ? "<em>erreur : " + esc(t.erreur.split("\n").slice(-1)[0]) + "</em>" : esc(JSON.stringify(t.obtenu))}${t.manquants.length ? " <em>(ligne d'intrant introuvable)</em>" : ""}</li>`).join("")}</ul>
        <details><summary>Code de l'étudiant</summary><pre>${esc(x.code || "(vide)")}</pre></details>`).join("");
      return `<details><summary>Détail</summary><div class="detail-grille">
        <section><h4>Partie A</h4><ul class="sans-puces">${A}</ul></section>
        <section><h4>Partie B : fiche de l'étudiant</h4>${fiche || "<p>(vide)</p>"}<div class="criteres">${B}</div></section>
        <section><h4>Partie C</h4>${C}</section></div></details>`;
    }

    function csv() {
      const virgule = n => String(n).replace(".", ",");
      const entete = ["Nom", "Fichier", "A", "B", ...cle.problemes.map(p => p.id), `Total sur ${TOTAL}`, "Pourcentage"];
      const lignes = etudiants.filter(e => !e.invalide).map(e => {
        const s = score(e);
        return [e.nom, e.fichier, s.A, s.B, ...e.c.map(x => virgule(x.points)), virgule(s.total), virgule((100 * s.total / TOTAL).toFixed(1))];
      });
      const texte = "﻿" + [entete, ...lignes].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
      a.download = `notes_${document.body.dataset.chapitre}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  }
})();
