import { beforeAll, expect, test, vi } from 'vitest'

// The s3 adapter reads S3_* env at import time and constructs an S3Client.
// Set dummy values before importing it (no network call is made — getSignedUrl
// is mocked to capture the command instead of signing against a live server).
beforeAll(() => {
  process.env.S3_ENDPOINT ??= 'http://localhost:14523'
  process.env.S3_BUCKET_PUBLIC ??= 'oceanview-public'
  process.env.S3_BUCKET_PRIVATE ??= 'oceanview-private'
  process.env.S3_ACCESS_KEY_ID ??= 'test-key'
  process.env.S3_SECRET_ACCESS_KEY ??= 'test-secret'
})

// Each mocked sign call records the GetObjectCommand's ResponseContentDisposition
// so we can assert what the adapter put on the request. A sentinel distinguishes
// "not set" from "no call".
const NOT_CAPTURED = Symbol('not captured')
let lastDisposition: string | undefined | typeof NOT_CAPTURED = NOT_CAPTURED
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(
    async (_client: unknown, command: { input: { ResponseContentDisposition?: string } }) => {
      lastDisposition = command.input.ResponseContentDisposition
      return 'https://signed.example/url'
    },
  ),
}))

test('getReadUrl sets ResponseContentDisposition from downloadFilename', async () => {
  const { s3 } = await import('./s3')
  const url = await s3.getReadUrl('private', 'documents/x/manual.pdf', 60, {
    downloadFilename: 'Motormanual.pdf',
  })
  expect(url).toBe('https://signed.example/url')
  expect(lastDisposition).toBe(
    `attachment; filename="Motormanual.pdf"; filename*=UTF-8''Motormanual.pdf`,
  )
})

test('getReadUrl omits ResponseContentDisposition when no downloadFilename', async () => {
  const { s3 } = await import('./s3')
  lastDisposition = NOT_CAPTURED
  await s3.getReadUrl('private', 'documents/x/manual.pdf', 60)
  expect(lastDisposition).toBeUndefined()
})

test('copy issues a CopyObjectCommand with REPLACE metadata', async () => {
  const { CopyObjectCommand, S3Client } = await import('@aws-sdk/client-s3')
  const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue(undefined as never)
  const { s3 } = await import('./s3')

  await s3.copy('private', 'documents/x/Batmanual.pdf', 'documents/x/Motor.pdf', 'application/pdf')

  expect(sendSpy).toHaveBeenCalledTimes(1)
  const command = sendSpy.mock.calls[0][0] as InstanceType<typeof CopyObjectCommand>
  expect(command).toBeInstanceOf(CopyObjectCommand)
  expect(command.input).toMatchObject({
    Bucket: 'oceanview-private',
    CopySource: 'oceanview-private/documents/x/Batmanual.pdf',
    Key: 'documents/x/Motor.pdf',
    ContentType: 'application/pdf',
    MetadataDirective: 'REPLACE',
  })
  sendSpy.mockRestore()
})
