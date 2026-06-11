import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { m } from '~/paraglide/messages'

type Props = { onContinue: () => void }

export function SignedInCard({ onContinue }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Oceanview</CardTitle>
        <CardDescription>{m.login_signed_in_description()}</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {m.login_signed_in_body()}
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onContinue}>
          {m.login_continue_here()}
        </Button>
      </CardFooter>
    </Card>
  )
}
