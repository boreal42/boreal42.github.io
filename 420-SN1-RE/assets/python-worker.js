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
        if nom.isidentifier():
            v = ns.get(nom, None)
            ok = None if v is None else _empreinte(v) == h
            res.append([nom, ok, repr(v), "" if ok in (None, True) else _indice(v, h)])
            continue
        # Une expression, comme un appel de fonction : aire_disque(2)
        fonction = nom.split("(")[0]
        if fonction not in ns:
            res.append([nom, False, "(fonction introuvable)", f"Aucune fonction nommée {fonction} : vérifie le nom de ta fonction, puis exécute de nouveau."])
            continue
        try:
            v = eval(nom, ns)
        except Exception as e:
            res.append([nom, False, f"{type(e).__name__}: {e}", "L'appel a provoqué une erreur. Vérifie les paramètres de ta fonction."])
            continue
        if v is None:
            res.append([nom, False, "None", "Ta fonction ne retourne rien. As-tu utilisé print() au lieu de return?"])
            continue
        ok = _empreinte(v) == h
        res.append([nom, ok, repr(v), "" if ok else _indice(v, h)])
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
  const { id, code, espace, checks, valeurs } = e.data;
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
  let verifs = null, vals = null;
  if (checks && checks.length) verifs = JSON.parse(py.globals.get("_verifier")(ns, py.toPy(checks)));
  if (valeurs && valeurs.length) {
    ns.set("__noms__", py.toPy(valeurs));
    vals = JSON.parse(await py.runPythonAsync(
      '__import__("json").dumps({n: (lambda v: v if v is None or isinstance(v, (int, float, str, bool)) else repr(v))(globals().get(n)) for n in __noms__})',
      { globals: ns }));
  }
  postMessage({ type: "resultat", id, sortie, erreur: null, verifs, valeurs: vals });
};
