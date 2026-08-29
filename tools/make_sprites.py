#!/usr/bin/env python3
"""Build the gameplay sprites from the high-res character art.

Every skin has two files:

    big_<name>.png   325x240, used for the menu preview, the shop and the Lab
    <name>.png       the sprite the game actually flies around

The big art sits on a padded canvas, so this script crops it to the character's
tight bounding box and scales it down to PLAYER_HEIGHT. The result is what the
game draws AND what it collides with: index.html keeps a fixed BIRD_HEIGHT and
scales any sprite to it, so when the files are already PLAYER_HEIGHT tall the
scale factor is exactly 1.0 and the sprite is drawn pixel for pixel.

Usage:  pip install pillow && python3 tools/make_sprites.py [height]

Changing the height here is all it takes to resize every character - just keep
BIRD_HEIGHT in index.html the same number so the art and the hitbox stay equal.
"""
import os
import sys
from PIL import Image

PLAYER_HEIGHT = 55
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# gameplay sprite -> high-res source
SKINS = [
    ('player.png', 'big_player.png'),
    ('player_rich.png', 'big_player_rich.png'),
    ('employed.png', 'big_employed.png'),
    ('doordash_cheetos.png', 'big_doordash_cheetos.png'),
    ('arthur.png', 'big_arthur.png'),
    ('luigi_shetos.png', 'big_luigi_shetos.png'),
    ('sherlock.png', 'big_sherlock.png'),
    ('heisen_bark.png', 'big_heisen_bark.png'),
    ('player_yellow.png', 'big_player_yellow.png'),
    ('player_black.png', 'big_player_black.png'),
]

# alpha at or above this counts as "the character"; anything fainter is edge
# smoothing and must not widen the bounding box (it would pad the hitbox).
ALPHA_CUTOFF = 8


def tight_crop(im, cutoff=ALPHA_CUTOFF):
    alpha = im.split()[3]
    width, height = im.size
    px = alpha.load()
    xs, ys = [], []
    for y in range(height):
        for x in range(width):
            if px[x, y] >= cutoff:
                xs.append(x)
                ys.append(y)
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def build(height):
    for sprite, big in SKINS:
        src = os.path.join(ROOT, big)
        dst = os.path.join(ROOT, sprite)
        cropped = tight_crop(Image.open(src).convert('RGBA'))
        w = max(1, round(cropped.size[0] * height / cropped.size[1]))
        out = cropped.resize((w, height), Image.LANCZOS)
        out.save(dst, optimize=True)
        print('%-26s %-14s -> %sx%s' % (sprite, '%sx%s' % cropped.size, w, height))


if __name__ == '__main__':
    build(int(sys.argv[1]) if len(sys.argv) > 1 else PLAYER_HEIGHT)
