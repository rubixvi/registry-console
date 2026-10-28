'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ARCHITECTURES = [
  { value: 'arm', label: 'ARM 32-bit' },
  { value: 'arm64', label: 'ARM 64-bit' },
  { value: '386', label: 'Intel / AMD 32-bit' },
  { value: 'amd64', label: 'Intel / AMD 64-bit' },
  { value: 's390x', label: 'IBM Z' },
  { value: 'ppc64le', label: 'PowerPC' },
  { value: 'riscv64', label: 'RISC-V' },
]

type Props = {
  value: string
  onChange: (value: string) => void
}

export function Architecture({ value, onChange }: Props) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label="Architecture" className="w-full sm:w-40  h-8">
        <SelectValue placeholder="Architecture" />
      </SelectTrigger>

      <SelectContent position="popper">
        <SelectItem value="all">Architecture</SelectItem>

        {ARCHITECTURES.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
