// Adapted from Resend's react-email demo
// (apps/demo/emails/05-Studio/activation.tsx, MIT — © 2024 Plus Five Five, Inc.).
// Source: https://github.com/resend/react-email/tree/canary/apps/demo/emails/05-Studio

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  render,
  Section,
  Tailwind,
  Text,
} from 'react-email'
import { m } from '~/paraglide/messages'
import type { Locale } from '~/paraglide/runtime'
import { TechFonts } from './Fonts'
import { techTailwindConfig } from './theme'

export interface MagicLinkEmailProps {
  url: string
  // Explicit rather than read from the Paraglide request scope: emails may be
  // rendered outside a request (queue, previews, tests), and the caller knows
  // the recipient's locale.
  locale: Locale
}

export const MagicLinkEmail = ({ url, locale }: MagicLinkEmailProps) => (
  <Tailwind config={techTailwindConfig}>
    <Html lang={locale}>
      <Head>
        <TechFonts />
      </Head>

      <Body className="m-0 bg-bg-2 p-0">
        <Preview>{m.email_magiclink_preview({}, { locale })}</Preview>
        <Container className="mx-auto w-full max-w-[640px]">
          <Section className="bg-bg-3 px-0 pt-14 text-center">
            <Section className="px-6 pb-[72px]">
              <Section className="mb-8">
                <Text className="m-0 font-24 font-geist text-fg tracking-tight">Oceanview</Text>
              </Section>

              <Section className="mx-auto mb-8 max-w-[448px]">
                <Text className="m-0 font-40 font-geist text-fg">
                  {m.email_magiclink_heading({}, { locale })}
                </Text>
                <Text className="m-0 mt-6 font-14 font-sans text-fg-2">
                  {m.email_magiclink_body({}, { locale })}
                </Text>
              </Section>

              <Button
                href={url}
                className="inline-block rounded-[8px] border border-button-border bg-white px-[20px] py-[12px] font-15 font-sans text-[#1F2222]"
              >
                {m.email_magiclink_button({}, { locale })}
              </Button>

              <Section className="mx-auto mt-12 max-w-[448px]">
                <Hr className="my-0 border-stroke" />
                <Text className="m-0 mt-6 font-13 font-sans text-fg-2">
                  {m.email_magiclink_fallback({}, { locale })}
                </Text>
                <Link href={url} className="break-all font-13 font-sans text-fg">
                  {url}
                </Link>
              </Section>
            </Section>
          </Section>

          <Section className="px-6 py-20 text-center">
            <Section className="mx-auto max-w-[320px]">
              <Text className="m-0 font-11 font-sans text-fg-2">
                {m.email_magiclink_ignore({}, { locale })}
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
)

MagicLinkEmail.PreviewProps = {
  url: 'https://oceanview.example/sign-in/magic-link?token=preview',
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
