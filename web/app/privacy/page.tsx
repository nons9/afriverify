import Link from 'next/link';
import type { Metadata } from 'next';
import { AfriVerifyLogo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Privacy Policy - AfriVerify',
  description: 'AfriVerify Privacy Policy - How we collect, use, and protect your personal data.',
};

const EFFECTIVE_DATE = 'September 1, 2026';
const COMPANY = 'Sankofa Network';
const EMAIL = 'privacy@sankofaapp.com';
const ADDRESS = 'Akwa Ibom, Nigeria';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* Nav */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <AfriVerifyLogo size={26} textSize="text-sm" />
          <Link href="/terms" className="text-sm text-slate-400 hover:text-white transition-colors">
            Terms of Service
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-white mb-3">Privacy Policy</h1>
          <p className="text-slate-500 text-sm">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              {COMPANY} (&quot;AfriVerify&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the AfriVerify identity verification
              platform accessible at afriverify.sankofaapp.com (the &quot;Service&quot;). This Privacy Policy explains
              how we collect, use, disclose, retain, and protect personal information when you use our Service,
              whether as a developer integrating our API, an end-user completing an identity verification, or a
              visitor to our website.
            </p>
            <p className="mt-3">
              We are committed to processing personal data in accordance with applicable data protection
              legislation including the Nigeria Data Protection Act 2023 (NDPA), the Kenya Data Protection
              Act 2019, the South Africa Protection of Personal Information Act (POPIA), Ghana&apos;s Data
              Protection Act 843, and where applicable, the EU General Data Protection Regulation (GDPR) and
              relevant frameworks across the 54 African Union member states we serve.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Data Controller</h2>
            <p>
              The data controller for personal data processed through the AfriVerify platform is {COMPANY},
              registered in Nigeria, with principal offices in {ADDRESS}. For data protection enquiries,
              contact our Data Protection Officer at <a href={`mailto:${EMAIL}`} className="text-indigo-400 hover:text-indigo-300">{EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Information We Collect</h2>

            <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">3.1 Identity Verification Data</h3>
            <p>When an end-user completes a verification through our platform or an integrated developer application, we collect:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Full legal name as it appears on government-issued identification</li>
              <li>Phone number (used as the primary identifier)</li>
              <li>Government ID type and a cryptographic hash of the ID number (we do not store the raw number)</li>
              <li>Nationality and country of identity document</li>
              <li>Biometric data: facial photograph and derived face embedding vector (stored encrypted)</li>
              <li>Device fingerprint identifiers</li>
              <li>IP address at time of verification</li>
              <li>Session metadata (timestamps, verification steps completed)</li>
            </ul>

            <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">3.2 Developer Account Data</h3>
            <p>When you register as a developer, we collect:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Full name, email address, company name, and phone number</li>
              <li>Billing information (processed by Flutterwave; we receive payment tokens, not raw card data)</li>
              <li>API usage logs, webhook endpoint URLs</li>
              <li>Account activity and security events</li>
            </ul>

            <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">3.3 Automatically Collected Data</h3>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Access logs (timestamp, endpoint, response code, latency)</li>
              <li>Error and exception reports</li>
              <li>Browser type and operating system (for the dashboard)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Legal Basis for Processing</h2>
            <p>We process personal data on the following legal bases:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li><span className="text-slate-300 font-medium">Contract performance:</span> to deliver the verification services requested by developers and their users</li>
              <li><span className="text-slate-300 font-medium">Legitimate interests:</span> fraud prevention, AML screening, platform security, and improving the accuracy of our identity models</li>
              <li><span className="text-slate-300 font-medium">Legal obligation:</span> compliance with anti-money laundering (AML), counter-terrorism financing (CTF), and know-your-customer (KYC) regulatory requirements in each jurisdiction we operate</li>
              <li><span className="text-slate-300 font-medium">Consent:</span> for optional features such as voice print storage and cross-platform identity portability via the Verified Identity Token (VIT)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. How We Use Your Information</h2>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li>Performing liveness detection, document authentication, and identity verification</li>
              <li>Issuing and validating Verified Identity Tokens (VITs)</li>
              <li>AML screening against global sanctions lists and PEP databases</li>
              <li>Calculating and maintaining trust scores</li>
              <li>Detecting and preventing fraud across the AfriVerify network</li>
              <li>Providing developer dashboard analytics and usage metrics</li>
              <li>Billing and invoicing</li>
              <li>Customer support and dispute resolution</li>
              <li>Complying with lawful requests from regulatory and law enforcement authorities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Sharing</h2>
            <p>We do not sell your personal data. We share data only:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li><span className="text-slate-300 font-medium">Identity verification providers:</span> Smile Identity, Dojah, and Onfido receive only the minimum data required to perform the specific check requested. Each provider is contractually bound to our data processing terms.</li>
              <li><span className="text-slate-300 font-medium">Payment processors:</span> Flutterwave processes billing transactions. We do not store raw card data.</li>
              <li><span className="text-slate-300 font-medium">Cloud infrastructure:</span> AWS (data storage, S3), Railway (API hosting), and Vercel (web hosting). Data processing agreements are in place with each provider.</li>
              <li><span className="text-slate-300 font-medium">Developer applications:</span> Verification outcomes (pass/fail, trust score, verification level) are shared with the developer whose API key initiated the verification. The developer&apos;s privacy policy governs their use of this data.</li>
              <li><span className="text-slate-300 font-medium">Law enforcement and regulators:</span> Where required by applicable law, court order, or legitimate regulatory demand.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. International Data Transfers</h2>
            <p>
              AfriVerify operates across multiple African jurisdictions and uses global cloud infrastructure.
              Where personal data is transferred outside the country of collection, we ensure appropriate
              safeguards are in place, including standard contractual clauses (SCCs), adequacy decisions,
              or binding corporate rules as applicable. For transfers involving EU data subjects, we comply
              with GDPR Chapter V requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Data Retention</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-white/10 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-white/5">
                    <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Data Category</th>
                    <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ['Verified identity record (name, nationality, hash)', '7 years from last activity or as required by KYC regulations'],
                    ['Facial embedding vectors', '5 years from last verification, unless extended consent given'],
                    ['Verification session logs', '5 years'],
                    ['API access logs', '2 years'],
                    ['Billing records', '7 years (tax and regulatory compliance)'],
                    ['Developer account data', 'Duration of account plus 2 years'],
                    ['AML screening results', '5 years or as required by applicable AML law'],
                  ].map(([cat, period]) => (
                    <tr key={cat}>
                      <td className="px-4 py-2.5 text-slate-300">{cat}</td>
                      <td className="px-4 py-2.5 text-slate-400">{period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Security</h2>
            <p>
              We implement enterprise-grade security measures including: AES-256 encryption at rest for all
              biometric data; TLS 1.3 in transit; HMAC-SHA512 webhook signatures; scrypt password hashing;
              SOC 2-aligned access controls; automated security scanning via OrbitShield (our proprietary
              fraud detection layer); and independent penetration testing. We operate a coordinated
              vulnerability disclosure programme at <a href="mailto:security@sankofaapp.com" className="text-indigo-400 hover:text-indigo-300">security@sankofaapp.com</a>.
            </p>
            <p className="mt-3">
              In the event of a personal data breach that poses a risk to your rights, we will notify the
              relevant supervisory authority within 72 hours and affected individuals without undue delay,
              in accordance with our incident response procedures.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the following rights:</p>
            <ul className="list-disc list-inside mt-2 space-y-1.5 text-slate-400">
              <li><span className="text-slate-300 font-medium">Access:</span> request a copy of personal data we hold about you</li>
              <li><span className="text-slate-300 font-medium">Rectification:</span> request correction of inaccurate data</li>
              <li><span className="text-slate-300 font-medium">Erasure:</span> request deletion of your data, subject to our legal retention obligations</li>
              <li><span className="text-slate-300 font-medium">Restriction:</span> request that we limit processing of your data</li>
              <li><span className="text-slate-300 font-medium">Portability:</span> receive your data in a structured, machine-readable format</li>
              <li><span className="text-slate-300 font-medium">Objection:</span> object to processing based on legitimate interests</li>
              <li><span className="text-slate-300 font-medium">Withdraw consent:</span> where processing is based on consent</li>
            </ul>
            <p className="mt-3">
              To exercise your rights, contact <a href={`mailto:${EMAIL}`} className="text-indigo-400 hover:text-indigo-300">{EMAIL}</a>.
              End-users may also manage their verified identity record at <Link href="/my-identity/login" className="text-indigo-400 hover:text-indigo-300">afriverify.sankofaapp.com/my-identity</Link>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Cookies and Tracking</h2>
            <p>
              Our dashboard uses session cookies strictly necessary for authentication. We do not use
              third-party advertising cookies, cross-site tracking, or analytics services that share data
              with third parties. The landing page uses no cookies. Developer dashboards use a single
              first-party JWT stored in localStorage for session management.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">12. Children&apos;s Privacy</h2>
            <p>
              Our Service is not directed to individuals under 18 years of age. We do not knowingly collect
              personal data from minors. If you believe we have inadvertently collected data from a minor,
              contact us immediately at <a href={`mailto:${EMAIL}`} className="text-indigo-400 hover:text-indigo-300">{EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy to reflect changes in law, our practices, or our services.
              Material changes will be communicated via email to registered developers at least 30 days
              before taking effect. The current version will always be available at
              afriverify.sankofaapp.com/privacy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">14. Contact Us</h2>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-slate-400 space-y-1">
              <p><span className="text-slate-300 font-medium">{COMPANY}</span></p>
              <p>Data Protection Officer</p>
              <p>{ADDRESS}</p>
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
