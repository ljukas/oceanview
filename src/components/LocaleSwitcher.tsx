import { SwedenFlag, UnitedKingdomFlag } from '~/components/flags'
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

const FLAG_BY_LOCALE: Record<Locale, typeof SwedenFlag> = {
  sv: SwedenFlag,
  en: UnitedKingdomFlag,
}

// The ring keeps the GB flag's white quadrants from washing into light
// backgrounds; rounded-full shapes it to the circular flag.
const FLAG_CLASSES = 'size-4 rounded-full ring-1 ring-border'

export function LocaleSwitcher() {
  const Flag = FLAG_BY_LOCALE[getLocale()]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Flag className={FLAG_CLASSES} />
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
          <DropdownMenuRadioItem value="sv">
            <SwedenFlag className={FLAG_CLASSES} />
            Svenska
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">
            <UnitedKingdomFlag className={FLAG_CLASSES} />
            English
          </DropdownMenuRadioItem>
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
  const OtherFlag = FLAG_BY_LOCALE[other]
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(other)}>
      <OtherFlag className={FLAG_CLASSES} />
      {other === 'en' ? 'In English' : 'På svenska'}
    </Button>
  )
}
