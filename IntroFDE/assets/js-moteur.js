// IntroFDE — Moteur JavaScript et TypeScript, partagé par le navigateur (js-worker.js) et la construction (Node).
// TypeScript est vraiment vérifié (types compris), avec les messages du compilateur en français.
(function (racine) {
  "use strict";
  const LIBS = ["lib.es2020.d.ts", "lib.es2019.d.ts", "lib.es2018.d.ts", "lib.es2017.d.ts", "lib.es2016.d.ts", "lib.es2015.d.ts", "lib.es5.d.ts", "lib.decorators.d.ts", "lib.decorators.legacy.d.ts", "lib.es2015.core.d.ts", "lib.es2015.collection.d.ts", "lib.es2015.iterable.d.ts", "lib.es2015.symbol.d.ts", "lib.es2015.generator.d.ts", "lib.es2015.promise.d.ts", "lib.es2015.proxy.d.ts", "lib.es2015.reflect.d.ts", "lib.es2015.symbol.wellknown.d.ts", "lib.es2016.array.include.d.ts", "lib.es2016.intl.d.ts", "lib.es2017.object.d.ts", "lib.es2017.sharedmemory.d.ts", "lib.es2017.string.d.ts", "lib.es2017.intl.d.ts", "lib.es2017.typedarrays.d.ts", "lib.es2017.date.d.ts", "lib.es2018.asynciterable.d.ts", "lib.es2018.asyncgenerator.d.ts", "lib.es2018.promise.d.ts", "lib.es2018.regexp.d.ts", "lib.es2018.intl.d.ts", "lib.es2019.array.d.ts", "lib.es2019.object.d.ts", "lib.es2019.string.d.ts", "lib.es2019.symbol.d.ts", "lib.es2019.intl.d.ts", "lib.es2020.bigint.d.ts", "lib.es2020.intl.d.ts", "lib.es2020.date.d.ts", "lib.es2020.number.d.ts", "lib.es2020.promise.d.ts", "lib.es2020.sharedmemory.d.ts", "lib.es2020.string.d.ts", "lib.es2020.symbol.wellknown.d.ts"];
  // Ce que la page offre au code, en plus du langage.
  const ENV = `export {};
declare global {
declare const console: { log(...v: any[]): void; error(...v: any[]): void; warn(...v: any[]): void; table(v: any): void };
declare function lireFichier(nom: string): string;
declare function attendre(ms: number): Promise<void>;
declare function setTimeout(f: () => void, ms?: number): number;
}`;
  const OPTIONS = { target: 7 /* ES2020 */, module: 99 /* ESNext : await au premier niveau */, moduleDetection: 3 /* Force */, strict: true, noEmitOnError: false, lib: ["lib.es2020.d.ts"],
    noImplicitAny: true, noUnusedLocals: false, skipLibCheck: true };

  // Valeur canonique d'un résultat, pour la correction (même règle que Python : les nombres à 4 décimales).
  function canonique(v) {
    if (v === undefined) return "undefined";
    if (v === null || typeof v === "boolean") return String(v);
    if (typeof v === "number") {
      let t = (Math.round(v * 1e4) / 1e4).toFixed(4);
      return t === "-0.0000" ? "0.0000" : t;
    }
    return JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x));
  }

  function verifierTS(ts, code, libs) {
    const fichiers = Object.assign({ "env.d.ts": ENV, "code.ts": code }, libs);
    const hote = {
      getSourceFile: (n, v) => (fichiers[n] !== undefined ? ts.createSourceFile(n, fichiers[n], v) : undefined),
      getDefaultLibFileName: () => "lib.es2020.d.ts", writeFile: () => {}, getCurrentDirectory: () => "",
      getDirectories: () => [], fileExists: n => fichiers[n] !== undefined, readFile: n => fichiers[n],
      getCanonicalFileName: n => n, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
    };
    const prog = ts.createProgram(["env.d.ts", "code.ts"], OPTIONS, hote);
    const diags = ts.getPreEmitDiagnostics(prog).filter(d => d.file && d.file.fileName === "code.ts");
    return diags.map(d => {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `Ligne ${line + 1} : ${ts.flattenDiagnosticMessageText(d.messageText, "\n")} (TS${d.code})`;
    });
  }

  function transpiler(ts, code) {
    return ts.transpileModule(code, { compilerOptions: { target: 7, module: 99, moduleDetection: 3 } }).outputText.replace(/^export \{\};?\s*$/m, "");
  }

  // Exécute le code (fonction asynchrone : await permis au premier niveau) et évalue les vérifications
  // dans la même portée que le code, pour que les const et let soient visibles.
  async function executer(js, checks, outils) {
    const sortie = [];
    const fmt = v => (typeof v === "string" ? v : (v === null || v === undefined || typeof v !== "object") ? String(v)
      : JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x)));
    const consoleLocal = {
      log: (...a) => sortie.push(a.map(fmt).join(" ")), error: (...a) => sortie.push(a.map(fmt).join(" ")),
      warn: (...a) => sortie.push(a.map(fmt).join(" ")), table: v => sortie.push(JSON.stringify(v, null, 1)),
    };
    const noms = (checks || []).map(c => c[0]);
    const evals = noms.map(n => `(() => { try { return { v: (${n}) }; } catch (e) { return { e: String(e) }; } })()`).join(",\n");
    const corps = `"use strict";\n${js}\n;return [${evals}];`;
    const AF = Object.getPrototypeOf(async function () {}).constructor;
    let resultats;
    try {
      const f = new AF("console", "lireFichier", "attendre", corps);
      resultats = await f(consoleLocal, outils.lireFichier, outils.attendre);
    } catch (e) {
      return { sortie: sortie.join("\n"), erreur: (e && e.name ? e.name + " : " : "") + (e && e.message ? e.message : String(e)) };
    }
    return { sortie: sortie.join("\n"), erreur: null, valeurs: noms.map((n, i) => [n, resultats[i]]) };
  }

  racine.MoteurJS = { LIBS, canonique, verifierTS, transpiler, executer };
  if (typeof module !== "undefined") module.exports = racine.MoteurJS;
})(typeof self !== "undefined" ? self : globalThis);
