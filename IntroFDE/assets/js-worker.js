// IntroFDE — JavaScript et TypeScript exécutés en arrière-plan (Web Worker), pour que la page ne gèle jamais.
importScripts("js-moteur.js");
const TS_URL = "https://cdn.jsdelivr.net/npm/typescript@5.6.3/lib/";
let compilateur = null, libs = null, fichiers = {};

async function chargerTS() {
  if (compilateur) return;
  importScripts(TS_URL + "typescript.js");     // définit la variable globale ts
  compilateur = self.ts;
  try {
    const fr = await (await fetch(TS_URL + "fr/diagnosticMessages.generated.json")).json();
    compilateur.setLocalizedDiagnosticMessages(fr);
  } catch (e) { /* messages en anglais si le fichier est absent */ }
  const textes = await Promise.all(MoteurJS.LIBS.map(n => fetch(TS_URL + n).then(r => r.text())));
  libs = Object.fromEntries(MoteurJS.LIBS.map((n, i) => [n, textes[i]]));
}

async function empreinte(texte) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

const outils = {
  lireFichier: nom => { if (!(nom in fichiers)) throw new Error(`Fichier introuvable : ${nom}`); return fichiers[nom]; },
  attendre: ms => new Promise(r => setTimeout(r, Math.min(ms, 2000))),
};

onmessage = async e => {
  const { id, code, lang, checks, fichiers: f } = e.data;
  fichiers = f || {};
  let js = code;
  if (lang === "ts") {
    try { await chargerTS(); } catch (err) {
      postMessage({ type: "resultat", id, sortie: "", erreur: "Impossible de charger TypeScript. Vérifie ta connexion Internet, puis réessaie." });
      return;
    }
    const erreurs = MoteurJS.verifierTS(compilateur, code, libs);
    if (erreurs.length) {
      postMessage({ type: "resultat", id, sortie: "", erreur: "Le compilateur TypeScript refuse ce code :\n" + erreurs.join("\n") });
      return;
    }
    js = MoteurJS.transpiler(compilateur, code);
  }
  postMessage({ type: "debut", id });
  const r = await MoteurJS.executer(js, checks, outils);
  if (r.erreur || !checks || !checks.length) { postMessage(Object.assign({ type: "resultat", id }, r)); return; }
  const verifs = [];
  for (let i = 0; i < checks.length; i++) {
    const [nom, h] = checks[i];
    const res = r.valeurs[i][1];
    if (res.e !== undefined) { verifs.push([nom, false, res.e, "Cette expression provoque une erreur : vérifie le nom et les paramètres."]); continue; }
    const v = res.v;
    if (v === undefined) { verifs.push([nom, null, "undefined", ""]); continue; }
    const ok = (await empreinte(MoteurJS.canonique(v))) === h;
    let indice = "";
    if (!ok && typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) indice = "Ta valeur est du texte : convertis-la en nombre avec Number().";
    verifs.push([nom, ok, MoteurJS.canonique(v), indice]);
  }
  postMessage({ type: "resultat", id, sortie: r.sortie, erreur: null, verifs });
};
