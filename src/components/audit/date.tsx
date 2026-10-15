'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Props = {
  id: string
  label: string
  name: 'from' | 'to'
  value: Date | undefined
  onChange: (date: Date | undefined) => void
}

function dateValue(date: Date | undefined): string {
  if (!date) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function DateFilter({ id, label, name, value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      <input name={name} type="hidden" value={dateValue(value)} />

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="w-full justify-between text-left font-normal"
            id={id}
            type="button"
            variant="outline"
          >
            <span className={value ? undefined : 'text-muted-foreground'}>
              {value
                ? value.toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Select date'}
            </span>

            <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            autoFocus
            defaultMonth={value}
            mode="single"
            onSelect={(date) => {
              onChange(date)
              setOpen(false)
            }}
            selected={value}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
