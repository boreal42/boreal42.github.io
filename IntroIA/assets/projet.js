// IntroIA — Projet de module : données de l'équipe générées à partir du numéro d'équipe.
// Le générateur (Python, bibliothèque standard) est dans la page chiffrée; il produit le fichier de données,
// copié dans le dossier de travail de Python et téléchargeable pour Colab ou Jupyter.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", () => {
    const champ = document.getElementById("equipe");
    const source = document.getElementById("generateur");
    if (!champ || !source) return;
    const zone = document.getElementById("donnees-perso");
    const etat = zone.querySelector(".etat-donnees");
    const apercu = zone.querySelector(".apercu");
    const bouton = zone.querySelector(".telecharger-donnees");
    const nomFichier = source.dataset.fichier || "donnees.csv";
    let demande = 0, csvCourant = null, equipeCourante = null;

    async function generer() {
      const chiffres = champ.value.replace(/\D/g, "");
      const num = ++demande;
      csvCourant = null;
      bouton.hidden = true;
      if (!chiffres || Number(chiffres) < 1 || Number(chiffres) > 999) {
        etat.textContent = "Entrez votre numéro d'équipe (donné par le formateur) : vos données seront générées à partir de lui.";
        apercu.hidden = true;
        return;
      }
      etat.textContent = "Génération de vos données…";
      const r = await window.Cours.executerPy(source.textContent + `\n_csv = generer(${Number(chiffres)})`, null, null, ["_csv"]);
      if (num !== demande) return;          // une saisie plus récente a pris le relais
      const csv = r.valeurs && r.valeurs._csv;
      if (r.erreur || typeof csv !== "string") {
        etat.textContent = "Impossible de générer vos données : avertissez le formateur.";
        return;
      }
      window.Cours.definirFichiers({ [nomFichier]: csv });
      csvCourant = csv;
      equipeCourante = Number(chiffres);
      const lignes = csv.trim().split("\n");
      etat.innerHTML = `Vos données sont prêtes : le fichier <code>${nomFichier}</code> contient ${lignes.length - 1} participants, générés à partir du numéro d'équipe <strong>${equipeCourante}</strong>.`;
      apercu.textContent = lignes.slice(0, 6).join("\n") + "\n...";
      apercu.hidden = false;
      bouton.hidden = false;
    }
    bouton.addEventListener("click", () => {
      if (!csvCourant) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csvCourant], { type: "text/csv;charset=utf-8" }));
      a.download = nomFichier;
      document.body.appendChild(a); a.click(); a.remove();
    });
    champ.addEventListener("change", generer);
    champ.addEventListener("input", () => { clearTimeout(champ._t); champ._t = setTimeout(generer, 600); });
    generer();
  });
})();
