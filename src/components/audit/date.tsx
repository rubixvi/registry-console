'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateISO, formatDateShort } from '@/utils/format-date'

type Props = {
  id: string
  label: string
  name: 'from' | 'to'
  value: Date | undefined
  onChange: (date: Date | undefined) => void
}

export function DateFilter({ id, label, name, value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      <input name={name} type="hidden" value={formatDateISO(value)} />

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="w-full justify-between text-left font-normal"
            id={id}
            type="button"
            variant="outline"
          >
            <span className={value ? undefined : 'text-muted-foreground'}>
              {value ? formatDateShort(value) : 'Select date'}
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
