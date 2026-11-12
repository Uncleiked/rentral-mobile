import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssetPhoto } from '../components/listing/AssetPhoto'
const source='/api/listings/11111111-1111-4111-8111-111111111111/source?kind=photo&index=0'
function render(src: string, original=false){return renderToStaticMarkup(createElement(AssetPhoto,{src,original,alt:'A complete listing photo',sizes:'(min-width:1024px) 720px,100vw'}))}
describe('protected responsive photo rendering',()=>{
 it('emits authenticated same-origin variants without a public optimizer proxy',()=>{
  const html=render(source)
  expect(html).toContain('srcSet=')
  expect(html).toContain('w=640')
  expect(html).toContain('w=1920')
  expect(html).not.toContain('/_next/image')
  expect(html).toContain('loading="lazy"')
  expect(html).toContain('decoding="async"')
 })
 it('leaves complete original inspection outside thumbnail transformation',()=>{
  const html=render(source,true)
  expect(html).not.toContain('srcSet=')
  expect(html).not.toContain('w=')
  expect(html).not.toContain('/_next/image')
 })
 it('never sends a signed capability or browser preview through a public optimizer',()=>{
  for(const src of ['/api/v1/files/listings-media/owner/photo.jpg?token=private-capability','blob:https://rentral.invalid/preview','data:image/png;base64,fixture']){
   const html=render(src)
   expect(html).not.toContain('srcSet=')
   expect(html).not.toContain('/_next/image')
  }
 })
})
