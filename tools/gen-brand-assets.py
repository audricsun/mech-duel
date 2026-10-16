#!/usr/bin/env python3
"""生成 机甲对决 MECH DUEL 的品牌素材(favicon / 图标 / OG 分享图)。

产物(仓库根目录):
  favicon.svg  favicon.ico  apple-touch-icon.png  icon-192.png  icon-512.png  og-image.png

像素画为 16x16 网格,颜色取自 index.html 中机甲的 P1/P2 调色板:
  P1 突击者(蓝) / P2 重装兵(红)
运行:python3 tools/gen-brand-assets.py
"""
import io
import os
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PALETTES = {
    # 与 index.html PAL.p1 / PAL.p2 一致
    "p1": {"J": (42, 51, 65), "D": (39, 67, 111), "M": (63, 111, 181),
           "L": (127, 179, 232), "V": (95, 242, 255), "W": (255, 255, 255)},
    "p2": {"J": (61, 44, 42), "D": (117, 48, 42), "M": (192, 75, 63),
           "L": (235, 143, 106), "V": (255, 194, 77), "W": (255, 255, 255)},
}

BG = (11, 15, 28, 255)        # #0b0f1c 图标底色
FRAME = (28, 38, 70, 255)     # #1c2646 与游戏外框一致

# 16x16 像素机甲头:'.'透明 D 轮廓 M 主体 L 亮部 J 关节/散热 V 目镜
ART = [
    "................",
    ".......VV.......",
    ".......DD.......",
    "...DDDDDDDDDD...",
    "..DDDDDDDDDDDD..",
    "..DMMMMMMMMMMD..",
    ".LDMVVVVVVVVMDL.",
    ".LDMVVVVVVVVMDL.",
    "..DMMMMMMMMMMD..",
    "..DDMMMMMMMMDD..",
    "...DDJJJJJJDD...",
    "....DDDDDDDD....",
    ".....DDDDDD.....",
    "..DDMMMMMMMMDD..",
    ".DDMMMLLLLMMMDD.",
    ".DDMMMMMMMMMMDD.",
]
assert len(ART) == 16 and all(len(r) == 16 for r in ART)


# ---------------------------------------------------------------- 像素绘制
def render_art(pal, scale):
    """把 ART 渲染为 RGBA 图,scale 为整数放大倍率(最近邻,像素锐利)。"""
    img = Image.new("RGBA", (16 * scale, 16 * scale), (0, 0, 0, 0))
    for y, row in enumerate(ART):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            c = pal[ch]
            for dy in range(scale):
                for dx in range(scale):
                    img.putpixel((x * scale + dx, y * scale + dy), c + (255,))
    return img


def rounded_mask(size, radius):
    """抗锯齿圆角遮罩(4x 超采样后缩小)。"""
    ss = 4
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make_icon(pal, size, radius=None, scale=None):
    """图标:圆角深色底 + 细边框 + 居中像素机甲头。"""
    if radius is None:
        radius = round(size * 3 / 16)
    scale = scale or max(1, size // 16)

    ic = Image.new("RGBA", (size, size), BG)
    # 中心微光,避免大片死黑
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    r = size * 0.9
    ImageDraw.Draw(glow).ellipse(
        [size / 2 - r / 2, size / 2 - r / 2, size / 2 + r / 2, size / 2 + r / 2],
        fill=(47, 62, 110, 80))
    ic = Image.alpha_composite(ic, glow.filter(ImageFilter.GaussianBlur(size * 0.12)))

    art = render_art(pal, scale)
    ic.alpha_composite(art, ((size - 16 * scale) // 2, (size - 16 * scale) // 2))

    b = max(1, round(size / 32))
    ImageDraw.Draw(ic).rounded_rectangle(
        [b / 2, b / 2, size - 1 - b / 2, size - 1 - b / 2],
        radius=max(0, radius - b // 2), outline=FRAME, width=b)

    if radius:
        ic.putalpha(ImageChops.multiply(ic.getchannel("A"), rounded_mask(size, radius)))
    return ic


# ---------------------------------------------------------------- favicon.svg
def svg_favicon(pal, radius=3):
    rows = []
    for y, row in enumerate(ART):
        x = 0
        while x < 16:
            ch = row[x]
            if ch == ".":
                x += 1
                continue
            run = 1
            while x + run < 16 and row[x + run] == ch:
                run += 1
            c = pal[ch]
            rows.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
            x += run
    body = "\n    ".join(rows)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
        'viewBox="0 0 16 16" shape-rendering="crispEdges">\n'
        '  <title>机甲对决 MECH DUEL</title>\n'
        f'  <rect width="16" height="16" rx="{radius}" fill="#0b0f1c"/>\n'
        f'  <rect x="0.5" y="0.5" width="15" height="15" rx="{radius}" fill="none" stroke="#1c2646" stroke-width="1"/>\n'
        f'    {body}\n'
        '</svg>\n')


# ---------------------------------------------------------------- favicon.ico
def write_ico(path, images):
    """手写 ICO 容器(内嵌 PNG,Vista+ 均支持),各尺寸独立渲染保证像素锐利。"""
    chunks = []
    for im in images:
        b = io.BytesIO()
        im.save(b, "PNG")
        chunks.append(b.getvalue())
    n = len(chunks)
    header = struct.pack("<HHH", 0, 1, n)
    offset = 6 + 16 * n
    entries, data = [], b""
    for im, png in zip(images, chunks):
        w, h = im.size
        entries.append(struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(png), offset + len(data)))
        data += png
    with open(path, "wb") as f:
        f.write(header + b"".join(entries) + data)


# ---------------------------------------------------------------- 字体
def load_font(path_candidates, size, wanted=None):
    """从候选 ttc/ttf 中挑字体;wanted 为 (名称片段, 排除片段)。"""
    for path in path_candidates:
        if not os.path.exists(path):
            continue
        for i in range(12):
            try:
                f = ImageFont.truetype(path, size, index=i)
            except Exception:
                break
            name = " ".join(f.getname())
            if wanted is None:
                return f
            inc, exc = wanted
            if all(k in name for k in inc) and not any(k in name for k in exc):
                return f
    raise RuntimeError(f"找不到字体: {path_candidates}")


def cjk_font(size):
    return load_font(
        ["/System/Library/Fonts/Hiragino Sans GB.ttc",
         "/System/Library/Fonts/STHeiti Medium.ttc",
         "/System/Library/Fonts/STHeiti Light.ttc"],
        size, wanted=(["W6"], []))


def mono_font(size):
    return load_font(["/System/Library/Fonts/Menlo.ttc"], size,
                     wanted=(["Bold"], ["Italic"]))


# ---------------------------------------------------------------- OG 分享图
def glow_text_layer(size, text, font, fill, tracking=0, center=None, anchor_y="m"):
    """带字距的文字(可含光晕)绘制到独立层。"""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (center[0] if center else size[0] / 2) - total / 2
    for ch, w in zip(text, widths):
        d.text((x, center[1]), ch, font=font, fill=fill, anchor="l" + anchor_y)
        x += w + tracking
    return layer


def draw_glow_text(base, text, font, fill, glow, blur, tracking=0, center=None):
    g = glow_text_layer(base.size, text, font, glow, tracking, center)
    base.alpha_composite(g.filter(ImageFilter.GaussianBlur(blur)))
    base.alpha_composite(glow_text_layer(base.size, text, font, fill, tracking, center))


def build_og_image():
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), (5, 6, 13, 255))

    # 中央冷色辉光
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W / 2 - 460, H / 2 - 310, W / 2 + 460, H / 2 + 310],
                                 fill=(16, 24, 54, 255))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(130)))
    # 左右阵营辉光(蓝 / 红)
    for cx, col in [(240, (63, 111, 181, 100)), (960, (192, 75, 63, 100))]:
        gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(gl).ellipse([cx - 175, 315 - 175, cx + 175, 315 + 175], fill=col)
        img = Image.alpha_composite(img, gl.filter(ImageFilter.GaussianBlur(75)))

    # 两侧机甲头像框
    def frame(x, y, scale, pal):
        pad = 18
        fs = 16 * scale + pad * 2
        ImageDraw.Draw(img).rounded_rectangle(
            [x, y, x + fs, y + fs], radius=16, fill=(7, 10, 20, 255),
            outline=(28, 38, 70, 255), width=3)
        img.alpha_composite(render_art(pal, scale), (x + pad, y + pad))
        return fs

    fs = frame(96, (H - 260) // 2, 14, PALETTES["p1"])
    frame(W - 96 - fs, (H - 260) // 2, 14, PALETTES["p2"])

    # 标题:机甲对决
    title_f = cjk_font(100)
    draw_glow_text(img, "机甲对决", title_f, (242, 246, 255, 255), (95, 242, 255, 200),
                   20, center=(W / 2, 208))
    # 副标题:MECH DUEL
    duel_f = mono_font(46)
    duel = "MECH DUEL"
    draw_glow_text(img, duel, duel_f, (95, 242, 255, 255), (95, 242, 255, 170),
                   16, tracking=10, center=(W / 2, 302))
    # 分隔线
    d = ImageDraw.Draw(img)
    d.line([(W / 2 - 150, 348), (W / 2 + 150, 348)], fill=(43, 58, 99, 255), width=2)
    d.rectangle([W / 2 - 3, 345, W / 2 + 3, 351], fill=(95, 242, 255, 255))
    # 卖点行(拆两行,避免与两侧机头像框重叠)
    tag_f = cjk_font(26)
    draw_glow_text(img, "14 台机甲 · 4 张动态战场",
                   tag_f, (168, 184, 216, 255), (0, 0, 0, 0), 0, center=(W / 2, 384))
    draw_glow_text(img, "双人同屏 · 人机对战 · 打开即玩",
                   tag_f, (168, 184, 216, 255), (0, 0, 0, 0), 0, center=(W / 2, 424))
    # 地址
    url_f = mono_font(21)
    draw_glow_text(img, "audricsun.github.io/mech-duel", url_f, (90, 109, 153, 255),
                   (0, 0, 0, 0), 0, center=(W / 2, 574))

    # CRT 扫描线
    sl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sl)
    for y in range(0, H, 3):
        ds.line([(0, y), (W, y)], fill=(0, 0, 0, 14))
    img = Image.alpha_composite(img, sl)

    # 暗角
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 100))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse([-260, -260, W + 260, H + 260], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(170))
    k = ImageChops.subtract(Image.new("L", (W, H), 255), m)
    vig.putalpha(Image.eval(k, lambda v: v * 100 // 255))
    img = Image.alpha_composite(img, vig)

    img.convert("RGB").save(os.path.join(ROOT, "og-image.png"), optimize=True)


# ---------------------------------------------------------------- main
def main():
    # favicon.svg
    with open(os.path.join(ROOT, "favicon.svg"), "w") as f:
        f.write(svg_favicon(PALETTES["p1"]))

    # favicon.ico:16 / 32 / 48 各自独立渲染
    write_ico(os.path.join(ROOT, "favicon.ico"),
              [make_icon(PALETTES["p1"], s) for s in (16, 32, 48)])

    # iOS 主屏图标(全出血深色底,iOS 自行裁圆角)
    make_icon(PALETTES["p1"], 180, radius=0, scale=9).save(
        os.path.join(ROOT, "apple-touch-icon.png"))

    # PWA / Android 图标
    make_icon(PALETTES["p1"], 192, radius=0).save(os.path.join(ROOT, "icon-192.png"))
    make_icon(PALETTES["p1"], 512, radius=0).save(os.path.join(ROOT, "icon-512.png"))

    build_og_image()
    print("done: favicon.svg favicon.ico apple-touch-icon.png icon-192.png icon-512.png og-image.png")


if __name__ == "__main__":
    main()
