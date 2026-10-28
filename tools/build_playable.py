#!/usr/bin/env python3
"""build_playable.py - one command from the live project to ad-network-ready single-file playables.

    python tools/build_playable.py [--variant default] [--networks all|applovin,unity,...] [--out dist]

For every network it writes dist/<variant>/<network>.html (Google: a .zip with index.html) where everything is inline:
engine + game code, textures re-encoded as WebP at the size the game actually draws them, and the network's CTA /
lifecycle adapter. Then it checks each file against that network's size limit and forbidden external requests, and
writes dist/<variant>/report.md. Variants (A/B hypotheses) are JSON overrides of SIM.K / copy in variants/<name>.json.
"""
import argparse, base64, io, json, os, re, sys, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = os.path.join(ROOT, 'live')
# per-project config (tools/build.json): store links, title, and for every shipped texture the longest side in px it
# needs = (largest on-screen size in view px) x ~1.4 headroom, never more; "lossy" for opaque tiles, "alpha" otherwise
CFG = json.load(open(os.path.join(ROOT, 'tools', 'build.json'), encoding='utf-8'))
STORE, TITLE = CFG['store'], CFG.get('title', 'Playable')
TEX = {n: (v[0], v[1]) for n, v in CFG['textures'].items()}

# limits as published by the networks (bytes of the uploaded file); keep them in one table so a change is one edit
NETWORKS = {
    'applovin':   {'limit': 5_000_000, 'adapter': 'mraid', 'mraid_tag': True},
    'unity':      {'limit': 5_000_000, 'adapter': 'mraid', 'mraid_tag': True},
    'ironsource': {'limit': 5_000_000, 'adapter': 'dapi',  'mraid_tag': True},
    'mintegral':  {'limit': 5_000_000, 'adapter': 'mintegral', 'mraid_tag': False},
    'google':     {'limit': 5_000_000, 'adapter': 'exitapi', 'mraid_tag': False, 'zip': True},
    'meta':       {'limit': 2_000_000, 'adapter': 'meta', 'mraid_tag': False},
    'preview':    {'limit': 5_000_000, 'adapter': 'web', 'mraid_tag': False},
}
ALLOWED_EXTERNAL = {'mraid.js', 'https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js'}

ADAPTERS = {
    # each one defines window.__openStore and wires lifecycle (viewability → audio, game end)
    'mraid': """(function(){var M=window.mraid;var url=function(){return /iphone|ipad|ipod/i.test(navigator.userAgent)?STORE.ios:STORE.android;};
window.__openStore=function(){try{if(M&&M.open){M.open(url());return;}}catch(e){}window.open(url());};
function vis(v){if(window.AUDIO)AUDIO.mute(!v);}
function ready(){try{if(M.isViewable)vis(M.isViewable());M.addEventListener('viewableChange',vis);
M.addEventListener('audioVolumeChange',function(p){if(window.AUDIO)AUDIO.mute(p===0);});}catch(e){}}
if(M){if(M.getState&&M.getState()==='loading')M.addEventListener('ready',ready);else ready();}})();""",
    'dapi': """(function(){var D=window.dapi;var url=function(){return /iphone|ipad|ipod/i.test(navigator.userAgent)?STORE.ios:STORE.android;};
window.__openStore=function(){try{if(D&&D.openStoreUrl){D.openStoreUrl();return;}if(window.mraid&&mraid.open){mraid.open(url());return;}}catch(e){}window.open(url());};
function vis(v){if(window.AUDIO)AUDIO.mute(!(v&&v.isViewable!==undefined?v.isViewable:v));}
function ready(){try{D.addEventListener('viewableChange',vis);D.addEventListener('audioVolumeChange',function(v){if(window.AUDIO)AUDIO.mute(!v);});vis(D.isViewable());}catch(e){}}
if(D){if(D.isReady&&D.isReady())ready();else D.addEventListener('ready',ready);}})();""",
    'mintegral': """(function(){window.__openStore=function(){if(window.install)window.install();};
window.__onEnd=function(){if(window.gameEnd)window.gameEnd();};
window.addEventListener('load',function(){if(window.gameReady)window.gameReady();});
window.gameStart=function(){};window.gameClose=function(){if(window.AUDIO)AUDIO.mute(true);};})();""",
    'exitapi': """(function(){window.__openStore=function(){if(window.ExitApi)ExitApi.exit();};})();""",
    'meta': """(function(){window.__openStore=function(){if(window.FbPlayableAd)FbPlayableAd.onCTAClick();};})();""",
    'web': """(function(){var url=function(){return /iphone|ipad|ipod/i.test(navigator.userAgent)?STORE.ios:STORE.android;};
window.__openStore=function(){window.open(url(),'_blank');};})();""",
}


def encode(name, kind, maxpx):
    src = os.path.join(LIVE, 'assets', name + '.png')
    im = Image.open(src)
    k = min(1.0, maxpx / max(im.size))
    if k < 1: im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    buf = io.BytesIO()
    if kind == 'lossy': im.convert('RGB').save(buf, 'WEBP', quality=78, method=6)
    else: im.convert('RGBA').save(buf, 'WEBP', quality=86, alpha_quality=90, method=6)
    return buf.getvalue(), im.size


def js_min(src):
    # conservative: drop full-line // comments and blank lines (keeps code byte-identical otherwise)
    return '\n'.join(l for l in src.splitlines() if l.strip() and not l.strip().startswith('//'))


def build(variant, nets, out):
    vdir = os.path.join(out, variant); os.makedirs(vdir, exist_ok=True)
    manifest = json.loads(re.sub(r'^window\.ASSETS = |;\s*$', '', open(os.path.join(LIVE, 'assets.js')).read().strip()))
    imgs, rows, man = {}, [], {}
    for n, (mx, kind) in TEX.items():
        if n not in manifest:
            print(f'  ! texture {n} not generated yet, skipped'); continue
        data, size = encode(n, kind, mx)
        imgs[n] = 'data:image/webp;base64,' + base64.b64encode(data).decode()
        man[n] = dict(manifest[n], w=size[0], h=size[1])
        rows.append((n, os.path.getsize(os.path.join(LIVE, 'assets', n + '.png')), len(data), size))
    scene = open(os.path.join(LIVE, 'scene.js'), encoding='utf-8').read()
    used = {n for n in manifest if re.search(r"['\"]" + re.escape(n) + r"['\"]", scene)}
    missing = sorted(used - set(TEX))
    if missing: print('  ! scene.js uses textures not listed in tools/build.json: ' + ', '.join(missing)); return False
    vfile = os.path.join(ROOT, 'variants', variant + '.json')
    over = json.load(open(vfile)) if os.path.exists(vfile) else {}
    mods = ['sizes.js', 'gl.js', 'lib.js', 'batch.js', 'sim.js', 'skin.js', 'scene.js', 'audio.js']
    code = '\n'.join(js_min(open(os.path.join(LIVE, m), encoding='utf-8').read()) for m in mods)
    # variant overrides land right after sim.js defines SIM (before scene.js reads it)
    vjs = f"Object.assign(SIM.K, {json.dumps(over.get('K', {}))}); window.VARIANT = {json.dumps(dict(over, name=variant))};"
    page = open(os.path.join(LIVE, 'index.html'), encoding='utf-8').read()
    m = re.search(r'<script>\n(.*)</script></body>', page, re.S); boot = m.group(1)
    head = page[:m.start()].replace('<title>live</title>', '<title>' + TITLE + '</title>')
    fdir = os.path.join(LIVE, 'fonts')                                              # HUD fonts travel inside the single file (data URI)
    for ff in (sorted(os.listdir(fdir)) if os.path.isdir(fdir) else []):
        if ff.endswith('.woff2'): head = head.replace(f'url(fonts/{ff})', 'url(data:font/woff2;base64,' + base64.b64encode(open(os.path.join(fdir, ff), 'rb').read()).decode() + ')')
    head = head.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">')
    head = re.sub(r'<div id="hint">.*?</div>', '<div id="hint"></div>', head)
    report = [f'# Build report — variant `{variant}`', '', '| network | file | size | limit | ok |', '|---|---|---|---|---|']
    ok_all = True
    for net in nets:
        cfg = NETWORKS[net]
        tags = ''
        if cfg['mraid_tag']: tags += '<script src="mraid.js"></script>'
        if cfg['adapter'] == 'exitapi':
            tags += '<meta name="ad.orientation" content="portrait"><script type="text/javascript" src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>'
        pre = (f'<script>window.__STATIC__=1;window.__AD__=1;window.__INLINE__=1;var STORE={json.dumps(STORE)};'
               f'window.ASSETS={json.dumps(man)};window.__IMG__={json.dumps(imgs)};window.SKIN_NAME={json.dumps(over.get("skin"))};</script>')
        html = (head.replace('</head>', tags + '</head>') + pre + '<script>' + code + '\n' + vjs + '</script>'
                + '<script>' + ADAPTERS[cfg['adapter']] + '</script>' + '<script>\n' + boot + '</script></body></html>')
        ext = [u for u in re.findall(r'(?:src|href)="([^"]+)"', html) if not u.startswith('data:')]
        bad = [u for u in ext if u not in ALLOWED_EXTERNAL]
        if cfg.get('zip'):
            path = os.path.join(vdir, net + '.zip')
            with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z: z.writestr('index.html', html)
        else:
            path = os.path.join(vdir, net + '.html'); open(path, 'w', encoding='utf-8').write(html)
        size = os.path.getsize(path); ok = size <= cfg['limit'] and not bad; ok_all &= ok
        report.append(f"| {net} | `{os.path.basename(path)}` | {size / 1e6:.2f} MB | {cfg['limit'] / 1e6:.0f} MB | {'yes' if ok else 'NO ' + ', '.join(bad)} |")
        print(f'  {net:11s} {size / 1e6:6.2f} MB  {"ok" if ok else "FAIL " + str(bad)}')
    report += ['', '## Textures (source PNG → shipped WebP at the drawn size)', '', '| texture | source | shipped | px |', '|---|---|---|---|']
    for n, a, b, sz in rows: report.append(f'| {n} | {a / 1e3:.0f} KB | {b / 1e3:.1f} KB | {sz[0]}×{sz[1]} |')
    tot_a, tot_b = sum(r[1] for r in rows), sum(r[2] for r in rows)
    report += [f'| **total** | **{tot_a / 1e6:.2f} MB** | **{tot_b / 1e3:.0f} KB** | |', '', f'Code: {len(code) / 1e3:.0f} KB inline (no external libraries).']
    open(os.path.join(vdir, 'report.md'), 'w', encoding='utf-8').write('\n'.join(report) + '\n')
    print(f'  textures {tot_a / 1e6:.2f} MB → {tot_b / 1e3:.0f} KB, code {len(code) / 1e3:.0f} KB → {vdir}/report.md')
    return ok_all


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--variant', default='default'); ap.add_argument('--networks', default='all'); ap.add_argument('--out', default=os.path.join(ROOT, 'dist'))
    ap.add_argument('--pages', help="also copy each variant's preview build here (GitHub Pages: default -> index.html)")
    a = ap.parse_args()
    nets = list(NETWORKS) if a.networks == 'all' else a.networks.split(',')
    variants = [v[:-5] for v in sorted(os.listdir(os.path.join(ROOT, 'variants')))] if a.variant == 'all' else [a.variant]
    ok = True
    for v in variants: print(f'variant {v}:'); ok &= build(v, nets, a.out)
    if a.pages and 'preview' in nets:
        import shutil; os.makedirs(a.pages, exist_ok=True)
        for v in variants: shutil.copy(os.path.join(a.out, v, 'preview.html'), os.path.join(a.pages, 'index.html' if v == 'default' else v + '.html'))
        print(f'  pages -> {a.pages}')
    sys.exit(0 if ok else 1)
