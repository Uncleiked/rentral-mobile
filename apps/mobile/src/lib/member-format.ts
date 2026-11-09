export function memberDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function memberTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
}

export function memberAmount(value: string, currency = 'NGN'): string {
  if (!/^\d+$/.test(value)) return 'Amount unavailable'
  const amount = BigInt(value)
  const whole = (amount / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = (amount % BigInt(100)).toString().padStart(2, '0')
  return `${currency === 'NGN' ? '₦' : `${currency} `}${whole}${cents === '00' ? '' : `.${cents}`}`
}

export function memberStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, character => character.toUpperCase())
}
