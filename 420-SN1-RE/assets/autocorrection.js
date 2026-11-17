// 420-SN1-RE — Auto-correction de l'épreuve à blanc (labo 13).
// À la fin de la séance, l'enseignant donne le code du corrigé. La page corrige alors le travail de
// l'étudiant avec les mêmes règles que l'épreuve finale (tests cachés, données du matricule,
// graphique, questions), propose la grille de planification en auto-évaluation et affiche le corrigé.
(function () {
  "use strict";
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const arrondi = x => Math.round(10 * x) / 10;
  function nombre(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean" || v === null || v === undefined) return NaN;
    const t = String(v).trim().replace(/^np\.(float|int)\d*\((.*)\)$/, "$2").replace(",", ".");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  const normaliser = t => String(t).trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "").replace(/,/g, ".").replace(/\s+/g, " ");
  function egal(obtenu, attendu, tolRel) {
    if (attendu === null) return obtenu === null || obtenu === "None";
    if (typeof attendu === "number") {
      const o = nombre(obtenu);
      return !isNaN(o) && Math.abs(o - attendu) <= Math.max(1e-6, (tolRel || 1e-6) * Math.abs(attendu));
    }
    if (typeof attendu === "boolean") return obtenu === attendu;
    return obtenu !== null && obtenu !== undefined && String(obtenu).trim() === String(attendu).trim();
  }
  const montre = v => v === undefined ? "(rien)" : v === null ? "None" : esc(typeof v === "number" ? String(Number(v.toPrecision(8))) : typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "string" ? v : JSON.stringify(v));
  const marque = ok => ok ? "✅" : "❌";
  const codeDe = id => { const z = document.querySelector(`.exo[data-id="${id}"] textarea.code`); return z ? z.value : ""; };

  document.addEventListener("contenu-ouvert", () => {
    const section = document.getElementById("autocorrection");
    if (!section) return;
    const form = section.querySelector("form");
    const msg = section.querySelector(".msg");
    const zone = section.querySelector(".resultats-auto");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      let cle;
      try {
        cle = JSON.parse(await window.Cours.dechiffrer(form.querySelector("input").value, JSON.parse(document.getElementById("corrige-chiffre").textContent)));
      } catch (err) { msg.textContent = "Ce code ne fonctionne pas. L'enseignant le donne à la fin de la séance."; return; }
      msg.textContent = "Correction en cours… (" + window.Cours.messageChargement("numpy matplotlib") + ")";
      zone.innerHTML = "";
      zone.innerHTML = await corriger(cle);
      msg.textContent = "";
      brancherGrille(cle);
    });
  });

  async function corriger(cle) {
    const parties = [];
    let auto = 0;
    // B — fonctions
    let lignesF = "";
    for (const f of cle.fonctions) {
      const r = await window.Cours.executerPy(codeDe(f.id), null, null, f.appels.map(a => a.expr));
      const essais = f.appels.map(a => ({ a, obtenu: r.valeurs ? r.valeurs[a.expr] : undefined }));
      const ok = essais.filter(x => !r.erreur && egal(x.obtenu, x.a.attendu)).length;
      const pts = arrondi(f.points * ok / essais.length); auto += pts;
      lignesF += `<h4>${esc(f.titre)} : ${pts} / ${f.points}</h4>${r.erreur ? `<p><em>Erreur : ${esc(r.erreur.split("\n").slice(-1)[0])}</em></p>` : ""}<ul>` +
        essais.map(x => `<li>${marque(!r.erreur && egal(x.obtenu, x.a.attendu))} <code>${esc(x.a.expr)}</code> → attendu ${montre(x.a.attendu)}, obtenu ${montre(x.obtenu)}</li>`).join("") + "</ul>";
    }
    parties.push(`<section><h3>Partie B — Fonctions</h3>${lignesF}</section>`);

    // C et D — programme sur les données du matricule
    const champ = document.getElementById("matricule");
    const matricule = champ ? champ.value.replace(/\D/g, "") : "";
    let lignesC = "", lignesG = "", ref = { valeurs: {} };
    let ptsC = 0, ptsG = 0;
    if (matricule.length < 5) {
      lignesC = "<p class=\"alerte\">Entre ton matricule en haut de la page : sans lui, ton programme ne peut pas être corrigé.</p>";
    } else {
      const g = await window.Cours.executerPy(cle.generateur + `\n_csv = generer(${Number(matricule)})`, null, null, ["_csv"]);
      const fichiers = { [cle.fichier]: g.valeurs && g.valeurs._csv };
      const vars = Object.keys(cle.variables);
      const persos = cle.questions.filter(q => q.perso).map(q => q.perso);
      ref = await window.Cours.executerPy(cle.reference, null, null, [...vars, ...persos], fichiers);
      const r = await window.Cours.executerPy(codeDe("P"), null, null, [...vars, ...cle.graphique.map(x => x[0])], fichiers);
      if (r.erreur) lignesC += `<p><em>Erreur à l'exécution de ton programme : ${esc(r.erreur.split("\n").slice(-1)[0])}</em></p>`;
      lignesC += "<ul>" + vars.map(v => {
        const brut = ref.valeurs ? ref.valeurs[v] : undefined;
        const attendu = brut === null ? null : nombre(brut);
        const obtenu = r.valeurs ? r.valeurs[v] : undefined;
        const ok = egal(obtenu, attendu, 0.001);
        if (ok) ptsC += cle.variables[v];
        return `<li>${marque(ok)} <code>${esc(v)}</code> (${cle.variables[v]} pts) → attendu ${montre(attendu)}, obtenu ${montre(obtenu)}</li>`;
      }).join("") + "</ul>";
      lignesG = "<ul>" + cle.graphique.map(([expr, pts, lib]) => {
        const ok = !!(r.valeurs && r.valeurs[expr] === true);
        if (ok) ptsG += pts;
        return `<li>${marque(ok)} ${esc(lib)} (${pts} pt${pts > 1 ? "s" : ""})</li>`;
      }).join("") + "</ul>";
    }
    auto += ptsC + ptsG;
    const totalC = Object.values(cle.variables).reduce((s, x) => s + x, 0);
    parties.push(`<section><h3>Partie C — Programme : ${arrondi(ptsC)} / ${totalC}</h3>${lignesC}</section>`);

    // D — questions
    const qs = [...document.querySelectorAll(".quiz.eval .q")];
    let ptsQ = 0;
    const lignesQ = cle.questions.map((q, i) => {
      const el = qs[i];
      const coche = el && el.querySelector("input[type=radio]:checked");
      const texte = el && el.querySelector("input[type=text]");
      const valeur = coche ? coche.value : texte ? texte.value : "";
      let attendu = q.attendu, ok;
      if (q.perso) attendu = ref.valeurs ? nombre(ref.valeurs[q.perso]) : NaN;
      if (q.choix) ok = normaliser(valeur) === normaliser(attendu);
      else { const v = nombre(valeur); ok = !isNaN(v) && Math.abs(v - nombre(attendu)) <= (q.tolerance || 0) + 1e-9; }
      if (ok) ptsQ += q.points;
      return `<li>${marque(ok)} ${esc(q.id)} (${q.points} pts) → ta réponse <code>${esc(valeur || "(vide)")}</code>, attendu ${montre(attendu)}</li>`;
    }).join("");
    auto += ptsQ;
    const totalG = cle.graphique.reduce((s, x) => s + x[1], 0), totalQ = cle.questions.reduce((s, q) => s + q.points, 0);
    parties.push(`<section><h3>Partie D — Validation : ${arrondi(ptsG + ptsQ)} / ${totalG + totalQ}</h3><h4>Graphique</h4>${lignesG || "<p>(non corrigé)</p>"}<h4>Questions</h4><ul>${lignesQ}</ul></section>`);

    // A — planification, en auto-évaluation
    const totalA = cle.planification.reduce((s, c) => s + c[1], 0);
    const grille = cle.planification.map(([lib, pts], k) => `<label class="critere"><input type="checkbox" data-pts="${pts}"> ${esc(lib)} (${pts} pts)</label>`).join("");
    parties.unshift(`<section><h3>Partie A — Planification : <span class="pts-a">0</span> / ${totalA}</h3>
      <p>Compare ta fiche au corrigé ci-dessous et coche honnêtement les critères atteints : à l'épreuve finale, c'est l'enseignant qui les coche.</p><div class="criteres">${grille}</div></section>`);

    const corrige = `<section><h3>Corrigé</h3>${cle.corrige_html}</section>`;
    return `<div class="bilan" data-auto="${arrondi(auto)}"><p class="score-auto">Ton résultat : <strong><span class="total-auto">${arrondi(auto)}</span> / ${cle.total}</strong>, dont <span class="pts-a2">0</span> / ${totalA} pour la planification que tu t'attribues.</p></div>`
      + parties.join("") + corrige;
  }

  function brancherGrille() {
    const zone = document.querySelector("#autocorrection .resultats-auto");
    const bilan = zone.querySelector(".bilan");
    const maj = () => {
      const a = [...zone.querySelectorAll(".criteres input:checked")].reduce((s, c) => s + Number(c.dataset.pts), 0);
      zone.querySelector(".pts-a").textContent = a;
      zone.querySelector(".pts-a2").textContent = a;
      zone.querySelector(".total-auto").textContent = arrondi(Number(bilan.dataset.auto) + a);
    };
    zone.querySelectorAll(".criteres input").forEach(c => c.addEventListener("change", maj));
  }
})();
