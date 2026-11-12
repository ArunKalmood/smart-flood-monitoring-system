"""Generate the downloadable public-safety PDFs served from frontend/public/resources/.

Usage (from anywhere):
    backend/venv/bin/python backend/scripts/build_public_resources.py [--out DIR]

The content is general flood-preparedness guidance and mirrors the safety tips
and emergency numbers shown on the public site (frontend/src/constants/publicInfo.js).
Re-run after editing the content below; the output files are committed.
"""
import argparse
import os

import _bootstrap  # noqa: F401  (sets sys.path / cwd)
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

REPO_DIR = os.path.dirname(_bootstrap.BACKEND_DIR)
DEFAULT_OUT = os.path.join(REPO_DIR, 'frontend', 'public', 'resources')

DISCLAIMER = (
    'General guidance only. Always follow instructions from your local authorities '
    'and official warnings. In immediate danger, call 112.'
)

# Kept in sync with EMERGENCY_NUMBERS in frontend/src/constants/publicInfo.js.
EMERGENCY_NUMBERS = [
    ('National emergency', 'Police, fire, ambulance', '112'),
    ('Disaster helpline', 'Toll-free', '1078'),
    ('Ambulance', 'Medical emergency', '108'),
    ('Police', 'Law & order', '100'),
    ('Fire', 'Fire emergency', '101'),
    ('State disaster helpline', 'State helpline', '1070'),
    ('NDRF', 'National Disaster Response Force', '011-23438091'),
]

SAFETY_PHASES = [
    ('Before a flood', [
        'Know your area’s flood risk and your nearest evacuation route.',
        'Prepare an emergency kit and keep it where you can grab it quickly.',
        'Keep important documents in a waterproof bag.',
        'Save emergency numbers and keep your phone charged.',
        'Move valuables and electrical items to higher floors.',
    ]),
    ('During a flood', [
        'Move to higher ground immediately when a warning is issued.',
        'Never walk or drive through flood water — 15 cm of moving water can knock you down.',
        'Switch off electricity and gas at the main supply if it is safe to do so.',
        'Stay away from power lines and electrical equipment.',
        'Follow official evacuation instructions and routes.',
    ]),
    ('After a flood', [
        'Return home only when the authorities say it is safe.',
        'Do not enter buildings with structural damage.',
        'Drink only boiled or bottled water until supplies are declared safe.',
        'Clean and disinfect everything that got wet.',
        'Photograph damage for insurance and relief claims.',
    ]),
]

CHECKLIST = [
    ('Water and food', [
        'Drinking water: about 4 litres per person per day, for at least 3 days',
        'Ready-to-eat food that needs no cooking (biscuits, dry fruit, packaged food)',
        'Baby food and special dietary items, if needed',
    ]),
    ('Health and safety', [
        'First-aid kit',
        'Regular medicines for at least one week, with prescriptions',
        'Water purification tablets or chlorine',
        'Hand sanitiser, soap, sanitary items',
    ]),
    ('Light, power and communication', [
        'Torch with spare batteries',
        'Fully charged mobile phone and power bank',
        'Battery-powered radio for official announcements',
        'Whistle to signal for help',
    ]),
    ('Documents and money', [
        'Copies of ID, ration card, bank and insurance papers in a waterproof bag',
        'Some cash in small denominations',
        'A written list of emergency and family contact numbers',
    ]),
    ('Clothing and other items', [
        'A change of clothes, rain gear and sturdy footwear',
        'Blanket or sleeping sheet',
        'Rope, knife and plastic sheet',
        'Items for children, elderly or disabled family members',
    ]),
]

EVACUATION = [
    ('Plan ahead', [
        'Find out whether your home is in a flood-prone area.',
        'Identify the nearest evacuation center or high ground and at least two routes to reach it.',
        'Agree on a family meeting point in case you are separated.',
        'Choose an out-of-area contact everyone can call to report they are safe.',
        'Plan for children, elderly people, people with disabilities and pets.',
    ]),
    ('When a warning is issued', [
        'Listen to official announcements on radio, TV or the FloodMonitor site.',
        'Pack your emergency kit and important documents.',
        'Move valuables, electrical items and stored food to upper floors.',
        'Fill clean containers with drinking water.',
        'Keep your phone charged and your vehicle fuelled if you have one.',
    ]),
    ('When you evacuate', [
        'Leave early — do not wait until water reaches your home.',
        'Switch off electricity and gas at the main supply if it is safe to do so.',
        'Lock your home and take your emergency kit.',
        'Use only the routes recommended by the authorities; avoid bridges over fast-flowing water.',
        'Never walk, swim or drive through flood water.',
        'Register at the evacuation center so that relief teams know you are safe.',
    ]),
    ('Returning home', [
        'Return only when the authorities say it is safe.',
        'Check for structural damage, gas leaks and electrical hazards before entering.',
        'Wear gloves and boots while cleaning; flood water may be contaminated.',
        'Throw away food that has been in contact with flood water.',
    ]),
]

FIRST_AID = [
    ('General rules', [
        'Make sure the scene is safe for you before helping anyone.',
        'Call 112 or 108 for any serious injury or illness.',
        'Wash your hands or wear gloves before giving first aid when possible.',
        'Do not give food or drink to someone who is unconscious or badly injured.',
    ]),
    ('Near-drowning', [
        'Do not enter fast-moving water yourself; reach or throw a rope or floating object.',
        'Once out of the water, check breathing. If the person is not breathing, start CPR if trained and call 112.',
        'If breathing, place the person on their side (recovery position) and keep them warm.',
        'Anyone rescued from water should be checked by a doctor, even if they seem well.',
    ]),
    ('Cuts and wounds', [
        'Apply firm pressure with a clean cloth to stop bleeding.',
        'Clean minor wounds with safe (boiled or bottled) water; flood water is not safe.',
        'Cover with a clean dressing. Seek medical care for deep wounds or signs of infection.',
        'Wounds exposed to flood water carry a risk of tetanus — consult a health worker.',
    ]),
    ('Hypothermia (body too cold)', [
        'Signs: shivering, confusion, slurred speech, drowsiness.',
        'Move the person to a dry, sheltered place and remove wet clothing.',
        'Warm them gradually with blankets; give warm (not hot) drinks if fully conscious.',
    ]),
    ('Electric shock', [
        'Do not touch the person until the power source is switched off.',
        'Call 112. Check breathing and start CPR if trained and needed.',
    ]),
    ('Water-borne illness', [
        'Diarrhoea and vomiting are common after floods. Give oral rehydration solution (ORS) often.',
        'Seek medical care for high fever, blood in stool, or signs of dehydration (very little urine, dizziness).',
        'Drink only boiled, bottled or chlorinated water.',
    ]),
]


def _styles():
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle('t', parent=base['Title'], textColor=colors.HexColor('#0b4f8a'), spaceAfter=4 * mm),
        'subtitle': ParagraphStyle('s', parent=base['Normal'], textColor=colors.HexColor('#555555'), spaceAfter=6 * mm),
        'h2': ParagraphStyle('h', parent=base['Heading2'], textColor=colors.HexColor('#0b4f8a'), spaceBefore=4 * mm),
        'body': ParagraphStyle('b', parent=base['Normal'], fontSize=10.5, leading=14),
        'note': ParagraphStyle('n', parent=base['Normal'], fontSize=9, textColor=colors.HexColor('#8a1c1c'),
                               spaceBefore=6 * mm),
    }


def _bullets(items, style):
    return ListFlowable(
        [ListItem(Paragraph(text, style), leftIndent=12) for text in items],
        bulletType='bullet', start='•', leftIndent=12,
    )


def _contacts_table():
    rows = [['Service', 'Description', 'Number']] + [list(r) for r in EMERGENCY_NUMBERS]
    table = Table(rows, colWidths=[55 * mm, 75 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0b4f8a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (2, 1), (2, -1), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#eef4fa')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#c8d6e5')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def _build(path, title, subtitle, story_fn):
    s = _styles()
    doc = SimpleDocTemplate(path, pagesize=A4, title=title, author='FloodMonitor',
                            leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
    story = [Paragraph(title, s['title']), Paragraph(subtitle, s['subtitle'])]
    story += story_fn(s)
    story.append(Paragraph(DISCLAIMER, s['note']))
    doc.build(story)


def _sections(sections):
    def story(s):
        out = []
        for heading, items in sections:
            out += [Paragraph(heading, s['h2']), _bullets(items, s['body'])]
        return out
    return story


def build_all(out_dir):
    os.makedirs(out_dir, exist_ok=True)

    def safety_story(s):
        out = _sections(SAFETY_PHASES)(s)
        out += [Paragraph('Emergency numbers', s['h2']), Spacer(1, 2 * mm), _contacts_table()]
        return out

    def contacts_story(s):
        return [
            _contacts_table(),
            Spacer(1, 6 * mm),
            Paragraph('Write down your local numbers too: nearest hospital, police station, '
                      'evacuation center, ward office and a family contact outside your area.', s['body']),
        ]

    files = {
        'flood-safety-guide.pdf': ('Flood Safety Guide', 'What to do before, during and after a flood', safety_story),
        'flood-emergency-checklist.pdf': ('Flood Emergency Checklist',
                                          'Prepare this kit in advance and keep it where you can grab it quickly',
                                          _sections(CHECKLIST)),
        'evacuation-planning-guide.pdf': ('Evacuation Planning Guide',
                                          'Plan your route and actions before you need them',
                                          _sections(EVACUATION)),
        'first-aid-guide.pdf': ('First Aid Guide for Floods',
                                'Basic first aid until professional help arrives', _sections(FIRST_AID)),
        'emergency-contact-directory.pdf': ('Emergency Contact Directory', 'National emergency numbers (India)',
                                            contacts_story),
    }
    written = []
    for name, (title, subtitle, story_fn) in files.items():
        path = os.path.join(out_dir, name)
        _build(path, title, subtitle, story_fn)
        written.append(path)
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', default=DEFAULT_OUT, help='output directory (default: frontend/public/resources)')
    args = parser.parse_args()
    for path in build_all(args.out):
        print(f'wrote {path} ({os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    main()
