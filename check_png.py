import sys

try:
    from PIL import Image
except ImportError:
    print("NO_PIL")
    sys.exit(0)

im = Image.open(sys.argv[1] if len(sys.argv) > 1 else "stamp-icon.png").convert("RGBA")
w, h = im.size
print(f"尺寸: {w}x{h}")
for name, (x, y) in {
    "左上": (2, 2), "右上": (w - 3, 2), "左下": (2, h - 3), "右下": (w - 3, h - 3),
    "中心": (w // 2, h // 2),
}.items():
    print(f"{name} ({x},{y}): RGBA={im.getpixel((x, y))}")
