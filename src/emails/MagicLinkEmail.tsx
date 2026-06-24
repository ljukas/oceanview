import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  render,
  Section,
  Tailwind,
  Text,
} from 'react-email'
import { m } from '~/paraglide/messages'
import type { Locale } from '~/paraglide/runtime'
import { emailTailwindConfig } from './theme'

export interface MagicLinkEmailProps {
  url: string
  // Explicit rather than read from the Paraglide request scope: emails may be
  // rendered outside a request (queue, previews, tests), and the caller knows
  // the recipient's locale.
  locale: Locale
}

// The brand sail (public/email-logo.png) is served from the same origin that
// issued the magic link — prod, preview, or localhost all resolve correctly,
// with no env lookup. (SVG is stripped by most clients, so the mark is a PNG.)
const logoSrcFor = (url: string) => `${new URL(url).origin}/email-logo.png`

export const MagicLinkEmail = ({ url, locale }: MagicLinkEmailProps) => (
  <Tailwind config={emailTailwindConfig}>
    <Html lang={locale}>
      <Head />

      <Body className="m-0 bg-bg p-0 font-sans">
        <Preview>{m.email_magiclink_preview({}, { locale })}</Preview>
        <Container className="mx-auto w-full max-w-[600px] px-6 py-12">
          <Section
            className="overflow-hidden rounded-[16px] border border-border border-solid bg-card shadow-card"
            style={{
              // Faint nautical-blue wash at the top, echoing /login's .brand-wash.
              // Outlook ignores backgroundImage and falls back to the white bg.
              backgroundColor: '#FFFFFF',
              backgroundImage:
                'radial-gradient(120% 80% at 50% -10%, rgba(21,108,221,0.10), rgba(255,255,255,0) 60%)',
            }}
          >
            <Section className="px-10 pt-12 pb-10 text-center">
              <Section className="mb-7">
                <Img
                  src={logoSrcFor(url)}
                  alt=""
                  width={48}
                  height={48}
                  className="mx-auto block"
                />
                <Text className="m-0 mt-3 font-24 font-sans text-fg">Oceanview</Text>
              </Section>

              <Section className="mx-auto max-w-[420px]">
                <Heading as="h1" className="m-0 font-40 font-sans text-fg">
                  {m.email_magiclink_heading({}, { locale })}
                </Heading>
                <Text className="m-0 mt-4 font-14 font-sans text-fg-muted">
                  {m.email_magiclink_body({}, { locale })}
                </Text>
              </Section>

              <Section className="mt-9">
                <Button
                  href={url}
                  className="box-border inline-block rounded-[10px] bg-brand px-6 py-3 font-15 font-sans text-brand-fg no-underline"
                >
                  {m.email_magiclink_button({}, { locale })}
                </Button>
              </Section>

              <Section className="mx-auto mt-11 max-w-[420px]">
                <Hr className="m-0 border-border border-solid border-t" />
                <Text className="m-0 mt-6 font-13 font-sans text-fg-muted">
                  {m.email_magiclink_fallback({}, { locale })}
                </Text>
                <Link href={url} className="break-all font-13 font-sans text-brand">
                  {url}
                </Link>
              </Section>
            </Section>
          </Section>

          <Section className="px-6 py-8 text-center">
            <Text className="m-0 font-11 font-sans text-fg-muted">
              {m.email_magiclink_ignore({}, { locale })}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
)

MagicLinkEmail.PreviewProps = {
  // localhost origin so the preview server (:14501) loads email-logo.png from
  // the running dev app (:14500) when it's up.
  url: 'http://localhost:14500/api/auth/magic-link/verify?token=preview',
  locale: 'sv',
} satisfies MagicLinkEmailProps

export default MagicLinkEmail

export async function renderMagicLink(props: MagicLinkEmailProps) {
  const [html, text] = await Promise.all([
    render(<MagicLinkEmail {...props} />),
    render(<MagicLinkEmail {...props} />, { plainText: true }),
  ])
  return { subject: m.email_magiclink_subject({}, { locale: props.locale }), html, text }
}
