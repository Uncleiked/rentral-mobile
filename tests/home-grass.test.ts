import { describe,expect,it } from 'vitest'
import { cursorImpulse,easeGrass,grassLean } from '@/lib/home/grass'
describe('cursor-driven footer grass',()=>{
 it('bends left or right with actual pointer travel and caps fast gestures',()=>{expect(cursorImpulse(100,120)).toBe(30);expect(cursorImpulse(120,100)).toBe(-30);expect(cursorImpulse(0,10000)).toBe(85);expect(cursorImpulse(10000,0)).toBe(-85)})
 it('concentrates the response around the pointer without reversing direction',()=>{expect(grassLean(100,100,40,0,0)).toBe(40);expect(grassLean(100,100,-40,0,0)).toBe(-40);expect(grassLean(1000,100,40,0,0)).toBeLessThan(12)})
 it('settles smoothly and bounds large animation frame gaps',()=>{expect(easeGrass(0,40,32)).toBeGreaterThan(0);expect(easeGrass(0,40,32)).toBeLessThan(40);expect(easeGrass(0,40,10000)).toBe(easeGrass(0,40,64));expect(easeGrass(10,0,-1)).toBe(10)})
})
