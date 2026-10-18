'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { DateFilter } from '@/components/audit/date'
import { Pagination } from '@/components/registry/filters/pagination'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAudit } from '@/hooks/audit/use-audit'
import { formatJson } from '@/utils/format-json'

export function AuditLog() {
  const state = useAudit()

  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()

  function clear(): void {
    setFrom(undefined)
    setTo(undefined)
    state.clear()
  }

  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-3"
        onReset={clear}
        onSubmit={state.apply}
      >
        <div className="grid gap-2">
          <Label htmlFor="audit-query">Search</Label>
          <Input
            id="audit-query"
            maxLength={256}
            name="query"
            placeholder="Actor, action, or target"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="audit-actor">Actor</Label>
          <Input id="audit-actor" maxLength={64} name="actor" placeholder="Exact username" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="audit-action">Action</Label>
          <Input id="audit-action" maxLength={128} name="action" placeholder="Exact event name" />
        </div>

        <DateFilter
          id="audit-from"
          label="From (UTC)"
          name="from"
          onChange={setFrom}
          value={from}
        />

        <DateFilter id="audit-to" label="To (UTC)" name="to" onChange={setTo} value={to} />

        <div className="flex flex-wrap items-end gap-2">
          <Button disabled={state.isValidating} type="submit">
            Apply
          </Button>

          <Button type="reset" variant="outline">
            Clear
          </Button>

          <Button
            aria-label="Refresh audit log"
            disabled={state.isValidating}
            onClick={state.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={state.isValidating ? 'animate-spin' : ''} />
          </Button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b p-5">
          <h2 className="font-semibold">Events</h2>

          <p className="mt-1 text-xs text-muted-foreground">
            {state.data?.total ?? 0} matching events - Retention follows the configured age limit
          </p>
        </div>

        {state.isLoading ? (
          <Loading />
        ) : state.error ? (
          <div className="p-5">
            <ErrorMessage message={state.error.message} />
          </div>
        ) : state.data?.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Time (UTC)</th>
                  <th className="px-5 py-3 font-medium">Actor</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Target</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {state.data.items.map((entry) => (
                  <tr className="align-top" key={entry.id}>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <time dateTime={entry.at}>{entry.at.replace('T', ' ').replace('Z', '')}</time>
                      <span className="mt-1 block text-xs text-muted-foreground">#{entry.id}</span>
                    </td>

                    <td className="min-w-32 px-5 py-4 break-all">{entry.actor}</td>

                    <td className="min-w-48 max-w-64 px-5 py-4 break-all font-mono text-xs">
                      {entry.action}
                    </td>

                    <td className="min-w-64 px-5 py-4">
                      {entry.target ? (
                        <details>
                          <summary className="cursor-pointer break-all text-xs">
                            {entry.target.length > 100
                              ? `${entry.target.slice(0, 100)}…`
                              : entry.target}
                          </summary>

                          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
                            {formatJson(entry.target)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-12 text-center text-sm text-muted-foreground">
            No matching audit events.
          </p>
        )}

        <Pagination
          hasNext={Boolean(state.data?.next)}
          hasPrevious={state.hasPrevious}
          next={state.next}
          page={state.page}
          pageSize={20}
          previous={state.previous}
        />
      </section>
    </div>
  )
}
