const LAGOS_AREAS = ['Ibeju-Lekki', 'Victoria Island', 'Lekki', 'Ikoyi', 'Ajah', 'Yaba', 'Ikeja', 'Surulere', 'Gbagada', 'Ikorodu', 'Epe', 'Badagry', 'Festac', 'Apapa', 'Maryland', 'Ogudu', 'Magodo', 'Ilupeju', 'Agege'];

export function vaultNeighborhood(address: string | null, neighborhood: unknown): string {
  const text = `${typeof neighborhood === 'string' ? neighborhood : ''} ${address ?? ''}`.toLowerCase();
  return LAGOS_AREAS.find((area: string) => text.includes(area.toLowerCase())) ?? 'Other area';
}

export function vaultSavedDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(date);
}
