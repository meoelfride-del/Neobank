import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Bot, Check, ChevronDown, CreditCard,
  Globe2, Landmark, LockKeyhole, Menu, Send, ShieldCheck,
  Sparkles, WalletCards, X, Zap,
} from 'lucide-react';

const productTabs = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    icon: BarChart3,
    title: 'Votre argent devient enfin lisible.',
    text: 'Soldes, dépenses et budgets se mettent à jour au même endroit pour vous aider à décider sans attendre.',
    stat: '2 450,75 €',
    statLabel: 'Solde disponible',
    rows: [['Courses', '420 €', '64%'], ['Transport', '186 €', '38%'], ['Loisirs', '94 €', '27%']],
    route: '/login',
  },
  {
    id: 'cartes',
    label: 'Cartes',
    icon: CreditCard,
    title: 'Une carte pour chaque moment.',
    text: 'Créez une carte virtuelle en quelques secondes, révélez ses données à la demande et bloquez-la instantanément.',
    stat: '•••• 4821',
    statLabel: 'Carte virtuelle',
    rows: [['Paiements en ligne', 'Actifs', '100%'], ['Plafond mensuel', '1 000 €', '72%'], ['Sécurité renforcée', 'Activée', '100%']],
    route: '/login',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    icon: Bot,
    title: 'Une réponse avant même de la chercher.',
    text: 'L’assistant Neo vous aide à comprendre votre solde, vos dépenses et vos opérations, 24 h/24.',
    stat: 'Neo',
    statLabel: 'Assistant disponible',
    rows: [['« Mon solde ? »', 'Instantané', '100%'], ['Analyse budget', 'Personnalisée', '84%'], ['Assistance', '24 h/24', '100%']],
    route: '/login',
  },
];

const faqs = [
  ['Comment ouvrir un compte NeoBank ?', 'Créez votre espace, complétez la vérification KYC puis accédez à votre tableau de bord. Le parcours se fait entièrement en ligne.'],
  ['Mes paiements sont-ils sécurisés ?', 'Oui. Les accès sont protégés par authentification, les données sensibles sont chiffrées et vous pouvez bloquer une carte à tout moment.'],
  ['Puis-je effectuer des virements instantanés ?', 'Vous pouvez envoyer de l’argent vers un téléphone, un email ou un IBAN et suivre immédiatement le statut de l’opération.'],
  ['L’application fonctionne-t-elle sur mobile ?', 'L’interface est responsive et toutes les fonctionnalités principales sont accessibles depuis un téléphone, une tablette ou un ordinateur.'],
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState(productTabs[0]);
  const [amount, setAmount] = useState(1000);
  const [openFaq, setOpenFaq] = useState(0);
  const convertedAmount = useMemo(() => (Number(amount || 0) * 655.957).toLocaleString('fr-FR', { maximumFractionDigits: 0 }), [amount]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="landing-page min-h-screen overflow-hidden bg-[#f5f7f3] text-ink-950">
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-black/5 bg-white/85 px-5 py-3 shadow-[0_12px_45px_-24px_rgba(8,11,18,.45)] backdrop-blur-xl">
          <a href="#accueil" onClick={closeMenu} className="flex items-center gap-2.5 font-display text-lg font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-mint-400"><Landmark size={19} /></span>
            NeoBank
          </a>

          <div className="hidden items-center gap-7 text-sm font-medium text-ink-950/65 md:flex">
            <a className="transition hover:text-ink-950" href="#produits">Produits</a>
            <a className="transition hover:text-ink-950" href="#transferts">Transferts</a>
            <a className="transition hover:text-ink-950" href="#securite">Sécurité</a>
            <a className="transition hover:text-ink-950" href="#faq">Aide</a>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black/5">Se connecter</Link>
            <Link to="/register" className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-ink-800">Ouvrir un compte</Link>
          </div>

          <button type="button" aria-label="Ouvrir le menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl bg-black/5 md:hidden">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>

        {menuOpen && (
          <div className="mx-auto mt-2 max-w-7xl rounded-2xl border border-black/5 bg-white p-4 shadow-xl md:hidden">
            <div className="grid gap-1 text-sm font-medium">
              {[['Produits', '#produits'], ['Transferts', '#transferts'], ['Sécurité', '#securite'], ['Aide', '#faq']].map(([label, href]) => (
                <a key={href} href={href} onClick={closeMenu} className="rounded-xl px-4 py-3 hover:bg-black/5">{label}</a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-black/5 pt-3">
                <Link to="/login" className="rounded-xl border border-black/10 px-3 py-3 text-center" onClick={closeMenu}>Connexion</Link>
                <Link to="/register" className="rounded-xl bg-ink-950 px-3 py-3 text-center text-white" onClick={closeMenu}>S’inscrire</Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        <section id="accueil" className="relative flex min-h-screen items-center px-5 pb-14 pt-28">
          <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-mint-400/35 blur-[110px]" />
          <div className="absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-gold-400/20 blur-[130px]" />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold shadow-sm">
                <Sparkles size={14} className="text-mint-600" /> La banque qui suit votre rythme
              </div>
              <h1 className="text-balance font-display text-5xl font-semibold leading-[.95] tracking-[-.055em] text-ink-950 sm:text-6xl lg:text-[5.4rem]">
                Votre argent.<br /><span className="text-mint-600">Sans temps mort.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-950/60 sm:text-xl">
                Payez, épargnez, transférez et pilotez votre budget dans une expérience bancaire claire, instantanée et sécurisée.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-950 px-6 py-4 font-semibold text-white shadow-[0_18px_40px_-18px_rgba(8,11,18,.8)] transition hover:-translate-y-1">
                  Commencer gratuitement <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                </Link>
                <a href="#produits" className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white/60 px-6 py-4 font-semibold transition hover:bg-white">Découvrir NeoBank</a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-950/55">
                {['Compte en quelques minutes', 'Sans frais cachés', 'Assistance 24 h/24'].map((item) => <span key={item} className="flex items-center gap-2"><Check size={16} className="text-mint-600" />{item}</span>)}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[550px]">
              <div className="absolute inset-8 rotate-6 rounded-[3rem] bg-mint-400/30 blur-2xl" />
              <div className="landing-float relative rounded-[2.2rem] border border-white/70 bg-ink-950 p-4 shadow-[0_45px_90px_-35px_rgba(8,11,18,.8)] sm:p-6">
                <div className="rounded-[1.7rem] bg-gradient-to-br from-ink-800 to-ink-950 p-5 text-white sm:p-7">
                  <div className="flex items-center justify-between">
                    <div><p className="text-xs text-white/45">Solde total</p><p className="mt-1 font-display text-3xl font-semibold">10 750,75 €</p></div>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint-500 text-ink-950"><WalletCards size={21} /></span>
                  </div>
                  <div className="mt-7 grid grid-cols-3 gap-2">
                    {[['Envoyer', Send], ['Cartes', CreditCard], ['Budget', BarChart3]].map(([label, Icon]) => (
                      <Link key={label} to="/login" className="rounded-2xl bg-white/5 p-3 text-center transition hover:-translate-y-1 hover:bg-white/10">
                        <Icon size={18} className="mx-auto text-mint-400" /><span className="mt-2 block text-[11px] text-white/65">{label}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl bg-white/[.06] p-4">
                    <div className="flex items-center justify-between text-xs"><span className="text-white/50">Budget mensuel</span><span>1 428 € / 2 200 €</span></div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[65%] rounded-full bg-mint-400" /></div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[['Carrefour Market', 'Courses', '-54,30 €'], ['Salaire', 'Revenu', '+2 800,00 €'], ['Netflix', 'Abonnement', '-15,99 €']].map(([name, category, value]) => (
                      <div key={name} className="flex items-center gap-3 rounded-2xl bg-white/[.04] p-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Zap size={15} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name}</span><span className="text-[10px] text-white/40">{category}</span></span>
                        <span className={`text-sm font-semibold ${value.startsWith('+') ? 'text-mint-400' : ''}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-ink-950 px-5 py-8 text-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {[['Temps réel', 'sur chaque opération'], ['24/7', 'protection active'], ['3 étapes', 'pour ouvrir un compte'], ['100%', 'pilotable en ligne']].map(([value, label]) => (
              <div key={value} className="py-4"><p className="font-display text-2xl font-semibold text-mint-400 sm:text-3xl">{value}</p><p className="mt-1 text-xs text-white/45 sm:text-sm">{label}</p></div>
            ))}
          </div>
        </section>

        <section id="produits" className="px-5 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[.22em] text-mint-600">Une seule application</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-6xl">Tout ce que votre argent peut faire.</h2>
              <p className="mt-5 text-lg text-ink-950/55">Explorez chaque univers pour voir comment NeoBank simplifie votre quotidien.</p>
            </div>

            <div className="mt-12 flex justify-center">
              <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-black/5 bg-white p-1.5 shadow-sm">
                {productTabs.map((product) => {
                  const Icon = product.icon;
                  const active = product.id === activeProduct.id;
                  return <button key={product.id} type="button" onClick={() => setActiveProduct(product)} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-ink-950 text-white shadow-lg' : 'text-ink-950/55 hover:bg-black/5'}`}><Icon size={17} />{product.label}</button>;
                })}
              </div>
            </div>

            <div className="mt-8 grid overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-50px_rgba(8,11,18,.45)] lg:grid-cols-2">
              <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
                <p className="text-sm font-semibold text-mint-600">{activeProduct.label}</p>
                <h3 className="mt-3 font-display text-3xl font-semibold sm:text-5xl">{activeProduct.title}</h3>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-950/55">{activeProduct.text}</p>
                <Link to={activeProduct.route} className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-ink-950">Essayer cette fonctionnalité <ArrowRight size={18} /></Link>
              </div>
              <div className="min-h-[440px] bg-ink-950 p-7 text-white sm:p-12">
                <div className="mx-auto max-w-md rounded-[1.7rem] border border-white/10 bg-white/[.06] p-6 shadow-2xl">
                  <p className="text-xs text-white/45">{activeProduct.statLabel}</p>
                  <p className="mt-2 font-display text-4xl font-semibold">{activeProduct.stat}</p>
                  <div className="mt-8 space-y-5">
                    {activeProduct.rows.map(([label, value, width]) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm"><span className="text-white/55">{label}</span><span>{value}</span></div>
                        <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-mint-400 transition-all duration-500" style={{ width }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="transferts" className="bg-[#dffbf3] px-5 py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-[.22em] text-mint-600">Transferts internationaux</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-6xl">L’argent voyage.<br />Pas les complications.</h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-950/60">Simulez un transfert en temps réel, puis accédez à votre espace pour l’effectuer de façon sécurisée.</p>
              <div className="mt-8 grid max-w-lg gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/70 p-4"><Globe2 className="text-mint-600" /><p className="mt-3 font-semibold">Destinations multiples</p><p className="mt-1 text-sm text-ink-950/50">Téléphone, email ou IBAN.</p></div>
                <div className="rounded-2xl bg-white/70 p-4"><Zap className="text-mint-600" /><p className="mt-3 font-semibold">Suivi instantané</p><p className="mt-1 text-sm text-ink-950/50">Chaque statut est visible.</p></div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-45px_rgba(8,11,18,.45)] sm:p-9">
              <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-ink-950/40">Vous envoyez</p><p className="mt-1 text-sm text-ink-950/45">Depuis votre compte EUR</p></div><span className="rounded-full bg-black/5 px-3 py-1.5 text-sm font-semibold">EUR</span></div>
              <div className="mt-5 flex items-end border-b border-black/10 pb-4"><input aria-label="Montant à convertir" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 flex-1 bg-transparent font-display text-4xl font-semibold outline-none sm:text-5xl" /><span className="pb-1 text-xl text-ink-950/45">€</span></div>
              <div className="my-5 flex items-center gap-3 text-sm text-ink-950/45"><span className="grid h-9 w-9 place-items-center rounded-full bg-mint-500"><ArrowRight size={16} /></span><span>1 EUR = 655,957 XOF · estimation</span></div>
              <div className="rounded-2xl bg-ink-950 p-5 text-white"><p className="text-xs text-white/45">Le destinataire reçoit</p><p className="mt-2 font-display text-4xl font-semibold text-mint-400">{convertedAmount} <span className="text-lg text-white/50">XOF</span></p></div>
              <Link to="/login" className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-500 px-5 py-4 font-semibold transition hover:bg-mint-400">Effectuer un transfert <ArrowRight size={18} /></Link>
            </div>
          </div>
        </section>

        <section id="securite" className="bg-ink-950 px-5 py-24 text-white sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-end gap-8 lg:grid-cols-2">
              <div><p className="text-sm font-bold uppercase tracking-[.22em] text-mint-400">Sécurité proactive</p><h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-6xl">Votre argent a<br />son espace sûr.</h2></div>
              <p className="max-w-xl text-lg leading-relaxed text-white/50">NeoBank combine contrôle d’accès, chiffrement des données sensibles et surveillance des opérations pour réduire les risques à chaque étape.</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                [LockKeyhole, 'Données chiffrées', 'Les informations sensibles de vos cartes sont chiffrées avant leur stockage.'],
                [ShieldCheck, 'Accès renforcé', 'Authentification, renouvellement sécurisé de session et validation multifactorielle.'],
                [Sparkles, 'Détection intelligente', 'Les opérations inhabituelles peuvent être signalées pour une vérification supplémentaire.'],
              ].map(([Icon, title, text]) => (
                <article key={title} className="group rounded-[1.7rem] border border-white/10 bg-white/[.04] p-7 transition hover:-translate-y-2 hover:border-mint-400/35 hover:bg-white/[.07]">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint-400/10 text-mint-400"><Icon size={23} /></span><h3 className="mt-7 text-xl font-semibold">{title}</h3><p className="mt-3 leading-relaxed text-white/45">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="px-5 py-24 sm:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div><p className="text-sm font-bold uppercase tracking-[.22em] text-mint-600">Questions fréquentes</p><h2 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Tout savoir avant de commencer.</h2><p className="mt-5 text-ink-950/50">Une autre question ? Notre assistant vous accompagne depuis votre espace.</p></div>
            <div className="space-y-3">
              {faqs.map(([question, answer], index) => {
                const opened = openFaq === index;
                return <article key={question} className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                  <button type="button" onClick={() => setOpenFaq(opened ? -1 : index)} aria-expanded={opened} className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold sm:p-6"><span>{question}</span><ChevronDown size={19} className={`shrink-0 transition ${opened ? 'rotate-180' : ''}`} /></button>
                  {opened && <p className="px-5 pb-6 leading-relaxed text-ink-950/55 sm:px-6">{answer}</p>}
                </article>;
              })}
            </div>
          </div>
        </section>

        <section className="px-5 pb-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.2rem] bg-mint-500 px-7 py-16 text-center sm:px-12 sm:py-24">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full border-[40px] border-white/15" /><div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[45px] border-ink-950/10" />
            <div className="relative"><h2 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">Prêt à faire bouger votre argent ?</h2><p className="mx-auto mt-5 max-w-2xl text-lg text-ink-950/60">Ouvrez votre espace NeoBank et prenez le contrôle de vos finances dès aujourd’hui.</p><Link to="/register" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink-950 px-7 py-4 font-semibold text-white transition hover:-translate-y-1">Créer mon compte <ArrowRight size={18} /></Link></div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 border-t border-black/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2 font-display font-bold"><Landmark size={18} /> NeoBank</div><p className="mt-2 text-sm text-ink-950/45">Votre argent, en temps réel.</p></div>
          <div className="flex flex-wrap gap-5 text-sm text-ink-950/50"><a href="#produits">Produits</a><a href="#securite">Sécurité</a><a href="#faq">Aide</a><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/conditions-utilisation">Conditions</Link><Link to="/login">Connexion</Link></div>
          <p className="text-xs text-ink-950/35">© {new Date().getFullYear()} NeoBank. Démonstration.</p>
        </div>
      </footer>
    </div>
  );
}
