import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { m } from '~/paraglide/messages'

type Props = { email: string }

export function MagicLinkSentCard({ email }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Oceanview</CardTitle>
        <CardDescription>{m.login_sent_description()}</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {m.login_sent_to()} <strong className="text-foreground">{email}</strong>.{' '}
        {m.login_sent_instructions()}
      </CardContent>
    </Card>
  )
}
