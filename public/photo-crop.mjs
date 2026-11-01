// Source-pixel geometry shared by the focus preview and the actual scan image.
export function cropRect(width,height,xPercent=50,yPercent=50,sizePercent=45){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Invalid photo size');
  const clamp=(value,min,max,fallback)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
  const size=Math.max(1,Math.round(Math.min(width,height)*clamp(sizePercent,20,100,45)/100));
  const x=Math.round(Math.max(0,Math.min(width-size,width*clamp(xPercent,0,100,50)/100-size/2)));
  const y=Math.round(Math.max(0,Math.min(height-size,height*clamp(yPercent,0,100,50)/100-size/2)));
  return {x,y,size};
}
