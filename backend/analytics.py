"""
WhatsApp Analytics Engine
Computes all insights: user activity, time patterns, emojis, content
"""

from collections import Counter, defaultdict
import re
import emoji as emoji_lib
import string
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


# Common English stopwords
STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'it', 'this', 'that', 'was', 'are', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'yes', 'so',
    'if', 'as', 'by', 'from', 'up', 'out', 'about', 'into', 'than',
    'then', 'there', 'their', 'they', 'what', 'when', 'where', 'who', 'am',
    'which', 'how', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
    'she', 'his', 'her', 'its', 'us', 'them', 'just', 'ok', 'okay',
    'yeah', 'oh', 'ah', 'ha', 'haha', 'lol', 'omg', 'bro',
    'like', 'get', 'got', 'go', 'im', 'ive', 'its', 'dont', 'cant',
    'wont', 'also', 'too', 'very', 'much', 'more', 'one', 'two', 'let',
    'all', 'any', 'some', 'only', 'same', 'after', 'back', 'now', 'here',
}

HOURS = list(range(24))
WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
# High-speed translation table for stripping punctuation
PUNCT_TABLE = str.maketrans('', '', string.punctuation)
analyzer = SentimentIntensityAnalyzer()

def extract_emojis(text):
    """Extract all emojis from text."""
    return [ch for ch in text if ch in emoji_lib.EMOJI_DATA]

def clean_word(word):
    """Fast lowercase and strip punctuation from a word."""
    return word.lower().translate(PUNCT_TABLE)

def generate_analytics(messages):
    """Main analytics function. Returns full dashboard data dict."""

    users = list({m['user'] for m in messages})
    dates = sorted({m['date'] for m in messages})

    # ── Per-user buckets ─────────────────────────────────────────────
    user_messages = defaultdict(list)
    for m in messages:
        user_messages[m['user']].append(m)

    # ── User activity ─────────────────────────────────────────────────
    msg_count = {u: len(msgs) for u, msgs in user_messages.items()}
    word_count = {u: sum(m['word_count'] for m in msgs) for u, msgs in user_messages.items()}
    media_count = {u: sum(1 for m in msgs if m['is_media']) for u, msgs in user_messages.items()}
    avg_len = {
        u: round(sum(m['char_count'] for m in msgs if not m['is_media']) /
                 max(1, sum(1 for m in msgs if not m['is_media'])), 1)
        for u, msgs in user_messages.items()
    }

    sorted_users = sorted(msg_count, key=msg_count.get, reverse=True)

    # ── Emoji analysis ────────────────────────────────────────────────
    user_emojis = {}
    all_emoji_counter = Counter()
    for m in messages:
        emojis = extract_emojis(m['message'])
        user_emojis[m['user']] = user_emojis.get(m['user'], 0) + len(emojis)
        all_emoji_counter.update(emojis)

    top_emojis = [{'emoji': e, 'count': c} for e, c in all_emoji_counter.most_common(10)]

    # ── Word analysis ─────────────────────────────────────────────────
    all_words = Counter()
    user_top_words = {}
    user_word_counters = defaultdict(Counter)
    
    for m in messages:
        if not m['is_media']:
            for w in m['message'].split():
                cleaned = clean_word(w)
                if cleaned and len(cleaned) > 2 and cleaned not in STOPWORDS:
                    user_word_counters[m['user']][cleaned] += 1
                    all_words[cleaned] += 1
    
    for u in users:
        user_top_words[u] = [{'word': w, 'count': c} for w, c in user_word_counters[u].most_common(5)]

    top_words_global = [{'word': w, 'count': c} for w, c in all_words.most_common(15)]

    # ── Time analysis ─────────────────────────────────────────────────
    hourly_counts = Counter(m['hour'] for m in messages)
    hourly_data = [hourly_counts.get(h, 0) for h in HOURS]

    weekday_counts = Counter(m['weekday'] for m in messages)
    weekday_data = [weekday_counts.get(d, 0) for d in WEEKDAYS]

    # Messages per date — cap at 180 points by aggregating into weeks for large datasets
    date_counts = Counter(m['date'] for m in messages)
    sorted_dates = sorted(date_counts)
    if len(sorted_dates) > 180:
        # Aggregate by week
        from datetime import datetime, timedelta
        week_counts = defaultdict(int)
        for d in sorted_dates:
            try:
                dt = datetime.strptime(d, '%Y-%m-%d')
                week_start = (dt - timedelta(days=dt.weekday())).strftime('%Y-%m-%d')
                week_counts[week_start] += date_counts[d]
            except Exception:
                week_counts[d] += date_counts[d]
        timeline = [{'date': d, 'count': c} for d, c in sorted(week_counts.items())]
    else:
        timeline = [{'date': d, 'count': date_counts.get(d, 0)} for d in sorted_dates]

    peak_hour = max(hourly_counts, key=hourly_counts.get, default=0)
    most_active_day = max(weekday_counts, key=weekday_counts.get, default='N/A')
    least_active_day = min(weekday_counts, key=weekday_counts.get, default='N/A')

    # ── Sentiment Analysis ───────────────────────────────────────────
    sentiments = []
    for m in messages:
        if not m['is_media'] and m['message']:
            score = analyzer.polarity_scores(m['message'])['compound']
            sentiments.append(score)
    avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0

    # ── Per-user time patterns ────────────────────────────────────────
    user_time_profiles = {}
    for u, msgs in user_messages.items():
        h_ctr = Counter(m['hour'] for m in msgs)
        peak = max(h_ctr, key=h_ctr.get, default=0)
        least = min((h for h in HOURS if h_ctr.get(h, 0) > 0),
                    key=lambda h: h_ctr.get(h, 0), default=0)
        heatmap = [h_ctr.get(h, 0) for h in HOURS]

        user_time_profiles[u] = {
            'peak_hour': peak,
            'peak_hour_label': _hour_label(peak),
            'least_hour': least,
            'least_hour_label': _hour_label(least),
            'heatmap': heatmap,
            'best_time_to_message': f"Message {u.split()[0]} around {_hour_label(peak)}",
        }

    # ── Personality badges ────────────────────────────────────────────
    badges = _compute_badges(sorted_users, msg_count, user_emojis, user_time_profiles, user_messages, avg_len)

    # ── Heatmap matrix (7 days × 24 hrs) ─────────────────────────────
    heatmap_matrix = _build_heatmap(messages)

    # ── User streaks (longest consecutive active days) ────────────────
    user_streaks = {}
    for u, msgs in user_messages.items():
        active_dates = sorted({m['date'] for m in msgs})
        max_streak = cur_streak = 1
        from datetime import datetime, timedelta
        for j in range(1, len(active_dates)):
            try:
                diff = (datetime.strptime(active_dates[j], '%Y-%m-%d') -
                        datetime.strptime(active_dates[j-1], '%Y-%m-%d')).days
                cur_streak = cur_streak + 1 if diff == 1 else 1
                max_streak = max(max_streak, cur_streak)
            except Exception:
                pass
        user_streaks[u] = max_streak if active_dates else 0

    # ── MVP scores ────────────────────────────────────────────────────
    opener_counts = defaultdict(int)
    for i, m in enumerate(messages):
        if i == 0 or messages[i]['date'] != messages[i-1]['date'] or \
                (messages[i]['hour'] - messages[i-1]['hour']) >= 3:
            opener_counts[m['user']] += 1
    max_msgs  = max(msg_count.values(), default=1)
    max_words = max(word_count.values(), default=1)
    max_reply = max(opener_counts.values(), default=1)
    mvp_scores = {
        u: round(
            (msg_count.get(u, 0) / max_msgs) * 40 +
            (word_count.get(u, 0) / max_words) * 40 +
            (opener_counts.get(u, 0) / max_reply) * 20
        , 1)
        for u in sorted_users
    }

    return {
        'users': sorted_users,
        'total_messages': len(messages),
        'total_days': len(dates),
        'date_range': {'start': dates[0] if dates else '', 'end': dates[-1] if dates else ''},

        # User stats
        'msg_count': msg_count,
        'word_count': word_count,
        'media_count': media_count,
        'avg_msg_length': avg_len,
        'user_emojis': user_emojis,
        'user_top_words': user_top_words,

        # Global charts
        'hourly_data': hourly_data,
        'weekday_data': weekday_data,
        'timeline': timeline,
        'top_emojis': top_emojis,
        'top_words': top_words_global,

        # Key stats
        'peak_hour': peak_hour,
        'peak_hour_label': _hour_label(peak_hour),
        'most_active_day': most_active_day,
        'least_active_day': least_active_day,
        'sentiment_score': round(avg_sentiment, 3),
        'sentiment_label': (
            'Positive 😊' if avg_sentiment > 0.05 else 
            'Negative 😟' if avg_sentiment < -0.05 else 'Neutral 😐'
        ),
        'most_active_user': sorted_users[0] if sorted_users else 'N/A',
        'least_active_user': sorted_users[-1] if sorted_users else 'N/A',

        # Advanced
        'user_time_profiles': user_time_profiles,
        'badges': badges,
        'heatmap_matrix': heatmap_matrix,
        'user_streaks': user_streaks,
        'mvp_scores': mvp_scores,
    }


def _hour_label(h):
    if h == 0:
        return '12 AM'
    elif h < 12:
        return f'{h} AM'
    elif h == 12:
        return '12 PM'
    else:
        return f'{h - 12} PM'


def _compute_badges(sorted_users, msg_count, user_emojis, time_profiles, user_messages, avg_len):
    badges = {}
    if not sorted_users:
        return badges

    badges['group_king'] = sorted_users[0]
    badges['ghost_member'] = sorted_users[-1]

    # Night owl: most msgs between 11pm-4am
    night_hours = set(range(23, 24)) | set(range(0, 5))
    night_scores = {u: sum(p['heatmap'][h] for h in night_hours) for u, p in time_profiles.items()}
    badges['night_owl'] = max(night_scores, key=night_scores.get) if night_scores else sorted_users[0]

    # Early bird: most msgs between 5-9am
    morning_scores = {u: sum(p['heatmap'][h] for h in range(5, 10)) for u, p in time_profiles.items()}
    badges['early_bird'] = max(morning_scores, key=morning_scores.get) if morning_scores else sorted_users[0]

    # Emoji king
    badges['emoji_king'] = max(user_emojis, key=user_emojis.get) if user_emojis else sorted_users[0]

    # One-Line King: lowest avg message length (min 10 msgs to qualify)
    qualified = {u: avg_len[u] for u in sorted_users if msg_count.get(u, 0) >= 10 and avg_len.get(u, 0) > 0}
    badges['one_line_king'] = min(qualified, key=qualified.get) if qualified else sorted_users[-1]

    # Door Opener: most first messages of a day (first msg after 3hr gap)
    opener_scores = defaultdict(int)
    ender_scores = defaultdict(int)
    all_msgs = sorted([m for msgs in user_messages.values() for m in msgs],
                      key=lambda m: (m['date'], m['time']))
    for i, m in enumerate(all_msgs):
        if i == 0:
            opener_scores[m['user']] += 1
            continue
        prev = all_msgs[i - 1]
        # New conversation = different date or >3hr gap
        if m['date'] != prev['date'] or (m['hour'] - prev['hour']) >= 3:
            opener_scores[m['user']] += 1
        if i == len(all_msgs) - 1 or (
            all_msgs[i + 1]['date'] != m['date'] or (all_msgs[i + 1]['hour'] - m['hour']) >= 3
        ):
            ender_scores[m['user']] += 1
    badges['door_opener'] = max(opener_scores, key=opener_scores.get) if opener_scores else sorted_users[0]
    badges['last_word_legend'] = max(ender_scores, key=ender_scores.get) if ender_scores else sorted_users[0]

    # Hibernating Member: longest streak of days with zero messages
    from datetime import datetime, timedelta
    hibernate_scores = {}
    for u, msgs in user_messages.items():
        active_dates = sorted({m['date'] for m in msgs})
        if len(active_dates) < 2:
            hibernate_scores[u] = 0
            continue
        max_gap = 0
        for j in range(1, len(active_dates)):
            try:
                gap = (datetime.strptime(active_dates[j], '%Y-%m-%d') -
                       datetime.strptime(active_dates[j-1], '%Y-%m-%d')).days
                max_gap = max(max_gap, gap)
            except Exception:
                pass
        hibernate_scores[u] = max_gap
    badges['hibernating'] = max(hibernate_scores, key=hibernate_scores.get) if hibernate_scores else sorted_users[-1]

    # Stalker Mode: high read-to-send ratio = low msg count but active days
    stalker_scores = {}
    for u, msgs in user_messages.items():
        active_days = len({m['date'] for m in msgs})
        count = msg_count.get(u, 1)
        stalker_scores[u] = active_days / count  # low msgs per active day = lurker
    qualified_stalkers = {u: s for u, s in stalker_scores.items() if msg_count.get(u, 0) >= 5}
    badges['stalker_mode'] = max(qualified_stalkers, key=qualified_stalkers.get) if qualified_stalkers else sorted_users[-1]

    return badges


def _build_heatmap(messages):
    """Build a 7×24 matrix: weekday × hour → message count."""
    matrix = [[0] * 24 for _ in range(7)]
    day_map = {d: i for i, d in enumerate(WEEKDAYS)}
    for m in messages:
        day_idx = day_map.get(m['weekday'], 0)
        matrix[day_idx][m['hour']] += 1
    return matrix
