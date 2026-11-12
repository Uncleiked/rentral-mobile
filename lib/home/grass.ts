export function cursorImpulse(previousX:number,currentX:number):number { return Math.max(-85,Math.min(85,(currentX-previousX)*1.5)) }
export function grassLean(x:number,pointerX:number,impulse:number,time:number,phase:number):number {
  const distance=Math.abs(x-pointerX),influence=Math.exp(-distance/220)
  return Math.sin(time*.8+phase)*4+Math.sin(time*.35+phase*.6)*3+impulse*(.25+.75*influence)
}
export function easeGrass(current:number,target:number,elapsed:number):number{return current+(target-current)*(1-Math.exp(-Math.min(Math.max(elapsed,0),64)/110))}
