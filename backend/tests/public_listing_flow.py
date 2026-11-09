"""Regression: an explicitly published vacant room is visible even before photos are added."""
import argparse
import json
import pathlib
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--state', required=True)
state = json.loads(pathlib.Path(parser.parse_args().state).read_text(encoding='utf-8'))
assert state['database'].startswith('smartrent_audit_') and ':5080/' not in state['base']
checks = 0


def req(path, method='GET', body=None, public=False, expected=200):
    global checks
    headers = {'Content-Type': 'application/json'}
    if not public:
        headers['Authorization'] = 'Bearer ' + state['tokens']['admin']
    request = urllib.request.Request(state['base'] + path, method=method, headers=headers,
                                    data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, content = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, content = error.code, error.read()
    assert status == expected, (method, path, status, content[:500])
    checks += 1
    return json.loads(content) if content else None


assert req('/dev/database-check', public=True)['database'] == state['database']
tag = uuid.uuid4().hex[:8]
p = req('/properties', 'POST', {'name': 'Listing regression ' + tag,
        'address': {'line': '1 Regression', 'locality': 'Listing', 'province': 'Regression'}, 'rates': []})
r = req('/rooms', 'POST', {'propertyId': p['id'], 'code': 'PUB' + tag,
        'name': 'No photo ' + tag, 'areaM2': 22, 'capacity': 2, 'rent': 3000000, 'rates': [], 'imageFileIds': []})
rid = r['id']


def visible():
    return any(room['id'] == rid for room in req('/public/rooms?pageSize=100', public=True)['items'])


assert not visible(), 'A hidden vacant room must stay private.'
published = req('/rooms/' + rid + '/listing', 'PUT', {'status': 'published', 'title': 'Room without photos'})
slug = published['listing']['slug']
assert visible(), 'An explicitly published vacancy must be listed without requiring a photo.'
filters = req('/public/filters', public=True)
assert filters['totalListings'] > 0
detail = req('/public/rooms/' + slug, public=True)
assert detail['images'] == [] and detail['coverImageUrl'] is None and detail['rent'] == 3000000
assert not {'currentTenancy', 'tickets', 'calendar', 'identityDocuments'}.intersection(detail)
assert req('/rooms/' + rid)['property']['isActive'] is True

req('/rooms/' + rid + '/listing', 'PUT', {'status': 'hidden', 'title': 'Room without photos'})
assert not visible()
req('/public/rooms/' + slug, public=True, expected=404)
req('/rooms/' + rid + '/listing', 'PUT', {'status': 'published', 'title': 'Room without photos'})
req('/rooms/' + rid + '/status', 'POST', {'status': 'maintenance', 'reason': 'Listing regression'})
assert not visible()
req('/public/rooms/' + slug, public=True, expected=404)
req('/rooms/' + rid + '/status', 'POST', {'status': 'available', 'reason': 'Ready again'})
req('/properties/' + p['id'] + '/deactivate', 'POST', {'reason': 'Listing regression'})
assert not visible()
req('/public/rooms/' + slug, public=True, expected=404)
req('/properties/' + p['id'] + '/activate', 'POST', {})
assert visible()
assert req('/public/rooms/' + slug, public=True)['availability']['status'] == 'available'
req('/rooms/' + rid, 'DELETE')
req('/properties/' + p['id'], 'DELETE')
print('PASS PUBLIC LISTINGS:', checks, 'HTTP operations plus assertions')
