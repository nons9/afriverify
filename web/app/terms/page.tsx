import Link from 'next/link';
import type { Metadata } from 'next';
import { AfriVerifyLogo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Terms of Service - AfriVerify',
  description: 'AfriVerify Terms of Service - the agreement governing your use of the AfriVerify platform.',
};

const EFFECTIVE_DATE = 'September 1, 2026';
const COMPANY = 'Sankofa Network';
const EMAIL = 'legal@sankofaapp.com';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* Nav */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <AfriVerifyLogo size={26} textSize="text-sm" />
          <Link href="/privacy" className="text-sm text-slate-400 hover:text-white transition-colors">
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-white mb-3">Terms of Service</h1>
          <p className="text-slate-500 text-sm">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Agreement to Terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you
              (&quot;Developer&quot;, &quot;you&quot;, or &quot;your&quot;) and {COMPANY} (&quot;AfriVerify&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
              governing your access to and use of the AfriVerify API, developer dashboard, SDKs, documentation,
              and all related services (collectively, the &quot;Service&quot;).
            </p>
            <p className="mt-3">
              By registering for an account, accessing our API, or using any part of the Service, you
              confirm that you have read, understood, and agree to be bound by these Terms, our Privacy
              Policy, and any additional policies or guidelines we publish. If you are acting on behalf of
              a company or other legal entity, you represent that you have the authority to bind that entity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Definitions</h2>
            <ul className="space-y-2 text-slate-400">
              {[
                ['"API"', 'the AfriVerify REST API endpoints and webhooks'],
                ['"API Key"', 'the credential pair (key + secret) issued to your account for authenticating API requests'],
                ['"End-User"', 'an individual whose identity is verified through the Service at your direction'],
                ['"Verification"', 'the process of confirming an End-User\'s identity using government-issued documents, biometrics, or official registries'],
                ['"VIT"', 'Verified Identity Token - a signed, portable attestation of a completed verification'],
                ['"Developer Data"', 'data you upload, transmit, or generate through the Service'],
                ['"Platform"', 'your application, website, or product that integrates with the Service'],
              ].map(([term, def]) => (
                <li key={term} className="flex gap-2">
                  <span className="text-slate-300 font-medium shrink-0">{term}</span>
                  <span>{def}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Eligibility and Registration</h2>
            <p>To use the Service you must:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Be at least 18 years of age and have the legal capacity to enter into contracts</li>
              <li>Be a legally incorporated entity or a natural person operating a lawful business</li>
              <li>Provide accurate, current, and complete registration information</li>
              <li>Maintain the security of your account credentials and API Keys</li>
              <li>Promptly notify us of any unauthorised access to your account at <a href="mailto:security@sankofaapp.com" className="text-indigo-400 hover:text-indigo-300">security@sankofaapp.com</a></li>
            </ul>
            <p className="mt-3">
              We reserve the right to refuse registration to, or terminate the account of, any person or
              entity that cannot satisfy the eligibility requirements or that poses a compliance, legal, or
              reputational risk to the AfriVerify network.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Permitted Use</h2>
            <p>
              Subject to your compliance with these Terms, we grant you a limited, non-exclusive,
              non-transferable, revocable licence to access and use the Service solely to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Verify the identity of End-Users of your Platform in connection with legitimate KYC, onboarding, financial services, or access-control purposes</li>
              <li>Issue and verify VITs to reduce friction for returning verified users</li>
              <li>Access your dashboard, usage data, and billing information</li>
              <li>Integrate our SDK and embed the hosted verification flow under your white-label configuration</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Prohibited Use</h2>
            <p>You must not use the Service to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Verify identities without the knowledge and express consent of the End-User</li>
              <li>Facilitate unlawful surveillance, stalking, harassment, or tracking of individuals</li>
              <li>Discriminate against individuals on the basis of race, ethnicity, religion, gender, disability, or any protected characteristic</li>
              <li>Build facial recognition systems for law enforcement, immigration enforcement, or military applications without our prior written approval</li>
              <li>Resell, sublicense, or provide API access to third parties outside your own Platform</li>
              <li>Reverse-engineer, decompile, or attempt to extract our proprietary models or identity databases</li>
              <li>Submit fraudulent or synthetic identities, including for testing purposes outside of the Sandbox environment</li>
              <li>Violate any applicable law, including AML/KYC regulations, data protection law, or sanctions regimes</li>
              <li>Interfere with the integrity, availability, or security of the Service or any other user&apos;s access to it</li>
            </ul>
            <p className="mt-3">
              Violation of this section may result in immediate termination and referral to law enforcement
              or regulatory authorities.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. End-User Obligations</h2>
            <p>When using the Service to verify End-Users, you are responsible for:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Obtaining all necessary consents from End-Users for identity verification, biometric processing, and data sharing with AfriVerify</li>
              <li>Publishing a privacy notice to End-Users that accurately describes the verification process and data flows</li>
              <li>Ensuring your Platform&apos;s use of verification results complies with applicable law in each End-User&apos;s jurisdiction</li>
              <li>Maintaining the confidentiality of verification outcomes and not disclosing them beyond what is necessary for your legitimate business purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. API Keys and Security</h2>
            <p>
              Your API Keys are credentials that authenticate requests as coming from your account. You are
              solely responsible for all activity conducted under your API Keys. You must:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Store API Keys securely and never expose them in client-side code, public repositories, or logs</li>
              <li>Use separate keys for Production and Sandbox environments</li>
              <li>Rotate keys promptly if you suspect compromise</li>
              <li>Validate webhook signatures using the HMAC-SHA512 secret provided in your dashboard</li>
            </ul>
            <p className="mt-3">
              We will not be liable for any loss or damage arising from your failure to maintain the security
              of your API Keys.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Pricing, Billing, and Taxes</h2>
            <p>
              Fees for the Service are set out on our pricing page and in your subscription plan. All fees
              are:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Billed monthly in advance for subscription charges, and in arrears for overage verifications</li>
              <li>Processed exclusively via Flutterwave. We do not accept Paystack or any other payment processor.</li>
              <li>Non-refundable except where required by applicable consumer protection law</li>
              <li>Subject to VAT, withholding tax, or other applicable taxes as required by law in your jurisdiction; you are responsible for all such taxes</li>
            </ul>
            <p className="mt-3">
              If payment fails, we will retry for 7 days before suspending API access. You will be notified
              at each retry attempt. Your data is preserved for 30 days after suspension before any deletion
              process begins.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Service Levels and Uptime</h2>
            <p>
              We target 99.9% monthly uptime for Production API endpoints. Scheduled maintenance is
              announced at least 24 hours in advance and excluded from uptime calculations. Sandbox
              environments carry no uptime guarantee.
            </p>
            <p className="mt-3">
              Our sole obligation for failure to meet the uptime target is to issue a service credit equal
              to the pro-rated fees for the affected period, up to a maximum of one month&apos;s fees, upon
              written request submitted within 30 days of the incident.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Intellectual Property</h2>
            <p>
              AfriVerify retains all right, title, and interest in the Service, including all software,
              algorithms, models, databases, trademarks, and documentation. Nothing in these Terms
              transfers any intellectual property rights to you. Your use of the AfriVerify name, logo,
              or trademarks in any marketing, press release, or public communication requires our prior
              written consent, except for factual references to your use of the API.
            </p>
            <p className="mt-3">
              You retain ownership of Developer Data. You grant us a limited licence to process Developer
              Data to the extent necessary to provide and improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Confidentiality</h2>
            <p>
              Each party agrees to keep confidential the other party&apos;s non-public technical, business, and
              commercial information disclosed in connection with the Service (&quot;Confidential Information&quot;),
              and to use it only for the purposes of these Terms. Confidential Information does not include
              information that is or becomes publicly known through no breach of this agreement, or that was
              independently developed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">12. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot;. AFRIVERIFY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED,
              INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT. WE DO NOT WARRANT THAT VERIFICATION RESULTS ARE ERROR-FREE, THAT
              THE SERVICE WILL MEET YOUR SPECIFIC COMPLIANCE REQUIREMENTS, OR THAT VERIFIED IDENTITIES
              CANNOT BE FRAUDULENTLY OBTAINED.
            </p>
            <p className="mt-3">
              Identity verification is a risk-reduction tool, not a guarantee. You remain solely responsible
              for making onboarding and access-control decisions based on our outputs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">13. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AFRIVERIFY&apos;S TOTAL AGGREGATE LIABILITY
              TO YOU ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER
              OF (A) THE FEES PAID BY YOU IN THE THREE MONTHS PRECEDING THE CLAIM, OR (B) USD 500. IN NO
              EVENT WILL AFRIVERIFY BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, EVEN
              IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">14. Indemnification</h2>
            <p>
              You will defend, indemnify, and hold harmless AfriVerify and its officers, directors,
              employees, and agents from and against any claims, damages, losses, costs, and expenses
              (including reasonable legal fees) arising out of or relating to: (a) your use of the Service
              in violation of these Terms; (b) your Platform and your treatment of End-Users; (c) your
              breach of applicable data protection, KYC, AML, or financial services law; or (d) any third-party
              claim that your Developer Data infringes a third party&apos;s intellectual property or privacy rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">15. Term and Termination</h2>
            <p>
              These Terms commence when you register an account and continue until terminated. Either party
              may terminate for convenience with 30 days&apos; written notice. We may terminate immediately if
              you materially breach these Terms, become insolvent, or pose a risk to the security or
              integrity of the Service.
            </p>
            <p className="mt-3">
              On termination: (a) all licences granted to you cease; (b) you must immediately stop using
              the API; (c) we will export your data in standard format upon request within 30 days;
              (d) provisions that by their nature should survive termination (including Sections 10, 11,
              12, 13, 14, and 16) will survive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">16. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising
              out of or in connection with these Terms that cannot be resolved through good-faith negotiation
              within 30 days will be referred to binding arbitration under the Arbitration and Conciliation
              Act Cap. A18, Laws of the Federation of Nigeria 2004, with the seat of arbitration in Lagos.
              The language of the arbitration will be English.
            </p>
            <p className="mt-3">
              Notwithstanding the foregoing, either party may seek interim injunctive or other equitable
              relief in any court of competent jurisdiction to prevent irreparable harm.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">17. Changes to These Terms</h2>
            <p>
              We may update these Terms at any time. Material changes will be communicated by email to the
              address on your account at least 30 days before they take effect. Your continued use of the
              Service after the effective date constitutes your acceptance of the revised Terms. If you
              object to a change, your sole remedy is to stop using the Service and close your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">18. General Provisions</h2>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li><span className="text-slate-300 font-medium">Entire agreement:</span> These Terms, together with the Privacy Policy and any order forms, constitute the entire agreement between you and AfriVerify regarding the Service and supersede all prior agreements.</li>
              <li><span className="text-slate-300 font-medium">Severability:</span> If any provision is found unenforceable, the remaining provisions remain in full force.</li>
              <li><span className="text-slate-300 font-medium">No waiver:</span> Failure to enforce any provision does not constitute a waiver.</li>
              <li><span className="text-slate-300 font-medium">Assignment:</span> You may not assign your rights under these Terms without our prior written consent. We may assign our rights in connection with a merger, acquisition, or sale of assets.</li>
              <li><span className="text-slate-300 font-medium">Force majeure:</span> Neither party is liable for delays or failures caused by events beyond their reasonable control.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">19. Contact</h2>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-slate-400 space-y-1">
              <p><span className="text-slate-300 font-medium">{COMPANY}</span></p>
              <p>Legal Department</p>
              <p><a href={`mailto:${EMAIL}`} className="text-indigo-400 hover:text-indigo-300">{EMAIL}</a></p>
            </div>
          </section>

        </div>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 mt-16">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-slate-600">
          <span>{COMPANY} &copy; {new Date().getFullYear()}</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-slate-400 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-400 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
