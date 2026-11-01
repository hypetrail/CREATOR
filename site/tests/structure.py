from pathlib import Path
from lxml import html
import re
root=Path(__file__).resolve().parents[1]
doc=html.fromstring(Path('/tmp/calorimob-rental-ssr.html').read_text())
ids=doc.xpath('//@id')
assert len(ids)==len(set(ids))
assert len(doc.xpath('//article[contains(@class,"moto-card")]'))==3
for img in doc.xpath('//img'):
    assert img.get('alt')
    assert (root/'public'/img.get('src').lstrip('/')).is_file()
for field in doc.xpath('//input | //select'):
    assert field.xpath('ancestor::label') or field.get('aria-label')
assert not doc.xpath('//a[contains(@href,"catalogo")]')
assert len(doc.xpath('//article[contains(@class,"plan-preview")]'))==3
assert len(doc.xpath('//a[starts-with(@href,"https://wa.me/5519971505878")]'))>=2
assert len(doc.xpath('//input[@type="date"]'))==2
assert len(doc.xpath('//input[@type="time"]'))==2
assert not doc.xpath('//section[contains(@class,"hero")]//img')
assert len(doc.xpath('//header//*[@aria-label="Calori Mobilidade Elétrica"]'))==1
assert not doc.xpath('//*[@aria-label="Motinha da CaloriMob"]')
assert len(doc.xpath('//article[contains(@class,"moto-card")]//img'))==3
assert 'Av. dos Lírios, 142' in doc.text_content()
assert 'Escolha. Converse. Ande.' in doc.text_content()
css=re.sub(r'/\*.*?\*/','',(root/'app/globals.css').read_text(),flags=re.S)
def blocks(text):
    pos=0
    while pos<len(text):
        start=text.find('{',pos)
        if start<0: break
        header=text[pos:start].strip()
        level=1; end=start+1
        while end<len(text) and level:
            if text[end]=='{': level+=1
            if text[end]=='}': level-=1
            end+=1
        assert level==0, 'Unbalanced CSS block'
        yield header,text[start+1:end-1]
        pos=end
def rules(width,text=css):
    for header,content in blocks(text):
        if header.startswith('@media'):
            if 'prefers-reduced-motion' in header: continue
            maximum=re.search(r'max-width:\s*(\d+)px',header)
            minimum=re.search(r'min-width:\s*(\d+)px',header)
            if maximum and width>int(maximum[1]): continue
            if minimum and width<int(minimum[1]): continue
            yield from rules(width,content)
        elif not header.startswith('@'):
            yield header,dict(part.strip().split(':',1) for part in content.split(';') if ':' in part)
def property_at(width,selector,prop):
    value=None
    for header,declarations in rules(width):
        if selector in [s.strip() for s in header.split(',')] and prop in declarations:
            value=declarations[prop].strip()
    return value
checks=[
 (390,'.fleet-grid','grid-template-columns','minmax(0,1fr)'),

 (390,'.guide-form','grid-template-columns','1fr'),
 (768,'.guide-form','grid-template-columns','1fr 1fr'),
 (1440,'.fleet-grid','grid-template-columns','repeat(3,minmax(0,1fr))'),
]
for width,selector,prop,expected in checks:
    actual=property_at(width,selector,prop)
    assert actual==expected, f'{width}px {selector}: {actual} != {expected}'
assert property_at(390,'.table-scroll','overflow')=='auto'
print('SSR structure, assets, and mobile/desktop CSS rules verified. This is not visual browser QA.')
