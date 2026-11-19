import type { MetadataRoute } from 'next';

const BASE_URL = 'https://afriverify.sankofaapp.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...['pricing', 'security', 'status', 'changelog', 'docs', 'legal', 'legal/dpa', 'legal/aup', 'legal/biometric', 'legal/sla', 'legal/research'].map((slug) => ({
      url: `${BASE_URL}/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: slug === 'pricing' || slug === 'security' ? 0.8 : 0.6,
    })),
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
