"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { FOURNISSEURS_PAR_CANAL } from "@/lib/messagerie/catalogue";
import { alerteCout, mesurerSms } from "@/lib/messagerie/cout";
import type { Canal } from "@/lib/messagerie/types";

/*
 * Messagerie — où sont posés les identifiants d'agrégateur SMS et WhatsApp.
 *
 * Les secrets ne transitent JAMAIS vers cet écran : la route ne renvoie que
 * « posée » ou « absente ». Un champ de secret laissé vide à l'enregistrement
 * conserve la valeur en base — c'est ce qui permet de modifier une URL sans
 * avoir à ressaisir un jeton qu'on n'a pas sous la main.
 *
 * Tant que le mode est « simulé », rien ne part : le circuit complet (choix du
 * canal, décompte du quota, imputation sur les crédits, journalisation) est
 * exercé, mais aucun message ne quitte la plateforme et rien n'est facturé.
 */

interface ConfigPublique {
  mode: "simule" | "reel";
  canal_defaut: Canal;
  sms_fournisseur: string | null;
  sms_url: string | null;
  sms_identifiant: string | null;
  sms_expediteur: string | null;
  cout_sms_gnf: number;
  whatsapp_fournisseur: string | null;
  whatsapp_url: string | null;
  whatsapp_numero_id: string | null;
  cout_whatsapp_gnf: number;
  email_fournisseur: string | null;
  email_url: string | null;
  email_expediteur: string | null;
  cout_email_gnf: number;
  sms_cle_posee: boolean;
  whatsapp_jeton_pose: boolean;
  email_cle_posee: boolean;
  maj_le: string | null;
}

const MESSAGE_TEST = "Docteur 224 : message de test de la configuration. Aucune action requise.";

export default function MessagerieAdmin() {
  const [config, setConfig] = useState<ConfigPublique | null>(null);
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [numeroTest, setNumeroTest] = useState("");
  const [resultatTest, setResultatTest] = useState<string | null>(null);

  // `version` plutôt qu'un appel direct : la lecture reste dans l'effet, et
  // recharger revient à l'incrémenter — la forme employée partout ailleurs
  // dans le projet, et la seule que la règle react-hooks accepte ici.
  const [version, setVersion] = useState(0);
  const recharger = () => setVersion((v) => v + 1);
  useEffect(() => {
    let actif = true;
    (async () => {
      const r = await fetch("/api/admin/messagerie");
      const { config: c, erreur: e } = await r.json();
      if (!actif) return;
      if (e) setErreur(e);
      setConfig(c);
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  const valeur = (cle: string, defaut: string | number | null | undefined) =>
    brouillon[cle] ?? (defaut === null || defaut === undefined ? "" : String(defaut));
  const modifier = (cle: string, v: string) => {
    setEnregistre(false);
    setErreur(null);
    setBrouillon((b) => ({ ...b, [cle]: v }));
  };

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    const r = await fetch("/api/admin/messagerie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...brouillon,
        coutSmsGnf: Number(valeur("coutSmsGnf", config?.cout_sms_gnf)) || 0,
        coutWhatsappGnf: Number(valeur("coutWhatsappGnf", config?.cout_whatsapp_gnf)) || 0,
        coutEmailGnf: Number(valeur("coutEmailGnf", config?.cout_email_gnf)) || 0,
      }),
    });
    const { erreur: e } = await r.json();
    setEnvoi(false);
    if (e) return setErreur(e);
    setBrouillon({});
    setEnregistre(true);
    recharger();
  }

  async function tester(canal: Canal) {
    setResultatTest(null);
    setErreur(null);
    const r = await fetch("/api/admin/messagerie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinataire: numeroTest, canal }),
    });
    const { resultat, erreur: e } = await r.json();
    if (e) return setErreur(e);
    setResultatTest(
      resultat.erreur
        ? `Échec (${canal}) : ${resultat.erreur}`
        : `Envoi ${resultat.simule ? "simulé" : "réel"} (${canal}) — ${resultat.segments} segment(s), ${resultat.coutGnf.toLocaleString("fr-FR")} GNF.`
    );
  }

  const champ =
    "mb-3 w-full rounded-xl border border-line bg-white p-[11px] text-[13px] outline-none focus:border-teal";
  const etiquette = "mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink";
  const carte = "mb-4 rounded-2xl border border-line bg-white p-5";

  const mesure = mesurerSms(MESSAGE_TEST);
  const alerte = alerteCout(MESSAGE_TEST);
  const modeReel = valeur("mode", config?.mode) === "reel";

  const contenu = chargement ? (
    <p className="text-[13px] text-muted">Chargement…</p>
  ) : !config ? (
    <p className="text-[13px] text-red">Configuration illisible.</p>
  ) : (
    <>
      {erreur && (
        <div role="alert" className="mb-4 rounded-[11px] bg-red-soft px-[13px] py-[11px] text-[12.5px] font-semibold text-red">
          {erreur}
        </div>
      )}

      <div className={carte}>
        <h3 className="mb-1 text-[15px] font-extrabold">Mode d’envoi</h3>
        <p className="mb-[14px] text-[12.5px] text-muted">
          En mode simulé, rien ne part et rien n’est facturé — mais le quota est décompté et les
          messages sont journalisés, pour que tout soit vérifiable avant la mise en service.
        </p>
        <label className={etiquette}>Mode</label>
        <select className={champ} value={valeur("mode", config.mode)} onChange={(e) => modifier("mode", e.target.value)}>
          <option value="simule">Simulé — rien n’est envoyé</option>
          <option value="reel">Réel — les messages partent</option>
        </select>
        {modeReel && config.mode === "simule" && (
          <p className="-mt-1.5 mb-3 text-[11.5px] font-semibold text-amber">
            Le passage en réel est refusé tant qu’aucun canal n’est complètement configuré.
          </p>
        )}
        <label className={etiquette}>Canal par défaut</label>
        <select
          className={champ}
          value={valeur("canalDefaut", config.canal_defaut)}
          onChange={(e) => modifier("canalDefaut", e.target.value)}
        >
          <option value="whatsapp">WhatsApp — le moins cher</option>
          <option value="sms">SMS</option>
          <option value="email">E-mail</option>
        </select>
        <p className="text-[11.5px] text-muted">
          Le SMS reste le repli quand WhatsApp échoue, et le seul canal pour un patient qui ne l’a
          pas. Le professionnel doit l’avoir autorisé. L’e-mail part <b>en plus</b> du canal
          téléphonique dès qu’une adresse est connue : il ne le remplace pas — tout le monde n’a
          pas de boîte mail, et personne ne la relève avant un rendez-vous.
        </p>
      </div>

      <div className={carte}>
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          Agrégateur SMS{" "}
          <span className={`ml-1 rounded-lg px-[9px] py-1 text-[11px] font-bold ${config.sms_cle_posee ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}>
            {config.sms_cle_posee ? "Clé posée" : "Clé absente"}
          </span>
        </h3>
        <label className={etiquette}>Fournisseur</label>
        <select
          className={champ}
          value={valeur("smsFournisseur", config.sms_fournisseur)}
          onChange={(e) => modifier("smsFournisseur", e.target.value)}
        >
          <option value="">— Choisir —</option>
          {FOURNISSEURS_PAR_CANAL.sms.map((f) => (
            <option key={f.valeur} value={f.valeur}>
              {f.label}
            </option>
          ))}
        </select>
        <label className={etiquette}>URL de l’API</label>
        <input className={champ} placeholder="https://api.exemple.gn/v1/sms" value={valeur("smsUrl", config.sms_url)} onChange={(e) => modifier("smsUrl", e.target.value)} />
        <label className={etiquette}>Identifiant / compte</label>
        <input className={champ} value={valeur("smsIdentifiant", config.sms_identifiant)} onChange={(e) => modifier("smsIdentifiant", e.target.value)} />
        <label className={etiquette}>Clé secrète</label>
        <input
          className={champ}
          type="password"
          placeholder={config.sms_cle_posee ? "Inchangée — laissez vide pour la conserver" : "Collez la clé"}
          value={brouillon.smsCle ?? ""}
          onChange={(e) => modifier("smsCle", e.target.value)}
        />
        <label className={etiquette}>Expéditeur affiché</label>
        <input className={champ} placeholder="DOCTEUR224" value={valeur("smsExpediteur", config.sms_expediteur)} onChange={(e) => modifier("smsExpediteur", e.target.value)} />
        <p className="-mt-1.5 mb-3 text-[11.5px] text-muted">
          À déclarer chez l’opérateur avant usage : un expéditeur non enregistré est rejeté.
        </p>
        <label className={etiquette}>Coût d’un segment (GNF)</label>
        <input className={champ} inputMode="numeric" value={valeur("coutSmsGnf", config.cout_sms_gnf)} onChange={(e) => modifier("coutSmsGnf", e.target.value)} />
      </div>

      <div className={carte}>
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          WhatsApp Business{" "}
          <span className={`ml-1 rounded-lg px-[9px] py-1 text-[11px] font-bold ${config.whatsapp_jeton_pose ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}>
            {config.whatsapp_jeton_pose ? "Jeton posé" : "Jeton absent"}
          </span>
        </h3>
        <label className={etiquette}>Fournisseur</label>
        <select
          className={champ}
          value={valeur("whatsappFournisseur", config.whatsapp_fournisseur)}
          onChange={(e) => modifier("whatsappFournisseur", e.target.value)}
        >
          <option value="">— Choisir —</option>
          {FOURNISSEURS_PAR_CANAL.whatsapp.map((f) => (
            <option key={f.valeur} value={f.valeur}>
              {f.label}
            </option>
          ))}
        </select>
        <label className={etiquette}>URL de l’API</label>
        <input className={champ} placeholder="https://graph.facebook.com/v21.0/…/messages" value={valeur("whatsappUrl", config.whatsapp_url)} onChange={(e) => modifier("whatsappUrl", e.target.value)} />
        <label className={etiquette}>Identifiant du numéro</label>
        <input className={champ} value={valeur("whatsappNumeroId", config.whatsapp_numero_id)} onChange={(e) => modifier("whatsappNumeroId", e.target.value)} />
        <label className={etiquette}>Jeton d’accès</label>
        <input
          className={champ}
          type="password"
          placeholder={config.whatsapp_jeton_pose ? "Inchangé — laissez vide pour le conserver" : "Collez le jeton"}
          value={brouillon.whatsappJeton ?? ""}
          onChange={(e) => modifier("whatsappJeton", e.target.value)}
        />
        <label className={etiquette}>Coût d’un message (GNF)</label>
        <input className={champ} inputMode="numeric" value={valeur("coutWhatsappGnf", config.cout_whatsapp_gnf)} onChange={(e) => modifier("coutWhatsappGnf", e.target.value)} />
      </div>

      <div className={carte}>
        <h3 className="mb-[14px] text-[15px] font-extrabold">
          E-mail transactionnel{" "}
          <span
            className={`ml-1 rounded-lg px-[9px] py-1 text-[11px] font-bold ${config.email_cle_posee ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}
          >
            {config.email_cle_posee ? "Clé posée" : "Clé absente"}
          </span>
        </h3>
        <p className="mb-[14px] text-[12.5px] text-muted">
          Confirmations et rappels envoyés par courriel, en complément du canal téléphonique. Un
          fournisseur d’e-mail transactionnel est indispensable : envoyer depuis une boîte
          ordinaire fait classer les messages en indésirables.
        </p>
        <label className={etiquette}>Fournisseur</label>
        <select
          className={champ}
          value={valeur("emailFournisseur", config.email_fournisseur)}
          onChange={(e) => modifier("emailFournisseur", e.target.value)}
        >
          <option value="">— Choisir —</option>
          {FOURNISSEURS_PAR_CANAL.email.map((f) => (
            <option key={f.valeur} value={f.valeur}>
              {f.label}
            </option>
          ))}
        </select>
        <label className={etiquette}>URL de l’API</label>
        <input
          className={champ}
          placeholder="https://api.resend.com/emails"
          value={valeur("emailUrl", config.email_url)}
          onChange={(e) => modifier("emailUrl", e.target.value)}
        />
        <label className={etiquette}>Adresse d’expédition</label>
        <input
          className={champ}
          placeholder="Docteur 224 <rendezvous@docteur224.com>"
          value={valeur("emailExpediteur", config.email_expediteur)}
          onChange={(e) => modifier("emailExpediteur", e.target.value)}
        />
        <p className="-mt-1.5 mb-3 text-[11.5px] text-muted">
          Le domaine doit être vérifié chez le fournisseur (SPF et DKIM), sans quoi les messages
          n’arrivent pas.
        </p>
        <label className={etiquette}>Clé d’API</label>
        <input
          className={champ}
          type="password"
          placeholder={
            config.email_cle_posee ? "Inchangée — laissez vide pour la conserver" : "Collez la clé"
          }
          value={brouillon.emailCle ?? ""}
          onChange={(e) => modifier("emailCle", e.target.value)}
        />
        <label className={etiquette}>Coût d’un e-mail (GNF)</label>
        <input
          className={champ}
          inputMode="numeric"
          value={valeur("coutEmailGnf", config.cout_email_gnf)}
          onChange={(e) => modifier("coutEmailGnf", e.target.value)}
        />
      </div>

      <div className={carte}>
        <h3 className="mb-1 text-[15px] font-extrabold">Envoi d’essai</h3>
        <p className="mb-[14px] text-[12.5px] text-muted">
          Le message de test fait {mesure.segments} segment(s) en {mesure.gsm7 ? "GSM-7" : "UCS-2"}.
          {alerte && ` ${alerte}`}
        </p>
        <label className={etiquette}>Destinataire</label>
        <input
          className={champ}
          placeholder="+224620000000 — ou une adresse e-mail"
          value={numeroTest}
          onChange={(e) => setNumeroTest(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {(["whatsapp", "sms", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => tester(c)}
              disabled={!numeroTest}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tester en {c === "sms" ? "SMS" : c === "email" ? "e-mail" : "WhatsApp"}
            </button>
          ))}
        </div>
        {resultatTest && <p className="mt-3 text-[12.5px] font-semibold text-blue">{resultatTest}</p>}
      </div>
    </>
  );

  return (
    <AdminShell permission="messagerie">
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Messagerie" />
        <div className="pad">
          {contenu}
          {/* Le bouton d'enregistrement n'existait que dans le bloc web : sur
              téléphone, on pouvait modifier la configuration sans jamais
              pouvoir la sauvegarder. */}
          {!chargement && config && (
            <>
              <button
                type="button"
                onClick={enregistrer}
                disabled={Object.keys(brouillon).length === 0 || envoi}
                className="btn block"
              >
                {envoi ? "Enregistrement…" : "💾 Enregistrer"}
              </button>
              {enregistre && (
                <p className="muted" style={{ fontSize: 12.5, textAlign: "center" }}>
                  ✓ Enregistré
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Messagerie</h2>
            <small className="text-[13px] text-muted">
              SMS, WhatsApp et e-mail — les clés ne quittent jamais le serveur
            </small>
          </div>
          <span className="flex items-center gap-3">
            {enregistre && <small className="text-[12.5px] font-bold text-green">✓ Enregistré</small>}
            <button
              type="button"
              onClick={enregistrer}
              disabled={Object.keys(brouillon).length === 0 || envoi}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {envoi ? "Enregistrement…" : "💾 Enregistrer"}
            </button>
          </span>
        </div>
        {contenu}
      </div>
    </AdminShell>
  );
}
