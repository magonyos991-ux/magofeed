"""Tableau de suivi des commentaires : l'étude de marché gratuite du Reel."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

OUT = sys.argv[1]
wb = Workbook()

ARIAL = 'Arial'
HEAD_FILL = PatternFill('solid', fgColor='1A1714')
HEAD_FONT = Font(name=ARIAL, bold=True, color='FFFFFF', size=10)
INPUT_FILL = PatternFill('solid', fgColor='FFF9E0')   # cellules à remplir
EXAMPLE_FONT = Font(name=ARIAL, italic=True, color='7A6F63', size=10)
BODY = Font(name=ARIAL, size=10)
BOLD = Font(name=ARIAL, size=10, bold=True)
thin = Side(style='thin', color='D9D2C5')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

# ---------------------------------------------------------------- Réponses
ws = wb.active
ws.title = 'Réponses'
headers = ['Date', 'Pseudo', 'Canette', 'Quartier', 'Source', 'Au catalogue ?',
           'Action', 'Fait le', 'Répondu ?', 'Retour J+7 ?', 'Note']
widths = [12, 18, 24, 18, 14, 15, 30, 12, 11, 13, 40]
for i, (h, w) in enumerate(zip(headers, widths), 1):
    c = ws.cell(row=1, column=i, value=h)
    c.font = HEAD_FONT
    c.fill = HEAD_FILL
    c.alignment = Alignment(vertical='center', wrap_text=True)
    c.border = BORDER
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 30
ws.freeze_panes = 'A2'

# Ligne d'exemple (à écraser)
example = ['2026-10-07', '@exemple_bxl', 'Ramune', 'Schaerbeek', 'Commentaire', 'Oui',
           'Chasse lancée', '2026-10-07', 'Oui', 'Non', 'EXEMPLE À ÉCRASER : une ligne par personne qui cite une canette']
for i, v in enumerate(example, 1):
    c = ws.cell(row=2, column=i, value=v)
    c.font = EXAMPLE_FONT
    c.fill = INPUT_FILL
    c.border = BORDER

LAST = 500
for r in range(3, LAST + 1):
    for i in range(1, len(headers) + 1):
        c = ws.cell(row=r, column=i)
        c.font = BODY
        c.fill = INPUT_FILL
        c.border = BORDER

# Listes déroulantes
dv_source = DataValidation(type='list', formula1='"Commentaire,DM,Story,WhatsApp"', allow_blank=True)
dv_oui = DataValidation(type='list', formula1='"Oui,Non"', allow_blank=True)
dv_action = DataValidation(type='list', formula1='"Proposer une boisson,Chasse lancée,Lien envoyé,À vérifier sur place,Vérifié elle y est,Rien à faire"', allow_blank=True)
for dv, col in ((dv_source, 'E'), (dv_oui, 'F'), (dv_action, 'G'), (dv_oui, 'I'), (dv_oui, 'J')):
    ws.add_data_validation(dv) if dv not in ws.data_validations.dataValidation else None
    dv.add(f'{col}2:{col}{LAST}')
for col in ('A', 'H'):
    for r in range(2, LAST + 1):
        ws[f'{col}{r}'].number_format = 'yyyy-mm-dd'

ws['C1'].comment = Comment("Écris la canette comme le dit la personne, puis normalise : « Ramune », pas « ramune fraise de chez le japonais ». Même orthographe que dans l'app.", 'Magofeed')
ws['D1'].comment = Comment("Commune ou quartier, un mot : Schaerbeek, Flagey, Saint-Gilles, Matongé… Si la personne ne le dit pas, demande-le dans ta réponse.", 'Magofeed')
ws['G1'].comment = Comment("Un seul geste dans l'app par réponse : Proposer une boisson (pas au catalogue) · Chasse lancée (au catalogue, personne autour) · Lien envoyé (déjà vue en rayon) · À vérifier sur place (quelqu'un donne un magasin) · Vérifié elle y est.", 'Magofeed')

# ---------------------------------------------------------------- Bilan
b = wb.create_sheet('Bilan')
b.column_dimensions['A'].width = 28
b.column_dimensions['B'].width = 12
b.column_dimensions['C'].width = 7
b.column_dimensions['D'].width = 28
b.column_dimensions['E'].width = 12
b.column_dimensions['G'].width = 34
b.column_dimensions['H'].width = 16

def head(cell, text):
    c = b[cell]
    c.value = text
    c.font = HEAD_FONT
    c.fill = HEAD_FILL
    c.border = BORDER

b['A1'].value = 'Bilan automatique des réponses'
b['A1'].font = Font(name=ARIAL, bold=True, size=14)
b['A2'].value = "Tout se calcule depuis l'onglet « Réponses ». Tu ne tapes rien ici, sauf pour ajouter une canette ou un quartier dans les listes (cellules jaunes)."
b['A2'].font = Font(name=ARIAL, italic=True, size=9, color='7A6F63')

head('A4', 'Canette'); head('B4', 'Citée (fois)'); head('C4', 'tri')
head('D4', 'Quartier'); head('E4', 'Cité (fois)')
head('G4', 'Chiffres de la première heure et après'); head('H4', 'Valeur')

canettes = ['Milkis', 'Ramune', 'Ciao Energy', 'Prime', 'Guaraná Antarctica', 'Calypso', 'Mogu Mogu',
            'Pocari Sweat', 'Inca Kola', 'Jarritos', 'Vimto', 'Calpico', 'Sumol', 'Mountain Dew',
            'Chupa Chups soda', 'Rani Float', 'Barbican', 'Soofty', "B'lue", 'Dr Pepper',
            'Fanta exotique (import)', 'Ice Tea Pastèque', 'Monster (goût rare)', 'Red Bull (édition rare)', 'AA Drink']
quartiers = ['Bruxelles-Ville', 'Ixelles', 'Schaerbeek', 'Saint-Gilles', 'Etterbeek', 'Anderlecht', 'Molenbeek',
             'Forest', 'Uccle', 'Jette', 'Evere', 'Auderghem', 'Woluwe-Saint-Lambert', 'Woluwe-Saint-Pierre',
             'Watermael-Boitsfort', 'Koekelberg', 'Berchem-Sainte-Agathe', 'Ganshoren', 'Saint-Josse',
             'Flagey', 'Matongé', 'Châtelain', 'Dansaert', 'Sainte-Catherine', 'Marolles', 'Louise', 'Cimetière d\'Ixelles']

N_SLOTS = 40
for i in range(N_SLOTS):
    r = 5 + i
    a = b.cell(row=r, column=1, value=canettes[i] if i < len(canettes) else None)
    a.font = BODY; a.fill = INPUT_FILL; a.border = BORDER
    f = b.cell(row=r, column=2, value=f'=IF(A{r}="","",COUNTIF(Réponses!$C$3:$C${LAST},A{r}))')
    f.font = BODY; f.border = BORDER
    k = b.cell(row=r, column=3, value=f'=IF(A{r}="",0,B{r}+(100-ROW())/1000)')
    k.font = Font(name=ARIAL, size=8, color='B5AA9B'); k.number_format = '0.000'
    d = b.cell(row=r, column=4, value=quartiers[i] if i < len(quartiers) else None)
    d.font = BODY; d.fill = INPUT_FILL; d.border = BORDER
    g = b.cell(row=r, column=5, value=f'=IF(D{r}="","",COUNTIF(Réponses!$D$3:$D${LAST},D{r}))')
    g.font = BODY; g.border = BORDER
END = 5 + N_SLOTS - 1

stats = [
    ('Réponses notées (hors ligne d\'exemple)', f'=COUNTA(Réponses!$B$3:$B${LAST})'),
    ('Canettes différentes citées', f'=SUMPRODUCT((Réponses!$C$3:$C${LAST}<>"")/COUNTIF(Réponses!$C$3:$C${LAST},Réponses!$C$3:$C${LAST}&""))'),
    ('Canettes citées mais absentes de la liste de gauche', f'=COUNTA(Réponses!$C$3:$C${LAST})-SUM(B5:B{END})'),
    ('Chasses lancées', f'=COUNTIF(Réponses!$G$3:$G${LAST},"Chasse lancée")'),
    ('Boissons proposées au catalogue', f'=COUNTIF(Réponses!$G$3:$G${LAST},"Proposer une boisson")'),
    ('Liens envoyés', f'=COUNTIF(Réponses!$G$3:$G${LAST},"Lien envoyé")'),
    ('Magasins à vérifier sur place', f'=COUNTIF(Réponses!$G$3:$G${LAST},"À vérifier sur place")'),
    ('Vérifiés, elle y est', f'=COUNTIF(Réponses!$G$3:$G${LAST},"Vérifié elle y est")'),
    ('Réponses sans retour de ta part', f'=COUNTIF(Réponses!$I$3:$I${LAST},"Non")'),
    ('Retours J+7 encore à faire', f'=COUNTIF(Réponses!$J$3:$J${LAST},"Non")'),
]
for i, (label, formula) in enumerate(stats):
    r = 5 + i
    l = b.cell(row=r, column=7, value=label); l.font = BODY; l.border = BORDER
    v = b.cell(row=r, column=8, value=formula); v.font = BOLD; v.border = BORDER

head('G17', 'Tes 3 prochains Reels (canettes les plus citées)'); head('H17', 'Citée (fois)')
for k in range(1, 4):
    r = 17 + k
    # k-ième plus grand compteur ; en cas d'égalité, la première de la liste.
    pos = f'MATCH(LARGE($C$5:$C${END},{k}),$C$5:$C${END},0)'
    name = f'=IFERROR(IF(INDEX($B$5:$B${END},{pos})=0,"",INDEX($A$5:$A${END},{pos})),"")'
    b.cell(row=r, column=7, value=name).font = BOLD
    b.cell(row=r, column=8, value=f'=IFERROR(IF(INDEX($B$5:$B${END},{pos})=0,"",INDEX($B$5:$B${END},{pos})),"")').font = BOLD
    b.cell(row=r, column=7).border = BORDER; b.cell(row=r, column=8).border = BORDER
b['G21'].value = "À égalité, c'est la canette la plus haute dans la liste de gauche qui passe devant (colonne « tri »)."
b['G21'].font = Font(name=ARIAL, italic=True, size=9, color='7A6F63')

head('G23', 'Quartier le plus cité'); head('H23', 'Cité (fois)')
b['G24'].value = f'=IFERROR(IF(MAX($E$5:$E${END})=0,"",INDEX($D$5:$D${END},MATCH(MAX($E$5:$E${END}),$E$5:$E${END},0))),"")'
b['H24'].value = f'=IFERROR(IF(MAX($E$5:$E${END})=0,"",MAX($E$5:$E${END})),"")'
b['G24'].font = BOLD; b['H24'].font = BOLD

b['G27'].value = 'Légende'
b['G27'].font = BOLD
b['G28'].value = 'Jaune = tu remplis. Blanc = ça se calcule tout seul.'
b['G29'].value = "La ligne 2 de « Réponses » est un exemple : écrase-la avec ta première vraie réponse."
b['G30'].value = "Compte depuis la ligne 3 : l'exemple n'est jamais compté."
for c in ('G28', 'G29', 'G30'):
    b[c].font = Font(name=ARIAL, size=9, color='7A6F63')

for row in b.iter_rows(min_row=1, max_row=40, min_col=1, max_col=8):
    for c in row:
        if c.font.name != ARIAL:
            c.font = BODY
        c.alignment = Alignment(vertical='center')

wb.save(OUT)
print('saved', OUT)
