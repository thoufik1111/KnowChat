"""
WhatsApp Chat Parser
Handles multiple export formats: 12hr, 24hr, Android, iOS
"""

import re
from datetime import datetime


# Regex patterns for different WhatsApp export formats
PATTERNS = [
    # Android 12hr: 12/31/21, 11:59 PM - Name: Message
    r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2}\s?[APap][Mm])\s-\s(.+?):\s(.*)',
    # Android 24hr: 12/31/21, 23:59 - Name: Message
    r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2})\s-\s(.+?):\s(.*)',
    # iOS 12hr: [12/31/21, 11:59:00 PM] Name: Message
    r'\[(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2}:\d{2}\s?[APap][Mm])\]\s(.+?):\s(.*)',
    # iOS 24hr: [12/31/21, 23:59:00] Name: Message
    r'\[(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2}:\d{2})\]\s(.+?):\s(.*)',
    # WhatsApp Web format: 31/12/2021, 23:59 - Name: Message
    r'(\d{1,2}/\d{1,2}/\d{4}),\s(\d{1,2}:\d{2})\s-\s(.+?):\s(.*)',
]

DATE_FORMATS = [
    '%m/%d/%y', '%d/%m/%y', '%m/%d/%Y', '%d/%m/%Y',
]

TIME_FORMATS = [
    '%I:%M %p', '%I:%M%p', '%H:%M', '%I:%M:%S %p', '%I:%M:%S%p', '%H:%M:%S',
]


def parse_datetime(date_str, time_str):
    """Try multiple date+time format combinations."""
    date_str = date_str.strip()
    time_str = time_str.strip().upper()

    for df in DATE_FORMATS:
        for tf in TIME_FORMATS:
            try:
                return datetime.strptime(f"{date_str} {time_str}", f"{df} {tf}")
            except ValueError:
                continue
    return None


def parse_chat(content):
    """
    Parse raw WhatsApp chat export into structured messages.
    Returns list of dicts: {date, time, hour, user, message, is_media}
    """
    messages = []
    lines = content.split('\n')

    compiled_patterns = [re.compile(p) for p in PATTERNS]
    active_pattern = None
    current_msg = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        matched = False
        for pattern in compiled_patterns:
            m = pattern.match(line)
            if m:
                active_pattern = pattern
                # Save previous message
                if current_msg:
                    messages.append(current_msg)

                date_str, time_str, user, message = m.group(1), m.group(2), m.group(3), m.group(4)
                dt = parse_datetime(date_str, time_str)

                is_media = '<media omitted>' in message.lower()
                is_system = (user.lower() in ['you', ''] or
                             any(kw in message.lower() for kw in
                                 ['messages and calls are end-to-end encrypted',
                                  'created group', 'added', 'removed', 'changed']))

                if not is_system:
                    current_msg = {
                        'date': dt.strftime('%Y-%m-%d') if dt else date_str,
                        'time': dt.strftime('%H:%M') if dt else time_str,
                        'hour': dt.hour if dt else 0,
                        'weekday': dt.strftime('%A') if dt else 'Unknown',
                        'user': user.strip(),
                        'message': message.strip(),
                        'is_media': is_media,
                        'word_count': len(message.split()) if not is_media else 0,
                        'char_count': len(message) if not is_media else 0,
                    }
                else:
                    current_msg = None

                matched = True
                break

        # Multiline message continuation
        if not matched and current_msg and line:
            current_msg['message'] += ' ' + line
            if not current_msg['is_media']:
                current_msg['word_count'] = len(current_msg['message'].split())
                current_msg['char_count'] = len(current_msg['message'])

    if current_msg:
        messages.append(current_msg)

    return messages
