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
import { TechFonts } from './Fonts'
import { techTailwindConfig } from './theme'

export interface MagicLinkEmailProps {
  url: string
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
  <Tailwind config={techTailwindConfig}>
    <Html lang="sv">
      <Head>
        <TechFonts />
      </Head>

      <Body className="m-0 bg-bg-2 p-0">
        <Preview>Använd länken för att logga in. Gäller i 5 minuter.</Preview>
        <Container className="mx-auto w-full max-w-[640px]">
          <Section className="bg-bg-3 px-0 pt-14 text-center">
            <Section className="px-6 pb-[72px]">
              <Section className="mb-8">
                <Text className="m-0 font-24 font-geist text-fg tracking-tight">Oceanview</Text>
              </Section>

              <Section className="mx-auto mb-8 max-w-[448px]">
                <Text className="m-0 font-40 font-geist text-fg">Logga in på Oceanview</Text>
                <Text className="m-0 mt-6 font-14 font-sans text-fg-2">
                  Hej! Klicka på knappen nedan för att logga in. Länken gäller i 5 minuter.
                </Text>
              </Section>

              <Button
                href={url}
                className="inline-block rounded-[8px] border border-button-border bg-white px-[20px] py-[12px] font-15 font-sans text-[#1F2222]"
              >
                Logga in
              </Button>

              <Section className="mx-auto mt-12 max-w-[448px]">
                <Hr className="my-0 border-stroke" />
                <Text className="m-0 mt-6 font-13 font-sans text-fg-2">
                  Om knappen inte fungerar, kopiera och klistra in följande länk i din webbläsare:
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
                Om du inte begärde det här mejlet kan du ignorera det.
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
} satisfies MagicLinkEmailProps

export default MagicLinkEmail

export async function renderMagicLink(props: MagicLinkEmailProps) {
  const [html, text] = await Promise.all([
    render(<MagicLinkEmail {...props} />),
    render(<MagicLinkEmail {...props} />, { plainText: true }),
  ])
  return { subject: 'Logga in på Oceanview', html, text }
}
