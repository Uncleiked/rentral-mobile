'use client'

import { useEffect,useRef,type ReactNode } from 'react'
import { Pause,Play } from 'lucide-react'
import { cursorImpulse,easeGrass,grassLean } from '@/lib/home/grass'
import { useHomeMotion } from './HomeMotion'

type Blade={x:number;y:number;height:number;width:number;phase:number;layer:number}
export function FooterMeadow({children}:{children:ReactNode}){
  const host=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null)
  const {paused,reducedMotion,toggleMotion}=useHomeMotion()
  useEffect(()=>{
    const element=host.current,surface=canvas.current,context=surface?.getContext('2d')
    if(!element||!surface||!context)return
    let width=0,height=0,blades:Blade[]=[],frame=0,visible=false,last=0,started=0,lean=0,target=0,pointerX=-1000,previousX:number|null=null
    const quiet=paused||reducedMotion
    const palette=getComputedStyle(element)
    const base=palette.getPropertyValue('--color-background-app').trim(),green=palette.getPropertyValue('--color-accent-primary').trim(),light=palette.getPropertyValue('--color-accent-hover').trim()
    function paint(time:number){
      context!.clearRect(0,0,width,height)
      for(const blade of blades){
        const bend=quiet?Math.sin(blade.phase)*7:grassLean(blade.x,pointerX,lean,time,blade.phase)
        const x=blade.x,y=blade.y,h=blade.height,tip=x+bend
        const tone=context!.createLinearGradient(x,y,x,y-h)
        tone.addColorStop(0,base);tone.addColorStop(.45,green);tone.addColorStop(1,blade.layer===2?light:green)
        context!.globalAlpha=.25+blade.layer*.17;context!.fillStyle=tone
        context!.beginPath();context!.moveTo(x-blade.width/2,y)
        context!.bezierCurveTo(x-3,y-h*.35,tip-8,y-h*.85,tip,y-h)
        context!.bezierCurveTo(tip+3,y-h*.7,x+blade.width/2+3,y-h*.3,x+blade.width/2,y)
        context!.closePath();context!.fill()
      }
      context!.globalAlpha=1
    }
    function tick(now:number){
      if(!visible||document.hidden||quiet){frame=0;return}
      frame=requestAnimationFrame(tick)
      if(now-last<32)return
      const elapsed=last?now-last:32;last=now;if(!started)started=now
      lean=easeGrass(lean,target,elapsed);target*=.93
      paint((now-started)/1000)
    }
    function resume(){if(visible&&!document.hidden&&!quiet&&!frame){last=0;frame=requestAnimationFrame(tick)}}
    function resize(){
      const rect=element!.getBoundingClientRect();width=rect.width;height=rect.height
      const ratio=Math.min(window.devicePixelRatio||1,1.75)
      surface!.width=Math.ceil(width*ratio);surface!.height=Math.ceil(height*ratio);context!.setTransform(ratio,0,0,ratio,0,0)
      blades=[]
      const count=Math.min(320,Math.max(110,Math.round(width/4.5)))
      for(let layer=0;layer<3;layer++)for(let index=0;index<count;index++){
        const seed=Math.sin(index*127.1+layer*311.7)*43758.5453,noise=seed-Math.floor(seed)
        blades.push({x:(index+.3+noise*.7)/count*width,y:height+12+layer*11,height:Math.min(height*.9,105+noise*180+layer*12),width:2+noise*5+layer,phase:index*.61+layer*2,layer})
      }
      paint(0)
    }
    const observer=new ResizeObserver(resize);observer.observe(element)
    const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(!visible&&frame){cancelAnimationFrame(frame);frame=0}else resume()},{rootMargin:'40px'})
    intersection.observe(element)
    const move=(event:PointerEvent)=>{if(event.pointerType==='touch'||quiet)return;const rect=element.getBoundingClientRect();pointerX=event.clientX-rect.left;if(previousX!==null)target=cursorImpulse(previousX,event.clientX);previousX=event.clientX;resume()}
    const leave=()=>{previousX=null;target=0}
    const visibility=()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0}else resume()}
    element.addEventListener('pointermove',move,{passive:true});element.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility)
    resize()
    return()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility)}
  },[paused,reducedMotion])
  return <footer ref={host} className="home-footer-meadow"><canvas ref={canvas} className="home-grass-canvas" aria-hidden="true" /><div className="home-grass-shade" aria-hidden="true" /><div className="home-footer home-container">{children}<div className="home-motion-control"><button type="button" onClick={toggleMotion} disabled={reducedMotion} aria-pressed={paused||reducedMotion} aria-label={reducedMotion?'Reduced motion is enabled':paused?'Resume homepage animations':'Pause homepage animations'}>{paused||reducedMotion?<Play className="size-3.5" aria-hidden="true" />:<Pause className="size-3.5" aria-hidden="true" />}{reducedMotion?'Reduced motion':paused?'Resume motion':'Pause motion'}</button></div></div></footer>
}
