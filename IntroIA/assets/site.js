// IntroIA — Code du cours pour la page d'accueil. Le contenu est chiffré (AES-GCM, clé dérivée du code
// par PBKDF2); le code est retenu dans ce navigateur, et partagé avec les chapitres.
(function () {
  "use strict";
  const CLE = "introia:site:code";
  if (document.documentElement.classList.contains("verrou-examen")) return;   // épreuve en cours : garde.js s'en occupe
  const porte = document.getElementById("porte");
  const paquet = JSON.parse(document.getElementById("site-chiffre").textContent);
  const normaliser = c => String(c).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s`'"«»“”‘’]/g, "");
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function dechiffrer(code) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normaliser(code)), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(paquet.sel), iterations: paquet.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(paquet.iv) }, cle, b64(paquet.donnees)));
  }
  function afficher(html) {
    porte.remove();
    const zone = document.createElement("div");
    zone.innerHTML = html;
    const scripts = [...zone.querySelectorAll("script")];
    scripts.forEach(s => s.remove());
    while (zone.firstChild) document.body.insertBefore(zone.firstChild, document.getElementById("site-chiffre"));
    scripts.forEach(s => { const n = document.createElement("script"); n.textContent = s.textContent; document.body.appendChild(n); });
  }
  async function ouvrir(code, silencieux) {
    try {
      const html = await dechiffrer(code);
      try { localStorage.setItem(CLE, JSON.stringify(normaliser(code))); } catch (e) {}
      afficher(html);
    } catch (e) {
      if (!silencieux) { porte.querySelector(".msg").textContent = "Ce code ne fonctionne pas. Vérifie-le avec ton enseignant."; porte.querySelector("input").select(); }
      porte.hidden = false;
    }
  }
  porte.querySelector("form").addEventListener("submit", e => { e.preventDefault(); ouvrir(porte.querySelector("input").value, false); });
  let connu = null;
  try { connu = JSON.parse(localStorage.getItem(CLE)); } catch (e) {}
  if (connu) { porte.hidden = true; ouvrir(connu, true); }
})();
