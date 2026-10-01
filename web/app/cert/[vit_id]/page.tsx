'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import s from '../cert.module.css';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface CertData {
  vit_id: string;
  status: 'active' | 'revoked' | 'expired';
  level: 1 | 2 | 3;
  subject_name: string;
  country: string;
  country_flag: string;
  country_name: string;
  id_type: string;
  checks_passed: string[];
  trust_score: number;
  issued_at: string;
  expires_at: string;
  verified_on: string;
  revoked_at?: string;
  revoked_reason?: string;
  vit_token_preview?: string;
  cert_fingerprint?: string;
}

const LVC: Record<string, string> = {
  lv1: '#3B82F6',
  lv2: '#34D399',
  lv3: '#F59E0B',
};

function levelColor(level: 1 | 2 | 3, status: string): string {
  if (status === 'revoked') return '#EF4444';
  if (status === 'expired') return '#6B7280';
  return LVC[`lv${level}`] ?? LVC.lv3;
}

function levelLabel(level: 1 | 2 | 3): string {
  return ['', 'Level 1 · Phone', 'Level 2 · ID Document', 'Level 3 · Biometric'][level];
}

function levelClass(level: 1 | 2 | 3): string {
  return [s.lb1, s.lb1, s.lb2, s.lb3][level];
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function CheckIcon() {
  return (
    <span className={s.chkIcon}>
      <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
        <path d="M1 2.5l1.5 1.5L6 1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="5.5" width="12" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5V4a3 3 0 016 0v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="9.25" r="1" fill="currentColor" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 5L1 7l3 2M10 5l3 2-3 2M7.5 3L6 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`${s.xchev}${open ? ' ' + s.xchevOpen : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
      <path d="M4.5 0l1.05 3.45L9 4.5l-3.45 1.05L4.5 9 3.45 5.55 0 4.5l3.45-1.05L4.5 0z" />
    </svg>
  );
}

export default function CertPage() {
  const { vit_id } = useParams<{ vit_id: string }>();

  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState(vit_id ?? '');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  let _tt: ReturnType<typeof setTimeout> | null = null;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (_tt) clearTimeout(_tt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    _tt = setTimeout(() => setToastVisible(false), 2200);
  }, []);

  const fetchCert = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setCert(null);
    setQrSrc(null);
    try {
      const res = await fetch(`${API}/v1/public/cert/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? (res.status === 404 ? 'Certificate not found.' : 'Verification failed.'));
      }
      const data = await res.json() as CertData;
      setCert(data);

      const certUrl = `${window.location.origin}/cert/${data.vit_id}`;
      import('qrcode').then(mod =>
        mod.default.toDataURL(certUrl, { width: 80, margin: 1, color: { dark: '#030611', light: '#ffffff' } })
          .then(setQrSrc)
          .catch(() => null)
      ).catch(() => null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (vit_id) fetchCert(vit_id);
  }, [vit_id, fetchCert]);

  function handleLookup() {
    const id = inputVal.trim();
    if (!id) return;
    if (id !== vit_id) {
      window.history.pushState(null, '', `/cert/${encodeURIComponent(id)}`);
    }
    fetchCert(id);
  }

  function copyId() {
    if (!cert) return;
    navigator.clipboard?.writeText(cert.vit_id)
      .then(() => showToast('Copied!'))
      .catch(() => showToast('Press Ctrl+C to copy'));
  }

  const lvc = cert ? levelColor(cert.level, cert.status) : LVC.lv3;

  return (
    <div className={s.page} style={{ '--lvc': lvc } as React.CSSProperties}>
      {/* Topbar */}
      <div className={s.topbar}>
        <strong>Cryptographically signed.</strong> Backed by a tamper-proof Verified Identity Token (VIT). Cannot be copied, forged, or faked with a screenshot.
      </div>

      {/* Header */}
      <header className={s.header}>
        <a href="https://afriverify.sankofaapp.com" className={s.logo}>
          <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
            <path d="M13 1L1 6.5V15c0 7.5 5.2 13.8 12 15.5 6.8-1.7 12-8 12-15.5V6.5L13 1z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" opacity="0.08" />
            <path d="M8.5 15l3.2 3.2L17.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          AfriVerify
        </a>
        <a href="https://afriverify.sankofaapp.com/register" className={s.hlink}>Get verified</a>
      </header>

      <main className={s.main}>
        {/* Lookup */}
        <div className={s.lookupWrap}>
          <div className={s.lookupLabel}>Verify a certificate</div>
          <div className={s.lookupRow}>
            <input
              className={s.lookupInput}
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="AVT-3-2026-78345621"
              spellCheck={false}
              autoComplete="off"
            />
            <button className={s.lookupBtn} onClick={handleLookup}>Verify</button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className={s.stateWrap}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <circle cx="16" cy="16" r="12" stroke="var(--fg-dim)" strokeWidth="2.5" />
              <path d="M28 16a12 12 0 00-12-12" stroke="var(--lvc, var(--lv3))" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className={s.stateDesc}>Checking certificate status...</div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className={s.stateWrap}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="var(--danger)" strokeWidth="1.5" />
              <path d="M24 14v14M24 32v2" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className={s.stateTitle}>Certificate Not Found</div>
            <div className={s.stateDesc}>{error}</div>
          </div>
        )}

        {/* Certificate */}
        {!loading && cert && (
          <>
            <div className={s.certSection}>
              {/* Header strip */}
              <div className={s.certHdr}>
                <div className={`${s.statusPill} ${cert.status === 'active' ? s.spActive : cert.status === 'revoked' ? s.spRevoked : s.spExpired}`}>
                  <span className={`${s.dot}${cert.status === 'active' ? ' ' + s.dotPulse : ''}`} />
                  <span>{cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}</span>
                </div>
                <div className={s.hdrRight}>
                  <span className={s.cflag}>{cert.country_flag}</span>
                  <span className={s.cname}>{cert.country_name}</span>
                  <span className={s.dtype}>{cert.id_type}</span>
                </div>
              </div>

              {/* Active / Expired body */}
              {cert.status !== 'revoked' && (
                <>
                  <div className={s.certBody}>
                    <div className={s.bodyLeft}>
                      <div className={`${s.lvlBadge} ${levelClass(cert.level)}`}>
                        {cert.level === 3 && <StarIcon />}
                        {levelLabel(cert.level)}
                      </div>
                      <div>
                        <h1 className={s.certName}>{cert.subject_name}</h1>
                        <div className={s.certSub}>Verified Identity Certificate</div>
                      </div>
                      <div className={s.checks}>
                        {cert.checks_passed.map(chk => (
                          <span key={chk} className={s.chk}>
                            <CheckIcon />
                            {chk}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className={s.qrCol}>
                      <div className={s.qrBox}>
                        {qrSrc && <img src={qrSrc} alt="QR code" width={80} height={80} />}
                      </div>
                      <div className={s.qrLbl}>Scan to verify</div>
                    </div>
                  </div>

                  <div className={s.certStats}>
                    <div>
                      <div className={s.statLbl}>Trust Score</div>
                      <div className={s.scoreRow}>
                        <svg className={s.scoreSvg} viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="3.2" />
                          <circle
                            cx="18" cy="18" r="14" fill="none"
                            stroke="var(--lvc, var(--lv3))" strokeWidth="3.2"
                            strokeDasharray="87.96"
                            strokeDashoffset={87.96 - (87.96 * cert.trust_score) / 100}
                            strokeLinecap="round"
                            transform="rotate(-90 18 18)"
                          />
                        </svg>
                        <span className={s.statVal}>{cert.trust_score}/100</span>
                      </div>
                    </div>
                    <div>
                      <div className={s.statLbl}>Issued</div>
                      <div className={s.statVal}>{fmtDate(cert.issued_at)}</div>
                    </div>
                    <div>
                      <div className={s.statLbl}>Expires</div>
                      <div className={`${s.statVal}${cert.status === 'expired' ? ' ' + s.statValDanger : ''}`}>
                        {fmtDate(cert.expires_at)}
                      </div>
                    </div>
                    <div>
                      <div className={s.statLbl}>Verified on</div>
                      <div className={s.statVal}>{cert.verified_on}</div>
                    </div>
                  </div>
                </>
              )}

              {/* Revoked overlay */}
              {cert.status === 'revoked' && (
                <div className={s.revokedBody}>
                  <div className={s.rvIcon}>✕</div>
                  <div className={s.rvTitle}>Certificate Revoked</div>
                  <div className={s.rvDesc}>
                    This certificate was revoked{cert.revoked_at ? ` on ${fmtDate(cert.revoked_at)}` : ''} and is no longer valid. Do not accept it as proof of identity.
                    {cert.revoked_reason && <><br /><em>{cert.revoked_reason}</em></>}
                  </div>
                </div>
              )}

              {/* ID row */}
              <div className={s.idRow}>
                <span className={s.idLbl}>Certificate ID</span>
                <span className={s.idVal}>{cert.vit_id}</span>
                <button className={s.cpyBtn} onClick={copyId}>Copy</button>
              </div>
            </div>

            {/* Cryptographic Proof */}
            <div className={s.xsec}>
              <button className={s.xtrig} onClick={() => setOpenSection(openSection === 'crypto' ? null : 'crypto')}>
                <span className={s.xtrigTitle}><LockIcon />Cryptographic Proof</span>
                <ChevronIcon open={openSection === 'crypto'} />
              </button>
              {openSection === 'crypto' && (
                <div className={s.xbody}>
                  <div className={s.xrow}>
                    <div className={s.xlbl}>Signing Algorithm</div>
                    <div className={s.xval}>ES256 - ECDSA with P-256 curve and SHA-256 digest</div>
                  </div>
                  <div className={s.xrow}>
                    <div className={s.xlbl}>Issued by</div>
                    <div className={s.xval}>AfriVerify Certificate Authority · CA-2026-001 · Sankofa Network</div>
                  </div>
                  {cert.vit_token_preview && (
                    <div className={s.xrow}>
                      <div className={s.xlbl}>VIT Token (signature truncated)</div>
                      <div className={s.xval}>{cert.vit_token_preview}</div>
                    </div>
                  )}
                  {cert.cert_fingerprint && (
                    <div className={s.xrow}>
                      <div className={s.xlbl}>Certificate Fingerprint (SHA-256)</div>
                      <div className={s.xval}>{cert.cert_fingerprint}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Verify via API */}
            <div className={s.xsec}>
              <button className={s.xtrig} onClick={() => setOpenSection(openSection === 'api' ? null : 'api')}>
                <span className={s.xtrigTitle}><CodeIcon />Verify via API</span>
                <ChevronIcon open={openSection === 'api'} />
              </button>
              {openSection === 'api' && (
                <div className={s.xbody}>
                  <div className={s.xrow}>
                    <div className={s.xlbl}>Public Endpoint - No authentication required</div>
                    <div className={s.apiUrlRow}>
                      <span className={s.apiUrl}>api.afriverify.sankofaapp.com/v1/public/cert/{cert.vit_id}</span>
                      <span className={s.meth}>GET</span>
                    </div>
                  </div>
                  <p className={s.xnote}>
                    Returns <code>status</code>, <code>level</code>, <code>checks_passed</code>, <code>trust_score</code>, <code>issued_at</code>, and <code>expires_at</code>. Personal data is never exposed. Drop this call into any server-side onboarding flow to confirm a certificate in real time.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className={s.footer}>
        Powered by{' '}
        <a href="https://afriverify.sankofaapp.com" target="_blank" rel="noopener">AfriVerify</a>
        {' '}&nbsp;·&nbsp;{' '}
        <a href="/privacy">Privacy</a>
        {' '}&nbsp;·&nbsp;{' '}
        <a href="/terms">Terms</a>
        <small className={s.footerNote}>
          This page does not store personal data. Certificate status is fetched live on every visit and cannot be cached or faked.
        </small>
      </footer>

      <div className={`${s.toast}${toastVisible ? ' ' + s.toastShow : ''}`}>{toastMsg}</div>
    </div>
  );
}
