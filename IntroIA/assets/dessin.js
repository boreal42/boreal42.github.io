// IntroIA — Interface du projet du module 3 : dessiner un chiffre, le ramener au format de MNIST
// (28 × 28, chiffre clair sur fond noir, centré par son centre de masse dans une boîte de 20 × 20),
// puis le classer avec le modèle exporté du carnet de l'équipe (fichier JSON) et trouver son groupe (k-moyennes).
// Le calcul se fait entièrement dans le navigateur, sans serveur.
(function () {
  "use strict";
  document.addEventListener("contenu-ouvert", demarrer);

  // ---------------------------------------------------------------- calcul du réseau (tenseurs h × w × c, à plat)
  const activer = {
    relu: v => v.map(x => (x > 0 ? x : 0)),
    sigmoid: v => v.map(x => 1 / (1 + Math.exp(-x))),
    tanh: v => v.map(x => Math.tanh(x)),
    linear: v => v,
    softmax: v => { const m = Math.max(...v); const e = v.map(x => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); },
  };

  function conv2d(t, couche) {
    const [kh, kw, cin, cout] = couche.forme;
    const k = couche.noyaux, b = couche.biais;
    const same = couche.padding === "same";
    const ph = same ? Math.floor((kh - 1) / 2) : 0, pw = same ? Math.floor((kw - 1) / 2) : 0;
    const H = same ? t.h : t.h - kh + 1, W = same ? t.w : t.w - kw + 1;
    const sortie = new Float32Array(H * W * cout);
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) for (let o = 0; o < cout; o++) {
      let s = b[o];
      for (let u = 0; u < kh; u++) {
        const y = i + u - ph; if (y < 0 || y >= t.h) continue;
        for (let v = 0; v < kw; v++) {
          const x = j + v - pw; if (x < 0 || x >= t.w) continue;
          const base = (y * t.w + x) * t.c, kb = ((u * kw + v) * cin) * cout + o;
          for (let c = 0; c < cin; c++) s += t.d[base + c] * k[kb + c * cout];
        }
      }
      sortie[(i * W + j) * cout + o] = s;
    }
    return { h: H, w: W, c: cout, d: Array.from(activer[couche.activation || "linear"](sortie)) };
  }

  function maxpool(t, couche) {
    const p = couche.taille || 2;
    const H = Math.floor(t.h / p), W = Math.floor(t.w / p);
    const d = new Array(H * W * t.c).fill(-Infinity);
    for (let i = 0; i < H * p; i++) for (let j = 0; j < W * p; j++) for (let c = 0; c < t.c; c++) {
      const k = (Math.floor(i / p) * W + Math.floor(j / p)) * t.c + c;
      d[k] = Math.max(d[k], t.d[(i * t.w + j) * t.c + c]);
    }
    return { h: H, w: W, c: t.c, d };
  }

  function aplatir(t, couche) {
    if (couche.ordre !== "chw") return { h: 1, w: 1, c: t.d.length, d: t.d };
    const d = [];
    for (let c = 0; c < t.c; c++) for (let i = 0; i < t.h; i++) for (let j = 0; j < t.w; j++) d.push(t.d[(i * t.w + j) * t.c + c]);
    return { h: 1, w: 1, c: d.length, d };
  }

  function dense(t, couche) {
    const [n, m] = couche.forme;
    if (t.d.length !== n) throw new Error(`une couche dense attend ${n} valeurs, elle en reçoit ${t.d.length}`);
    const W = couche.poids, d = Array.from(couche.biais);
    for (let i = 0; i < n; i++) { const x = t.d[i]; if (x === 0) continue; for (let o = 0; o < m; o++) d[o] += x * W[i * m + o]; }
    return { h: 1, w: 1, c: m, d: activer[couche.activation || "linear"](d) };
  }

  const calculs = { conv2d, maxpool, flatten: aplatir, dense };
  window.IntroIADessin = { predire: (m, img) => predire(m, img), valider: m => valider(m) };   // pour vérifier l'export

  function predire(modele, image) {
    let t = { h: 28, w: 28, c: 1, d: Array.from(image) };
    let caracteristiques = null;
    modele.couches.forEach((couche, i) => {
      t = calculs[couche.type](t, couche);
      if (i === modele.caracteristiques) caracteristiques = t.d.slice();
    });
    let p = t.d;
    const somme = p.reduce((a, b) => a + b, 0);
    if (p.some(x => x < 0) || Math.abs(somme - 1) > 1e-3) p = activer.softmax(p);    // des logits : on applique softmax
    return { probabilites: p, caracteristiques };
  }

  function valider(m) {
    if (!m || !Array.isArray(m.couches) || !m.couches.length) throw new Error("le fichier ne contient pas de couches");
    m.couches.forEach((c, i) => {
      if (!calculs[c.type]) throw new Error(`couche ${i} : type « ${c.type} » non pris en charge (conv2d, maxpool, flatten, dense)`);
      if (c.activation && !activer[c.activation]) throw new Error(`couche ${i} : activation « ${c.activation} » non prise en charge`);
      if (c.poids) c.poids = Float32Array.from(c.poids.flat(Infinity));
      if (c.noyaux) c.noyaux = Float32Array.from(c.noyaux.flat(Infinity));
    });
    if (m.centres && m.caracteristiques === undefined) throw new Error("des centres de groupes sont donnés, mais pas l'indice de la couche des caractéristiques");
    return m;
  }

  // ---------------------------------------------------------------- prétraitement à la façon de MNIST
  function versMnist(source) {
    const n = source.width;
    const brut = source.getContext("2d").getImageData(0, 0, n, n).data;
    const gris = new Float32Array(n * n);
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let i = 0; i < n * n; i++) {
      const v = brut[4 * i] / 255;               // trait blanc sur fond noir
      gris[i] = v;
      if (v > 0.1) { const x = i % n, y = Math.floor(i / n); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) return null;
    // 1. la boîte englobante, ramenée à 20 × 20 en gardant les proportions
    const cote = Math.max(x1 - x0 + 1, y1 - y0 + 1), echelle = 20 / cote;
    const tmp = document.createElement("canvas"); tmp.width = tmp.height = 28;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 28, 28);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    const lw = (x1 - x0 + 1) * echelle, lh = (y1 - y0 + 1) * echelle;
    ctx.drawImage(source, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (28 - lw) / 2, (28 - lh) / 2, lw, lh);
    let img = Array.from(ctx.getImageData(0, 0, 28, 28).data.filter((_, k) => k % 4 === 0), v => v / 255);
    // 2. on déplace l'image pour que son centre de masse soit au centre (14, 14)
    let m = 0, cx = 0, cy = 0;
    img.forEach((v, k) => { m += v; cx += v * (k % 28); cy += v * Math.floor(k / 28); });
    const dx = Math.round(13.5 - cx / m), dy = Math.round(13.5 - cy / m);
    const decale = new Array(784).fill(0);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx >= 0 && sx < 28 && sy >= 0 && sy < 28) decale[y * 28 + x] = img[sy * 28 + sx];
    }
    return decale;
  }

  // ---------------------------------------------------------------- l'interface
  function demarrer() {
    const zone = document.getElementById("interface-dessin");
    if (!zone) return;
    const toile = zone.querySelector("canvas.dessin");
    const apercu = zone.querySelector("canvas.apercu28");
    const etat = zone.querySelector(".etat-modele");
    const resultat = zone.querySelector(".resultat-dessin");
    const barres = zone.querySelector(".barres");
    const bilan = zone.querySelector(".bilan-dessin");
    const ctx = toile.getContext("2d");
    let modele = null, image = null, derniere = null;
    const compte = { bons: 0, total: 0 };

    function effacer() {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, toile.width, toile.height);
      apercu.getContext("2d").clearRect(0, 0, apercu.width, apercu.height);
      resultat.textContent = modele ? "Dessinez un chiffre." : "Chargez d'abord le modèle exporté par votre carnet.";
      barres.innerHTML = ""; image = null; derniere = null;
      zone.querySelectorAll(".juger").forEach(b => { b.disabled = true; });
    }
    effacer();

    let trace = false, precedent = null;
    const position = e => { const r = toile.getBoundingClientRect(); return [(e.clientX - r.left) * toile.width / r.width, (e.clientY - r.top) * toile.height / r.height]; };
    toile.addEventListener("pointerdown", e => { trace = true; precedent = position(e); toile.setPointerCapture(e.pointerId); point(precedent); });
    toile.addEventListener("pointermove", e => { if (!trace) return; const p = position(e); ligne(precedent, p); precedent = p; });
    const fin = () => { if (trace) { trace = false; analyser(); } };
    toile.addEventListener("pointerup", fin);
    toile.addEventListener("pointercancel", fin);
    function point(p) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.fill(); }
    function ligne(a, b) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 18; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    function analyser() {
      image = versMnist(toile);
      if (!image) return;
      const a = apercu.getContext("2d"), px = a.createImageData(28, 28);
      image.forEach((v, k) => { px.data.set([255 * v, 255 * v, 255 * v, 255], 4 * k); });
      const tmp = document.createElement("canvas"); tmp.width = tmp.height = 28; tmp.getContext("2d").putImageData(px, 0, 0);
      a.imageSmoothingEnabled = false; a.drawImage(tmp, 0, 0, apercu.width, apercu.height);
      if (!modele) return;
      let r;
      try { r = predire(modele, image); } catch (e) { resultat.textContent = "Erreur du modèle : " + e.message; return; }
      const p = r.probabilites, chiffre = p.indexOf(Math.max(...p));
      let groupe = "";
      if (modele.centres && r.caracteristiques) {
        const dist = modele.centres.map(c => c.reduce((s, v, k) => s + (v - r.caracteristiques[k]) ** 2, 0));
        const g = dist.indexOf(Math.min(...dist));
        const et = modele.etiquettes_groupes ? ` (surtout des ${modele.etiquettes_groupes[g]})` : "";
        groupe = ` · groupe ${g}${et}`;
      }
      derniere = chiffre;
      resultat.innerHTML = `Prédiction : <strong class="chiffre-predit">${chiffre}</strong> (confiance ${(100 * p[chiffre]).toFixed(1)} %)<span class="groupe-predit">${groupe}</span>`;
      barres.innerHTML = p.map((v, k) => `<div class="proba${k === chiffre ? " max" : ""}"><span>${k}</span><i style="width:${(100 * v).toFixed(1)}%"></i><small>${(100 * v).toFixed(1)} %</small></div>`).join("");
      zone.querySelectorAll(".juger").forEach(b => { b.disabled = false; });
    }

    zone.querySelector(".effacer").addEventListener("click", effacer);
    zone.querySelectorAll(".juger").forEach(b => b.addEventListener("click", () => {
      if (derniere === null) return;
      compte.total += 1; if (b.dataset.bon === "1") compte.bons += 1;
      bilan.textContent = `Chiffres dessinés jugés : ${compte.total} · bien reconnus : ${compte.bons} (${(100 * compte.bons / compte.total).toFixed(1)} %)`;
      effacer();
    }));
    zone.querySelector(".charger-modele").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        modele = valider(JSON.parse(await f.text()));
        const n = modele.couches.length;
        etat.textContent = `Modèle chargé : ${f.name}, ${n} couches${modele.centres ? `, ${modele.centres.length} groupes` : ", sans groupes"}${modele.equipe ? ` (équipe ${modele.equipe})` : ""}.`;
        if (image) analyser(); else effacer();
      } catch (err) {
        modele = null;
        etat.textContent = "Ce fichier n'est pas un modèle valide : " + err.message;
      }
    });
  }
})();
