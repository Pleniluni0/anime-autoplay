"""
Native Messaging Host para Anime AutoPlay Host.
Recibe mensajes de la extensión Chrome y ejecuta clicks reales con pyautogui.

Instalar dependencia: pip install pyautogui
"""

import sys
import json
import struct
import time

try:
    import pyautogui
    pyautogui.FAILSAFE = False  # Evita que mover el ratón a la esquina cancele
    pyautogui.PAUSE = 0          # Sin pausa entre acciones
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False


def read_message():
    """Lee un mensaje del stdin en formato Native Messaging (4 bytes length + JSON)."""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack('=I', raw_length)[0]
    if length == 0:
        return None
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode('utf-8'))


def send_message(obj):
    """Envía un mensaje al stdout en formato Native Messaging."""
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle(msg):
    if not isinstance(msg, dict):
        return {'ok': False, 'error': 'invalid message'}

    action = msg.get('action') or msg.get('type')

    if action in ('AUTO_CLICK', 'click'):
        if not HAS_PYAUTOGUI:
            return {'ok': False, 'error': 'pyautogui not installed'}
        delay_ms = msg.get('delay', 300)
        x = msg.get('x')
        y = msg.get('y')
        if x is None or y is None:
            return {'ok': False, 'error': 'missing x/y'}
        time.sleep(delay_ms / 1000.0)
        pyautogui.click(int(x), int(y))
        return {'ok': True, 'clicked': [x, y]}

    return {'ok': False, 'error': f'unknown action: {action}'}


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        response = handle(msg)
        send_message(response)


if __name__ == '__main__':
    main()
