/* Faire tourner une VRAIE Cloud Function sur l'emulateur.
   ----------------------------------------------------------------------------
   Le banc n'execute pas les Cloud Functions. Les scenarios en recopiaient donc
   le code « a l'identique » — et une copie ne teste qu'elle-meme : le jour ou
   la fonction change, la copie continue d'annoncer ce qu'elle faisait avant.

   Ici, on charge le fichier LIVRE (functions-a-deployer/*.js) en lui donnant,
   a la place de firebase-admin et de firebase-functions, de fines doublures
   branchees sur l'emulateur, regles desactivees — exactement la position de
   l'Admin SDK en production. Seul ce dont les fonctions se servent est double :
   collection, doc, get, set, update, where, runTransaction, FieldValue et
   getAuth().getUsers. Une dependance non prevue fait echouer le chargement :
   on le saura, au lieu de tester une fonction a moitie branchee.

     import { fonctionServeur, compte } from "../fonction-serveur.mjs";
     const serveur = fonctionServeur(env, new URL("../../chasse-codes.js", import.meta.url), {
       comptes: { alice: compte("alice"), fantome: compte("fantome", { anonyme: true }) },
     });
     await serveur.declencher("poserCodeChasse", "chasseCodes/5449000000996");
*/
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where,
         runTransaction, serverTimestamp, increment } from "firebase/firestore";

/* Un compte tel que getAuth().getUser le rend : un compte anonyme n'a aucun
   fournisseur de connexion, un vrai compte en a au moins un. */
export function compte(uid, options) {
  const o = options || {};
  const jours = o.jours == null ? 30 : o.jours;
  return {
    uid: String(uid),
    providerData: o.anonyme ? [] : [{ providerId: "password", uid: String(uid) }],
    metadata: { creationTime: new Date(Date.now() - jours * 86400000).toUTCString() },
  };
}

export function fonctionServeur(env, fichier, options) {
  const comptes = (options && options.comptes) || {};
  let db = null;   // la base sans regles, le temps d'un declenchement

  const instantane = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const refDe = (chemin) => {
    const r = doc(db, chemin);
    return {
      id: r.id, path: r.path, _r: r,
      get: async () => instantane(await getDoc(r)),
      set: (data, opts) => setDoc(r, data, opts || {}),
      update: (data) => updateDoc(r, data),
    };
  };
  const base = {
    collection: (nom) => ({
      doc: (id) => refDe(nom + "/" + id),
      where: (champ, op, valeur) => ({
        get: async () => {
          const q = await getDocs(query(collection(db, nom), where(champ, op, valeur)));
          const docs = q.docs.map(instantane);
          return { empty: q.empty, size: q.size, docs, forEach: (fn) => docs.forEach(fn) };
        },
      }),
    }),
    runTransaction: (fn) => runTransaction(db, (t) => fn({
      get: async (ref) => instantane(await t.get(ref._r)),
      update: (ref, data) => { t.update(ref._r, data); },
      set: (ref, data, opts) => { t.set(ref._r, data, opts || {}); },
    })),
  };
  const auth = {
    getUsers: async (ids) => ({
      users: ids.map((x) => comptes[x.uid]).filter(Boolean),
      notFound: ids.filter((x) => !comptes[x.uid]),
    }),
    getUser: async (uid) => {
      if (!comptes[uid]) throw new Error("compte introuvable : " + uid);
      return comptes[uid];
    },
  };
  const declencheur = (type) => (opts, fn) => ({ type, opts, fn });
  const dependances = {
    "firebase-functions/v2/firestore": {
      onDocumentWritten: declencheur("ecriture"),
      onDocumentCreated: declencheur("creation"),
    },
    "firebase-admin/app": { initializeApp: () => {}, getApps: () => [{}] },
    "firebase-admin/firestore": {
      getFirestore: () => base,
      FieldValue: { serverTimestamp: () => serverTimestamp(), increment: (n) => increment(n) },
    },
    "firebase-admin/auth": { getAuth: () => auth },
  };

  const source = readFileSync(fichier, "utf8");
  const module = { exports: {} };
  const exiger = (nom) => {
    if (nom in dependances) return dependances[nom];
    throw new Error("fonction-serveur : dependance non doublee « " + nom + " »");
  };
  new Function("require", "module", "exports", source)(exiger, module, module.exports);

  /* « chasseCodes/{barcode} » + « chasseCodes/123 » -> { barcode: "123" } */
  const parametres = (modele, chemin) => {
    const m = String(modele).split("/"), c = String(chemin).split("/");
    const out = {};
    m.forEach((part, i) => { const x = /^\{(.+)\}$/.exec(part); if (x) out[x[1]] = c[i]; });
    return out;
  };

  return {
    /* Rejoue le declenchement de la fonction `nom` sur le document `chemin`,
       tel qu'il est dans la base a cet instant. */
    async declencher(nom, chemin) {
      const f = module.exports[nom];
      if (!f || typeof f.fn !== "function") throw new Error("pas de fonction « " + nom + " » dans " + fichier);
      await env.withSecurityRulesDisabled(async (c) => {
        db = c.firestore();
        try {
          const ref = refDe(chemin);
          const s = await ref.get();
          const cliche = { id: s.id, exists: s.exists, ref, data: s.data };
          const event = {
            params: parametres(f.opts && f.opts.document, chemin),
            data: f.type === "ecriture" ? { before: null, after: cliche } : cliche,
          };
          await f.fn(event);
        } finally { db = null; }
      });
    },
  };
}
