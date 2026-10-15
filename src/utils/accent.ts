export function accent(hex: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255

    if (channel <= 0.04045) return channel / 12.92

    return ((channel + 0.055) / 1.055) ** 2.4
  })

  const [red, green, blue] = channels
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722

  if (luminance > 0.179) return '#111827'

  return '#ffffff'
}
