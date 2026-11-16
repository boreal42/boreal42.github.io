// Exemples Python exécutables dans la page (Pyodide, chargé au premier clic).
(function () {
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
  let pyPromise = null;

  function chargerPython() {
    if (!pyPromise) {
      pyPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = PYODIDE;
        s.onload = () => loadPyodide().then(resolve, reject);
        s.onerror = () => reject(new Error("Impossible de charger Python. Vérifie ta connexion Internet."));
        document.head.appendChild(s);
      });
    }
    return pyPromise;
  }

  function ajuster(t) {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 4 + "px";
  }

  function nettoyerErreur(message) {
    const lignes = message.trim().split("\n");
    const debut = lignes.findIndex(l => l.includes('File "<exec>"'));
    const utiles = debut >= 0 ? lignes.slice(debut) : lignes.slice(-1);
    return utiles.map(l => l.replace('File "<exec>", ', "")).join("\n");
  }

  document.querySelectorAll(".runner").forEach(bloc => {
    const zone = bloc.querySelector("textarea");
    const sortie = bloc.querySelector("output");
    const etat = bloc.querySelector(".status");
    const original = zone.value;
    ajuster(zone);
    zone.addEventListener("input", () => ajuster(zone));
    zone.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const d = zone.selectionStart;
        zone.value = zone.value.slice(0, d) + "    " + zone.value.slice(zone.selectionEnd);
        zone.selectionStart = zone.selectionEnd = d + 4;
      }
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); bloc.querySelector(".run").click(); }
    });

    bloc.querySelector(".reset").addEventListener("click", () => {
      zone.value = original; ajuster(zone); sortie.textContent = ""; sortie.className = ""; etat.textContent = "";
    });

    bloc.querySelector(".run").addEventListener("click", async () => {
      sortie.className = "";
      sortie.textContent = "";
      etat.textContent = pyPromise ? "Exécution…" : "Chargement de Python (une seule fois, quelques secondes)…";
      let texte = "";
      try {
        const py = await chargerPython();
        py.setStdout({ batched: s => { texte += s + "\n"; } });
        py.setStderr({ batched: s => { texte += s + "\n"; } });
        await py.runPythonAsync(zone.value);
        sortie.textContent = texte || "(aucun affichage)";
        etat.textContent = "";
      } catch (err) {
        sortie.textContent = texte + nettoyerErreur(String(err.message || err));
        sortie.className = "err";
        etat.textContent = "Erreur";
      }
    });
  });

  // Table des matières : surligner la section visible.
  const liens = [...document.querySelectorAll(".toc a[href^='#']")];
  if (liens.length && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          liens.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    liens.forEach(a => { const h = document.getElementById(a.getAttribute("href").slice(1)); if (h) obs.observe(h); });
  }
})();
