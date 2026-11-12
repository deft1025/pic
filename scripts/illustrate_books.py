#!/usr/bin/env python3
"""Draw storybooks from their page-by-page storyboards, without changing text or audio."""
import argparse
import hashlib
import importlib.util
from html import escape
import json
import math
from pathlib import Path
import re
import tempfile
import textwrap

ROOT = Path(__file__).resolve().parents[1]
ART_VERSION = 'story-art-v2'
CONFIG = ROOT / 'config/illustrations.json'


def tag(name, content='', **attrs):
    a = ' '.join(f'{k.replace("_", "-")}="{escape(str(v), quote=True)}"' for k, v in attrs.items())
    return f'<{name} {a}>{content}</{name}>'


def group(content, name='', **attrs):
    if name:
        attrs['data_object'] = name
    return tag('g', content, **attrs)


def rect(x, y, w, h, color, r=0, **attrs):
    return tag('rect', x=x, y=y, width=w, height=h, rx=r, fill=color, **attrs)


def ellipse(x, y, rx, ry, color, **attrs):
    return tag('ellipse', cx=x, cy=y, rx=rx, ry=ry, fill=color, **attrs)


def circle(x, y, r, color, **attrs):
    return tag('circle', cx=x, cy=y, r=r, fill=color, **attrs)


def path(d, color='none', stroke=None, width=5, **attrs):
    if stroke:
        attrs.update(stroke=stroke, stroke_width=width, stroke_linecap='round', stroke_linejoin='round')
    return tag('path', d=d, fill=color, **attrs)


def line(x1, y1, x2, y2, color, width=5, **attrs):
    return path(f'M{x1} {y1}L{x2} {y2}', stroke=color, width=width, **attrs)


def star(x, y, size=24, color='#ffdf86'):
    points = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = size if i % 2 == 0 else size * .46
        points.append(f'{x + math.cos(a) * r:.1f},{y + math.sin(a) * r:.1f}')
    return group(tag('polygon', points=' '.join(points), fill=color), 'star')


def moon(x=980, y=140, size=64):
    return group(circle(x, y, size + 22, '#fff3c7', opacity='.14') + circle(x, y, size, '#ffefbd')
                 + circle(x - 19, y - 13, size * .12, '#eddaa9', opacity='.6')
                 + circle(x + 25, y + 21, size * .16, '#eddaa9', opacity='.45'), 'moon')


def cloud(x, y, s=1, color='#fffdf4'):
    return group(ellipse(0, 0, 98, 29, color) + circle(-42, -21, 36, color) + circle(17, -36, 48, color)
                 + circle(60, -14, 32, color), 'cloud', transform=f'translate({x} {y}) scale({s})')


def flower(x, y, s=1, color='#f3c95e'):
    petals = ''.join(ellipse(math.cos(i * math.pi / 3) * 22, -55 + math.sin(i * math.pi / 3) * 22,
                            16, 19, color) for i in range(6))
    return group(path('M0 0V-54', stroke='#709c78', width=7)
                 + path('M0-9Q-39-38-36-8Q-17 5 0-9M0-24Q38-54 38-24Q22-13 0-24', '#93b886')
                 + petals + circle(0, -55, 15, '#be9257'), 'flower',
                 transform=f'translate({x} {y}) scale({s})')


def tree(x, y, s=1, bare=False):
    trunk = path('M-15 4L-9-224L20-224L17 4Z', '#ab8464')
    limbs = path('M1-110L-57-180M7-150L66-219M6-190L-25-246', stroke='#ab8464', width=15)
    leaves = '' if bare else (circle(-45, -214, 67, '#9db997') + circle(30, -254, 75, '#aac49d')
                              + circle(71, -193, 60, '#a6bd94') + circle(-7, -162, 68, '#b5cba5'))
    return group(trunk + limbs + leaves, 'tree', transform=f'translate({x} {y}) scale({s})')


def outdoors(night=False, rain=False, stars=0, puddle=False):
    sky = '#677994' if night else '#dce5e5' if rain else '#dcecf1'
    s = rect(0, 0, 1200, 800, sky)
    if rain:
        s += cloud(250, 130, 1.15, '#c7d7d8') + cloud(810, 185, 1.2, '#c7d7d8')
    elif not night:
        s += circle(1000, 135, 58, '#f9dfa0') + cloud(250, 145, .9) + cloud(770, 220, .65)
    else:
        s += moon()
        positions = [(145, 120), (350, 220), (620, 90), (770, 290), (1100, 320), (120, 370), (460, 100)]
        s += ''.join(star(*positions[i % len(positions)], 10) for i in range(stars))
    s += path('M0 510Q220 387 450 505Q800 350 1200 480V800H0Z', '#adc5a0' if not night else '#8fa596')
    s += path('M0 625Q370 494 650 590Q990 494 1200 590V800H0Z', '#c6d3ac' if not night else '#a4b49b')
    s += tree(110, 610, 1.45) + tree(1110, 565, 1.2)
    s += path('M250 800Q500 568 780 553Q620 682 720 800Z', '#eaddb8' if not night else '#c6c4aa')
    if puddle:
        s += ellipse(610, 695, 170, 30, '#a9ccd2') + ellipse(590, 690, 102, 10, '#d6e6e6')
    if rain:
        s += rain_marks()
    return group(s, 'forest')


def rain_marks():
    return group(''.join(line(x, y, x - 11, y + 30, '#a2bec8', 4, opacity='.7')
                         for x in range(180, 1100, 105) for y in [125, 260, 395]), 'rain')


def window(x=840, y=100, w=240, h=270, night=False, sunset=False):
    sky = '#71829b' if night else '#f5c2a0' if sunset else '#cee6ed'
    s = rect(x - 15, y - 15, w + 30, h + 30, '#d7b994', 28) + rect(x, y, w, h, sky, 18)
    if night:
        s += moon(x + w * .68, y + h * .3, 29)
    else:
        s += circle(x + w * .68, y + h * .4, 34, '#ffe5ad') + cloud(x + w * .3, y + h * .7, .35)
    s += line(x + w / 2, y, x + w / 2, y + h, '#fbf3df', 12)
    s += line(x, y + h * .52, x + w, y + h * .52, '#fbf3df', 12)
    s += rect(x - 29, y + h - 4, w + 58, 23, '#bd9777', 7)
    return group(s, 'window')


def room(kind='bedroom', night=False, sunset=False):
    wall = {'bedroom': '#f4e9d5', 'kitchen': '#f5ebd4', 'playroom': '#e8eee0',
            'desk': '#f4e8d8', 'bathroom': '#e1eeea'}[kind]
    s = rect(0, 0, 1200, 800, wall) + rect(0, 555, 1200, 245, '#d9c4a0')
    s += rect(0, 545, 1200, 18, '#cbb28f')
    s += ''.join(line(0, y, 1200, y, '#c7af8d', 2, opacity='.45') for y in [620, 700, 780])
    s += ellipse(600, 683, 404, 87, '#e9dcc1')
    if kind != 'bathroom':
        s += window(night=night, sunset=sunset)
    if kind == 'playroom':
        s += rect(80, 190, 185, 230, '#d3bb92', 14)
        for y in [265, 350]:
            s += rect(84, y, 177, 12, '#bca27e')
        for i in range(5):
            s += rect(105 + i * 25, 216, 19, 47, ['#e6a796', '#89b1b2', '#e2c36f'][i % 3], 3)
        s += ellipse(600, 660, 375, 85, '#c4d7cc')
    if kind == 'kitchen':
        s += group(rect(65, 320, 245, 255, '#89aaa3', 18) + rect(53, 308, 270, 24, '#bd9876', 6)
                   + rect(100, 402, 175, 123, '#6c7772', 14) + rect(115, 418, 145, 91, '#bd9b72', 8)
                   + circle(117, 365, 12, '#f4d480') + circle(244, 365, 12, '#f4d480'), 'oven')
        s += rect(390, 155, 200, 20, '#bb9877', 6)
        s += circle(445, 139, 22, '#ece0b9') + rect(500, 110, 40, 43, '#e6b4a0', 10)
    if kind == 'bathroom':
        for x in range(70, 1200, 130):
            s += line(x, 0, x, 545, '#cadbd5', 2)
        for y in [130, 260, 390]:
            s += line(0, y, 1200, y, '#cadbd5', 2)
    return group(s, kind)


def face(kind, mood='happy'):
    colors = {'rabbit': '#fff8e9', 'bear': '#c69970', 'fox': '#df9d70', 'hedgehog': '#dac4a5', 'frog': '#a0bd8f'}
    c = colors[kind]
    s = ''
    if kind == 'rabbit':
        s += ellipse(-25, -115, 18, 58, c, transform='rotate(-12 -25 -115)')
        s += ellipse(25, -115, 18, 58, c, transform='rotate(12 25 -115)')
        s += ellipse(-25, -116, 8, 40, '#edbeb0', transform='rotate(-12 -25 -116)')
        s += ellipse(25, -116, 8, 40, '#edbeb0', transform='rotate(12 25 -116)')
    if kind == 'bear':
        s += circle(-42, -80, 23, c) + circle(42, -80, 23, c)
        s += circle(-42, -80, 12, '#e2c2a0') + circle(42, -80, 12, '#e2c2a0')
    if kind == 'fox':
        s += path('M-51-47L-48-114L-8-75L12-75L49-114L52-40Z', c)
        s += path('M-40-76L-39-100L-19-80M25-81L40-101L41-76', '#f5d3bb')
    if kind == 'hedgehog':
        s += path('M-63 5L-76-15L-65-30L-82-49L-58-55L-63-77L-37-76L-29-99L-7-85L12-104L27-82L51-87L52-62L76-55L63-34L78-14L60 7Z', '#8d7768')
    if kind == 'frog':
        s += circle(-34, -77, 26, c) + circle(34, -77, 26, c)
    s += ellipse(0, -33, 57 if kind != 'frog' else 65, 54 if kind != 'frog' else 44, c)
    if kind == 'fox':
        s += path('M-51-34Q-25-51 0-17Q25-51 51-34Q42 11 0 22Q-42 11-51-34', '#fff2db')
    if kind == 'bear':
        s += ellipse(0, -9, 27, 19, '#ecd4b2')
    eyes = ''
    if mood in ['sleep', 'calm', 'yawn']:
        eyes = path('M-30-37q10 9 20 0M10-37q10 9 20 0', stroke='#584b42', width=4)
    elif mood == 'sad':
        eyes = path('M-31-42q9-9 19-1M12-43q10-8 20 1', stroke='#655346', width=4)
        eyes += circle(-20, -31, 3.5, '#514a43') + circle(21, -31, 3.5, '#514a43')
    else:
        eyes = circle(-22, -37, 4.5, '#514a43') + circle(22, -37, 4.5, '#514a43')
    s += eyes + ellipse(-37, -13, 11, 6, '#e7aa9b', opacity='.65') + ellipse(37, -13, 11, 6, '#e7aa9b', opacity='.65')
    s += ellipse(0, -20 if kind != 'frog' else -13, 6, 4, '#9d7264')
    if mood == 'angry':
        s += path('M-34-56L-11-48M11-48L34-56M-9 3q9-8 18 0', stroke='#655346', width=4)
    elif mood == 'sad':
        s += path('M-9 4q9-9 18 0', stroke='#79604f', width=3)
    elif mood in ['yawn', 'scared']:
        s += ellipse(0, 0, 10 if mood == 'scared' else 16, 12 if mood == 'scared' else 22, '#9c6d65')
    elif mood != 'sleep':
        s += path('M-10-2q10 13 20 0', stroke='#79604f', width=3)
    return group(s, f'{kind}-face', data_expression=mood)


def animal(kind, x, y, s=1, mood='happy', pose='stand', prop=None, rotate=0, adult=False):
    colors = {'rabbit': '#fff8e9', 'bear': '#b98e67', 'fox': '#d99060', 'hedgehog': '#907a69', 'frog': '#8fae85'}
    c = colors[kind]
    a = ''
    if kind == 'fox':
        a += path('M37 77Q124 1 124 83Q114 132 37 106Z', '#d99060')
        a += path('M109 37Q133 39 124 83Q119 100 104 108L90 90Z', '#fff0d6')
    if kind == 'hedgehog':
        a += ellipse(0, 44, 68, 76, '#907a69')
        a += path('M-59 21L-78 8L-67 44L-84 55L-59 71M59 21L78 8L67 44L84 55L59 71', '#907a69')
    a += ellipse(0, 56, 52, 63, c)
    if kind in ['bear', 'fox', 'frog']:
        a += ellipse(0, 60, 30, 41, '#e8d5ad' if kind != 'frog' else '#d6dfb3')
    if kind == 'rabbit':
        a += path('M-48 18Q0 37 48 18L40 62Q0 77-40 62Z', '#a1c4c7' if not adult else '#c4b0cd')
    if kind == 'bear':
        a += path('M-44 26Q0 42 44 26L39 59Q0 72-39 59Z', '#a8bd9a')
    if kind == 'fox':
        a += path('M-40 22Q0 41 40 22L34 42Q0 55-34 42Z', '#ddbd74')
    foot_y = 113 if pose != 'sit' else 105
    a += ellipse(-30, foot_y, 24, 13, c) + ellipse(30, foot_y - (8 if pose == 'walk' else 0), 24, 13, c)
    arms = {'open': ('M-39 37Q-91-7-106 16', 'M39 37Q91-7 106 16'),
            'reach': ('M-40 37Q-82 43-85 7', 'M40 37Q86 22 100-8'),
            'hold': ('M-40 37Q-75 78-13 78', 'M40 37Q75 78 13 78'),
            'yawn': ('M-40 37Q-63 5-21-3', 'M40 37Q72 60 44 83')}
    left, right = arms.get(pose, ('M-40 35Q-67 58-48 82', 'M40 35Q67 58 48 82'))
    a += path(left, stroke=c, width=22) + path(right, stroke=c, width=22)
    a += face(kind, mood)
    if prop == 'pillow':
        a += group(rect(-56, 44, 112, 65, '#efd7b0', 15) + path('M-44 53Q0 64 44 53M-44 99Q0 87 44 99', stroke='#d3b68d', width=2), 'pillow')
    if prop == 'boots':
        a += group(rect(-51, 95, 38, 28, '#d3ad59', 8) + rect(13, 88, 38, 28, '#d3ad59', 8), 'rain-boots')
    if prop == 'bandage':
        a += group(rect(-35, 80, 30, 13, '#f5dfbc', 4, transform='rotate(-15 -20 87)')
                   + rect(-25, 81, 9, 11, '#d5b48c', 2), 'bandage')
    return group(a, kind, transform=f'translate({x} {y}) rotate({rotate}) scale({s})')


def bed(x=480, y=400, sleeper='rabbit', mood='sleep', quilt='#a6c5c3', s=1):
    a = rect(-45, -60, 520, 265, '#bf9b78', 34) + rect(-25, -43, 480, 225, '#fff6de', 28)
    a += rect(5, -25, 190, 100, '#f0dfbd', 25)
    a += group(face(sleeper, mood), transform='translate(105 30) scale(.95)')
    a += rect(-18, 78, 470, 106, quilt, 20)
    a += ''.join(path(f'M{x0} 80q28 45 0 103', stroke='#e5eee0', width=3) for x0 in range(30, 440, 75))
    a += rect(-50, 157, 525, 32, '#c2a07b', 9) + rect(-35, 180, 30, 50, '#b38d69', 6) + rect(425, 180, 30, 50, '#b38d69', 6)
    return group(a, 'bed', transform=f'translate({x} {y}) scale({s})')


def table(x=600, y=610, w=700):
    return group(rect(x - w / 2 + 30, y + 20, 28, 135, '#b48c63', 9)
                 + rect(x + w / 2 - 58, y + 20, 28, 135, '#b48c63', 9)
                 + ellipse(x, y, w / 2, 55, '#c49b71') + ellipse(x, y - 10, w / 2, 48, '#eed7ac'), 'table')


def plate(x, y, full=False):
    a = ellipse(x, y, 78, 20, '#fff9e9') + ellipse(x, y, 55, 12, '#e3dcc2')
    if full:
        a += bread(x, y - 14, .5, sliced=True)
    return group(a, 'plate')


def bread(x, y, s=1, sliced=False):
    if sliced:
        a = path('M-52 22V-34Q-73-80 0-84Q73-80 52-34V22Z', '#c19352')
        a += path('M-41 13V-33Q-55-65 0-68Q55-65 41-33V13Z', '#f4d493')
        a += ''.join(circle(px, py, 3, '#d4ab6c') for px, py in [(-20, -28), (17, -46), (8, -5)])
    else:
        a = ellipse(0, 0, 105, 52, '#c08d4b') + ellipse(-4, -12, 99, 42, '#e6b663')
        a += ''.join(path(f'M{i}-43q-22 16-9 40', stroke='#c18b4e', width=7) for i in [-45, 0, 45])
    return group(a, 'bread-slice' if sliced else 'bread', transform=f'translate({x} {y}) scale({s})')


def carrots(x, y, s=1):
    a = ''
    for i in [-20, 15, 45]:
        a += path(f'M{i} 0q-34-26-40 2l25 72Z', '#df9a61')
        a += path(f'M{i-23}-13l-15-29m15 29l2-34m-2 34l16-28', stroke='#85a779', width=7)
    return group(a, 'carrots', transform=f'translate({x} {y}) scale({s})')


def berries(x, y, s=1, scattered=False):
    a = '' if scattered else ellipse(0, 20, 77, 25, '#f5e7c5')
    for px, py in [(-41, 0), (-17, -17), (11, -8), (36, 2), (1, 12)]:
        a += circle(px, py, 16, '#68769c') + ellipse(px - 3, py - 5, 5, 3, '#a4b0c7')
    return group(a, 'blueberries', transform=f'translate({x} {y}) scale({s})')


def blocks(x=600, y=590, level=4, fallen=False, wide=False):
    colors = ['#d7ae67', '#97b5b1', '#d9a491', '#aebc8f', '#b4a2c3']
    a = ''
    if fallen:
        for i, (px, py, rot) in enumerate([(-145, 0, -15), (-40, 20, 20), (75, -10, -28), (165, 25, 12), (-80, -70, 33)]):
            a += rect(px - 33, py - 62, 66, 66, colors[i], 8, transform=f'rotate({rot} {px} {py})')
    else:
        for row in range(level):
            count = max(1, 3 - row) if wide else 1
            for col in range(count):
                a += rect((col - (count - 1) / 2) * 76 - 35, -row * 68 - 65, 70, 65, colors[row % 5], 8)
        a += path(f'M-38 {-level*68}L0 {-level*68-54}L38 {-level*68}Z', '#c9a390')
    return group(a, 'fallen-blocks' if fallen else 'block-tower', transform=f'translate({x} {y})')


def nest(x, y):
    a = path('M-130 70Q0 29 130 58', stroke='#a48261', width=18)
    a += ellipse(0, 0, 81, 35, '#b6936e')
    a += ellipse(0, -7, 63, 23, '#e4caa2')
    a += ellipse(0, -25, 40, 30, '#91b0bc') + circle(26, -46, 23, '#a8c2c8')
    a += path('M44-47l25 9-25 8', '#d9b16b') + path('M14-48q9 8 17 0', stroke='#5a6770', width=3)
    for n in [-46, -14, 23, 50]:
        a += path(f'M{n-20} 5l37 11', stroke='#d7b68a', width=3)
    return group(a, 'bird-nest', transform=f'translate({x} {y})')


def leaf_umbrella(x, y, s=1):
    a = path('M-155 0Q-22-170 160-9Q0-24-155 0', '#7fa37a')
    a += path('M-155 0Q0-50 160-9M0-72V173q0 41-33 25', stroke='#a5ba8a', width=7)
    return group(a, 'leaf-umbrella', transform=f'translate({x} {y}) scale({s})')


def soil(season):
    skies = ['#e4e4cf', '#dfe6ea', '#d9e9e9', '#e2edf0']
    s = rect(0, 0, 1200, 800, skies[season])
    s += path('M0 364Q300 332 600 369Q920 327 1200 363V800H0Z', '#c6a786')
    s += path('M0 431Q350 395 650 437Q970 406 1200 435V800H0Z', '#b69473')
    for i in range(22):
        x, y = 55 + (i * 157) % 1100, 420 + (i * 73) % 320
        s += ellipse(x, y, 13 + i % 8, 6, '#a58668' if i % 2 else '#d9bea0')
    if season == 0:
        s += tree(1040, 360, .75, bare=True)
    if season == 1:
        s += group(path('M0 352Q350 316 600 351Q920 313 1200 350V384Q800 359 0 389Z', '#fffdf6')
                   + tree(180, 350, .8, bare=True), 'snow')
        for x, y in [(330, 110), (560, 225), (790, 95), (1020, 210)]:
            s += group(line(x - 13, y, x + 13, y, '#fffdf6', 4) + line(x, y - 13, x, y + 13, '#fffdf6', 4), 'snowflake')
    if season == 2:
        s += cloud(350, 100, 1.4, '#c4d8dc') + cloud(850, 140, 1.1, '#c4d8dc') + rain_marks()
    if season == 3:
        s += circle(930, 140, 68, '#f6d58f') + cloud(240, 135, .75)
    s += group(ellipse(600, 515, 28, 44, '#93724f', transform='rotate(22 600 515)')
               + path('M592 485Q579 514 585 541', stroke='#c7a879', width=4), 'seed')
    return s


def strawberry(x, y, s=1):
    a = path('M-35-12Q-51 20 0 62Q51 20 35-12Q0-34-35-12', '#d98075')
    a += path('M0-22L-30-41L-18-14L-45-12L-10 0L0-22L15 0L44-19L17-18L25-43Z', '#789866')
    a += ''.join(ellipse(px, py, 2.5, 4, '#ffe2ac') for px, py in [(-20, 7), (10, 11), (0, 36), (23, 28), (-13, 28)])
    return group(a, 'strawberry', transform=f'translate({x} {y}) scale({s})')


def bridge():
    a = path('M0 550Q500 390 1200 560L1200 745Q600 610 0 735Z', '#a9ced1')
    a += ''.join(path(f'M{x} {620+(x%3)*14}q55-19 100 1', stroke='#d8e9e4', width=5) for x in range(40, 1200, 180))
    a += group(path('M335 527L1000 447L1020 510L354 605Z', '#ba9671')
               + ''.join(line(365+i*58, 525-i*7, 382+i*58, 599-i*8, '#8f775f', 4) for i in range(11))
               + line(340, 437, 995, 369, '#a08263', 11)
               + line(355, 515, 1015, 435, '#a08263', 7)
               + ''.join(line(x, y, x+8, y+115, '#987b5d', 10) for x, y in [(345, 420), (520, 403), (700, 383), (880, 364), (1000, 351)]), 'wooden-bridge')
    a += path('M0 585Q120 499 330 530L355 610Q145 639 0 693Z', '#b9cda0')
    a += path('M1000 451Q1110 425 1200 469V700Q1110 626 1020 508Z', '#bbcea2')
    return a


def toothbrush(x, y, s=1, angle=0, foam=False):
    a = rect(-88, 0, 167, 15, '#8fafb0', 8) + rect(45, -16, 55, 31, '#b9d2c4', 8)
    a += ''.join(line(i, -14, i, -29, '#f8f0d8', 5) for i in [50, 61, 72, 83, 94])
    if foam:
        a += group(circle(60, -26, 15, '#fffdf4') + circle(81, -34, 16, '#fffdf4')
                   + circle(99, -23, 12, '#fffdf4'), 'foam')
    return group(a, 'toothbrush', transform=f'translate({x} {y}) rotate({angle}) scale({s})')


def sink(x=800, y=460, running=False, brush_in_cup=True):
    s = rect(x - 135, y + 12, 285, 220, '#b2c9be', 16) + ellipse(x, y, 183, 48, '#fbf7e9')
    s += ellipse(x, y, 135, 31, '#c8dbd5')
    s += path(f'M{x+80} {y-25}V{y-132}q0-45-46-36v33', stroke='#98aaa3', width=17)
    if running:
        s += group(line(x+34, y-122, x+34, y-5, '#98c8d6', 9)
                   + ellipse(x+34, y+2, 37, 8, '#a9d6db'), 'running-water')
    s += group(rect(x + 104, y - 83, 49, 75, '#e2bd7f', 9)
               + (toothbrush(x + 129, y - 116, .6, -82) if brush_in_cup else ''), 'toothbrush-cup')
    return group(s, 'sink')


def teeth(x, y, s=1, brush=True):
    a = ellipse(0, 0, 154, 104, '#cf9b92') + ellipse(0, 1, 130, 78, '#a9756a')
    for py in [-43, 29]:
        for px in [-88, -44, 0, 44, 88]:
            a += rect(px-18, py-20, 36, 43, '#fff8df', 10)
    if brush:
        a += toothbrush(0, -5, 1.1, -18, foam=True)
    return group(a, 'teeth', transform=f'translate({x} {y}) scale({s})')


def rainbow():
    colors = ['#de9589', '#e6b47a', '#e8d483', '#a8c7a0', '#9bc7cd', '#a5b6d2', '#c6b0cc']
    return group(''.join(path(f'M{600-r} 400a{r} {r*.78} 0 0 1 {2*r} 0', stroke=c, width=24)
                         for r, c in zip(range(390, 240, -22), colors)), 'rainbow')


def bunny_goodnight(n):
    if n == 0:
        return room(sunset=True) + rect(85, 410, 215, 100, '#c4b2a1', 15) + animal('rabbit', 590, 457, 1.7, pose='hold', prop='pillow')
    if n == 1:
        return outdoors(night=True, stars=4) + nest(835, 359) + animal('rabbit', 422, 501, 1.45, pose='reach')
    if n == 2:
        return room(night=True) + bed(545, 411, 'bear', quilt='#d4bd89') + animal('rabbit', 302, 487, 1.3, pose='reach')
    if n == 3:
        return outdoors(night=True, stars=5) + animal('rabbit', 588, 481, 1.75, mood='yawn', pose='yawn')
    if n == 4:
        return room(night=True) + animal('rabbit', 855, 421, 1.65, pose='open', adult=True) + bed(290, 438, mood='happy')
    return room(night=True) + animal('rabbit', 300, 480, 1.35, mood='calm', pose='sit', adult=True) + bed(500, 422)


def sharing(n):
    s = room('kitchen')
    if n == 0:
        return s + animal('bear', 710, 427, 1.6, pose='hold') + table(630, 602, 470) + bread(620, 560, 1.3) + group(path('M590 480q-20-30 0-54M650 475q20-30 0-54', stroke='#dfc8a5', width=5), 'bread-aroma')
    if n == 1:
        return s + group(rect(30, 120, 270, 440, '#b99b76', 20) + rect(53, 141, 220, 416, '#d6e5cc', 12), 'open-door') + animal('rabbit', 265, 490, 1.25, pose='hold') + plate(265, 610, True) + animal('bear', 745, 440, 1.6, pose='reach') + table(740, 646, 500) + bread(750, 600, .8)
    if n == 2:
        return s + animal('fox', 300, 485, 1.35, pose='hold') + plate(300, 605, True) + animal('bear', 735, 435, 1.6, pose='reach') + table(735, 647, 500) + bread(725, 609, .6) + bread(850, 606, .45, sliced=True)
    if n == 3:
        return s + animal('bear', 600, 407, 1.75, mood='sad', pose='hold') + table(600, 648, 660) + plate(600, 623) + circle(670, 619, 4, '#c5a36d') + circle(685, 626, 3, '#c5a36d') + group(path('M771 480q31 10 12 28M797 475q31 10 12 28', stroke='#b69b7e', width=4), 'rumbling-tummy')
    s += animal('rabbit', 290, 470, 1.25, pose='hold') + animal('bear', 610, 405, 1.55, pose='open') + animal('fox', 940, 475, 1.3, pose='hold')
    s += table(600, 650, 900) + carrots(370, 608, .75) + berries(860, 610, .9)
    if n == 4:
        s += group(rect(700, 585, 155, 43, '#c1a181', 12) + path('M719 590v-29q55-50 110 0v29', stroke='#ba936b', width=8), 'basket')
    else:
        s += plate(600, 616, True) + plate(290, 645) + plate(915, 645) + bread(470, 642, .45, sliced=True)
    return s


def feelings(n):
    s = room('playroom')
    if n == 0:
        return s + blocks(535, 629, 5) + animal('fox', 900, 454, 1.5, pose='open')
    if n == 1:
        return s + blocks(505, 663, fallen=True) + animal('fox', 900, 455, 1.5, mood='angry', pose='hold') + group(path('M680 335l-32 39 38 10-30 42', stroke='#d59b89', width=7), 'crash-motion')
    if n == 2:
        return s + blocks(260, 682, fallen=True) + animal('fox', 650, 451, 1.65, mood='calm', pose='open') + group(path('M394 440q-49-48 2-84M888 425q52-35 0-75', stroke='#b7cbc3', width=11), 'slow-breath')
    if n == 3:
        return s + blocks(198, 677, fallen=True) + animal('fox', 460, 488, 1.45, mood='sad', pose='sit') + animal('rabbit', 800, 488, 1.2, pose='reach')
    if n == 4:
        return s + animal('fox', 292, 465, 1.35, pose='reach') + animal('rabbit', 906, 475, 1.2, pose='reach') + blocks(600, 648, 2, wide=True) + rect(370, 525, 70, 65, '#d9a491', 8)
    return s + animal('fox', 280, 460, 1.4, pose='open') + animal('rabbit', 928, 470, 1.25, pose='open') + blocks(600, 648, 5, wide=True)


def seed_story(n):
    if n < 4:
        s = soil(n)
        if n == 0:
            s += group(path('M170 180q170-79 280 34t170-8M80 270q170-45 290 20', stroke='#afbdac', width=8)
                       + path('M440 293q78 30 130 157', stroke='#d9bf8c', width=4, stroke_dasharray='9 14'), 'autumn-wind')
        if n >= 2:
            s += group(path('M600 541q-30 61-9 109m5-40l-39 17m34-37l35 24', stroke='#eee3bc', width=9), 'root')
        if n == 3:
            s += group(path('M605 491Q613 395 608 260', stroke='#789e6b', width=12)
                       + path('M607 339Q506 276 507 326Q541 378 607 354M610 295Q704 228 709 276Q679 327 610 311', '#9dbd80'), 'shoot')
        return s
    s = outdoors() + rect(240, 635, 720, 82, '#b69a79', 50)
    if n == 4:
        s += group(path('M600 649V271', stroke='#80a06c', width=17)
                   + path('M600 456Q432 333 427 414Q450 507 600 480M600 379Q765 259 776 346Q738 430 600 406M600 575Q439 477 445 544Q490 609 600 595', '#93b77c'), 'leafy-plant')
        s += group(ellipse(711, 350, 27, 36, '#d77f6e') + circle(711, 320, 13, '#625e4e')
                   + line(711, 324, 711, 383, '#625e4e', 3)
                   + circle(699, 343, 5, '#625e4e') + circle(725, 358, 5, '#625e4e'), 'ladybug')
    else:
        s += flower(600, 646, 4.8) + flower(350, 688, .6) + flower(900, 690, .75)
        s += group(ellipse(872, 331, 26, 16, '#dac0ca', transform='rotate(-32 872 331)')
                   + ellipse(910, 333, 26, 16, '#dac0ca', transform='rotate(32 910 333)')
                   + line(892, 323, 891, 352, '#a58c91', 5), 'butterfly')
    return s


def colors_story(n):
    s = outdoors(puddle=n in [0, 4])
    if n == 0:
        return s + animal('rabbit', 590, 468, 1.7, pose='walk', prop='boots') + flower(360, 660, .7)
    if n == 1:
        s += group(path('M350 614q-15-170 92-226M405 512q-140-80-160 10q50 88 160 23M424 462q135-90 158-6q-41 72-158 37', '#8ba878'), 'strawberry-plant')
        return s + strawberry(350, 530, 1.5) + strawberry(510, 540, 1.1) + animal('rabbit', 865, 470, 1.45, pose='reach', prop='boots')
    if n == 2:
        return s + flower(698, 653, 3.3, '#f1d16c') + animal('rabbit', 370, 485, 1.45, pose='reach', prop='boots')
    if n == 3:
        s += group(path('M0 638Q600 512 1200 632V800H0Z', '#a6c48d') + ''.join(path(f'M{x} 735l-12-34m12 34l8-26', stroke='#7ea373', width=4) for x in range(40, 1200, 57)), 'green-grass')
        return s + animal('rabbit', 650, 478, 1.55, pose='walk', prop='boots')
    if n == 4:
        s += group(ellipse(610, 662, 245, 59, '#94bfce') + cloud(590, 655, .9, '#e8f1e8'), 'sky-reflection')
        return s + animal('rabbit', 944, 488, 1.3, pose='reach', prop='boots')
    return s + rainbow() + animal('rabbit', 605, 510, 1.4, pose='open', prop='boots')


def brave(n):
    s = outdoors() + bridge() + ''.join(flower(x, y, .8) for x, y in [(1100, 525), (1070, 590), (1170, 561)])
    if n == 0:
        return s + animal('hedgehog', 203, 503, 1.3, mood='scared')
    if n == 1:
        return s + animal('hedgehog', 240, 455, 1.55, mood='scared', pose='hold') + group(path('M124 622q-25-18 0-34M355 604q25-18 0-34', stroke='#b99579', width=5), 'shaky-feet')
    if n == 2:
        return s + animal('bear', 125, 420, 1.5, pose='reach') + animal('hedgehog', 340, 482, 1.15, mood='scared')
    if n == 3:
        return s + animal('hedgehog', 465, 414, 1.15, pose='walk') + animal('bear', 230, 439, 1.1, pose='reach')
    if n == 4:
        return s + animal('bear', 525, 375, 1, pose='walk') + animal('hedgehog', 780, 371, 1.1, pose='walk') + group(path('M850 185q110-53 164 0M630 225q75-27 108-4', stroke='#b7ccc3', width=7), 'gentle-breeze')
    s += animal('bear', 855, 361, 1.1, pose='open') + animal('hedgehog', 1052, 439, 1.2, pose='open')
    return s + ''.join(flower(x, y, .7, c) for x, y, c in [(960, 647, '#e4b5ad'), (1080, 660, '#f1d170'), (1160, 680, '#cfbad2')])


def brushing(n):
    s = room('bathroom')
    if n == 0:
        return s + circle(795, 235, 135, '#c3d5ce') + circle(795, 235, 120, '#eaf3e9') + sink() + animal('bear', 408, 453, 1.6, pose='reach')
    if n == 1:
        s += rect(90, 560, 1020, 105, '#d4bd95', 20)
        s += group(rect(0, 0, 165, 63, '#e7d7b0', 14) + rect(-19, 13, 28, 36, '#a1bfc2', 6)
                   + rect(38, 9, 75, 44, '#93b2a4', 8), 'toothpaste', transform='translate(470 280) rotate(25)')
        s += toothbrush(596, 475, 2.6, foam=True)
        s += group(rect(298, 526, 150, 52, '#d8ba78', 13) + circle(326, 586, 19, '#b18d62') + circle(413, 586, 19, '#b18d62') + rect(320, 494, 62, 39, '#aec7bf', 8), 'imaginary-toothbrush-train')
        return s + cloud(250, 430, .35) + star(900, 330, 17)
    if n == 2:
        s += animal('bear', 302, 426, 1.9, pose='hold')
        s += toothbrush(360, 394, 1.1, -10, foam=True)
        s += group(circle(862, 239, 126, '#f6e8cb') + teeth(862, 239, .62), 'outside-teeth')
        inside = path('M-79 68Q-144-98 0-95Q144-98 79 68L48 54Q91-56 0-57Q-91-56-48 54Z', '#d3a89a')
        for i in range(9):
            a = math.pi + i*math.pi/8
            x, y = math.cos(a)*83, math.sin(a)*71
            inside += rect(x-15, y-16, 30, 34, '#fff8df', 9, transform=f'rotate({i*22.5-90} {x} {y})')
        inside += toothbrush(10, 14, .73, -35, foam=True)
        s += group(circle(862, 517, 127, '#f6e8cb') + group(inside, transform='translate(862 529)'), 'inside-teeth')
        return s + group(path('M682 234q-40-27-65 9M1009 494q35-35 5-67', stroke='#9bb8ad', width=7), 'brushing-motion')
    if n == 3:
        s += animal('bear', 230, 480, 1.2, mood='calm')
        s += teeth(745, 367, 1.4, brush=False) + toothbrush(690, 290, 1.2, -8, foam=True) + toothbrush(800, 444, 1.2, 172, foam=True)
        return s + group(path('M506 276v59m0-59l-13 18m13-18l13 18M983 452v-59m0 59l-13-18m13 18l13-18', stroke='#89aea6', width=6), 'top-and-bottom-brushing')
    if n == 4:
        return s + sink(running=True, brush_in_cup=False) + animal('bear', 475, 444, 1.5, pose='reach') + toothbrush(717, 418, .8, -10) + group(circle(700, 470, 12, '#f7f9ee') + circle(728, 485, 17, '#f7f9ee') + circle(665, 482, 9, '#f7f9ee'), 'rinsed-foam')
    s += group(rect(175, 95, 370, 365, '#b7cbc0', 100) + rect(193, 113, 334, 329, '#e9f3ed', 90)
               + group(face('bear'), transform='translate(360 292) scale(1.45)')
               + rect(345, 292, 34, 10, '#fffbe7', 5), 'mirror-reflection')
    return s + sink(770, 490) + animal('bear', 1040, 468, 1.35, pose='open')


def star_story(n):
    s = outdoors(night=True)
    # No decorative stars on counting pages: the visible number must match the text.
    if n < 5:
        s += group(rect(230, 570, 745, 120, '#c3b0bd', 45)
                   + ''.join(line(250, y, 948, y, '#e0d1cf', 5) for y in [598, 633, 668]), 'picnic-blanket')
        s += animal('fox', 398, 528, 1.05, mood='sleep' if n == 4 else 'happy', pose='sit', rotate=-66)
        s += animal('fox', 760, 505, 1.32, mood='calm', pose='sit', rotate=-65, adult=True)
    positions = {0: [], 1: [(555, 215)], 2: [(465, 215), (688, 180)],
                 3: [(420, 311), (600, 246), (788, 174)],
                 4: [(260, 170), (425, 245), (590, 160), (760, 290), (805, 91)]}
    if n < 5:
        s += ''.join(star(x, y, 34) for x, y in positions[n])
    else:
        s += animal('fox', 620, 370, 1.9, pose='hold', adult=True)
        s += animal('fox', 626, 500, .85, mood='sleep', pose='sit', rotate=-75)
        s += rect(230, 656, 210, 50, '#c3b0bd', 20)
        s += ''.join(star(140+(i*173)%950, 80+(i*89)%270, 10+i%3*3) for i in range(17))
    return s


def letter(n):
    if n == 0:
        s = room('desk', night=True) + animal('rabbit', 548, 410, 1.4, pose='hold') + table(580, 600, 580)
        return s + group(rect(455, 542, 180, 72, '#fff8e7', 8) + line(642, 566, 690, 523, '#a48c75', 9), 'blank-letter')
    if n == 1:
        return outdoors() + animal('rabbit', 410, 485, 1.3, pose='reach') + animal('bear', 830, 450, 1.5, pose='hold') + berries(605, 640, 1.25, scattered=True) + group(rect(898, 557, 110, 57, '#bb9a78', 13) + path('M912 561v-40q43-47 85 0v40', stroke='#bb9a78', width=8), 'basket')
    if n == 2:
        return outdoors() + animal('rabbit', 435, 520, 1.4, mood='sad', pose='sit', prop='bandage') + animal('bear', 802, 465, 1.45, mood='calm', pose='reach') + ellipse(295, 665, 45, 20, '#b3ac94')
    if n == 3:
        s = outdoors() + group(path('M225 679L323 444L539 428L599 664Z', '#a9aaa0')
                               + path('M568 676L624 478L817 491L899 684Z', '#b7b8ac'), 'stone-crack')
        return s + flower(587, 610, 1.65) + animal('rabbit', 1000, 497, 1.25, pose='reach')
    if n == 4:
        s = room('desk', night=True) + animal('rabbit', 473, 482, 1.5, pose='open')
        s += group(path('M1018 160L690 457L1110 457Z', '#fff1be', opacity='.2'), 'moonbeam')
        s += group(rect(846, 336, 139, 56, '#fff8e7', 5) + path('M849 341l67 32 66-32', stroke='#cfb995', width=3), 'finished-letter')
        return s
    s = outdoors(night=True, stars=5)
    s += group(rect(170, 290, 660, 425, '#e7d3b0', 35) + path('M95 322L497 105L901 322Z', '#b9a18c')
               + rect(425, 342, 280, 230, '#eedfbb', 24) + rect(443, 360, 244, 185, '#d9e8e2', 18)
               + animal('rabbit', 564, 461, .88) + rect(411, 547, 308, 26, '#bd9976', 8)
               + rect(637, 523, 53, 29, '#fff9e6', 4), 'bunny-window')
    return s


def rainy(n):
    s = outdoors(rain=n < 5, puddle=True)
    if n == 0:
        return s + animal('frog', 610, 487, 1.6, pose='hold') + leaf_umbrella(615, 285, 1.35)
    if n == 1:
        return s + animal('rabbit', 520, 530, 1.05, pose='walk') + animal('frog', 720, 510, 1.2, pose='reach') + leaf_umbrella(650, 305, 1.15)
    if n == 2:
        return s + animal('rabbit', 415, 526, 1) + animal('frog', 625, 527, 1.1) + animal('hedgehog', 852, 552, .95, mood='scared') + leaf_umbrella(610, 327, 1.03)
    if n == 3:
        return s + tree(920, 580, 1.9) + animal('frog', 450, 525, 1.05, pose='reach') + animal('rabbit', 200, 550, .9, pose='walk') + animal('hedgehog', 670, 550, .9, pose='walk') + leaf_umbrella(360, 338, .75)
    if n == 4:
        return s + tree(600, 597, 2.3) + animal('rabbit', 400, 567, .95, pose='sit') + animal('frog', 650, 565, 1, pose='sit') + animal('hedgehog', 860, 574, .9, pose='sit') + leaf_umbrella(1080, 505, .55)
    return s + animal('rabbit', 309, 448, 1.15, pose='walk', rotate=-7) + animal('frog', 650, 441, 1.2, pose='open', rotate=8) + animal('hedgehog', 960, 482, 1.05, pose='walk') + group(path('M442 710l-20-22m40 15 9-26M790 699l-9-25', stroke='#8bb7c0', width=5), 'puddle-splash')


DRAWERS = {
    'moon-rabbit': bunny_goodnight, 'bear-share': sharing, 'fox-feelings': feelings,
    'seed-journey': seed_story, 'rainbow-walk': colors_story, 'hedgehog-brave': brave,
    'teddy-brush': brushing, 'count-stars': star_story, 'rainy-friends': rainy, 'moon-letter': letter,
}

# Load the additional compositions by file path so CLI and importlib-based tests
# use the same renderer without relying on the caller's Python import path.
_spec = importlib.util.spec_from_file_location('bookdash_art', ROOT/'scripts/bookdash_art.py')
_bookdash_art = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bookdash_art)
DRAWERS.update(_bookdash_art.drawers(globals()))


def page_svg(book, number, storyboard):
    scene = storyboard['pages'][number - 1]
    body = DRAWERS[book['id']](number - 1)
    title = f"{book['title_zh']} · 第 {number} 页"
    desc = scene['description']
    # Fine paper flecks are shared decoration; story actions determine each image.
    texture = ''.join(circle(35+(i*137)%1140, 25+(i*79)%750, .8, '#8a7e69', opacity='.12') for i in range(55))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"'
            f' role="img" aria-labelledby="art-title art-desc" data-scene="{escape(scene["scene"], quote=True)}">'
            + tag('title', escape(title), id='art-title') + tag('desc', escape(desc), id='art-desc')
            + body + texture + '</svg>\n')


def cover_svg(book, storyboard):
    number = storyboard['cover_page']
    body = DRAWERS[book['id']](number - 1)
    title = book['title_zh']
    english = textwrap.wrap(book['title_original'], width=32)
    s = rect(0, 0, 600, 760, '#f8f0df', 24)
    s += tag('text', '小 小 绘 本 馆', x=300, y=65, text_anchor='middle', fill='#9c896c',
             font_family='sans-serif', font_size=16, letter_spacing=5)
    s += tag('text', escape(title), x=300, y=137, text_anchor='middle', fill='#526457',
             font_family='PingFang SC,Microsoft YaHei,sans-serif', font_size=min(43, 500 // len(title)), font_weight=700)
    s += '<svg x="20" y="205" width="560" height="390" viewBox="0 0 1200 800" overflow="hidden">' + body + '</svg>'
    for i, text in enumerate(english):
        s += tag('text', escape(text), x=300, y=655+i*27, text_anchor='middle', fill='#9c896c',
                 font_family='Georgia,serif', font_size=21)
    badge = '原 创 双 语 故 事' if book.get('is_demo') else 'BOOK DASH · 双 语 重 绘 版'
    s += tag('text', badge, x=300, y=731, text_anchor='middle', fill='#a6957c',
             font_family='sans-serif', font_size=12, letter_spacing=4)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760" role="img">'
            + tag('title', escape(title+'封面')) + s + '</svg>\n')


def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, suffix='.tmp', delete=False, encoding='utf-8') as f:
        f.write(text)
        temporary = Path(f.name)
    temporary.replace(path)


def generate(content_dir=None, web_dir=None, config=None):
    content_dir = Path(content_dir) if content_dir else ROOT/'content/books'
    web_dir = Path(web_dir) if web_dir else ROOT/'web'
    storyboards = json.loads(Path(config or CONFIG).read_text(encoding='utf-8'))
    prepared = []
    for book_id, board in storyboards.items():
        path_ = content_dir/f'{book_id}.json'
        book = json.loads(path_.read_text(encoding='utf-8'))
        if book_id not in DRAWERS or book['id'] != book_id:
            raise ValueError('缺少逐页插画实现：'+book_id)
        if len(book['pages']) != len(board['pages']):
            raise ValueError('分镜页数与绘本页数不符：'+book_id)
        for index, (page, scene) in enumerate(zip(book['pages'], board['pages']), 1):
            if page['page_number'] != index or page['text_zh'] != scene['text_zh']:
                raise ValueError(f'{book_id} 第 {index} 页文本已变化，请先调整分镜')
        prepared.append((path_, book, board))
    for path_, book, board in prepared:
        dest = web_dir/'assets/books'/book['id']
        cover = cover_svg(book, board)
        images = [page_svg(book, n, board) for n in range(1, len(book['pages'])+1)]
        revision = hashlib.sha256((cover+''.join(images)).encode('utf-8')).hexdigest()[:12]
        atomic_write(dest/'cover.svg', cover)
        for n, page in enumerate(book['pages'], 1):
            atomic_write(dest/f'page-{n:03}.svg', images[n-1])
            page['image'] = f'/assets/books/{book["id"]}/page-{n:03}.svg'
            page['image_alt'] = board['pages'][n-1]['description']
        book['cover'] = f'/assets/books/{book["id"]}/cover.svg'
        # Retain audio, voice metadata, source text and all operational fields.
        base = re.sub(r'-story-art-v\d+(?:-[0-9a-f]{12})?$', '', book['content_version'])
        book['content_version'] = base+'-'+ART_VERSION+'-'+revision
        atomic_write(path_, json.dumps(book, ensure_ascii=False, indent=2)+'\n')
        print(f'{book["id"]}: {len(book["pages"])} 张独立情节插画 + 封面')
    return len(prepared)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--content', type=Path)
    p.add_argument('--web', type=Path)
    p.add_argument('--config', type=Path, default=CONFIG)
    p.add_argument('--book', help='默认从MySQL读取指定书目，完成后写回路径')
    p.add_argument('--db-config', type=Path, help='数据库.env配置文件')
    args = p.parse_args()
    if args.content:
        generate(args.content, args.web, args.config)
    else:
        if not args.book:
            p.error('请用 --book 指定数据库书目；--content 仅兼容历史JSON资料')
        if args.web or args.config != CONFIG:
            p.error('数据库模式使用标准资源目录与分镜配置')
        spec = importlib.util.spec_from_file_location('pic_db_materials', Path(__file__).with_name('materials.py'))
        materials = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(materials)
        materials.make_art(materials.Store(args.db_config), args.book)


if __name__ == '__main__':
    main()
