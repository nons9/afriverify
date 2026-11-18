// RFC 9116 security.txt. `Expires` rolls forward (270 days from each request, cached for a day) so the file never
// goes stale and fails the RFC's "must not be expired" rule.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const expires = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    'Contact: mailto:security@sankofaapp.com',
    `Expires: ${expires}`,
    'Preferred-Languages: en, fr',
    'Canonical: https://afriverify.sankofaapp.com/.well-known/security.txt',
    'Policy: https://afriverify.sankofaapp.com/security',
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
