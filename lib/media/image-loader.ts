/** Browser-safe: never send private images through a public optimization proxy. */
export const PRIVATE_IMAGE_WIDTHS = [160,320,640,960,1440,1920] as const
export function isProtectedListingImage(src:string):boolean {
  if(!/^\/api\/listings\/[a-f0-9-]{36}\/source\?/i.test(src))return false
  try{const url=new URL(src,'https://rentral.invalid');return ['photo','poster'].includes(url.searchParams.get('kind')??'')}catch{return false}
}
export function protectedListingImageLoader({src,width}:{src:string;width:number}):string {
  if(!isProtectedListingImage(src))throw new Error('Unsupported private image source.')
  const url=new URL(src,'https://rentral.invalid')
  const size=PRIVATE_IMAGE_WIDTHS.find(value=>value>=width)??1920
  url.searchParams.set('w',String(size))
  return url.pathname+url.search
}
