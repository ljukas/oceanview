import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { uploadFileToStorage } from '~/lib/effects/storage/clientUpload'
import { orpc } from '~/lib/orpc/client'

const ACCEPT_LIST = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const
const ACCEPT = ACCEPT_LIST.join(',')
const MAX_BYTES = 25_000_000

type DocumentMime = (typeof ACCEPT_LIST)[number]

function isDocumentMime(value: string): value is DocumentMime {
  return (ACCEPT_LIST as readonly string[]).includes(value)
}

export function DocumentUpload() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)

  const mintMutation = useMutation(orpc.file.mintDocumentUpload.mutationOptions())
  const confirmMutation = useMutation(orpc.file.confirmDocumentUpload.mutationOptions())

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('Filen är för stor (max 25 MB)')
      return
    }
    if (!isDocumentMime(file.type)) {
      toast.error('Filtypen stöds inte')
      return
    }
    setPending(true)
    try {
      const mint = await mintMutation.mutateAsync({
        contentType: file.type,
        sizeBytes: file.size,
        name: file.name,
      })

      await uploadFileToStorage(file, mint, { access: 'private', contentType: file.type })

      await confirmMutation.mutateAsync({
        pathname: mint.pathname,
        name: file.name,
        sizeBytes: file.size,
      })

      await queryClient.invalidateQueries({ queryKey: orpc.file.listDocuments.key() })
      toast.success('Dokumentet laddades upp')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte ladda upp filen')
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <UploadIcon />}
        Ladda upp dokument
      </Button>
    </>
  )
}
