import { m } from '~/paraglide/messages'

// The fixed, curated tag vocabulary seeded by drizzle/0016_seed_system_tags.sql.
// Order here is irrelevant — display order comes from tag.sortOrder; this registry
// only maps slug -> localized label. A new seeded slug without a label here is a
// TYPE error (Record key) and is also caught at runtime by tagLabels.test.ts.
export const TAG_SLUGS = [
  'restaurant',
  'anchorage',
  'pier',
  'cove',
  'beach',
  'marina',
  'bar',
  'snorkeling',
  'provisioning',
  'viewpoint',
] as const

export type TagSlug = (typeof TAG_SLUGS)[number]

export const tagLabels: Record<TagSlug, () => string> = {
  restaurant: m.tag_restaurant,
  anchorage: m.tag_anchorage,
  pier: m.tag_pier,
  cove: m.tag_cove,
  beach: m.tag_beach,
  marina: m.tag_marina,
  bar: m.tag_bar,
  snorkeling: m.tag_snorkeling,
  provisioning: m.tag_provisioning,
  viewpoint: m.tag_viewpoint,
}

export function isTagSlug(slug: string): slug is TagSlug {
  return slug in tagLabels
}
