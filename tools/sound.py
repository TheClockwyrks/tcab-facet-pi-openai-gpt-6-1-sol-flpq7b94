"""One-time original audio and live-particle production; never run by npm build."""
import json, subprocess, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TMP=Path('/tmp/facet-sound'); TMP.mkdir(exist_ok=True)
OUT=ROOT/'public/assets'; (OUT/'audio').mkdir(parents=True,exist_ok=True); (OUT/'fx').mkdir(exist_ok=True)
def call(tool,c,*args):
    subprocess.run([tool,'--config',str(c),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def config(name,tool,duration):
    c=TMP/(name+'.config.json')
    data=dict(sample_rate=22050,channels='stereo',max_duration_ms=duration,seed=42,actions=str(TMP/(name+'.json')),preview=str(TMP/(name+'.png')),wav=str(OUT/'audio'/(name+'.wav')))
    if tool=='music': data.update(instrument_bank='gm-lite',mid=str(OUT/'audio'/(name+'.mid')))
    if tool=='sfx-sample': data.update(sample_pack='combat-core')
    c.write_text(json.dumps(data)); call(tool,c,'init'); return c

def voice(c,name,freq,dur,start=0,gain=-20,wave='sine'):
    call('sfx-synth',c,'add-voice','--name',name,'--wave',wave,'--freq',freq,'--dur',dur,'--start',start,'--gain',gain)
    call('sfx-synth',c,'set-envelope','--voice',name,'--env','pluck')
for name,freq,dur in [('select',1200,95),('swap',620,150),('refuse',105,130),('land',75,180),('flaw',1850,95),('cut',1320,550),('levelup',660,700),('gameover',440,850)]+[(f'ladder-{i+1}',440*2**(i/12),350) for i in range(8)]:
    c=config(name,'sfx-synth',1400)
    voice(c,'body',freq,dur,gain=-19 if 'ladder' in name else -17,wave='triangle' if name in ['swap','refuse'] else 'sine')
    if name in ['flaw','land','refuse','swap']:
        voice(c,'grain',freq*2,60,gain=-28,wave='noise')
    else:
        voice(c,'overtone',freq*2.76,dur*.65,gain=-29)
        call('sfx-synth',c,'add-fm','--voice','body','--modulator',2.78,'--index',.7)
        call('sfx-synth',c,'add-reverb','--size',.35,'--mix',.15)
    if name=='swap': call('sfx-synth',c,'set-pitch','--voice','body','--slide-to',1000,'--over',120)
    if name=='gameover':
        for i,n in enumerate([392,330,220]): voice(c,f'n{i}',n,450,180+i*180)
    if name=='levelup':
        for i,n in enumerate([830,990,1320]): voice(c,f'n{i}',n,500,120+i*130)
    call('sfx-synth',c,'render')
c=config('shatter','sfx-sample',900)
call('sfx-sample',c,'add-sample','--name','debris_glass','--t',0,'--gain',-18,'--trim','0,650','--fade-out',180)
call('sfx-sample',c,'add-sample','--name','snap_transient','--t',0,'--gain',-26,'--pitch',-4)
call('sfx-sample',c,'render')
# Two 8-bar pieces in D minor: title's answering hook and an unhurried play ostinato.
for name,tempo in [('title',96),('play',76)]:
    c=config(name,'music',int(32*60000/tempo))
    call('music',c,'set-tempo','--bpm',tempo)
    for track,instrument,gain,pan in [('melody','music_box',-17,-.22),('harmony','vibraphone',-25,.25),('bass','marimba',-23,0)]:
        call('music',c,'define-track','--name',track,'--instrument',instrument)
        call('music',c,'set-track-fx','--track',track,'--gain',gain,'--pan',pan,'--reverb',.25)
    chords=[[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64]]
    hook=[74,77,81,77,76,74,72,69,74,77,79,77,76,72,69,72]
    for bar in range(8):
        ch=chords[bar%4]
        for n in ch[1:]: call('music',c,'add-note','--track','harmony','--pitch',n,'--t',bar*4,'--dur',3.8,'--velocity',55)
        for beat in [0,2]: call('music',c,'add-note','--track','bass','--pitch',ch[0],'--t',bar*4+beat,'--dur',1.7,'--velocity',66)
        if name=='title':
            for j in range(4): call('music',c,'add-note','--track','melody','--pitch',hook[(bar*2+j)%len(hook)],'--t',bar*4+j*.75,'--dur',.8,'--velocity',72+(j%2)*8)
        else:
            for j in range(3): call('music',c,'add-note','--track','melody','--pitch',ch[1+j]+12,'--t',bar*4+j*1.25,'--dur',1.25,'--velocity',52)
    call('music',c,'render')
for name,count,speed,size,color in [('clear',12,55,3,'#9fe7dc'),('flawed',28,110,5,'#ffe5aa'),('cut',24,85,3,'#fff4cc'),('aura',0,13,2,'#e4d39a')]:
    c=TMP/(name+'.particle.json')
    c.write_text(json.dumps(dict(width=192,height=192,duration_ms=1200,fps=30,seed=42,actions=str(TMP/(name+'.p.json')),preview=str(TMP/(name+'.gif')),system=str(OUT/'fx'/(name+'.json')))))
    call('particle-2d',c,'init')
    call('particle-2d',c,'add-emitter','--name','sparks','--shape','disc','--x',0,'--y',0,'--radius',24 if name=='aura' else 5,*(['--rate',9] if name=='aura' else ['--burst',count]),'--lifetime',800 if name=='aura' else 500,'--lifetime-spread',150,'--speed',speed,'--speed-spread',speed*.4,'--cone-angle',180)
    call('particle-2d',c,'set-particle','--emitter','sparks','--size-from',size,'--size-to',0,'--opacity-from',.8,'--opacity-to',0,'--color-gradient',color+'@0,#ffffff@0.3,'+color+'@1','--rotation',180)
    call('particle-2d',c,'set-forces','--gravity',-55 if name!='aura' else 0,'--drag',1.5)
    if name=='aura': call('particle-2d',c,'set-timeline','--loop','true')
    call('particle-2d',c,'render','--frame',8,'--out',str(TMP/(name+'-particle.png')))
print('Soundtrack, cues and particle systems rendered.')
