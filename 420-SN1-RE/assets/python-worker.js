// 420-SN1-RE — Python (Pyodide) exécuté en arrière-plan, pour que la page ne gèle jamais.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
const OUTILS = `
import hashlib, json
def _empreinte(v):
    if isinstance(v, bool) or v is None:
        texte = repr(v)
    elif isinstance(v, (int, float)):
        texte = f"{round(float(v), 4):.4f}"
        if texte == "-0.0000":
            texte = "0.0000"
    else:
        texte = repr(v)
    return hashlib.sha256(texte.encode()).hexdigest()[:12]

def _indice(v, h):
    # Indices ciblés pour les erreurs de débutant les plus fréquentes.
    if isinstance(v, tuple):
        if len(v) == 2 and all(isinstance(x, int) for x in v):
            try:
                if _empreinte(float(f"{v[0]}.{v[1]}")) == h:
                    return f"Ta valeur est bonne, mais tu as écrit une virgule. En Python, le séparateur décimal est le point : {v[0]}.{v[1]}"
            except ValueError:
                pass
        return "C'est un tuple : plusieurs valeurs séparées par une virgule. As-tu écrit une virgule au lieu d'un point décimal?"
    if isinstance(v, str):
        try:
            nombre = float(v.replace(",", "."))
            if _empreinte(nombre) == h or _empreinte(int(nombre)) == h:
                return "Ta valeur est bonne, mais c'est du texte : enlève les guillemets pour en faire un nombre."
        except ValueError:
            pass
        if _empreinte(v.strip()) == h:
            return "Presque : enlève les espaces au début ou à la fin du texte."
        for cand in (True, False):
            if v.strip().lower() in (repr(cand).lower(), "vrai" if cand else "faux") and _empreinte(cand) == h:
                return f"Bonne idée, mais True et False s'écrivent sans guillemets : {cand}"
    return ""

def _verifier(ns, checks):
    res = []
    for nom, h in checks:
        v = ns.get(nom, None)
        ok = None if v is None else _empreinte(v) == h
        res.append([nom, ok, repr(v), "" if ok in (None, True) else _indice(v, h)])
    return json.dumps(res)
`;
const espaces = {};
let py = null;
function nettoyerErreur(message) {
  const lignes = String(message).trim().split("\n");
  const debut = lignes.findIndex(l => l.includes('File "<exec>"'));
  const utiles = debut >= 0 ? lignes.slice(debut) : lignes.slice(-1);
  return utiles.map(l => l.replace('File "<exec>", ', "")).join("\n");
}
const pret = loadPyodide().then(async p => { await p.runPythonAsync(OUTILS); py = p; postMessage({ type: "pret" }); })
  .catch(e => postMessage({ type: "echec", message: String(e) }));
onmessage = async e => {
  await pret;
  const { id, code, espace, checks } = e.data;
  let sortie = "";
  py.setStdout({ batched: s => { sortie += s + "\n"; } });
  py.setStderr({ batched: s => { sortie += s + "\n"; } });
  const ns = espace ? (espaces[espace] = espaces[espace] || py.globals.get("dict")()) : py.globals.get("dict")();
  try {
    await py.runPythonAsync(code, { globals: ns });
  } catch (err) {
    postMessage({ type: "resultat", id, sortie, erreur: nettoyerErreur(err.message || err) });
    return;
  }
  let verifs = null;
  if (checks && checks.length) verifs = JSON.parse(py.globals.get("_verifier")(ns, py.toPy(checks)));
  postMessage({ type: "resultat", id, sortie, erreur: null, verifs });
};
