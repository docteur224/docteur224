import { redirect } from "next/navigation";

/*
 * Cet écran a été absorbé par /espace-medecin/correspondance, qui réunit les
 * trois flux (dossiers reçus d'un confrère, dossiers adressés, documents
 * partagés par les patients).
 *
 * La route est conservée en redirection et non supprimée : des notifications
 * déjà enregistrées en base pointent dessus, et elles resteront cliquables.
 */
export default function DocumentsPartagesRedirection() {
  redirect("/espace-medecin/correspondance?vue=partages");
}
