// IntroIA — Évaluation : données personnelles générées à partir du matricule.
// Le générateur (Python, bibliothèque standard) est dans la page chiffrée; il produit le fichier de données.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", () => {
    const champ = document.getElementById("matricule");
    const source = document.getElementById("generateur");
    if (!champ || !source) return;
    const zone = document.getElementById("donnees-perso");
    const etat = zone.querySelector(".etat-donnees");
    const apercu = zone.querySelector(".apercu");
    let demande = 0;

    async function generer() {
      const chiffres = champ.value.replace(/\D/g, "");
      const num = ++demande;
      if (chiffres.length < 5) {
        etat.textContent = "Entre ton matricule : tes données personnelles seront générées à partir de lui.";
        apercu.hidden = true;
        return;
      }
      etat.textContent = "Génération de tes données…";
      const r = await window.Cours.executerPy(source.textContent + `\n_csv = generer(${Number(chiffres)})`, null, null, ["_csv"]);
      if (num !== demande) return;          // une saisie plus récente a pris le relais
      const csv = r.valeurs && r.valeurs._csv;
      if (r.erreur || typeof csv !== "string") {
        etat.textContent = "Impossible de générer tes données : avertis l'enseignant.";
        return;
      }
      const nomFichier = source.dataset.fichier || "donnees.csv";
      window.Cours.definirFichiers({ [nomFichier]: csv });
      const lignes = csv.trim().split("\n");
      etat.innerHTML = `Tes données sont prêtes : le fichier <code>${nomFichier}</code> contient ${lignes.length - 1} mesures, générées à partir du matricule <strong>${chiffres}</strong>.`;
      apercu.textContent = lignes.slice(0, 6).join("\n") + "\n...";
      apercu.hidden = false;
    }
    champ.addEventListener("change", generer);
    champ.addEventListener("input", () => { clearTimeout(champ._t); champ._t = setTimeout(generer, 600); });
    generer();
  });
})();
