// IntroIA — Python (Pyodide) exécuté en arrière-plan, pour que la page ne gèle jamais.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
const OUTILS = `
import hashlib, json, os, sys
os.environ["MPLBACKEND"] = "Agg"

def _figures():
    # Graphiques Matplotlib produits par le code : images PNG en base64, puis on ferme tout.
    if "matplotlib.pyplot" not in sys.modules:
        return "[]"
    import base64, io
    import matplotlib.pyplot as plt
    images = []
    for num in plt.get_fignums():
        tampon = io.BytesIO()
        plt.figure(num).savefig(tampon, format="png", dpi=96, bbox_inches="tight")
        images.append(base64.b64encode(tampon.getvalue()).decode())
    plt.close("all")
    return json.dumps(images)
def _natif(v):
    # Scalaires NumPy → types Python (repr identique d'une version de NumPy à l'autre).
    if type(v).__module__ == "numpy" and hasattr(v, "item"):
        try:
            return v.item()
        except (ValueError, TypeError):
            return v
    if isinstance(v, list):
        return [_natif(x) for x in v]
    if isinstance(v, tuple):
        return tuple(_natif(x) for x in v)
    if isinstance(v, dict):
        return {_natif(k): _natif(x) for k, x in v.items()}
    return v

def _empreinte(v):
    v = _natif(v)
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

def _valeurs(ns, noms):
    # Valeurs de variables ou d'expressions (appels de fonctions), pour la correction.
    sortie = {}
    for n in noms:
        try:
            v = ns.get(n, None) if n.isidentifier() else eval(n, ns)
        except Exception as e:
            v = f"Erreur : {type(e).__name__}: {e}"
        if not (v is None or isinstance(v, (int, float, str, bool))):
            v = repr(v)
        sortie[n] = v
    return json.dumps(sortie)

def _verifier(ns, checks):
    res = []
    for nom, h in checks:
        if nom.isidentifier():
            v = ns.get(nom, None)
            ok = None if v is None else _empreinte(v) == h
            res.append([nom, ok, repr(v), "" if ok in (None, True) else _indice(v, h)])
            continue
        # Une expression, comme un appel de fonction : aire_disque(2)
        fonction = nom.split("(")[0].split(".")[0].split("[")[0]
        import builtins as _b
        if fonction.isidentifier() and fonction not in ns and not hasattr(_b, fonction):
            res.append([nom, False, f"({fonction} introuvable)", f"{fonction} n'existe pas encore dans ton code : vérifie son nom, ou l'import, puis exécute de nouveau."])
            continue
        try:
            v = eval(nom, ns)
        except Exception as e:
            res.append([nom, False, f"{type(e).__name__}: {e}", "L'appel a provoqué une erreur. Vérifie les paramètres de ta fonction."])
            continue
        if v is None and _empreinte(None) != h:
            res.append([nom, False, "None", "Ta fonction ne retourne rien. As-tu utilisé print() au lieu de return?"])
            continue
        ok = _empreinte(v) == h
        res.append([nom, ok, repr(v), "" if ok else _indice(v, h)])
    return json.dumps(res)
`;
const espaces = {};
const SUPPLEMENTS = { seaborn: new URL("wheels/seaborn-0.13.2-py3-none-any.whl", self.location).href };
const installes = new Set();
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
  const { id, code, espace, checks, valeurs, fichiers } = e.data;
  let sortie = "";
  // Fichiers de données fournis par la page (CSV, texte), écrits dans le dossier de travail.
  if (fichiers) for (const [nom, contenu] of Object.entries(fichiers)) { try { py.FS.writeFile(nom, contenu); } catch (err) {} }
  // Modules supplémentaires (numpy, matplotlib) : chargés au besoin, hors du délai d'exécution.
  try { await py.loadPackagesFromImports(code); } catch (err) {}
  // Modules absents de Pyodide (seaborn, arrow…) : installés avec micropip la première fois.
  try {
    const voulus = py.pyodide_py.code.find_imports(code).toJs();
    const manquants = voulus.filter(m => SUPPLEMENTS[m] && !installes.has(m));
    if (manquants.length) {
      await py.loadPackage(["micropip", "numpy", "pandas", "matplotlib"]);
      const micropip = py.pyimport("micropip");
      for (const m of manquants) { await micropip.install.callKwargs(SUPPLEMENTS[m], { deps: false }); installes.add(m); }
    }
  } catch (err) {}
  postMessage({ type: "debut", id });
  py.setStdout({ batched: s => { sortie += s + "\n"; } });
  py.setStderr({ batched: s => { sortie += s + "\n"; } });
  const ns = espace ? (espaces[espace] = espaces[espace] || py.globals.get("dict")()) : py.globals.get("dict")();
  try {
    await py.runPythonAsync(code, { globals: ns });
  } catch (err) {
    let figures = [];
    try { figures = JSON.parse(py.globals.get("_figures")()); } catch (e2) {}
    postMessage({ type: "resultat", id, sortie, erreur: nettoyerErreur(err.message || err), figures });
    return;
  }
  let verifs = null, vals = null;
  if (checks && checks.length) verifs = JSON.parse(py.globals.get("_verifier")(ns, py.toPy(checks)));
  if (valeurs && valeurs.length) {
    vals = JSON.parse(py.globals.get("_valeurs")(ns, py.toPy(valeurs)));
  }
  let figures = [];
  try { figures = JSON.parse(py.globals.get("_figures")()); } catch (e2) {}
  postMessage({ type: "resultat", id, sortie, erreur: null, verifs, valeurs: vals, figures });
};
