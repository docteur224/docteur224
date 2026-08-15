"use client";

import AssistantShell from "@/components/assistant/AssistantShell";
import MonCompte from "@/components/compte/MonCompte";

/* Mon compte — écran commun aux cinq espaces (components/compte/MonCompte). */
export default function MonCompteAssistant() {
  return (
    <AssistantShell>
      <MonCompte retourMobile="/espace-assistant/compte" />
    </AssistantShell>
  );
}
