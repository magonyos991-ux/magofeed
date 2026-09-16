/* Verifie que le banc lui-meme fonctionne. */
import { banc, doit, doitEchouer, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc } from "firebase/firestore";
const env = await banc("exemple");
const alice = env.authenticatedContext("alice").firestore();
const anon = env.unauthenticatedContext().firestore();
await doit("un compte connecte cree son profil", async () => {
  await setDoc(doc(alice, "users", "alice"), { pseudo: "Alice", pts: 0 });
});
await doit("et le relit", async () => {
  const s = await getDoc(doc(alice, "users", "alice"));
  if (!s.exists()) throw new Error("profil absent");
});
await doitEchouer("un inconnu n'ecrit pas dans le profil d'Alice", async () => {
  await setDoc(doc(anon, "users", "alice"), { pts: 99999 });
});
await bilan(env);
