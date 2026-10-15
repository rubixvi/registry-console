'use client'

import { useEffect, useState } from 'react'

import { isTagOrder, type TagOrder } from '@/utils/tag-order'

const STORAGE_KEY = 'registry-console:tag-order'

export function useTagOrder(defaultOrder: TagOrder) {
  const [order, setOrder] = useState<TagOrder>(defaultOrder)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)

      if (isTagOrder(saved)) setOrder(saved)
    } catch {
      // Browser preferences are optional.
    }
  }, [])

  function changeOrder(value: string): void {
    if (!isTagOrder(value)) return

    setOrder(value)

    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Continue without saving the preference.
    }
  }

  return { order, changeOrder }
}
