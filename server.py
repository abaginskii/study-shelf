import base64
import cgi
import hashlib
import hmac
import html
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA = Path(os.getenv('DATA_DIR', ROOT / 'data')).resolve()
FILES = DATA / 'files'
STATIC = ROOT / 'static'
DATA.mkdir(parents=True, exist_ok=True)
FILES.mkdir(parents=True, exist_ok=True)
DB = DATA / 'library.sqlite3'
PASSWORD = os.getenv('APP_PASSWORD', '')
SECRET = os.getenv('APP_SECRET', '')
AI_KEY = os.getenv('OPENAI_API_KEY', '')
MAX_BYTES = 60 * 1024 * 1024


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def init():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT 'Без предмета',
          kind TEXT NOT NULL, filename TEXT, mimetype TEXT, original_text TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '', terms TEXT NOT NULL DEFAULT '[]', questions TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'inbox', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS topics (
          id TEXT PRIMARY KEY, title TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
          material_id TEXT, created_at TEXT NOT NULL,
          FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE SET NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS material_search USING fts5(id UNINDEXED,title,subject,original_text,summary);
        ''')


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def get_material(mid):
    with connect() as db:
        row = db.execute('SELECT * FROM materials WHERE id=?', (mid,)).fetchone()
        return dict(row) if row else None


def save_search(db, mid):
    row = db.execute('SELECT * FROM materials WHERE id=?', (mid,)).fetchone()
    db.execute('DELETE FROM material_search WHERE id=?', (mid,))
    db.execute('INSERT INTO material_search VALUES (?,?,?,?,?)',
               (mid, row['title'], row['subject'], row['original_text'], row['summary']))


def json_request(url, payload, key=AI_KEY):
    req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=110) as res:
        return json.load(res)


def response_text(result):
    return ''.join(part.get('text', '') for item in result.get('output', [])
                   for part in item.get('content', []) if part.get('type') == 'output_text')


def transcribe(data, filename, mime):
    boundary = '----Study' + secrets.token_hex(12)
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-4o-mini-transcribe\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename.replace(chr(34), "")}"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request('https://api.openai.com/v1/audio/transcriptions', data=body,
        headers={'Authorization': 'Bearer ' + AI_KEY, 'Content-Type': f'multipart/form-data; boundary={boundary}'}, method='POST')
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.load(res).get('text', '')


def ai_extract_image(data, mime):
    result = json_request('https://api.openai.com/v1/responses', {
        'model': os.getenv('OPENAI_MODEL', 'gpt-4.1-mini'),
        'input': [{'role': 'user', 'content': [
            {'type': 'input_text', 'text': 'Распознай весь читаемый текст на изображении. Сохрани структуру. Не выдумывай нечитаемое; помечай [неразборчиво]. Верни только распознанный текст.'},
            {'type': 'input_image', 'image_url': f'data:{mime};base64,{base64.b64encode(data).decode()}'}]}]})
    return response_text(result)


def ai_study(text, title):
    prompt = ('Подготовь учебный материал на русском языке СТРОГО по предоставленному источнику. '
              'Не добавляй непроверенные факты. Верни только JSON объект с полями: '
              'summary (понятный конспект с абзацами), terms (массив строк), '
              'questions (массив объектов {question,answer,source_quote}, 5 штук). '
              'source_quote — короткий дословный фрагмент из источника; если нет, пустая строка. '
              f'Название: {title}\nИсточник:\n{text[:45000]}')
    result = json_request('https://api.openai.com/v1/responses', {
        'model': os.getenv('OPENAI_MODEL', 'gpt-4.1-mini'),
        'input': [{'role': 'user', 'content': prompt}],
        'text': {'format': {'type': 'json_object'}}})
    return json.loads(response_text(result))


def fallback_study(text):
    blocks = [x.strip() for x in re.split(r'\n\s*\n', text) if x.strip()]
    summary = '\n\n'.join(blocks[:6])[:3500]
    sentences = [x.strip() for x in re.split(r'(?<=[.!?])\s+', text) if len(x.strip()) > 45]
    questions = [{'question': 'Объясните своими словами: ' + s[:100].rstrip('.!?') + '…',
                  'answer': s[:350], 'source_quote': s[:180]} for s in sentences[:5]]
    return {'summary': summary, 'terms': [], 'questions': questions}


def file_text(data, mime, name):
    if mime == 'application/pdf' or name.lower().endswith('.pdf'):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return '\n\n'.join((p.extract_text() or '') for p in reader.pages)[:120000], None
        except ImportError:
            return '', 'Для PDF установите зависимости из requirements.txt.'
        except Exception:
            return '', 'Не удалось прочитать текст PDF. Возможно, это скан.'
    if mime.startswith('text/') or name.lower().endswith(('.txt', '.md')):
        return data.decode('utf-8-sig', 'replace')[:120000], None
    if mime.startswith('image/'):
        if not AI_KEY:
            return '', 'Фото сохранено. Для распознавания добавьте OPENAI_API_KEY.'
        return ai_extract_image(data, mime), None
    if mime.startswith('video/'):
        return '', 'Видео сохранено. Автоматическая расшифровка видео пока не поддерживается; загрузите аудиодорожку отдельно.'
    if mime.startswith('audio/'):
        if not AI_KEY:
            return '', 'Запись сохранена. Для расшифровки добавьте OPENAI_API_KEY.'
        if len(data) > 25 * 1024 * 1024:
            return '', 'Запись сохранена. Для расшифровки нужен файл до 25 МБ.'
        return transcribe(data, name, mime), None
    return '', 'Файл сохранён, но для этого формата нет автоматического извлечения текста.'


def public_material(row):
    row = dict(row)
    row['terms'] = json.loads(row['terms'])
    row['questions'] = json.loads(row['questions'])
    row['file_url'] = '/api/materials/' + row['id'] + '/file' if row['filename'] else None
    return row


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args), flush=True)

    def send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def cookie_ok(self):
        if not PASSWORD:
            return True
        if not SECRET:
            return False
        jar = cookies.SimpleCookie()
        try: jar.load(self.headers.get('Cookie', ''))
        except cookies.CookieError: return False
        token = jar.get('study_session')
        if not token: return False
        try:
            stamp, signature = token.value.split('.', 1)
            if time.time() - int(stamp) > 30 * 86400: return False
            expected = hmac.new(SECRET.encode(), stamp.encode(), hashlib.sha256).hexdigest()
            return hmac.compare_digest(expected, signature)
        except (ValueError, TypeError): return False

    def authorized(self):
        if self.cookie_ok(): return True
        self.send(401, {'error': 'Нужен вход в приложение'})
        return False

    def read_json(self):
        size = int(self.headers.get('Content-Length', '0'))
        if size > 2_000_000: raise ValueError('Слишком большой запрос')
        return json.loads(self.rfile.read(size))

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        if path == '/api/session':
            self.send(200, {'authenticated': self.cookie_ok(), 'password_required': bool(PASSWORD), 'ai_available': bool(AI_KEY)})
            return
        if path.startswith('/api/'):
            if not self.authorized(): return
            if path == '/api/materials':
                q = parse_qs(url.query).get('q', [''])[0].strip()
                subject = parse_qs(url.query).get('subject', [''])[0]
                with connect() as db:
                    terms = re.findall(r'\w+', q, flags=re.UNICODE)[:8]
                    if terms:
                        query = ' AND '.join('\"' + term + '\"*' for term in terms)
                        rows = db.execute('SELECT m.* FROM materials m JOIN material_search s ON s.id=m.id WHERE material_search MATCH ? ORDER BY m.created_at DESC', (query,)).fetchall()
                    else:
                        rows = db.execute('SELECT * FROM materials ORDER BY created_at DESC').fetchall()
                self.send(200, {'materials': [public_material(r) for r in rows if not subject or r['subject'] == subject]})
                return
            if path == '/api/topics':
                with connect() as db: rows = db.execute('SELECT * FROM topics ORDER BY created_at DESC').fetchall()
                self.send(200, {'topics': [dict(x) for x in rows]})
                return
            match = re.fullmatch(r'/api/materials/([0-9a-f-]+)(/file)?', path)
            if match:
                row = get_material(match[1])
                if not row: self.send(404, {'error': 'Материал не найден'}); return
                if match[2]:
                    file = FILES / row['id']
                    if not file.is_file(): self.send(404, {'error': 'Файл не найден'}); return
                    self.send_response(200)
                    self.send_header('Content-Type', row['mimetype'] or 'application/octet-stream')
                    self.send_header('Content-Disposition', 'inline; filename="' + re.sub(r'[^a-zA-Z0-9._-]', '_', row['filename'] or 'file') + '"')
                    self.send_header('Content-Length', str(file.stat().st_size))
                    self.end_headers()
                    with file.open('rb') as f:
                        while chunk := f.read(65536): self.wfile.write(chunk)
                    return
                self.send(200, {'material': public_material(row)})
                return
            self.send(404, {'error': 'Не найдено'}); return
        file = STATIC / ('index.html' if path == '/' else path.lstrip('/'))
        if not file.is_file() or STATIC not in file.resolve().parents:
            self.send_error(404); return
        data = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/login':
            try: value = self.read_json().get('password', '')
            except Exception: self.send(400, {'error': 'Неверный запрос'}); return
            if not PASSWORD or not SECRET or not hmac.compare_digest(value, PASSWORD):
                self.send(403, {'error': 'Неверный пароль'}); return
            stamp = str(int(time.time()))
            sig = hmac.new(SECRET.encode(), stamp.encode(), hashlib.sha256).hexdigest()
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Set-Cookie', f'study_session={stamp}.{sig}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000' + ('; Secure' if self.headers.get('X-Forwarded-Proto') == 'https' else ''))
            self.end_headers(); self.wfile.write(body); return
        if not self.authorized(): return
        if path == '/api/materials':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length > MAX_BYTES: self.send(413, {'error': 'Файл слишком большой (максимум 60 МБ)'}); return
                if self.headers.get('Content-Type', '').startswith('multipart/form-data'):
                    form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST','CONTENT_TYPE':self.headers['Content-Type'],'CONTENT_LENGTH':str(length)})
                    title = (form.getfirst('title') or '').strip()
                    subject = (form.getfirst('subject') or 'Без предмета').strip()
                    field = form['file'] if 'file' in form else None
                    if field is None or not field.filename: raise ValueError('Выберите файл')
                    filename = Path(field.filename).name[:200]
                    mime = field.type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                    data = field.file.read(MAX_BYTES + 1)
                    if len(data) > MAX_BYTES: raise ValueError('Файл слишком большой')
                    kind = 'pdf' if filename.lower().endswith('.pdf') else ('image' if mime.startswith('image/') else ('audio' if mime.startswith(('audio/', 'video/')) else 'text'))
                    original, warning = file_text(data, mime, filename)
                else:
                    payload = self.read_json()
                    title = (payload.get('title') or '').strip()
                    subject = (payload.get('subject') or 'Без предмета').strip()
                    original = (payload.get('text') or '').strip()[:120000]
                    filename = mime = data = None
                    kind, warning = 'text', None
                if not title: title = Path(filename).stem if filename else original.splitlines()[0][:80] if original else 'Без названия'
                title = title[:160]; subject = subject[:100] or 'Без предмета'
                if not original and not data: raise ValueError('Добавьте текст или файл')
                mid = str(uuid.uuid4())
                if data is not None: (FILES / mid).write_bytes(data)
                with connect() as db:
                    db.execute('INSERT INTO materials (id,title,subject,kind,filename,mimetype,original_text,created_at) VALUES (?,?,?,?,?,?,?,?)',
                               (mid,title,subject,kind,filename,mime,original,utc()))
                    save_search(db, mid)
                self.send(201, {'material': public_material(get_material(mid)), 'warning': warning}); return
            except Exception as e:
                self.send(400, {'error': str(e)}); return
        match = re.fullmatch(r'/api/materials/([0-9a-f-]+)/generate', path)
        if match:
            row = get_material(match[1])
            if not row: self.send(404, {'error': 'Материал не найден'}); return
            if not row['original_text'].strip(): self.send(400, {'error': 'Сначала добавьте распознанный текст'}); return
            try: study = ai_study(row['original_text'], row['title']) if AI_KEY else fallback_study(row['original_text'])
            except Exception as e: self.send(502, {'error': 'Не удалось создать конспект: ' + str(e)}); return
            with connect() as db:
                db.execute('UPDATE materials SET summary=?,terms=?,questions=?,status=? WHERE id=?',
                    (str(study.get('summary',''))[:20000],json.dumps(study.get('terms',[])[:30],ensure_ascii=False),
                     json.dumps(study.get('questions',[])[:10],ensure_ascii=False),'ready',row['id']))
                save_search(db,row['id'])
            self.send(200, {'material': public_material(get_material(row['id']))}); return
        if path == '/api/topics':
            try:
                payload = self.read_json()
                title = str(payload.get('title','')).strip()[:160]
                body = str(payload.get('body','')).strip()[:20000]
                mid = payload.get('material_id')
                if not title or not body or (mid and not get_material(mid)): raise ValueError('Укажите название, текст и существующий источник')
                topic = {'id':str(uuid.uuid4()),'title':title,'body':body,'material_id':mid,'created_at':utc()}
                with connect() as db: db.execute('INSERT INTO topics VALUES (?,?,?,?,?)',tuple(topic.values()))
                self.send(201, {'topic':topic}); return
            except Exception as e: self.send(400, {'error':str(e)}); return
        self.send(404, {'error':'Не найдено'})

    def do_PATCH(self):
        match = re.fullmatch(r'/api/materials/([0-9a-f-]+)', urlparse(self.path).path)
        if not self.authorized(): return
        if not match: self.send(404, {'error':'Не найдено'}); return
        row = get_material(match[1])
        if not row: self.send(404, {'error':'Материал не найден'}); return
        try:
            payload = self.read_json()
            allowed = {'title':160,'subject':100,'original_text':120000,'summary':20000}
            fields = {k:str(v).strip()[:n] for k,n in allowed.items() if (v:=payload.get(k)) is not None}
            if not fields: raise ValueError('Нет изменений')
            with connect() as db:
                db.execute('UPDATE materials SET ' + ','.join(k+'=?' for k in fields) + ' WHERE id=?', (*fields.values(),row['id']))
                save_search(db,row['id'])
            self.send(200, {'material':public_material(get_material(row['id']))})
        except Exception as e: self.send(400, {'error':str(e)})


if __name__ == '__main__':
    init()
    host = os.getenv('HOST', '127.0.0.1')
    port = int(os.getenv('PORT', '8080'))
    if host != '127.0.0.1' and (not PASSWORD or not SECRET):
        raise SystemExit('Для публичного запуска задайте APP_PASSWORD и APP_SECRET')
    print(f'Study Space: http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
