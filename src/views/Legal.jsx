import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Landmark } from 'lucide-react';

const documents = {
  mentions: {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', <>Le site <strong>neo-finance.app</strong> présente Neo Finance, une application de démonstration technologique. Avant toute exploitation commerciale, cette section doit être complétée avec la dénomination sociale, la forme juridique, le capital, le numéro d’immatriculation, l’adresse du siège et le responsable de publication.</>],
      ['Nature du service', <>Neo Finance est actuellement un projet de démonstration et <strong>n’est pas présenté comme un établissement bancaire agréé</strong>. Les soldes, cartes et opérations de démonstration ne constituent ni des dépôts bancaires ni une offre de services financiers réglementés.</>],
      ['Hébergement', <>Le frontend est hébergé par Vercel Inc. Le backend et la base PostgreSQL sont hébergés par Render Services, Inc. Les services utilisent des connexions HTTPS.</>],
      ['Propriété intellectuelle', <>Les textes, interfaces, composants graphiques et éléments de marque Neo Finance sont protégés. Toute reproduction substantielle sans autorisation est interdite, sous réserve des licences open source applicables.</>],
      ['Responsabilité', <>L’éditeur s’efforce de maintenir le service accessible. Cette version étant une démonstration, elle ne doit pas être utilisée pour conserver ou transférer des fonds réels.</>],
      ['Contact', <>Pour une demande liée au site ou aux données personnelles, utilisez le canal d’assistance de l’application. Une adresse dédiée devra être publiée avant l’ouverture commerciale.</>],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    sections: [
      ['Données traitées', <>Neo Finance traite les informations fournies à l’inscription, les données de sécurité, le statut KYC, les comptes, cartes chiffrées, transactions et échanges avec l’assistant.</>],
      ['Finalités', <>Ces données servent à créer et sécuriser le compte, fournir les fonctionnalités demandées, prévenir la fraude, traiter le KYC, assurer le support, diagnostiquer les erreurs et mesurer les performances publiques.</>],
      ['Bases et proportionnalité', <>Les traitements sont limités à l’exécution du service demandé, à la sécurité et aux obligations applicables. Une exploitation commerciale devra documenter les bases juridiques selon les juridictions concernées.</>],
      ['Hébergement et destinataires', <>Les données techniques sont traitées par Vercel pour le frontend et la performance, et par Render pour l’API, les journaux et PostgreSQL. Aucun mot de passe en clair n’est conservé.</>],
      ['Mesure d’audience', <>Vercel Web Analytics et Speed Insights peuvent mesurer les pages publiques et les Core Web Vitals. Les routes privées sont exclues de la mesure d’audience configurée. Aucun outil publicitaire tiers n’est installé.</>],
      ['Durée et sécurité', <>Les durées de conservation devront être fixées avant commercialisation. Les mots de passe sont hachés, les données de carte chiffrées et les accès utilisent des jetons temporaires.</>],
      ['Vos droits', <>Vous pouvez demander l’accès, la rectification ou la suppression via l’assistance. L’identité du responsable du traitement et l’autorité compétente devront être précisées avant ouverture commerciale.</>],
    ],
  },
  terms: {
    title: 'Conditions d’utilisation',
    sections: [
      ['Objet', <>Ces conditions encadrent l’accès à la démonstration Neo Finance et à ses fonctionnalités de gestion financière simulée.</>],
      ['Création du compte', <>Vous devez fournir des informations exactes, protéger vos identifiants et signaler tout accès suspect. Vous êtes responsable des actions réalisées depuis votre session.</>],
      ['Usage autorisé', <>Le service ne doit pas être utilisé pour des activités frauduleuses, contourner les contrôles, perturber l’infrastructure ou accéder aux données d’un autre utilisateur.</>],
      ['Démonstration financière', <>Les comptes, cartes, budgets et transferts présentés sont destinés aux essais techniques et ne permettent pas de détenir ou transférer de l’argent réel.</>],
      ['Disponibilité', <>Le service peut être modifié ou interrompu pour maintenance, sécurité ou évolution. Aucune garantie de disponibilité continue n’est fournie pour cette démonstration.</>],
      ['Suspension', <>Un compte peut être suspendu en cas d’abus, de risque de sécurité, d’informations incorrectes ou de violation des présentes conditions.</>],
      ['Évolution', <>Une version adaptée au pays d’établissement et aux services réellement proposés devra être validée avant commercialisation.</>],
    ],
  },
};

export default function Legal({ type }) {
  const document = documents[type] || documents.mentions;

  useEffect(() => {
    const previous = window.document.title;
    window.document.title = `${document.title} — Neo Finance`;
    return () => { window.document.title = previous; };
  }, [document.title]);

  return (
    <div className="min-h-screen bg-[#f5f7f3] text-ink-950">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-display font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-mint-400"><Landmark size={18} /></span>Neo Finance</Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-950/60 hover:text-ink-950"><ArrowLeft size={16} /> Retour au site</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[.2em] text-mint-600">Informations publiques</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-6xl">{document.title}</h1>
        <p className="mt-4 text-sm text-ink-950/45">Dernière mise à jour : 21 juillet 2026</p>
        <div className="mt-10 rounded-2xl border border-gold-500/25 bg-gold-400/10 p-5 text-sm leading-relaxed text-ink-950/70">Document préparatoire pour une démonstration. Il ne remplace pas la validation d’un juriste ni les autorisations nécessaires aux services financiers.</div>
        <div className="mt-10 space-y-5">
          {document.sections.map(([title, content]) => <section key={title} className="rounded-2xl border border-black/5 bg-white p-6 sm:p-8"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-3 leading-7 text-ink-950/60">{content}</div></section>)}
        </div>
        <nav className="mt-10 flex flex-wrap gap-4 text-sm font-semibold"><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/conditions-utilisation">Conditions d’utilisation</Link></nav>
      </main>
    </div>
  );
}
