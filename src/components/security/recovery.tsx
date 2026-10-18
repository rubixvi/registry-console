import { Button } from '@/components/ui/button'

type Props = {
  codes: string[]
  onConfirm: () => void
}

export function Recovery({ codes, onConfirm }: Props) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6" role="status">
      <h2 className="font-semibold">Save your recovery codes</h2>

      <p className="text-sm text-muted-foreground">
        Store these recovery codes securely. Each code can be used once to access your account if
        your authenticator is unavailable. These codes will not be displayed again.
      </p>

      <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <Button onClick={onConfirm} type="button" variant="outline">
        Confirm
      </Button>
    </section>
  )
}
