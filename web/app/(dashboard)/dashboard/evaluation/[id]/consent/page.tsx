'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { evalCall } from '@/lib/eval-api';
import { PrintSheet } from '@/components/print-sheet';

interface Study { id: string; name: string; purpose: string; retention_days: number; consent_version: string }
type Lang = 'en' | 'fr';

const T = {
  en: {
    title: 'Information and consent sheet',
    intro: 'You are invited to help test a face-scan safety feature. Please read this sheet. You can ask any question before you decide, and you can say no.',
    h: ['Why we are doing this', 'What you will do', 'What we keep', 'Your rights', 'Contact'],
    purpose: (p: string) => `${p} We want to measure how well the scan tells a real person from a fake (a photo, a video or a mask), and whether it works fairly for everyone.`,
    do: ['Look at a phone camera and follow short on-screen instructions (for example, turn your head or blink). It takes about two minutes.', 'You may be asked to repeat it in different lighting or on different phones.', 'You are never asked to do anything painful or unsafe. Colours flash on the screen during the scan: if flashing lights bother you, tell us and skip that part.'],
    keep: (d: number) => [`A short video of your face from the phone camera, stored encrypted.`, `We record a code instead of your name. We do not record your name, phone number or email with the images.`, `We note your approximate age range, gender and skin tone (on a 10-step scale) only to check that the feature works fairly for everyone.`, `Images are deleted automatically after ${d} days. Only the study team can see them. Results are published only as totals and percentages, never as individual people.`],
    rights: ['Taking part is voluntary. You will be treated the same whether you say yes or no.', 'You can stop at any time, and you can ask us to delete everything we hold about you. Tell the person running the session your code and we will delete your images and results.', 'You must be 18 or older to take part.'],
    contact: 'Questions or a request to withdraw:',
    consentTitle: 'Consent',
    consent: 'I have read this sheet (or it was read to me). I understand it, my questions were answered, and I agree to take part.',
    fields: ['Participant code (given by the study team)', 'Signature or mark', 'Date', 'Study team member'],
    version: 'Consent wording version',
  },
  fr: {
    title: 'Fiche d’information et de consentement',
    intro: 'Vous êtes invité(e) à aider à tester une fonction de sécurité par analyse du visage. Lisez cette fiche. Vous pouvez poser toutes vos questions avant de décider, et vous pouvez refuser.',
    h: ['Pourquoi nous faisons cela', 'Ce que vous ferez', 'Ce que nous conservons', 'Vos droits', 'Contact'],
    purpose: (p: string) => `${p} Nous voulons mesurer dans quelle mesure l’analyse distingue une vraie personne d’une fausse (photo, vidéo ou masque), et si elle fonctionne équitablement pour tout le monde.`,
    do: ['Regarder la caméra d’un téléphone et suivre de courtes instructions à l’écran (par exemple tourner la tête ou cligner des yeux). Cela dure environ deux minutes.', 'On pourra vous demander de recommencer avec un autre éclairage ou un autre téléphone.', 'On ne vous demande jamais rien de douloureux ou de dangereux. Des couleurs clignotent à l’écran pendant l’analyse : si les lumières clignotantes vous gênent, dites-le-nous et passez cette partie.'],
    keep: (d: number) => [`Une courte vidéo de votre visage filmée par le téléphone, stockée chiffrée.`, `Nous enregistrons un code à la place de votre nom. Nous n’enregistrons ni votre nom, ni votre numéro de téléphone, ni votre e-mail avec les images.`, `Nous notons votre tranche d’âge approximative, votre genre et votre teint (échelle à 10 niveaux) uniquement pour vérifier que la fonction est équitable.`, `Les images sont supprimées automatiquement après ${d} jours. Seule l’équipe de l’étude peut les voir. Les résultats sont publiés uniquement sous forme de totaux et de pourcentages, jamais par personne.`],
    rights: ['La participation est volontaire. Vous serez traité(e) de la même façon que vous disiez oui ou non.', 'Vous pouvez arrêter à tout moment et demander la suppression de tout ce que nous détenons sur vous. Donnez votre code à la personne qui conduit la séance et nous supprimerons vos images et résultats.', 'Vous devez avoir 18 ans ou plus pour participer.'],
    contact: 'Questions ou demande de retrait :',
    consentTitle: 'Consentement',
    consent: 'J’ai lu cette fiche (ou on me l’a lue). Je l’ai comprise, on a répondu à mes questions et j’accepte de participer.',
    fields: ['Code du participant (donné par l’équipe)', 'Signature ou marque', 'Date', 'Membre de l’équipe'],
    version: 'Version du texte de consentement',
  },
} as const;

export default function ConsentSheetPage() {
  const { id } = useParams<{ id: string }>();
  const [study, setStudy] = useState<Study | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [error, setError] = useState('');
  useEffect(() => { evalCall<Study>(`/studies/${id}`).then(setStudy).catch((e: Error) => setError(e.message)); }, [id]);

  if (error) return <div className="p-8"><p role="alert" className="text-base text-red-400">{error}</p></div>;
  if (!study) return <div className="p-8 text-slate-400 text-base">Loading...</div>;
  const t = T[lang];

  const toolbar = (
    <>
      <Link href={`/dashboard/evaluation/${study.id}`} className="inline-flex items-center gap-1.5 text-base text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" aria-hidden /> Back to study</Link>
      <div role="group" aria-label="Language" className="inline-flex rounded-lg border border-white/15 overflow-hidden">
        {(['en', 'fr'] as Lang[]).map((l) => (
          <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-4 py-2.5 text-sm ${lang === l ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}>{l === 'en' ? 'English' : 'Français'}</button>
        ))}
      </div>
      <p className="basis-full text-sm text-amber-200">Have this wording reviewed by a lawyer or your ethics contact for your country before using it with real participants. It is a starting point, not legal advice.</p>
    </>
  );

  return (
    <PrintSheet toolbar={toolbar}>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-slate-600 mt-1">{study.name} · AfriVerify</p>
      <p className="mt-4">{t.intro}</p>
      <h2 className="mt-6 text-lg font-semibold">{t.h[0]}</h2><p>{t.purpose(study.purpose)}</p>
      <h2 className="mt-6 text-lg font-semibold">{t.h[1]}</h2><ul className="list-disc pl-6 space-y-1">{t.do.map((x) => <li key={x}>{x}</li>)}</ul>
      <h2 className="mt-6 text-lg font-semibold">{t.h[2]}</h2><ul className="list-disc pl-6 space-y-1">{t.keep(study.retention_days).map((x) => <li key={x}>{x}</li>)}</ul>
      <h2 className="mt-6 text-lg font-semibold">{t.h[3]}</h2><ul className="list-disc pl-6 space-y-1">{t.rights.map((x) => <li key={x}>{x}</li>)}</ul>
      <h2 className="mt-6 text-lg font-semibold">{t.h[4]}</h2>
      <p>{t.contact} privacy@sankofaapp.com</p>
      <div className="mt-8 border-t border-slate-300 pt-6" style={{ breakInside: 'avoid' }}>
        <h2 className="text-lg font-semibold">{t.consentTitle}</h2>
        <p className="mt-2">☐ {t.consent}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {t.fields.map((f) => (<div key={f}><div className="h-8 border-b border-slate-500" /><p className="text-sm text-slate-600 mt-1">{f}</p></div>))}
        </div>
        <p className="mt-6 text-sm text-slate-500">{t.version}: {study.consent_version}</p>
      </div>
    </PrintSheet>
  );
}
