'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ARCHITECTURES = [
  { value: 'amd64', label: 'Intel / AMD 64-bit' },
  { value: 'arm64', label: 'ARM 64-bit' },
  { value: 'arm', label: 'ARM 32-bit' },
  { value: '386', label: 'Intel / AMD 32-bit' },
  { value: 'ppc64le', label: 'PowerPC' },
  { value: 's390x', label: 'IBM Z' },
  { value: 'riscv64', label: 'RISC-V' },
]

type Props = {
  value: string
  onChange: (value: string) => void
}

export function Architecture({ value, onChange }: Props) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label="Architecture" className="w-full sm:w-40">
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
