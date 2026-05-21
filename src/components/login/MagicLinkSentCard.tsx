import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

type Props = { email: string }

export function MagicLinkSentCard({ email }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Oceanview</CardTitle>
        <CardDescription>Inloggningslänken är på väg.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Vi har skickat en inloggningslänk till <strong className="text-foreground">{email}</strong>.
        Kolla din inkorg (eller serverloggen tills vidare) och följ länken för att fortsätta.
      </CardContent>
    </Card>
  )
}
