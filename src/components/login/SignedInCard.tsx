import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'

type Props = { onContinue: () => void }

export function SignedInCard({ onContinue }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Oceanview</CardTitle>
        <CardDescription>Du är inloggad.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Du kan stänga den här fliken och gå tillbaka till din andra flik — eller fortsätta här.
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onContinue}>
          Fortsätt här
        </Button>
      </CardFooter>
    </Card>
  )
}
