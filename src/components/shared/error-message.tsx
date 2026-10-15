import { AlertCircle } from 'lucide-react'

type Props = {
  message?: string
}

export function ErrorMessage({ message }: Props) {
  if (!message) return null

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
