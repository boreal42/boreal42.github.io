// IntroIA — Mode examen. Pendant une épreuve, le reste du site est fermé dans ce navigateur :
// seule la page de l'épreuve (qui contient l'aide-mémoire) reste accessible, jusqu'à la fin prévue.
// Chargé dans le <head> de chaque page, avant le contenu. Les pages de correction ne sont pas touchées.
(function () {
  "use strict";
  var CLE = "introia:examen";
  // Empreinte SHA-256 du code de levée de l'enseignant (le code lui-même n'est pas dans le site).
  var LEVEE = "4fad235daabd8ff4301ff8f530bdc3b345d0adaeb81aeb9fc62f8e7a9557947f";
  if (location.pathname.indexOf("/correction/") >= 0) return;
  var examen = null;
  try { examen = JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) { return; }
  if (!examen || Date.now() > examen.fin) {
    try { if (examen) localStorage.removeItem(CLE); } catch (e) {}
    return;
  }
  if (location.pathname === examen.url) return;   // la page de l'épreuve elle-même

  var style = document.createElement("style");
  style.textContent = "html.verrou-examen body > *:not(#mode-examen){display:none!important}" +
    "#mode-examen{max-width:34rem;margin:12vh auto;padding:2rem;font-family:system-ui,sans-serif;line-height:1.5;" +
    "background:#fff;border:2px solid #6a3fb5;border-radius:12px;color:#14212b}" +
    "#mode-examen h1{font-size:1.4rem;margin:0 0 .8rem}#mode-examen a.btn{display:inline-block;margin:.8rem 0;padding:.6rem 1rem;" +
    "background:#6a3fb5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}" +
    "#mode-examen details{margin-top:1.4rem;font-size:.9rem}#mode-examen input{padding:.4rem;margin-right:.4rem}";
  document.head.appendChild(style);
  document.documentElement.classList.add("verrou-examen");

  document.addEventListener("DOMContentLoaded", function () {
    var fin = new Date(examen.fin).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
    var bloc = document.createElement("div");
    bloc.id = "mode-examen";
    bloc.innerHTML = "<h1>Épreuve en cours</h1>" +
      "<p>Pendant l'épreuve, le reste du site est fermé dans ce navigateur, jusqu'à " + fin + ". " +
      "L'aide-mémoire du cours se trouve au bas de la page de l'épreuve.</p>" +
      "<a class=\"btn\" href=\"" + examen.url + "\">Retour à l'épreuve</a>" +
      "<details><summary>Enseignant : lever le mode examen</summary>" +
      "<form><input type=\"password\" autocomplete=\"off\" aria-label=\"Code de levée\"><button type=\"submit\">Lever</button> <span></span></form></details>";
    document.body.insertBefore(bloc, document.body.firstChild);
    bloc.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var code = bloc.querySelector("input").value.trim().toLowerCase();
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)).then(function (h) {
        var hex = Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
        if (hex === LEVEE) { localStorage.removeItem(CLE); location.reload(); }
        else bloc.querySelector("span").textContent = "Code refusé.";
      });
    });
  });
})();
