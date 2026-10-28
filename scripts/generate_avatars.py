"""Génère un avatar illustré 2D (visage + épaules) par politicien à partir de sa photo.

Utilise un modèle d'image Gemini (Google) : la photo de la personne est envoyée avec
une consigne de style, et l'image renvoyée est enregistrée dans data/avatars/<id>.jpg.

Photo source, dans l'ordre :
  1. data/photos/<id>.jpg ou .png si elle existe ;
  2. sinon la photo principale de sa page Wikipédia (fr), sous licence libre, téléchargée dans
     data/photos/<id>.jpg et créditée dans data/photos/CREDITS.csv.
Si Gemini refuse la photo locale (photo d'agence avec filigrane, par exemple), le script
réessaie avec la photo Wikipédia, rangée dans data/photos/wikipedia/<id>.jpg.

Prérequis :
  pip install google-genai pillow requests
  export GEMINI_API_KEY=...   (clé créée sur https://aistudio.google.com/apikey)

Attention : la génération d'image n'est pas incluse dans l'offre gratuite de l'API Gemini.
Compter environ 0,034 $ par image en 1K (tarif d'octobre 2026), soit moins de 2 $ pour tous
les politiciens. Lancer d'abord avec --dry-run pour voir ce qui sera généré.

Exemples :
  python3 scripts/generate_avatars.py --dry-run
  python3 scripts/generate_avatars.py --ids ephilippe gattal
  python3 scripts/generate_avatars.py --only-2027
  python3 scripts/generate_avatars.py --force --style-ref exemple.png
"""
import argparse
import csv
import html
import io
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SPREADSHEETS = ROOT / 'data' / 'spreadsheet'
PHOTOS = ROOT / 'data' / 'photos'
AVATARS = ROOT / 'data' / 'avatars'
CREDITS = PHOTOS / 'CREDITS.csv'

DEFAULT_MODEL = 'gemini-nano-banana-2.1'
PRICE_PER_IMAGE_USD = 0.0336
USER_AGENT = 'kidikoi-avatars/1.0 (https://github.com/VincentCavez/kidikoi)'

# Personnes sans page Wikipédia à leur nom (ou avec un homonyme) : photo à fournir à la main
NO_WIKIPEDIA = {'slabib', 'mmarkovic', 'bmathieu', 'amikolajczak', 'mmlekuz', 'gplatret'}
# Titre de page Wikipédia quand il diffère de « Prénom Nom »
WIKIPEDIA_TITLES = {}

PROMPT = """Turn the person in this photo into a flat 2D vector-style avatar illustration.
Head and shoulders only, centered, facing the viewer, with a gentle friendly expression.
Keep the person clearly recognizable: same face shape, hairstyle, hair color, skin tone,
glasses, beard or moustache if any, and similar clothing.
Style: clean modern flat illustration like a set of stock profile avatars, smooth simple
shapes, soft subtle shading, no outlines, no text, no logos, no flags, no hands.
Background: one plain uniform color {background} filling the whole square image.
Square framing, the shoulders reaching the bottom edge of the image."""

STYLE_REF_PROMPT = 'Use the second image only as a reference for the illustration style, not for the person.'


def read_people(include_fiction):
    """Retourne [(id, nom complet, est_candidat_2027)] depuis les CSV du jeu."""
    people = []
    with open(SPREADSHEETS / 'politiques.csv', encoding='utf-8') as f:
        for row in csv.DictReader(f, delimiter=';'):
            name = f"{row['prenom']} {row['nom']}".strip()
            people.append((row['id'], name, (row.get('presidentielle_2027') or '').strip() == 'oui'))
    if include_fiction:
        with open(SPREADSHEETS / 'personnages.csv', encoding='utf-8') as f:
            for row in csv.DictReader(f, delimiter=';'):
                people.append((row['id'], f"{row['prenom']} {row['nom']}".strip(), False))
    return people


def local_photo(person_id):
    for ext in ('jpg', 'png'):
        path = PHOTOS / f'{person_id}.{ext}'
        if path.exists():
            return path
    return None


def wikipedia_query(**params):
    params.update(action='query', format='json', formatversion=2)
    resp = requests.get('https://fr.wikipedia.org/w/api.php', params=params,
                        headers={'User-Agent': USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp.json()['query']['pages'][0]


def find_wikipedia_photo(person_id, name):
    """Cherche la photo principale de la page Wikipédia : (url, fichier, auteur, licence) ou None."""
    if person_id in NO_WIKIPEDIA:
        return None
    title = WIKIPEDIA_TITLES.get(person_id, name)
    page = wikipedia_query(titles=title, redirects=1, prop='pageimages|pageprops', piprop='name', pilicense='free')
    if page.get('missing') or 'disambiguation' in page.get('pageprops', {}) or 'pageimage' not in page:
        return None

    return file_info(page['pageimage'])


def file_info(file_name):
    """Infos d'un fichier Commons : (url, page, auteur, licence) ou None."""
    file_page = wikipedia_query(titles=f"File:{file_name}", prop='imageinfo',
                                iiprop='url|extmetadata', iiurlwidth=800)
    if 'imageinfo' not in file_page:  # fichier supprimé ou introuvable
        return None
    info = file_page['imageinfo'][0]
    meta = info.get('extmetadata', {})
    # Les métadonnées Commons contiennent du HTML (liens vers l'auteur)
    clean = lambda key: html.unescape(re.sub(r'<[^>]+>', '', meta.get(key, {}).get('value') or '')).replace('\n', ' ').strip()
    return {
        'file': file_name,
        'url': info.get('thumburl') or info['url'],
        'page': info.get('descriptionurl', ''),
        'artist': clean('Artist'),
        'license': clean('LicenseShortName'),
    }


OTHER_WIKIPEDIAS = ['en', 'de', 'it', 'es', 'nl', 'pt', 'pl', 'ca', 'sv', 'cs', 'ro', 'uk']


def find_alternative_photos(person_id, name, exclude, limit):
    """Photos principales (libres) choisies par les Wikipédias d'autres langues."""
    if person_id in NO_WIKIPEDIA:
        return []
    title = WIKIPEDIA_TITLES.get(person_id, name)
    page = wikipedia_query(titles=title, redirects=1, prop='langlinks', lllimit='max')
    titles = {link['lang']: link['title'] for link in page.get('langlinks', [])}
    found, seen = [], set(exclude)
    for lang in OTHER_WIKIPEDIAS:
        if lang not in titles or len(found) >= limit:
            continue
        resp = requests.get(f'https://{lang}.wikipedia.org/w/api.php', headers={'User-Agent': USER_AGENT}, timeout=30,
                            params=dict(action='query', titles=titles[lang], prop='pageimages', piprop='name',
                                        pilicense='free', format='json', formatversion=2))
        file_name = resp.json()['query']['pages'][0].get('pageimage')
        if not file_name or file_name in seen or not file_name.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        seen.add(file_name)
        info = file_info(file_name)
        if info:
            found.append(info)
    return found


def from_wikipedia(path):
    """La photo a-t-elle déjà été téléchargée depuis Wikipédia (listée dans CREDITS.csv) ?"""
    if not CREDITS.exists():
        return False
    with open(CREDITS, encoding='utf-8') as f:
        return any(row['fichier'] == str(path.relative_to(ROOT)) for row in csv.DictReader(f))


def download_photo(person_id, photo, path):
    from PIL import Image

    resp = requests.get(photo['url'], headers={'User-Agent': USER_AGENT}, timeout=60)
    resp.raise_for_status()
    image = Image.open(io.BytesIO(resp.content)).convert('RGB')
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'JPEG', quality=90)

    new_file = not CREDITS.exists()
    with open(CREDITS, 'a', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(['fichier', 'source', 'auteur', 'licence'])
        writer.writerow([path.relative_to(ROOT), photo['page'], photo['artist'], photo['license']])
    return path


def generate_avatar(client, model, photo_path, style_ref, background, size_px):
    from google.genai import errors, types
    from PIL import Image

    contents = [PROMPT.format(background=background), Image.open(photo_path)]
    if style_ref:
        contents += [STYLE_REF_PROMPT, Image.open(style_ref)]
    config = types.GenerateContentConfig(
        response_modalities=['IMAGE'],
        image_config=types.ImageConfig(aspect_ratio='1:1', image_size='1K'),
    )

    for attempt in range(5):
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            break
        except errors.APIError as error:
            # Quota dépassé ou serveur surchargé : on réessaie avec un délai croissant
            if error.code in (429, 500, 503) and attempt < 4:
                time.sleep(10 * 2 ** attempt)
                continue
            raise

    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content else []) or []:
            if part.inline_data and part.inline_data.data:
                image = Image.open(io.BytesIO(part.inline_data.data)).convert('RGB')
                return image.resize((size_px, size_px), Image.LANCZOS)
    reason = response.candidates[0].finish_reason if response.candidates else response.prompt_feedback
    raise RuntimeError(f"aucune image renvoyée ({reason})")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--ids', nargs='+', help='ne traiter que ces ids (ex. ephilippe gattal)')
    parser.add_argument('--only-2027', action='store_true', help='seulement les candidats à la présidentielle 2027')
    parser.add_argument('--include-fiction', action='store_true', help='inclure aussi les personnages de fiction')
    parser.add_argument('--force', action='store_true', help='régénérer même si l’avatar existe déjà')
    parser.add_argument('--dry-run', action='store_true', help='afficher ce qui serait fait, sans appeler Gemini')
    parser.add_argument('--no-download', action='store_true', help='ne pas chercher de photo sur Wikipédia')
    parser.add_argument('--model', default=DEFAULT_MODEL, help=f'modèle Gemini (défaut : {DEFAULT_MODEL})')
    parser.add_argument('--style-ref', type=Path, help='image d’exemple du style voulu (facultatif)')
    parser.add_argument('--background', default='#EFE6DF', help='couleur de fond des avatars (défaut : #EFE6DF)')
    parser.add_argument('--size', type=int, default=512, help='taille finale en pixels (défaut : 512)')
    parser.add_argument('--alt-photos', type=int, default=0,
                        help='si Gemini refuse, essayer jusqu’à N autres photos libres (Wikipédias étrangères)')
    args = parser.parse_args()

    people = read_people(args.include_fiction)
    if args.ids:
        wanted = set(args.ids)
        unknown = wanted - {pid for pid, _, _ in people}
        if unknown:
            parser.error(f"ids inconnus : {', '.join(sorted(unknown))}")
        people = [p for p in people if p[0] in wanted]
    if args.only_2027:
        people = [p for p in people if p[2]]

    AVATARS.mkdir(parents=True, exist_ok=True)
    client = None
    if not args.dry_run:
        from google import genai
        client = genai.Client()  # lit GEMINI_API_KEY (ou GOOGLE_API_KEY)

    todo, done, skipped, failed = 0, [], [], []
    for person_id, name, _ in people:
        target = AVATARS / f'{person_id}.jpg'
        if target.exists() and not args.force:
            skipped.append(f'{person_id} (avatar déjà présent)')
            continue

        photo = local_photo(person_id)
        wiki_cache = {}

        def wikipedia_photo():
            # Recherche faite au plus une fois par personne
            if 'info' not in wiki_cache:
                wiki_cache['info'] = None
                if not args.no_download:
                    try:
                        wiki_cache['info'] = find_wikipedia_photo(person_id, name)
                    except Exception as error:  # réseau, page inattendue…
                        print(f'  {person_id} : erreur Wikipédia ({error})')
            return wiki_cache['info']

        if photo:
            source = photo.relative_to(ROOT)
        elif wikipedia_photo():
            source = f"Wikipédia ({wikipedia_photo()['license'] or 'licence ?'}) {wikipedia_photo()['page']}"
        else:
            skipped.append(f'{person_id} ({name}) : pas de photo, à déposer dans data/photos/{person_id}.jpg')
            continue

        todo += 1
        if args.dry_run:
            print(f'[à générer] {person_id:15} {name:28} ← {source}')
            continue

        print(f'[{todo}] {person_id} ({name})…', end=' ', flush=True)
        try:
            if not photo:
                photo = download_photo(person_id, wikipedia_photo(), PHOTOS / f'{person_id}.jpg')
            # Photo refusée par Gemini : on retente avec d'autres photos libres
            fallbacks = []
            if photo == local_photo(person_id) and wikipedia_photo() and not from_wikipedia(photo):
                fallbacks.append((wikipedia_photo(), PHOTOS / 'wikipedia' / f'{person_id}.jpg'))
            avatar = None
            while avatar is None:
                try:
                    avatar = generate_avatar(client, args.model, photo, args.style_ref, args.background, args.size)
                except RuntimeError as refusal:
                    if not fallbacks and args.alt_photos and 'alt' not in wiki_cache:
                        exclude = [wikipedia_photo()['file']] if wikipedia_photo() else []
                        wiki_cache['alt'] = find_alternative_photos(person_id, name, exclude, args.alt_photos)
                        fallbacks = [(alt, PHOTOS / 'wikipedia' / f'{person_id}-{n + 2}.jpg')
                                     for n, alt in enumerate(wiki_cache['alt'])]
                    if not fallbacks:
                        raise
                    alt, path = fallbacks.pop(0)
                    print(f'refusée, essai avec {alt["page"].rsplit("/", 1)[-1][:40]}…', end=' ', flush=True)
                    photo = download_photo(person_id, alt, path)
            avatar.save(target, 'JPEG', quality=88)
            done.append(person_id)
            print('ok')
        except Exception as error:
            failed.append(f'{person_id} : {error}')
            print(f'échec ({error})')

    print()
    if args.dry_run:
        print(f'{todo} avatar(s) à générer, coût estimé ≈ {todo * PRICE_PER_IMAGE_USD:.2f} $ avec {args.model}.')
    else:
        print(f'{len(done)} avatar(s) générés dans {AVATARS.relative_to(ROOT)}/')
    if skipped:
        print(f'\nIgnorés ({len(skipped)}) :\n  ' + '\n  '.join(skipped))
    if failed:
        print(f'\nÉchecs ({len(failed)}) :\n  ' + '\n  '.join(failed))
        sys.exit(1)


if __name__ == '__main__':
    main()
