import { describe,it,expect } from 'vitest';
function luminance(hex) { const rgb=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]; }
function ratio(a,b) { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(values[0]+.05)/(values[1]+.05); }
describe('design palette contrast',()=>{
  it.each([
    ['body','#252923','#faf8f3'],['secondary','#596052','#faf8f3'],['burgundy link','#821d32','#faf8f3'],
    ['light text on burgundy','#fff9ee','#821d32'],['footer','#d6ddcf','#243b32'],
    ['published badge','#2d4f30','#e3eddd'],['review badge','#62420c','#f5e6c8'],['approved badge','#24445e','#dfe9f1']
  ])('%s text reaches 4.5:1',(_,foreground,background)=>expect(ratio(foreground,background)).toBeGreaterThanOrEqual(4.5));
  it.each([
    ['light-surface focus','#176cbd','#faf8f3'],['dark-surface focus','#fff9ee','#821d32'],['footer focus','#fff9ee','#243b32'],['form boundaries','#88847e','#ffffff'],['action boundaries','#777a70','#faf8f3']
  ])('%s reaches 3:1',(_,foreground,background)=>expect(ratio(foreground,background)).toBeGreaterThanOrEqual(3));
});
