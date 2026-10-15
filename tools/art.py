"""One-time original Facet pixel-art production. Requires draw and draw-sheet.
Not part of the build. All rasterization goes through the drawing tools.
"""
import os, json, math, subprocess, colorsys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/gems'
TMP = Path('/tmp/facet-art')
TMP.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

def run(tool, config, *args):
    subprocess.run([tool, '--config', str(config), *args], check=True, stdout=subprocess.DEVNULL)

def raster(name, pixels, w=64, h=64, sheet=False):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    ops=[]
    for y in range(h):
        x=0
        while x<w:
            c=pixels.get((x,y))
            end=x+1
            while end<w and pixels.get((end,y))==c: end+=1
            if c: ops.append(dict(op='fill_rect',x=x,y=y,width=end-x,height=1,color=c))
            x=end
    log=TMP / (name.replace('/','-')+'.json')
    log.write_text(json.dumps(ops))
    conf=TMP / 'config.json'
    if sheet:
        frame=int(target.stem.split('-')[-1])
        conf.write_text(json.dumps(dict(width=w,height=h,background='#00000000',frames=[frame],actions=str(log).replace(f'{frame}.png.json','{frame}.png.json'),preview=str(target))))
        run('draw-sheet',conf,'render','--actions',str(log),'--out',str(target),'--width',str(w),'--height',str(h),'--no-layers')
    else:
        conf.write_text(json.dumps(dict(width=w,height=h,background='#00000000',actions=str(log),preview=str(target))))
        run('draw',conf,'render','--actions',str(log),'--out',str(target),'--width',str(w),'--height',str(h),'--no-layers')

def inside(x,y,poly):
    return all((poly[(i+1)%len(poly)][0]-p[0])*(y-p[1])-(poly[(i+1)%len(poly)][1]-p[1])*(x-p[0])>=0 for i,p in enumerate(poly))

shapes=[[(20,7),(43,7),(56,20),(56,43),(43,56),(20,56),(7,43),(7,20)],[(32,4),(56,18),(56,44),(32,59),(7,44),(7,18)],[(32,4),(56,48),(8,48)],[(15,9),(48,9),(56,17),(56,47),(48,55),(15,55),(7,47),(7,17)],[(32,3),(52,30),(32,60),(12,30)],[(24,5),(40,5),(53,15),(59,32),(53,49),(40,58),(24,58),(11,49),(5,32),(11,15)],[(32,3),(51,17),(51,46),(32,60),(13,46),(13,17)]]
hues=[.965,.075,.145,.415,.49,.615,.755]
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst']

def gem(k,strain=0,turn=0):
    poly=shapes[k] if k<7 else shapes[1]
    if k==7:
        poly=[(32+(x-32)*(.78+.18*math.cos(turn)),y) for x,y in poly]
    inner=[(32+(x-32)*.55,31+(y-31)*.55) for x,y in poly]
    pix={}
    for y in range(64):
        for x in range(64):
            if not inside(x,y,poly): continue
            edge=not all(inside(x+dx,y+dy,poly) for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
            a=math.atan2(y-31,x-32)
            sector=int((a+math.pi)*len(poly)/(2*math.pi))
            v=[.72,.53,.64,.8,.96,.88,.68,.57,.6,.75][sector%10]
            if inside(x,y,inner): v=.73+(x+y)/450
            # Layered cut facets and small inset sheen; no smooth gradients.
            if abs((x-32)*.6+(y-31))<1 and inside(x,y,inner): v=.99
            if edge: v=.38 if y>32 else .98
            hue=hues[k] if k<7 else (sector/len(poly)+turn*.07)%1
            sat=.67 if k<7 else .24
            if inside(x,y,inner): sat*=.78
            r,g,b=colorsys.hsv_to_rgb(hue,sat,v)
            pix[x,y]='#%02x%02x%02xff'%(int(r*255),int(g*255),int(b*255))
    # Pixel-sized polished reflection.
    for x,y in [(22,17),(23,17),(24,17),(22,18),(22,19)]:
        if (x,y) in pix: pix[x,y]='#f2fff1ff'
    cracks=[[(31,9),(28,23),(35,30),(29,43)],[(35,30),(45,34),(49,46)],[(29,43),(36,51),(33,58)],[(28,23),(18,28),(12,25)]]
    for line in cracks[:strain if strain<3 else 4]:
        for (ax,ay),(bx,by) in zip(line,line[1:]):
            n=max(abs(bx-ax),abs(by-ay))
            for i in range(n+1):
                x=round(ax+(bx-ax)*i/n); y=round(ay+(by-ay)*i/n)
                for dx,c in [(0,'#07161fff'),(1,'#d1ffddff' if strain<3 else '#fff0b3ff')]:
                    if (x+dx,y) in pix: pix[x+dx,y]=c
    if strain==3:
        for (x,y) in list(pix):
            if not all((x+dx,y+dy) in pix for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]): pix[x,y]='#ffe0a0ff'
    return pix

for k,name in enumerate(names+['prism']):
    for strain in range(4): raster(f'{name}-{strain}.png',gem(k,strain))
    base=gem(k,2)
    for f in range(7):
        pix={}
        for (x,y),color in base.items():
            a=math.atan2(y-31,x-32)
            sector=int((a+math.pi)*6/(2*math.pi))
            theta=(sector+.5)*math.pi/3-math.pi
            d=f*f*.75
            xx=round(x+math.cos(theta)*d); yy=round(y+math.sin(theta)*d+f*f*.18)
            if 0<=xx<64 and 0<=yy<64 and (x+y+sector)%13!=f: pix[xx,yy]=color[:-2]+('%02x'%max(0,255-f*32))
        raster(f'break/{name}/{f}.png',pix,sheet=True)
for strain in range(4):
    for f in range(12): raster(f'prism-turn/{"" if strain==0 else str(strain)+"-"}{f}.png',gem(7,strain,f*math.pi/6),sheet=True)
for name in ['brilliant','star']:
    pix={}
    for y in range(64):
        for x in range(64):
            dx=x-32; dy=y-32
            if name=='brilliant':
                d=abs(dx)+abs(dy)
                on=24<=d<=26 or (abs(dx)<=1 and abs(dy)<8) or (abs(dy)<=1 and abs(dx)<8)
            else:
                a=(math.atan2(dy,dx)+math.pi/8)%(math.pi/4)-math.pi/8; r=math.hypot(dx,dy)
                bound=9+16*(1-abs(a)/(math.pi/8))
                on=bound-2.3<=r<=bound or (r<6 and (abs(dx)<=1 or abs(dy)<=1))
            if on: pix[x,y]='#fff2baff'
    raster(f'{name}.png',pix)
# Hand-built hammered brass surround, inset wells, rivets and engraved corners.
pix={}; w=608; h=608
for y in range(h):
    for x in range(w):
        d=min(x,y,w-1-x,h-1-y)
        c=None
        if d<4: c=['#182d32ff','#a38b58ff','#4a5143ff','#273b3dff'][d]
        elif d<14: c='#263d40ff' if (x+y)%4 else '#2b4243ff'
        elif d<17: c=['#13292fff','#b69a5dff','#37504cff'][d-14]
        else:
            cx=(x-16)%72; cy=(y-16)%72
            c='#10282eff' if (x//72+y//72)%2 else '#122b31ff'
            if cx==0 or cy==0: c='#1d383dff'
            if cx==1 or cy==1: c='#0d2128ff'
        pix[x,y]=c
for ax in [8,599]:
    for ay in [8,599]:
        for dy in range(-3,4):
            for dx in range(-3,4):
                if dx*dx+dy*dy<=9: pix[ax+dx,ay+dy]='#c5ae76ff' if dx+dy<0 else '#615b40ff'
raster('frame.png',pix,w,h)
print('Original gem collection rendered.')
