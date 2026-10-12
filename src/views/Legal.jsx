import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Landmark } from 'lucide-react';
import { legalEntity as entity } from '../config/legal';

const supplied = value => value || 'À renseigner par la société';

const documents = {
  mentions: {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', <><p>NEO BANK est la marque présentée sur <strong>neo-finance.app</strong>. Les données d’identification de l’exploitant sont les suivantes :</p><dl className="mt-4 space-y-2">{[['Raison sociale', entity.name], ['Forme juridique', entity.form], ['Capital social', entity.capital], ['Immatriculation', entity.registration], ['Siège social', entity.address], ['Pays d’établissement', entity.country], ['Responsable de publication', entity.publisher], ['Contact', entity.contact]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{supplied(value)}</dd></div>)}</dl></>],
      ['Statut et autorisations', <>Autorité compétente : {supplied(entity.regulator)}. Référence et périmètre de l’autorisation : {supplied(entity.authorization)}. Les activités réglementées, les prestataires responsables et les mécanismes éventuels de protection des fonds doivent être identifiés dans les documents contractuels du service concerné. Aucune garantie des dépôts ne peut être présumée à partir du nom commercial.</>],
      ['Nature du service', <>L’application permet de consulter des comptes, enregistrer des demandes d’opérations et gérer les données associées. Les fonctionnalités disponibles sont décrites dans chaque parcours. Le rôle de la société, les prestataires financiers et le périmètre des services autorisés doivent correspondre aux références réglementaires et aux contrats applicables indiqués dans les informations publiques.</>],
      ['Hébergement', <>Le frontend est hébergé par Vercel Inc. Le backend et la base PostgreSQL sont hébergés par Render Services, Inc. Les services utilisent des connexions HTTPS.</>],
      ['Propriété intellectuelle', <>Les textes, interfaces, composants graphiques et éléments de marque NEO BANK sont protégés. Toute reproduction substantielle sans autorisation est interdite, sous réserve des licences open source applicables.</>],
      ['Responsabilité', <>Les demandes d’opérations suivent les étapes et statuts affichés dans votre espace. Consultez leurs détails et les conditions du service concerné avant confirmation.</>],
      ['Réclamations et règlement des différends', <>Adresse et procédure de réclamation : {supplied(entity.complaints)}. Conservez la référence de l’opération concernée et décrivez les faits sans transmettre votre mot de passe ni vos codes de sécurité. Les délais de réponse, voies de recours et coordonnées du médiateur compétent doivent être précisés selon le pays d’établissement et le contrat applicable.</>],
      ['Contact', <>Contact de la société : {supplied(entity.contact)}. L’assistant automatisé ne transmet pas les messages à un conseiller. Pour une réclamation ou une demande concernant vos données, utilisez les contacts dédiés publiés dans ces documents.</>],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    sections: [
      ['Données traitées', <>L’application enregistre votre identité, votre date et lieu de naissance, votre nationalité, vos coordonnées, votre adresse, votre profession facultative et la photo de votre document d’identité. Elle conserve également les données de sécurité, statuts KYC, comptes, numéros de cartes chiffrés, opérations et messages de l’assistant.</>],
      ['Finalités', <>Ces données servent à créer et sécuriser le compte, fournir les fonctionnalités demandées, prévenir la fraude, traiter le KYC, assurer le support, diagnostiquer les erreurs et mesurer les performances publiques.</>],
      ['Bases et proportionnalité', <>Les traitements sont liés à l’exécution du service demandé, à la sécurité et aux obligations applicables. Le responsable doit documenter leurs bases juridiques selon les juridictions concernées.</>],
      ['Hébergement et destinataires', <>Les données techniques sont traitées par Vercel pour le frontend et la performance, et par Render pour l’API, les journaux et PostgreSQL. Aucun mot de passe en clair n’est conservé.</>],
      ['Mesure d’audience', <>Vercel Web Analytics et Speed Insights peuvent mesurer les pages publiques et les Core Web Vitals. Les routes privées sont exclues de la mesure d’audience configurée. Aucun outil publicitaire tiers n’est installé.</>],
      ['Durée et sécurité', <>Conservation : {supplied(entity.retention)}. Les mots de passe sont hachés. Les photos KYC et les numéros de carte sont chiffrés. Les photos sont accessibles à leur propriétaire et aux administrateurs authentifiés, sans lien public. Les consultations, téléchargements et décisions KYC sont journalisés. Une nouvelle photo remplace la précédente.</>],
      ['Vérification de l’identité', <>Un administrateur examine manuellement le profil et la photo déposée. Il peut valider le dossier, le refuser avec un motif ou annuler sa validation. Les modifications sont verrouillées pendant la revue et après validation. Aucune reconnaissance faciale automatisée n’est effectuée.</>],
      ['Notifications transactionnelles par SMS', <>Lorsque le service SMS est activé, le numéro de téléphone et le contenu nécessaire à la notification sont transmis au prestataire SMS configuré (TextBee ou Twilio) pour informer de la validation du KYC et des transferts validés ou reçus. Ces messages ne contiennent ni document d’identité, ni mot de passe, ni numéro de carte. Les éventuels transferts internationaux et garanties contractuelles du prestataire doivent être documentés par le responsable du traitement. Ces notifications ne sont pas des communications commerciales.</>],
      ['Contact et conservation', <>Contact pour les données personnelles : {supplied(entity.privacyContact)}. Politique de conservation : {supplied(entity.retention)}. Les demandes sont examinées au regard des obligations de conservation et de sécurité effectivement applicables.</>],
      ['Vos droits', <>L’identité du responsable, son contact, la procédure de demande d’accès, de rectification ou de suppression et l’autorité compétente restent à préciser. L’assistant à réponses prédéfinies ne constitue pas une procédure de traitement de ces demandes.</>],
    ],
  },
  terms: {
    title: 'Conditions d’utilisation',
    sections: [
      ['Objet', <>Ces conditions décrivent l’accès à NEO BANK et à ses fonctionnalités de gestion de comptes et d’opérations.</>],
      ['Création de l’espace personnel', <>Protégez vos identifiants et vérifiez les informations saisies dans votre espace. L’accès aux fonctionnalités dépend du statut de votre compte et des autorisations accordées.</>],
      ['Usage autorisé', <>Le service ne doit pas être utilisé pour des activités frauduleuses, contourner les contrôles, perturber l’infrastructure ou accéder aux données d’un autre utilisateur.</>],
      ['Traitement des opérations', <>Les IBAN et les cartes sont attribués manuellement par un administrateur à partir des identifiants destinés au client. Chaque opération sortante gérée dans l’application, y compris une échéance récurrente ou un ajustement débiteur, exige un code OTP fourni par l’administrateur avec un message, puis la confirmation du client et la validation finale avant débit. Les opérations externes suivent le traitement manuel de l’éditeur.</>],
      ['Disponibilité', <>Le service peut être modifié ou interrompu pour maintenance, sécurité ou évolution. Aucun délai de traitement des demandes n’est garanti par cette page.</>],
      ['Frais, limites et traitement', <>Les frais, plafonds, devises, délais de traitement et conditions d’annulation doivent être communiqués dans les documents contractuels applicables avant confirmation. Le statut d’une demande en attente ne vaut pas exécution d’un transfert. Un SMS confirme un événement enregistré ; il ne remplace pas le relevé ni les justificatifs de l’opération.</>],
      ['Sécurité et notifications', <>Ne communiquez jamais votre mot de passe, votre clé MFA ou votre code OTP à un tiers. Vérifiez les détails d’une opération dans votre espace sécurisé. La livraison d’un SMS dépend du prestataire et de l’opérateur ; une absence de SMS ne modifie pas le statut de l’opération.</>],
      ['Suspension', <>Un compte peut être suspendu en cas d’abus, de risque de sécurité, d’informations incorrectes ou de violation des présentes conditions.</>],
      ['Évolution', <>Ces conditions doivent être adaptées au pays d’établissement et aux services fournis, puis validées par le responsable du service.</>],
    ],
  },
};

export default function Legal({ type }) {
  const document = documents[type] || documents.mentions;

  useEffect(() => {
    const previous = window.document.title;
    window.document.title = `${document.title} — NEO BANK`;
    return () => { window.document.title = previous; };
  }, [document.title]);

  return (
    <div className="min-h-screen bg-[#f5f7f3] text-ink-950">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-display font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-mint-400"><Landmark size={18} /></span>NEO BANK</Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-950/60 hover:text-ink-950"><ArrowLeft size={16} /> Retour au site</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[.2em] text-mint-600">Informations publiques</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink-950 sm:text-6xl">{document.title}</h1>
        <p className="mt-4 text-sm text-ink-950/65">Dernière mise à jour : 11 octobre 2026</p>
        {(!entity.name || !entity.registration || !entity.address || !entity.country || !entity.contact || !entity.publisher) && <div className="mt-10 rounded-2xl border border-gold-500/25 bg-gold-400/10 p-5 text-sm leading-relaxed text-ink-950/70">Les informations d’identification, de contact et de statut réglementaire de l’éditeur restent à compléter et à valider.</div>}
        <div className="mt-10 space-y-5">
          {document.sections.map(([title, content]) => <section key={title} className="rounded-2xl border border-black/5 bg-white p-6 sm:p-8"><h2 className="text-xl font-semibold text-ink-950">{title}</h2><div className="mt-3 leading-7 text-ink-950/60">{content}</div></section>)}
        </div>
        <nav className="mt-10 flex flex-wrap gap-4 text-sm font-semibold"><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/conditions-utilisation">Conditions d’utilisation</Link></nav>
      </main>
    </div>
  );
}
