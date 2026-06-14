import { AlertCircle } from 'lucide-react'

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  )
}
