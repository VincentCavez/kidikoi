"""Serveur local pour valider ou refuser les citations depuis citations.html.

Le site publié sur GitHub Pages est statique et ne peut pas modifier les CSV. Ce serveur sert le
site sur ta machine et enregistre chaque clic « Valider » / « Refuser » directement dans la
colonne `statut` du fichier de citations (vide = à valider, `valide`, `refuse`).
Il ne reste ensuite qu'à commiter les CSV.

  python3 scripts/serveur_validation.py          # puis ouvrir http://localhost:8000/citations.html
  python3 scripts/serveur_validation.py --port 8080
"""
import argparse
import csv
import errno
import json
import os
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUOTE_FILES = {
    'politiques': ROOT / 'data' / 'spreadsheet' / 'politiques_citations.csv',
    'personnages': ROOT / 'data' / 'spreadsheet' / 'personnages_citations.csv',
}
STATUSES = {'', 'valide', 'refuse'}


def set_status(file_key, line_number, citation, status):
    """Remplace le statut (dernière colonne) de la ligne `line_number` (1 = première citation)."""
    path = QUOTE_FILES[file_key]
    lines = path.read_text(encoding='utf-8').rstrip('\n').split('\n')
    header = next(csv.reader([lines[0]]))
    if header[-1] != 'statut':
        raise ValueError(f'{path.name} : la dernière colonne doit être « statut »')
    if not 1 <= line_number < len(lines):
        raise ValueError('ligne inexistante')
    row = next(csv.reader([lines[line_number]]))
    # Garde-fou : le fichier a pu changer depuis le chargement de la page
    if row[0].strip() != citation.strip():
        raise ValueError('la citation ne correspond plus à cette ligne, recharge la page')
    prefix = lines[line_number].rsplit(',', 1)[0]
    lines[line_number] = f'{prefix},{status}'

    # Écriture atomique pour ne jamais laisser un CSV à moitié écrit
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix='.csv')
    with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
        f.write('\n'.join(lines) + '\n')
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    def log_request(self, code='-', size='-'):
        # La page essaie avatar, puis photo, puis image par défaut : ces 404 sont normaux
        if self.path.startswith('/api/') or (isinstance(code, int) and code >= 500):
            super().log_request(code, size)

    def log_error(self, format, *args):
        pass

    def end_headers(self):
        # Toujours relire les CSV à jour
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/ping':
            return self.send_json(200, {'ok': True})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/statut':
            return self.send_json(404, {'erreur': 'introuvable'})
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            if data.get('fichier') not in QUOTE_FILES or data.get('statut') not in STATUSES:
                raise ValueError('fichier ou statut invalide')
            set_status(data['fichier'], int(data['ligne']), data['citation'], data['statut'])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(400, {'erreur': str(error)})
        return self.send_json(200, {'ok': True})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8000, help='port local (défaut : 8000)')
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        raise SystemExit(f'Le port {args.port} est déjà utilisé : le serveur tourne peut-être déjà, '
                         f'ouvre http://localhost:{args.port}/citations.html. '
                         f'Sinon, choisis un autre port avec --port 8001.')
    print(f'Validation des citations : http://localhost:{args.port}/citations.html  (Ctrl+C pour arrêter)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
