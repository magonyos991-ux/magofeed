/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */

/* ============================================================================
   ESLint — filet de sécurité pour un projet SANS build
   ----------------------------------------------------------------------------
   Pourquoi ce fichier existe : l'app est un gros index.html et quelques scripts
   classiques, sans bundler. Rien ne relit ce code à notre place. Deux bugs bien
   réels sont passés inaperçus faute d'un tel filet :

     • handleDeepLink déclarée DEUX fois — la seconde écrasait la première, et
       les liens partagés vers une boisson de la communauté ne s'ouvraient pas.
     • BRAND_DOMAINS déclarée DEUX fois avec des contenus différents (marques de
       boissons / enseignes de magasins) — 227 marques affichées, zéro logo.

   Les deux sont des `no-redeclare`, attrapés en une seconde par cette config.

   PARTI PRIS : uniquement des règles qui attrapent des BUGS. Aucune règle de
   style (indentation, guillemets, points-virgules). Un linter qui râle sur la
   forme finit ignoré, et c'est le fond qu'on veut voir.

   Lancer :  npm install eslint@9 eslint-plugin-html@8 --no-save && npx eslint .
   ============================================================================ */

import html from "eslint-plugin-html";
import { parse } from "espree";
import { readFileSync, readdirSync } from "node:fs";

/* Les scripts de data/ déclarent des globales que index.html consomme
   (DRINKS, curSel, toast, playSound…). Sans build ni imports, ESLint ne peut
   pas le deviner : on les lui donne. La liste est CALCULÉE à chaque exécution
   plutôt qu'écrite à la main — ajouter une variable dans data/state.js suffit,
   il n'y a pas de liste à tenir à jour, donc rien qui se désynchronise. */
function globalsFromData() {
  const out = {};
  for (const file of readdirSync("data").filter((f) => f.endsWith(".js"))) {
    const ast = parse(readFileSync(`data/${file}`, "utf8"), { ecmaVersion: 2022, sourceType: "script" });
    for (const node of ast.body) {
      if (node.type === "VariableDeclaration")
        for (const d of node.declarations) if (d.id.type === "Identifier") out[d.id.name] = "writable";
      if (node.type === "FunctionDeclaration" && node.id) out[node.id.name] = "writable";
    }
  }
  return out;
}

const BROWSER = {
  window: "writable", document: "readonly", console: "readonly", navigator: "readonly",
  location: "writable", history: "readonly", localStorage: "readonly", sessionStorage: "readonly",
  indexedDB: "readonly", caches: "readonly", self: "readonly", clients: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
  requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly", fetch: "readonly",
  AbortController: "readonly", Notification: "readonly", CustomEvent: "readonly", Event: "readonly",
  URL: "readonly", URLSearchParams: "readonly", Blob: "readonly", FormData: "readonly",
  FileReader: "readonly", Image: "readonly", Audio: "readonly", DOMParser: "readonly",
  AudioContext: "readonly", webkitAudioContext: "readonly", TextEncoder: "readonly",
  atob: "readonly", btoa: "readonly", crypto: "readonly", performance: "readonly",
  matchMedia: "readonly", getComputedStyle: "readonly", screen: "readonly",
  devicePixelRatio: "readonly", alert: "readonly", confirm: "readonly", prompt: "readonly",
  /* Bibliothèques chargées par <script> depuis un CDN */
  L: "readonly", Quagga: "readonly", firebase: "readonly",
  /* Défini par le <script> classique d'index.html, appelé depuis le <script
     type="module"> Firebase. Les deux blocs ont des portées distinctes pour
     ESLint ; au navigateur, une fonction du script classique EST une globale.
     L'appel réel est de toute façon gardé par un typeof === "function". */
  checkWatches: "readonly"
};

const BUG_RULES = {
  /* builtinGlobals:false — sinon data/state.js se ferait reprocher de déclarer
     les globales que cette même config annonce. On garde ce qui compte : deux
     déclarations du même nom DANS un même fichier, très exactement les deux
     bugs cités plus haut. */
  "no-redeclare": ["error", { builtinGlobals: false }],
  "no-undef": "error",            // faute de frappe sur un nom de variable
  "no-dupe-keys": "error",        // clé écrite deux fois dans un objet
  "no-dupe-args": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",      // code derrière un return : mort sans le dire
  "no-func-assign": "error",
  "no-cond-assign": "error",      // if (a = b) au lieu de ==
  "no-self-assign": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-sparse-arrays": "error",
  "no-unsafe-negation": "error",
  "no-empty-pattern": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-compare-neg-zero": "error",
  "no-unsafe-finally": "error",
  "getter-return": "error",
  "no-obj-calls": "error"
};

export default [
  { ignores: ["node_modules/**", "f/**", "promo/**", "icons/**"] },
  {
    /* index.html : eslint-plugin-html extrait les blocs <script>.
       sourceType "module" pour que le bloc Firebase (import …) soit analysé
       lui aussi — sans quoi ~1900 lignes échapperaient au linter. */
    files: ["**/*.html"],
    plugins: { html },
    settings: { "html/javascript-mime-types": ["text/javascript", "module"] },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...BROWSER, ...globalsFromData() }
    },
    rules: BUG_RULES
  },
  {
    files: ["data/**/*.js", "sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...BROWSER, ...globalsFromData(), renderStoreList: "readonly", require: "readonly", module: "writable", process: "readonly" }
    },
    rules: BUG_RULES
  },
  {
    /* Cloud Functions et scripts de build : Node, pas navigateur.
       (build-share-pages.js pilote Playwright : le code passé à page.evaluate()
       s'exécute, lui, dans le navigateur — d'où window ici.) */
    files: ["functions-a-deployer/**/*.js", "growth/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { require: "readonly", module: "writable", exports: "writable", process: "readonly",
                 Buffer: "readonly", __dirname: "readonly", console: "readonly", URL: "readonly",
                 fetch: "readonly", setTimeout: "readonly", TextEncoder: "readonly",
                 /* Globales de Node 18+, au meme titre que fetch : sans elles,
                    le garde-fou signalait comme « variable inexistante » un
                    delai d'attente parfaitement valide. */
                 AbortSignal: "readonly", AbortController: "readonly",
                 URLSearchParams: "readonly", crypto: "readonly",
                 window: "readonly", document: "readonly" }
    },
    rules: BUG_RULES
  }
];
