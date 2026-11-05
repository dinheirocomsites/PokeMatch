"""Reduz as imagens das cartas e agrupa por coleção em JSON (data URIs).
Uso: python3 -I scripts/pack-images.py <pasta-com-webp-baixados> <pasta-saida>
Cada arquivo de saída: { "<id da carta>": "data:image/webp;base64,..." }."""
import sys, os, json, base64, io
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
packs, bad = {}, 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.webp'):
        continue
    cid = f[:-5]
    try:
        im = Image.open(os.path.join(src, f)).convert('RGB')
    except Exception:
        bad += 1
        continue
    w = 220
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=62, method=6)
    set_id = cid.rsplit('-', 1)[0]
    packs.setdefault(set_id, {})[cid] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
total = 0
for set_id, items in packs.items():
    data = json.dumps(items, separators=(',', ':'))
    total += len(data)
    with open(os.path.join(out, f'{set_id}.json'), 'w') as fh:
        fh.write(data)
print(f'{sum(len(v) for v in packs.values())} imagens em {len(packs)} pacotes, {total / 1e6:.1f} MB, {bad} inválidas')
