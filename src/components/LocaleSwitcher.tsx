import { GB, SE } from 'country-flag-icons/react/3x2'
import { GlobeIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { m } from '~/paraglide/messages'
import { getLocale, type Locale, setLocale } from '~/paraglide/runtime'

// setLocale writes the oceanview-locale cookie and reloads the page — the
// whole document (loader data, query cache, <html lang>) re-renders
// server-side in the new locale, so no React state or provider is involved.

const FLAG_BY_LOCALE: Record<Locale, typeof SE> = { sv: SE, en: GB }

export function LocaleSwitcher() {
  const Flag = FLAG_BY_LOCALE[getLocale()]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          {/* Flag wrapper matches FlagComponent in ui/phone-input.tsx */}
          <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20 [&_svg:not([class*='size-'])]:size-full">
            <Flag title={m.locale_switcher_label()} />
          </span>
          <span className="sr-only">{m.locale_switcher_label()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={getLocale()}
          onValueChange={(value) => setLocale(value as Locale)}
        >
          {/* Endonyms — each language named in itself, readable whatever the
              active locale is. Deliberately not in messages/*.json. */}
          <DropdownMenuRadioItem value="sv">Svenska</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Pre-auth variant for the login page: one tap straight to the other
// language, labeled in that language so it reads as an exit for someone who
// doesn't understand the current one.
export function LocaleSwitcherInline() {
  const other: Locale = getLocale() === 'sv' ? 'en' : 'sv'
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(other)}>
      <GlobeIcon data-icon="inline-start" />
      {other === 'en' ? 'In English' : 'På svenska'}
    </Button>
  )
}
