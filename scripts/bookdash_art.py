"""New SVG artwork for the complete Book Dash adaptations, using pic's soft palette.

Original artists are credited in the manifests. These are new compositions, not
copies of the source illustrations. Each drawer corresponds to a reviewed spread.
"""


def drawers(primitives):
    for name in ('rect', 'ellipse', 'circle', 'path', 'line', 'group', 'tag', 'tree',
                 'flower', 'cloud', 'outdoors', 'room', 'window', 'star', 'rain_marks'):
        globals()[name] = primitives[name]
    return {
        'bd-come-back-cat': cat_story, 'bd-a-house-for-mouse': mouse_story,
        'bd-amazing-daisy': daisy_story, 'bd-a-tiny-seed': wangari_story,
        'bd-sleepy-mr-sloth': sloth_story, 'bd-little-ants-big-plan': ant_story,
        'bd-tortoise-finds-his-home': tortoise_story,
        'bd-whose-button-is-this': button_story, 'bd-hippo-wants-to-dance': hippo_story,
        'bd-what-is-it': mystery_story,
    }


COLORS = {'cat': '#d9a77c', 'mouse': '#b8b6a3', 'dog': '#7c7b76', 'parrot': '#9db898',
          'fish': '#e4b47a', 'chicken': '#f1d188', 'sparrow': '#ad967c', 'swallow': '#7f9eac',
          'sloth': '#baa68a', 'giraffe': '#d9bb7e', 'snake': '#9fb899', 'bird': '#85acb3',
          'tortoise': '#a7b185', 'hippo': '#b6a7b6', 'donkey': '#b5afa2', 'meerkat': '#bda17d',
          'elephant': '#9bb6ad', 'monkey': '#bda88b', 'owl': '#b5b5a0', 'buck': '#d3ba91'}


def crit(kind, x, y, scale=1, mood='happy', angle=0, wings=False):
    """Consistent, rounded characters; rotate and pose are part of the composition."""
    c = COLORS[kind]
    b = ''
    if kind in ('cat', 'mouse', 'dog', 'monkey'):
        b += path('M47 58Q138 50 105-38', stroke=c, width=15)
    if kind == 'giraffe':
        b += rect(-22, -150, 43, 190, c, 20)
        b += circle(-12, -93, 12, '#b99865') + circle(13, -32, 10, '#b99865')
    if kind == 'snake':
        b += path('M-95 72Q-12 133 30 72T100 20Q150-22 65-70', stroke=c, width=32)
    elif kind == 'tortoise':
        b += ellipse(0, 53, 96, 68, '#8fa27d')
        for xx, yy in [(-36, 27), (26, 14), (53, 65), (-11, 75)]:
            b += ellipse(xx, yy, 26, 22, '#afbd91', stroke='#839773', stroke_width=3)
        b += ellipse(-64, 114, 23, 13, c) + ellipse(64, 114, 23, 13, c)
    else:
        b += ellipse(0, 48, 58 if kind not in ('hippo', 'elephant') else 82, 72, c)
        b += ellipse(-34, 113, 25, 13, c) + ellipse(34, 113, 25, 13, c)
        if wings or kind in ('parrot', 'chicken', 'sparrow', 'swallow', 'bird', 'owl'):
            if wings:
                b += path('M-33 25Q-155-81-119 18Q-120 75-43 61M33 25Q155-81 119 18Q120 75 43 61', c)
            else:
                b += ellipse(-43, 40, 19, 44, '#e6d1ac' if kind=='chicken' else '#b8c4ab', transform='rotate(-18 -43 40)')
                b += ellipse(43, 40, 19, 44, '#e6d1ac' if kind=='chicken' else '#b8c4ab', transform='rotate(18 43 40)')
        else:
            b += path('M-45 22Q-87 42-69 77M45 22Q87 42 69 77', stroke=c, width=18)
    hy = -140 if kind=='giraffe' else -35
    h = ''
    if kind in ('cat', 'owl'):
        h += path('M-54-16L-54-91L-9-61L12-61L54-91L54-16Z', c)
    elif kind in ('mouse', 'monkey'):
        h += circle(-46, -60, 29, c) + circle(46, -60, 29, c)
        h += circle(-46, -60, 17, '#dfbeb0') + circle(46, -60, 17, '#dfbeb0')
    elif kind in ('dog', 'donkey', 'buck', 'giraffe', 'hippo'):
        if kind in ('donkey', 'buck', 'giraffe'):
            h += ellipse(-33, -87, 15, 37, c) + ellipse(33, -87, 15, 37, c)
        else:
            h += ellipse(-47, -48, 20, 34 if kind=='dog' else 20, c) + ellipse(47, -48, 20, 34 if kind=='dog' else 20, c)
    if kind=='chicken':
        h += circle(-20, -74, 15, '#cf9384') + circle(0, -85, 17, '#cf9384') + circle(21, -75, 15, '#cf9384')
    h += ellipse(0, -17, 62 if kind not in ('hippo','elephant') else 76, 57, c)
    if kind=='sloth':
        h += ellipse(0, -18, 50, 43, '#e9d9b9')
        h += ellipse(-24, -26, 18, 12, '#978778', transform='rotate(-22 -24 -26)')
        h += ellipse(24, -26, 18, 12, '#978778', transform='rotate(22 24 -26)')
    if kind=='elephant':
        h += ellipse(-67, -10, 31, 46, c) + ellipse(67, -10, 31, 46, c)
        h += group(path('M24-3Q129-5 118 96Q110 138 75 108', stroke=c, width=30), 'elephant-trunk')
    if kind=='giraffe':
        h += group(path('M-22-66v-38m44 38v-38',stroke='#b69b6b',width=10)
                   +circle(-22,-106,9,'#b69b6b')+circle(22,-106,9,'#b69b6b')
                   +ellipse(0,9,34,19,'#e6d2a1'),'giraffe-horns-and-muzzle')
    if kind in ('hippo','donkey'):
        h += ellipse(0, 12, 62, 29, '#c6b7bf' if kind=='hippo' else '#d9ceba')
        h += circle(-24, 10, 4, '#807578') + circle(24, 10, 4, '#807578')
    if mood=='sleep':
        h += path('M-34-25q11 9 21 0M13-25q11 9 21 0', stroke='#62584f', width=4)
    else:
        h += circle(-23, -25, 4.5, '#62584f') + circle(23, -25, 4.5, '#62584f')
    if kind in ('parrot','fish','chicken','sparrow','swallow','bird','owl'):
        h += path('M-10-5L0 13L20-4Z', '#d5a86b')
    elif kind not in ('hippo','elephant','donkey'):
        h += ellipse(0, -8, 6, 4, '#a27e70')
    if mood=='sad':
        h += path('M-12 21q12-12 24 0', stroke='#826a5b', width=3)
        h += path('M-29-13Q-45 5-30 10Q-15 6-29-13', '#9fc4cc')
    elif mood=='surprised':
        h += ellipse(0, 18, 9, 13, '#9d7b71')
    elif mood!='sleep':
        h += path('M-10 17q10 10 20 0', stroke='#826a5b', width=3)
    if kind=='cat':
        h += path('M-44-2l-29-8m29 20-31 3M44-2l29-8m-29 20 31 3', stroke='#a98769', width=2)
        h += path('M-22-66l8 15M0-70v16M22-66l-8 15', stroke='#bd8f68', width=6)
    b += group(h, kind+'-face', transform=f'translate(0 {hy+35})')
    if kind=='cat':b+=path('M-27 37l20 10m-19 14 20 9M27 37 7 47m19 14L6 70',stroke='#bd8f68',width=6)
    if kind=='elephant':b+=path('M28 72l20 23-30-2', '#e0d7bb')
    if kind=='buck':b+=group(path('M-24-77l-25-80m12 38-23-7m20-1 6-23M24-77l25-80m-12 38 23-7m-20-1-6-23',stroke='#aa9476',width=7),'buck-antlers')
    return group(b,kind,transform=f'translate({x} {y}) rotate({angle}) scale({scale})',data_expression=mood)


def person(x,y,s=1,adult=False,mood='happy',arms='down',scarf=False):
    skin='#98765c'; dress='#8fada4' if adult else '#d9b675'
    b=ellipse(-30,116,23,12,'#826e5d')+ellipse(30,116,23,12,'#826e5d')
    b+=path('M-42 20L-62 102Q0 126 62 102L42 20Z',dress)
    if arms=='up':b+=path('M-36 31l-56-64M36 31l56-64',stroke=skin,width=18)
    elif arms=='reach':b+=path('M-36 31l-42 47M36 31l59 15',stroke=skin,width=18)
    else:b+=path('M-36 31l-22 58M36 31l22 58',stroke=skin,width=18)
    b+=circle(0,-28,55,skin)+path('M-53-27Q-68-103 0-95Q67-99 53-24L31-60Q-4-40-32-60Z','#5e544b')
    if scarf:b+=path('M-56-35Q-73-106 0-102Q75-102 56-35L23-64-22-48Z','#97ad83')+ellipse(53,-70,24,20,'#a9ba8d')
    b+=circle(-20,-26,4,'#51483f')+circle(20,-26,4,'#51483f')+path('M-10-2q10 11 20 0',stroke='#5f4b40',width=3)
    return group(b,'wangari-adult' if adult else 'child',transform=f'translate({x} {y}) scale({s})')


def book(x,y,s=1):
    b=path('M0 0Q-74-41-149-12V93Q-67 62 0 105Q67 62 149 93V-12Q74-41 0 0Z','#fff7e2',stroke='#ad9877',width=5)
    b+=line(0,3,0,98,'#d0c4a8',3)
    b+=''.join(path(f'M{side*22} {yy}q{side*42}-14 {side*96}-4',stroke='#d4c9af',width=3) for side in (-1,1) for yy in (24,44,64))
    return group(b,'open-book',transform=f'translate({x} {y}) scale({s})')


def butterfly(x,y,s=1):
    return group(ellipse(-13,-8,17,23,'#e2b6a9')+ellipse(13,-8,17,23,'#efcf8e')+line(0,-20,0,22,'#8c8b70',4),'butterfly',transform=f'translate({x} {y}) scale({s})')


def snail(x,y,s=1):
    return group(ellipse(0,17,58,14,'#b8c4a1')+circle(-7,-10,31,'#d2b995')+path('M-10-24q32 7 12 26q-27 8-23-14q9-11 18 0',stroke='#a78d70',width=4)+path('M36 10l4-30m8 32 8-30',stroke='#94a082',width=4)+circle(40,-22,4,'#6d745e')+circle(56,-20,4,'#6d745e'),'snail',transform=f'translate({x} {y}) scale({s})')


def ladybug(x,y,s=1):
    return group(ellipse(0,0,20,27,'#ca8f79')+line(0,-23,0,24,'#786e5a',3)+circle(0,-25,10,'#786e5a')+circle(-9,-5,4,'#786e5a')+circle(10,10,4,'#786e5a'),'ladybug',transform=f'translate({x} {y}) scale({s})')


def feather(x,y,s=1):
    return group(ellipse(0,0,13,38,'#e8d5b1',transform='rotate(24)')+line(-10,30,12,-30,'#bfa98a',2),'feather',transform=f'translate({x} {y}) scale({s})')


def sofa():
    return group(rect(245,320,715,310,'#d7bf9f',75)+rect(275,343,655,170,'#e7d5b8',48)+rect(282,520,642,98,'#f1e3c7',35)+rect(210,460,95,210,'#cfb28f',30)+rect(914,460,95,210,'#cfb28f',30)+rect(286,663,30,55,'#ad9274',8)+rect(900,663,30,55,'#ad9274',8),'sofa')


def basket(x=620,y=590,empty=False):
    return group(ellipse(x,y-10,178,63,'#b89b73')+ellipse(x,y-8,157,48,'#f4e6c4')+path(f'M{x-175} {y}q13 126 175 126q162 0 175-126Q{x} {y+100} {x-175} {y}', '#c8b08b')+''.join(path(f'M{x+dx} {y+53}v48',stroke='#a89171',width=4) for dx in (-110,-65,-20,25,70,115)),'empty-basket' if empty else 'basket')


def extras_cat(x,y,s=1):
    return group(snail(x,y,s)+feather(x+80*s,y-70*s,.8*s)+path(f'M{x-100*s} {y+50*s}q{-60*s} {-30*s} {-20*s} {-65*s}',stroke='#b4a0ba',width=5),'cat-souvenirs')


def cat_story(n):
    if n in (0,1,2,3,8,9,10,11):s=room('playroom')
    else:s=outdoors()
    if n==0:return s+sofa()+crit('cat',630,660,1.1,angle=-88)+circle(250,720,26,'#b5cbd0')
    if n==1:return s+basket()+crit('cat',610,551,.95)
    if n==2:return s+group(rect(390,90,370,530,'#b7ced2',20)+''.join(path(f'M{x} 108q-22 160 0 485',stroke='#9abac3',width=9) for x in (435,500,565,630,695)),'curtain')+crit('cat',600,290,1.2,angle=-20)
    if n==3:return s+group(rect(380,120,390,560,'#b89e7b',16)+rect(405,140,340,530,'#d5e6d6',8)+path('M405 140L601 200V670L405 670Z','#e5ceaa')+circle(570,420,10,'#ae9875'),'open-door')+crit('cat',780,570,.95,angle=14)+basket(210,590,True)
    if n==4:return s+flower(750,675,1.4)+flower(420,685,.9,'#e9b3a4')+crit('cat',580,475,1.2,angle=28)+butterfly(790,340,1.3)+butterfly(375,405,.85)
    if n==5:return s+group(line(250,220,1020,220,'#b29d7e',6)+rect(240,180,20,450,'#b79c7c',5)+rect(1010,180,20,450,'#b79c7c',5)+path('M540 230h72v113h49v50H540Z','#c4b1cd')+path('M570 395q10 90 140 128',stroke='#b8a2bd',width=5),'sock-and-clothesline')+crit('cat',770,525,1.1,angle=-25)
    if n==6:return s+crit('cat',470,510,1.3,angle=20)+snail(755,655,1.45)+path('M550 620q170 90 42-100q-55-70-5-112',stroke='#b4a0ba',width=5)
    if n==7:return s+crit('cat',420,530,1.1)+crit('chicken',825,510,1.3,wings=True)+extras_cat(465,555,.65)
    if n==8:return s+rect(315,120,360,540,'#b99f7c',18)+rect(340,145,310,510,'#d5e2c7',10)+crit('cat',590,540,1.25)+extras_cat(645,565,.8)+feather(770,340)
    if n==9:return s+basket()+crit('cat',620,566,.9,mood='sleep',angle=-65)+extras_cat(660,575,.65)
    if n==10:return s+basket(empty=True)+feather(570,587)+feather(690,580,.7)
    return s+sofa()+crit('cat',610,480,1,mood='sleep',angle=-80)+extras_cat(678,518,.7)


def dream_base(color):
    return rect(0,0,1200,800,'#f7efdc')+group(rect(90,65,1020,655,color,100)+cloud(128,710,.6)+cloud(1035,95,.5),'dream-frame')


def mouse_story(n):
    if n==0:return outdoors()+group(rect(700,325,270,270,'#e4c684',24)+path('M655 333L835 192L1015 333Z','#ba9c83')+rect(790,430,80,165,'#ad977a',15),'yellow-house')+crit('mouse',410,550,.8)+group(rect(353,570,42,50,'#a1bdc2',10),'mouse-travel-bag')
    if n==1:return room('playroom')+group(rect(370,100,420,550,'#d9c18d',18)+rect(400,130,360,500,'#6f8278',8)+path('M400 130L570 186V630L400 630Z','#e9d9ad'),'ajar-door')+crit('mouse',700,560,.8)
    if n==2:return room('playroom')+ellipse(660,650,300,70,'#bdced0')+crit('dog',750,485,1.5,angle=-15)+crit('mouse',375,570,.75)
    if n==3:return dream_base('#e7d7b4')+ellipse(640,598,350,75,'#b49d7c')+crit('mouse',590,370,1.4,angle=23)+path('M450 613q-40-90-92-23m463 13q43-98 78-39',stroke='#b49d7c',width=10)
    if n==4:return room('playroom')+group(line(560,320,910,320,'#b59875',20)+line(735,320,735,650,'#b59875',18)+ellipse(735,682,130,25,'#cbb697'),'bird-perch')+crit('parrot',735,204,1.2)+crit('mouse',425,565,.75)
    if n==5:return dream_base('#c5d8b9')+tree(300,690,1.5)+tree(940,660,1.7)+crit('mouse',580,490,1.4,mood='surprised')+crit('parrot',885,269,.75,wings=True)+group(path('M330 278q-58 55 0 107m25-91q-38 39 0 78M790 435q50 20 0 68',stroke='#b5a56f',width=9),'bird-noise')
    if n==6:return room('playroom')+group(rect(610,270,370,300,'#bdd7d6',38,stroke='#9dbac0',stroke_width=8)+rect(630,345,330,205,'#b5d4df',20)+crit('fish',800,440,.62,angle=80),'fish-tank')+crit('mouse',375,543,.8)
    if n==7:return dream_base('#b9d2dd')+crit('mouse',590,363,1.45,angle=-40,mood='surprised')+crit('fish',890,430,.7,angle=80)+group(''.join(path(f'M{x} 671q-60-105 0-230q40-100 8-151',stroke='#92b4a4',width=16) for x in (220,350,960)),'waterweed')+circle(750,190,24,'#e0ece8')+circle(820,138,15,'#e0ece8')
    if n==8:return room('playroom')+crit('mouse',570,620,.9,angle=18)+group(path('M265 683h140m-113-38h89',stroke='#d1bc91',width=7),'running-trail')
    if n==9:return room('playroom')+sofa()+group(rect(865,242,210,302,'#b9b7a5',25)+rect(889,270,162,240,'#7d8278',20)+path('M922 476q-40-87 25-145q-5 53 45 80q34 42-13 72Z','#efc181')+line(899,317,1043,317,'#a7a899',6)+line(899,375,1043,375,'#a7a899',6)+line(899,433,1043,433,'#a7a899',6),'enclosed-fireplace')+crit('mouse',340,354,.6)
    s=room('playroom')+group(rect(305,160,590,530,'#c5ab84',20)+rect(328,190,542,470,'#d9c69f',8)+rect(325,405,550,20,'#b69c79',4)+rect(325,640,550,20,'#b69c79',4),'bookshelf')
    for i,(xx,hh,col) in enumerate([(350,175,'#abc3c6'),(427,160,'#d9b388'),(710,190,'#acb69c'),(795,164,'#d2b2a2')]):s+=rect(xx,405-hh,65,hh,col,6)
    if n==10:return s+crit('mouse',590,335,.65)+rect(514,386,150,16,'#e6dabd',6)
    return s+rect(493,342,207,60,'#efe3c7',22)+crit('mouse',580,342,.66,mood='sleep',angle=-78)+star(625,250,16)


def coop(high=False):
    return group(rect(155,410 if not high else 315,340,250 if not high else 345,'#d5ba8d',20)+path('M110 420L325 252L540 420Z' if not high else 'M100 327Q320 0 550 327Z','#b9a388')+rect(265,490,110,170,'#857d6a',40),'round-house' if high else 'chicken-coop')


def flock(y=580):
    return ''.join(crit('chicken',xx,y,ss) for xx,ss in [(770,.65),(920,.73),(1050,.56)])


def daisy_story(n):
    if n in (4,10):s=rect(0,0,1200,800,'#dcecf1')+cloud(280,210,1.1)+cloud(900,535,1.1)+path('M0 725Q370 590 700 720T1200 680V800H0Z','#c5d3b1')
    else:s=outdoors()+coop(n==9)
    if n==0:return s+crit('chicken',660,520,1.25)+flower(870,687,.9)
    if n==1:return s+crit('chicken',560,485,1.2,wings=True)+flock()
    if n==2:return s+crit('chicken',605,490,1.45,wings=True)+crit('chicken',535,580,.74,mood='sad')+flock(650)
    if n==3:return s+crit('chicken',720,500,1.4,wings=True)+group(path('M500 476q-45-40-46-98M940 478q45-40 46-98',stroke='#b2c6b5',width=9),'wing-movement')
    if n==4:return s+group(ellipse(600,370,455,268,'#eef4e7')+crit('chicken',610,350,1.15,wings=True)+crit('sparrow',340,340,.6,wings=True)+crit('swallow',880,264,.7,wings=True),'imagined-flight')+cloud(510,715,.25)
    if n==5:return s+crit('chicken',755,530,1.3,angle=24,wings=True)+path('M663 386q-120-108-102-153',stroke='#b5bd9d',width=7)+ellipse(750,718,100,22,'#aaba91')
    if n==6:return s+crit('chicken',755,495,1.6,wings=True)+crit('chicken',590,600,.85,mood='sad')
    if n==7:return s+crit('chicken',625,320,1.1,wings=True,angle=12)+path('M505 349Q456 303 425 270',stroke='#b8c8b6',width=7)
    if n==8:return s+group(ellipse(560,674,150,40,'#ddc48a')+''.join(line(x,650,x+30,683,'#c9ad74',5) for x in (430,490,550,610,670)),'soft-straw')+crit('chicken',552,580,1.03,angle=43,mood='sad')+flock()
    if n==9:return s+crit('chicken',675,230,1.15,wings=True,angle=4)+group(path('M520 260q100 75 380 10M600 390q130 72 350-12',stroke='#c2d4d2',width=10),'lifting-wind')
    if n==10:return s+crit('chicken',615,330,1.5,wings=True)+crit('sparrow',300,420,.72,wings=True)+crit('swallow',940,270,.9,wings=True)
    return s+crit('chicken',220,320,.6,wings=True)+crit('chicken',330,285,.66,wings=True)+crit('chicken',445,320,.55,wings=True)+crit('chicken',850,210,1.05,wings=True)


def seedlings(x,y,count=4):
    s=''
    for i in range(count):
        xx=x+i*60
        s+=rect(xx-19,y,42,42,'#c1a17f',6)+path(f'M{xx+2} {y}v-48',stroke='#8eab7c',width=6)+ellipse(xx-10,y-30,17,9,'#aac495',transform=f'rotate(25 {xx-10} {y-30})')+ellipse(xx+15,y-48,17,9,'#a1bd8c',transform=f'rotate(-25 {xx+15} {y-48})')
    return group(s,'seedlings')


def field():
    return outdoors()+group(path('M170 720L380 470H910L1080 720Z','#c2ac86')+''.join(line(250+i*130,705,420+i*80,485,'#a99072',9) for i in range(6)),'vegetable-field')


def wangari_story(n):
    if n==0:return field()+group(path('M250 390L600 105L940 390Z','#b7c5bb')+path('M513 174L600 105L685 180L625 160L580 180Z','#fff3db'),'mount-kenya')+person(680,500,1.2,True)+person(485,565,.75)
    if n==1:return field()+person(580,530,.95,arms='reach')+group(ellipse(710,659,10,7,'#a17f59')+ellipse(750,643,9,6,'#a17f59')+path('M280 644l110-23 13 16-116 30Z','#b1bbb5')+line(263,652,290,644,'#927a5c',15),'seeds-and-laid-down-machete')+seedlings(790,580,2)
    if n==2:return rect(0,0,1200,800,'#f0d6ba')+circle(935,245,70,'#e9bc89')+path('M0 450Q400 370 1200 450V800H0Z','#b1bf9b')+group(path('M0 650Q450 480 1200 650V800H0Z','#a8c4ca'),'river')+group(rect(380,575,460,35,'#bd9d79',8)+line(400,530,820,530,'#b29875',10)+line(400,520,400,630,'#b29875',10)+line(820,520,820,630,'#b29875',10),'footbridge')+person(660,468,.7)+ellipse(752,540,48,25,'#b2936b')+seedlings(730,518,1)
    if n==3:return outdoors()+group(rect(660,282,350,290,'#d9c6a2',18)+path('M610 295L835 150L1060 295Z','#b89d83')+rect(800,405,80,167,'#a5b9b0',10),'school')+person(510,543,.7)+person(350,518,.95)+rect(435,540,50,60,'#99b7c2',12)+person(125,540,.67,True)
    if n==4:return room('desk')+person(590,445,1.2)+rect(290,565,620,45,'#c4a47c',14)+book(590,543,1.1)+group(ellipse(535,554,38,21,'#a6bfad')+ellipse(665,557,29,32,'#b3c8b5'),'world-map')+group(path('M920 230l40-7 8-28 10 0 7 25 40-8-30 17 16 18-10 3-22-15-40 7Z','#fff8e8'),'airplane')
    if n==5:return room('desk')+person(450,450,1.25,True)+rect(200,595,760,45,'#c3a57f',12)+seedlings(650,540,3)+group(circle(754,386,66,'#dce8db',fill_opacity='.4',stroke='#a7b7a5',stroke_width=10)+line(800,432,867,500,'#a7b7a5',15),'magnifier')+group(ellipse(1010,200,130,116,'#eef1dc')+tree(1010,260,.65)+person(970,240,.25)+person(1050,240,.25),'childhood-memory')
    if n==6:return room('desk')+person(490,470,1.3,True)+book(510,578,.85)+''.join(rect(285,640-i*33,185,28,col,5) for i,col in enumerate(['#a3b9ae','#c4b290','#b2c6cd','#d6b4a1']))+group(ellipse(900,230,190,140,'#eef2df')+tree(880,285,.75)+path('M755 262L900 140L1030 262Z','#b8c6b2'),'home-memory')
    if n==7:return rect(0,0,1200,800,'#e8e3cd')+path('M0 400H1200V800H0Z','#c5b58c')+group(''.join(rect(x,560,65,48,'#a98e70',9)+ellipse(x+32,560,32,10,'#ddc8a0') for x in (220,480,900)),'tree-stumps')+person(550,520,1.05,True)+person(830,550,.9,True)+group(ellipse(941,650,65,28,'#b59a74')+path('M890 641q45-110 97 0',stroke='#b59a74',width=8),'empty-firewood-basket')+''.join(line(50,y,1160,y-40,'#ad9b78',4) for y in (725,765))
    if n==8:return field()+person(320,455,1.2,True,arms='reach',scarf=True)+person(595,495,1,True)+person(825,505,.95,True)+person(1020,500,1,True)+seedlings(475,640,5)+group(rect(175,630,100,30,'#d6bd8a',8)+circle(194,641,9,'#bda16c'),'seed-tray')
    if n==9:return outdoors()+path('M520 800Q660 605 790 505Q850 450 1020 410L1100 430Q900 490 855 560Q730 680 720 800Z','#a6c8cd')+tree(320,555,1.3)+tree(555,525,1.05)+tree(825,480,.65)+seedlings(200,715,6)
    if n==10:return outdoors()+person(600,410,1.65,True,scarf=True)+group(circle(600,500,46,'#dfc078')+circle(600,500,32,'#ead59d')+path('M575 464l-22-65m72 65 22-65',stroke='#bac5a3',width=10)+path('M584 500l13 14 24-29',stroke='#b49a63',width=5),'peace-prize-medal')
    return outdoors()+tree(595,650,2.15)+person(265,592,.65)+person(925,550,.95,True,arms='reach')+seedlings(800,670,3)+flower(340,735,.65)


def branch(y=470,side=0):
    s=rect(0,0,1200,800,'#deebe6')+tree(110,800,2.8)+tree(1110,800,2.8)
    s+=group(path(f'M{-50 if side==0 else 1250} {y+80}Q590 {y-20} {1100 if side==0 else 100} {y}',stroke='#ad9172',width=38)+''.join(ellipse(x,y-25,65,26,'#b0c59c',transform=f'rotate(-24 {x} {y-25})') for x in (240,850,990)),'sleeping-branch')
    return s


def bee(x,y,s=1):
    return group(ellipse(-10,-20,16,22,'#edf2e3')+ellipse(12,-20,16,22,'#edf2e3')+ellipse(0,0,29,20,'#dbc381')+line(-8,-16,-8,16,'#94856a',6)+line(8,-16,8,16,'#94856a',6)+circle(25,-3,3,'#6e6758'),'bee',transform=f'translate({x} {y}) scale({s})')


def hive(x=900,y=235):
    return group(ellipse(x,y,80,110,'#d4b982')+''.join(path(f'M{x-65} {y+i}q65 18 130 0',stroke='#bca16f',width=5) for i in (-40,0,40))+ellipse(x+14,y+42,20,23,'#9b8a69'),'beehive')


def sloth_story(n):
    if n==0:return outdoors()+crit('sloth',620,500,1.55,mood='surprised')+group(path('M430 330q-50-70-10-95M805 330q50-70 10-95',stroke='#b9c8b3',width=6),'yawn-marks')
    if n==1:return branch(380)+crit('sloth',590,436,1.3,angle=155)+path('M420 565q150 120 330-25',stroke='#c2d0be',width=8)
    if n==2:return branch(525)+crit('sloth',410,460,1.15)+ellipse(900,440,30,60,'#d9bb7e')
    if n==3:return branch(540)+crit('giraffe',860,610,1.2)+crit('sloth',420,400,1.25,angle=-25,mood='surprised')
    if n==4:return branch(470,1)+crit('sloth',445,405,1.1)+hive()+bee(755,303,.7)+bee(1030,350,.65)
    if n==5:return branch(500,1)+crit('sloth',380,420,1.2,mood='surprised')+hive(830,230)+''.join(bee(x,y,.8) for x,y in [(655,380),(780,450),(1010,360),(980,190),(650,210)])
    if n==6:return branch(470)+crit('sloth',390,400,1.1)+group(path('M680 459q170-110 270-20',stroke='#9fb899',width=32),'snake-tail-hint')
    if n==7:return branch(530)+crit('sloth',430,420,1.3,mood='surprised')+crit('snake',820,437,1.4,mood='surprised')
    if n==8:return branch(440,1)+crit('sloth',440,370,1.1)+group(line(857,345,857,420,'#b49772',7)+line(900,345,900,420,'#b49772',7)+ellipse(882,320,85,48,'#b0c59c'),'hidden-bird-feet')
    if n==9:return branch(490,1)+crit('sloth',410,420,1.2,mood='surprised')+crit('bird',850,365,1.1,wings=True)+group(path('M970 275q60 30 0 60m25-100q90 60 0 120',stroke='#b8bd9e',width=7),'loud-bird-call')
    if n==10:return branch(365)+crit('sloth',635,292,1.25)+cloud(330,180,.6)+cloud(870,145,.7)
    return branch(320)+crit('sloth',600,250,1.15,mood='sleep',angle=-70)+crit('bird',930,257,.7,mood='sleep')+crit('snake',365,478,.7,mood='sleep')+crit('giraffe',930,685,.8,mood='sleep')+hive(225,385)+bee(200,540,.55)


def ant(x,y,s=1,glasses=False,queen=False,arms=False):
    b=ellipse(0,65,40,45,'#b08c71')+circle(0,10,29,'#ba9678')+circle(0,-39,40,'#c3a17f')
    b+=path('M-23-71l-20-31m66 31 20-31',stroke='#9a7b64',width=5)
    for side in (-1,1):
        for yy in (14,43,70):b+=path(f'M{side*25} {yy}l{side*45} {-24 if arms else 20}l{side*12} 23',stroke='#a6866d',width=7)
    b+=circle(-14,-40,4,'#65594b')+circle(14,-40,4,'#65594b')+path('M-10-17q10 12 20 0',stroke='#806953',width=3)
    if glasses:b+=circle(-17,-41,17,'none',stroke='#798f8a',stroke_width=5)+circle(17,-41,17,'none',stroke='#798f8a',stroke_width=5)+line(-2,-41,2,-41,'#798f8a',5)
    if queen:b+=path('M-30-78L-33-113L-9-98L0-126L14-99L34-115L30-78Z','#dfc580')
    return group(b,'ant-queen' if queen else 'ant-reader' if glasses else 'ant',transform=f'translate({x} {y}) scale({s})')


def food(x,y,s=1,bun=False):
    b=ellipse(0,20,70,23,'#ddbf80')+ellipse(0,-3,68,16,'#b39a77')+path('M-64-10q64-88 128 0Z','#e3c48a')
    if not bun:b+=path('M-65 6l25-8 30 12L20 1l34 10 10-5',stroke='#a6b17e',width=8)
    return group(b,'food-bun' if bun else 'food-burger',transform=f'translate({x} {y}) scale({s})')


def underground():
    return rect(0,0,1200,800,'#cfbfa0')+group(rect(110,90,980,620,'#eddfbc',150)+rect(915,190,180,230,'#baa786',70),'underground-store')


def ant_story(n):
    if n in (2,4,9,10):s=underground()
    else:s=outdoors(night=n==8)
    if n==0:return s+book(505,550,1.8)+ant(510,429,.9,True)+ant(900,580,.65)+food(910,485,.6)
    if n==1:return s+rect(170,470,800,240,'#d8c0be',38)+person(420,375,.9)+book(510,520,.9)+ant(605,539,.24,True)+ant(840,650,.34)+food(840,595,.3)
    if n==2:return s+ant(350,440,1.1)+ant(820,440,1.1)+ant(585,520,.8,True)+ant(975,575,.5)
    if n==3:return s+group(''.join(ellipse(x,y,44,20,col,transform=f'rotate({i*23} {x} {y})') for i,(x,y,col) in enumerate([(350,680,'#d6b482'),(710,520,'#d5c093'),(960,650,'#bd9d79')])),'autumn-leaves')+ant(460,600,.75)+ant(820,620,.7)+group(path('M400 500q65-40 90 10q-30 70-85 0','#e0c7a3')+line(449,481,466,460,'#9a856a',6),'apple-core')+ellipse(1015,735,90,30,'#ae977b')
    if n==4:return s+ant(630,320,1.2,queen=True)+''.join(ant(x,570,.65) for x in (260,440,810,970))
    if n==5:return s+ant(435,530,1.1,True,arms=True)+group(ellipse(810,260,240,170,'#f7edcf')+rect(655,210,310,120,'#b0c2b2',12)+rect(680,275,260,15,'#b19a78',5)+food(805,244,.8),'restaurant-plan')
    if n==6:return rect(0,0,1200,800,'#efdbc1')+circle(965,400,76,'#e3bc88')+path('M0 575Q600 420 1200 580V800H0Z','#b5c29c')+''.join(ant(230+i*170,650-i*40,.6,i==0) for i in range(5))
    if n==7:return s+group(rect(610,270,440,350,'#e4c99c',24)+rect(655,390,110,230,'#9bb6ac',12)+rect(810,390,190,125,'#b8d0ce',12)+rect(790,560,240,15,'#b79e7b',5)+food(900,544,.4),'restaurant')+ant(375,560,.8,True,arms=True)+ant(180,635,.55)
    if n==8:return s+''.join(ant(230+i*220,620-i*22,.65,i==0)+food(230+i*220,512-i*22,.5,bun=i%2==0) for i in range(4))
    if n==9:return s+''.join(food(220+i*170,610-j*70,.7,(i+j)%2==0) for i in range(5) for j in range(2))+ant(750,330,1,queen=True)+ant(540,350,.8,True,arms=True)+group(line(585,378,691,373,'#ba9678',12)+ellipse(640,375,15,10,'#c3a17f'),'ant-handshake')
    if n==10:return s+ant(400,480,1.15)+ant(680,480,1.15)+ant(540,530,.68,True)+ant(875,550,.55)+group(path('M451 510Q500 466 540 524M629 510Q580 466 540 524',stroke='#ba9678',width=15),'family-hug')
    return s+book(610,570,1.65)+ant(500,440,.9,True)+ant(720,467,.7)+line(555,466,676,488,'#b08c71',11)


def riders(count):
    s=snail(490,456,.68) if count>=1 else ''
    if count>=2:s+=crit('sparrow',620,402,.45)
    if count>=3:s+=ladybug(713,480,.65)
    if count>=4:s+=crit('mouse',789,425,.46)
    return s


def wind():
    return group(path('M180 300q280-120 480 5t340-10M280 650q180-80 470 0M440 200q180-80 330-8',stroke='#b0c7c8',width=9)+ellipse(270,400,32,12,'#c5b58b',transform='rotate(35 270 400)')+ellipse(920,610,33,12,'#c8b68c',transform='rotate(-30 920 610)'),'strong-wind')


def walking_tortoise():
    b=ellipse(475,669,55,25,'#a7b185')+ellipse(785,669,55,25,'#a7b185')
    b+=group(path('M390 640Q390 365 630 365Q855 365 865 640Z','#92a582')
             +''.join(ellipse(x,y,53,42,'#afbd96',stroke='#879b79',stroke_width=4)
                      for x,y in [(515,465),(645,420),(756,486),(612,563)]),'tortoise-shell')
    b+=group(ellipse(899,605,91,55,'#afbd96')+circle(932,585,6,'#66755a')
             +path('M935 619q22 14 35-3',stroke='#879b79',width=4),'tortoise-head')
    return group(b,'tortoise')


def tortoise_story(n):
    s=outdoors(rain=n>=8)
    if n<10:s+=walking_tortoise()
    if n==0:return s+snail(320,680,1.1)
    if n==1:return s+riders(1)+flower(920,690,.7)
    if n==2:return s+riders(1)+group(line(810,280,1060,280,'#b49a79',16),'bird-branch')+crit('sparrow',930,200,.75)
    if n==3:return s+riders(1)+crit('sparrow',850,330,.65,wings=True)+path('M980 236Q1050 420 730 438',stroke='#b6c7b7',width=6)
    if n==4:return s+riders(2)+flower(960,610,1.7)+ladybug(960,497,.85)
    if n==5:return s+riders(3)+group(path('M240 365q180-60 300 0M750 300q140-40 250 0',stroke='#bcd0c5',width=6),'gentle-breeze')
    if n==6:return s+riders(3)+crit('mouse',945,588,.7)+group(''.join(flower(865+i*40,692-(i%2)*15,.32,'#f4ead1') for i in range(5)),'daisy-chain')
    if n==7:return s+riders(4)+wind()
    if n==8:return s+riders(4)+wind()+group(path('M810 100l-40 95 50-10-35 90 90-130-50 9 30-54Z','#f2e7bb'),'distant-lightning')
    if n==9:return s+wind()+snail(305,400,.8)+crit('sparrow',815,270,.6,wings=True)+ladybug(930,420,.8)+crit('mouse',320,555,.6,angle=-28)
    # No exposed head or legs on the final two pages: the shell is the discovered home.
    s+=group(path('M370 615Q365 330 620 330Q875 330 870 615Z','#92a582')+ellipse(620,615,253,49,'#809375')+''.join(ellipse(x,y,55,43,'#afbd96',stroke='#879b79',stroke_width=4) for x,y in [(530,430),(664,405),(760,470),(586,526)]),'closed-tortoise-shell')
    if n==10:return s+snail(295,695,.75)+crit('sparrow',940,585,.5)+ladybug(960,700,.6)+crit('mouse',195,590,.55)
    return s+group(ellipse(620,641,195,34,'#e5d4a6')+snail(468,628,.6)+crit('sparrow',563,602,.38)+ladybug(666,631,.48)+crit('mouse',755,602,.4),'friends-sheltering')


def robot(x,y,s=1,holding=True,angle=0):
    b=rect(-44,-80,88,77,'#a7c3c3',19)+rect(-48,10,96,100,'#a7c3c3',20)+line(0,-82,0,-110,'#9cb1aa',6)+circle(0,-114,9,'#d8be80')
    b+=circle(-19,-45,7,'#617a79')+circle(19,-45,7,'#617a79')+rect(-17,-23,34,6,'#7f9690',3)
    b+=path('M-48 30l-34 40 37 18M48 30l34 40-37 18',stroke='#91aaa7',width=16)+rect(-39,111,22,39,'#8ba39e',7)+rect(17,111,22,39,'#8ba39e',7)
    if holding:b+=button(0,65,.65)
    return group(b,'little-robot',transform=f'translate({x} {y}) rotate({angle}) scale({s})')


def button(x,y,s=1):
    return group(circle(0,0,46,'#a5c0d2')+circle(0,0,35,'none',stroke='#8faabd',stroke_width=4)+''.join(circle(xx,yy,5,'#eaf0e7') for xx,yy in [(-10,-10),(10,-10),(-10,10),(10,10)]),'blue-button',transform=f'translate({x} {y}) scale({s})')


def street():
    return rect(0,0,1200,800,'#dcebf0')+group(rect(20,110,290,340,'#e6d9ba',20)+rect(340,175,220,275,'#c2d0c6',16)+rect(820,100,340,350,'#dcc8b5',20)+''.join(rect(x,y,48,63,'#b2c8ce',8) for x in (80,175,400,885,1000) for y in (220,330)),'street-houses')+rect(0,450,1200,350,'#c1c4bb')+rect(0,600,1200,200,'#e8deca')+line(0,601,1200,601,'#b0b3a6',12)


def signal(red=False):
    col='#d19e8f' if red else '#9ab99d'
    return group(rect(820,115,160,220,'#7b8a82',26)+rect(885,335,25,320,'#9aa99d',8)+circle(900,165,19,col)+path('M900 196v63m-35-37 35-26 35 26m-35 37-26 42m26-42 26 42',stroke=col,width=14),'red-signal' if red else 'green-signal')


def doll(x,y,s=1,complete=False):
    b=path('M-46 15L-70 115H70L46 15Z','#d8b7ba')+circle(0,-37,57,'#ead6b6')+path('M-52-49Q-50-113 7-101Q58-99 57-37M-50-43l-25 65M50-43l25 65',stroke='#ad8e70',width=15)
    b+=button(-21,-43,.25)
    b+=button(21,-43,.25) if complete else group(path('M12-51l18 17m0-17-18 17',stroke='#b0927c',width=3),'missing-button-eye')
    b+=path('M-11-6q11 12 22 0',stroke='#a68a76',width=3)+path('M-48 34l-43 54M48 34l43 54',stroke='#ead6b6',width=17)+ellipse(-35,128,25,13,'#b79f90')+ellipse(35,128,25,13,'#b79f90')
    return group(b,'rag-doll',transform=f'translate({x} {y}) scale({s})')


def shoe():
    return group(path('M230 120H540L580 370Q950 420 930 580H165Q90 468 210 330Z','#cd9f8c')+path('M175 584H930V620H165Z','#efe2c5')+path('M410 190l180 135m-170-60 190 130',stroke='#e9d4b4',width=14),'large-red-shoe')


def bench():
    return group(rect(300,495,650,48,'#c8ae88',12)+rect(285,340,680,38,'#d5bd99',8)+rect(285,402,680,38,'#d5bd99',8)+rect(330,536,28,136,'#ad9779',8)+rect(895,536,28,136,'#ad9779',8),'street-bench')


def button_story(n):
    s=street()
    if n==0:return s+robot(500,540,1.15,False)+button(760,680,1)+path('M780 590q45 0 35 55',stroke='#b3c8c5',width=6)
    if n==1:return s+robot(610,470,1.5)+path('M390 713h90m-120-38h65',stroke='#c9ba9b',width=6)
    if n==2:return s+shoe()+robot(982,590,.72)
    if n==3:return s+shoe()+group(path('M447 230Q850 100 870 428',stroke='#e9d4b4',width=11),'swinging-shoelace')+robot(850,402,.95,angle=23)
    if n in (4,5):return s+signal(n==5)+robot(530,510,1.25)
    if n==6:return s+robot(390,550,1.2)+crit('dog',900,520,1.25)
    if n==7:return s+crit('dog',750,450,1.9,angle=-20)+robot(455,566,.94)+group(circle(410,535,9,'#b3d0d3')+circle(450,550,7,'#b3d0d3')+path('M600 486q-50 0-65 31',stroke='#d3a99b',width=20),'friendly-dog-lick')
    if n in (8,9):
        s+=group(''.join(rect(100+i*160,455,90,150,'#f7efdf',5) for i in range(6)),'pedestrian-crossing')+robot(560,665,.75)
        if n==9:s+=group(rect(680,340,430,150,'#9cb8ba',32)+path('M740 340l55-95h170l87 95Z','#b8cdd0')+circle(775,490,38,'#8d9388')+circle(1020,490,38,'#8d9388'),'passing-car')+group(path('M710 576q-160-170-270-130m270 130q-70-170-40-220',stroke='#aacbd0',width=11),'puddle-splash')
        return s
    s+=bench()
    if n==10:return s+robot(350,565,.85)+doll(760,408,.95)
    if n==11:return s+robot(450,470,1.15,False)+button(620,485,.7)+doll(800,396,1.15)
    return s+robot(485,398,.95,False)+doll(760,390,1.05,True)+line(539,466,672,475,'#b2c8c0',12)


def millipede(x,y,s=1):
    b=''.join(circle(-65+i*21,0,19,'#aeaa86')+line(-65+i*21,14,-72+i*21,36,'#888a6b',4) for i in range(6))
    b+=circle(63,-8,26,'#b8b493')+circle(69,-15,4,'#687158')+path('M65-29l5-25m5 27 19-21',stroke='#909477',width=4)
    return group(b,'millipede',transform=f'translate({x} {y}) scale({s})')


def grasshopper(x,y,s=1):
    b=ellipse(0,0,40,19,'#9db58b')+circle(38,-17,20,'#b7c99c')+circle(43,-21,4,'#66765c')+path('M-22 11l-30 37 48-13M12 12l20 34 20-20M40-36l7-22',stroke='#7e9b70',width=6)
    return group(b,'grasshopper',transform=f'translate({x} {y}) scale({s})')


def hippo_story(n):
    s=outdoors(puddle=n in (2,3,6,7))
    if n==0:return s+crit('hippo',610,460,1.7,angle=-8,wings=True)+group(cloud(370,700,.45,'#d8c9a9')+cloud(870,690,.5,'#d8c9a9'),'dust-clouds')
    if n==1:return s+crit('hippo',790,450,1.5)+millipede(400,650,1.9)
    if n==2:return s+group(ellipse(605,635,380,104,'#accdd0'),'river-water')+crit('hippo',605,515,1.45,angle=-65)+group(path('M300 520q-50-110-90-80M920 520q70-100 110-110',stroke='#b1d0d2',width=12),'splashing-water')
    if n==3:return s+crit('hippo',510,630,1.1)+group(line(720,270,1090,320,'#b49b7b',19),'river-branch')+crit('bird',895,220,.9)+circle(975,380,15,'#a9c9d0')
    if n==4:return s+crit('hippo',625,450,1.65,angle=24,wings=True)+group(path('M340 650q240 110 500-20',stroke='#c3d1b8',width=8),'twirling-motion')
    if n==5:return s+crit('hippo',340,450,1.4,angle=-15)+crit('meerkat',720,430,1.05)+group(ellipse(930,680,155,60,'#a9c7c8')+rect(780,625,300,63,'#bed5d0',28)+''.join(crit('meerkat',850+i*70,601,.35) for i in range(3))+circle(865,651,14,'#f0f4df')+circle(975,646,17,'#f0f4df'),'meerkat-bath')
    if n==6:return s+ellipse(640,675,340,65,'#bba98d')+crit('hippo',620,560,1.6,angle=83)+group(circle(295,580,12,'#bba98d')+circle(915,550,17,'#bba98d'),'mud-splashes')
    if n==7:return s+crit('hippo',350,560,1.2)+crit('donkey',825,470,1.45)+group(rect(720,535,86,100,'#a3bdc1',14)+rect(910,535,86,100,'#a3bdc1',14)+path('M730 535q30-80 66 0M920 535q30-80 66 0',stroke='#91a7a7',width=7),'water-buckets')
    if n==8:return s+ellipse(620,670,210,70,'#b9b9a5')+crit('hippo',620,465,1.6,mood='sad')+grasshopper(880,690,1)
    if n==9:return s+crit('hippo',400,470,1.5,mood='sad')+group(path('M600 470q-22 45 0 48q22-3 0-48M895 575q-21 43 0 46q21-3 0-46','#a7c9d0'),'tear-drops')+grasshopper(775,560,1.7)+path('M670 650q45-80 100-35',stroke='#c7cdb2',width=7)
    if n==10:return s+crit('hippo',490,420,1.6,angle=-12,wings=True)+grasshopper(830,520,1.7)+crit('donkey',1020,500,.6)+crit('bird',250,360,.5)
    return s+crit('hippo',570,410,1.35,angle=10,wings=True)+grasshopper(810,650,1.3)+millipede(260,640,1)+crit('bird',880,290,.65,wings=True)+crit('meerkat',230,440,.75,angle=-16)+crit('donkey',1000,450,1,angle=15)


def mystery_animal(kind,x,y,s=1):
    b=crit(kind,x,y,s)
    if kind=='elephant':b+=group(path('M-50 65L-165 30L-138 57L-183 68L-135 79L-159 103L-46 96Z','#9bb6ad'),'crocodile-tail',transform=f'translate({x} {y}) scale({s})')
    if kind=='owl':b+=group(ellipse(x,y+55*s,48*s,60*s,'#d9dbbf'),'woolly-tummy')
    return b


def baby(x,y,s=1,sneeze=False):
    b=ellipse(0,45,75,40,'#e6d2b3')+ellipse(-55,71,30,15,'#b98f72')+ellipse(58,71,30,15,'#b98f72')+circle(0,-17,55,'#b98f72')+path('M-18-67q30-35 39-4',stroke='#6e5a48',width=6)
    b+=path('M-31-23q9 9 18 0M12-23q9 9 18 0',stroke='#6e5a48',width=4) if sneeze else circle(-22,-22,4,'#62513f')+circle(22,-22,4,'#62513f')
    b+=ellipse(0,8,9,12,'#967160') if sneeze else path('M-10 9q10 13 20 0',stroke='#967160',width=3)
    return group(b,'human-baby',transform=f'translate({x} {y}) scale({s})')


def shadow(x=900,y=590,s=1):
    return group(ellipse(x,y,80*s,118*s,'#b3b8ac')+circle(x,y-135*s,46*s,'#b3b8ac')+ellipse(x-52*s,y+115*s,22*s,28*s,'#b3b8ac')+ellipse(x+52*s,y+115*s,22*s,28*s,'#b3b8ac'),'mysterious-shadow')


def mystery_story(n):
    s=outdoors()
    if n==0:return s+shadow(910,520,.65)+mystery_animal('elephant',280,470,1)+crit('monkey',480,560,.75)+mystery_animal('owl',655,560,.65)
    if n in (1,2,3):return s+shadow(930,525,.8)+mystery_animal(['elephant','monkey','owl'][n-1],450,455,1.7)
    if n==4:return s+shadow(930,530,.8)+crit('buck',350,470,1.4)+crit('buck',590,595,.65)
    if n==5:return s+shadow(970,540,.72)+crit('elephant',370,425,1.25)+tree(520,690,1.8)
    if n==6:return s+shadow(980,510,.75)+crit('monkey',390,490,1.2,mood='surprised')+crit('owl',650,560,.85,mood='surprised')
    if n==7:return s+shadow(790,595,.7)+baby(630,455,1.6,True)+group(path('M395 400l-80-25m80 65-85 10M840 410l95-19',stroke='#b4cac8',width=7),'sneeze-puffs')
    if n==8:return s+crit('elephant',270,420,1.2,mood='surprised',angle=-18)+crit('monkey',640,530,1,mood='surprised',angle=-22)+crit('owl',980,450,.9,mood='surprised',wings=True)
    if n==9:return s+shadow(825,610,.9)+baby(675,510,1.2)+crit('monkey',270,390,.8,mood='surprised',angle=-25)+crit('buck',1020,460,.85,mood='surprised')
    if n==10:return s+crit('buck',230,450,1.3)+crit('buck',535,555,.75)+baby(840,570,1.2)
    return s+crit('buck',525,510,1.12)+baby(735,540,1.23)+crit('owl',240,520,.6)+crit('monkey',970,520,.65)+flower(620,735,.6)
