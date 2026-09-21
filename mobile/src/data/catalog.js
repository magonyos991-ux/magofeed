/* Catalogue des boissons — collection Firestore "catalog", la même que le web. */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

let _catalogue = null;

export async function chargerCatalogue() {
  if (_catalogue) return _catalogue;
  const snap = await getDocs(collection(db, "catalog"));
  const rows = [];
  snap.forEach((d) => {
    const x = d.data();
    if (!x || !x.name) return;
    x.docId = d.id;
    rows.push(x);
  });
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  /* Dédoublonnage d'affichage : le catalogue contient des fiches en double à
     la casse près (« AA Drink Pro Energy » / « AA DRINK PRO ENERGY »). Le web
     les fusionne via drinkMerges ; ici on garde la première de chaque nom. */
  const vus = {};
  const uniques = rows.filter((d) => {
    const k = normaliser(d.name);
    if (vus[k]) return false;
    vus[k] = 1;
    return true;
  });
  _catalogue = uniques;
  return uniques;
}

export function normaliser(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filtrerCatalogue(rows, texte) {
  const q = normaliser(texte).trim();
  if (!q) return rows;
  return rows.filter(
    (d) => normaliser(d.name).includes(q) || normaliser(d.brand).includes(q)
  );
}
