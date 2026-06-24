import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { AvatarUpload } from '~/components/user/AvatarUpload'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

type Props = {
  onFinish: () => void
  onBack: () => void
  finishing: boolean
}

export function OnboardingAvatarStep({ onFinish, onBack, finishing }: Props) {
  // AvatarUpload persists the image itself (mint → upload → confirm); this step
  // only adds the finish/skip + back chrome. `me.image` decides the primary
  // button label — a picture present reads as "Done", none as "Skip".
  const { data: me } = useSuspenseQuery(orpc.user.me.queryOptions())

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {m.onboarding_avatar_title()}
        </h1>
        <p className="text-balance text-muted-foreground text-sm">
          {m.onboarding_avatar_description()}
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <div className="flex justify-center">
          <AvatarUpload />
        </div>

        <Button
          type="button"
          size="xl"
          className="w-full font-normal"
          onClick={onFinish}
          disabled={finishing}
        >
          {finishing ? <Spinner data-icon="inline-start" /> : null}
          {me.image ? m.onboarding_finish() : m.onboarding_skip()}
        </Button>

        <div className="flex justify-start">
          <Button type="button" variant="ghost" onClick={onBack} disabled={finishing}>
            <ArrowLeftIcon />
            {m.common_back()}
          </Button>
        </div>
      </div>
    </div>
  )
}
