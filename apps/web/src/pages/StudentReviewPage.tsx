import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Star, Loader2, CheckCircle2, MessageSquare, Eye, EyeOff } from 'lucide-react';

interface SessionForReview {
  session_id: string;
  topic: string;
  planned_date: string;
  teacher_name: string;
  already_rated: boolean;
}

export function StudentReviewPage() {
  const { user, lang } = useAuthStore();
  const [sessions, setSessions] = useState<SessionForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingSession, setRatingSession] = useState<SessionForReview | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<SessionForReview[]>('/api/ratings/my-sessions');
      setSessions(Array.isArray(res) ? res : []);
    } catch { setSessions([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (!user || user.role !== 'student') {
    return <div className="py-20 text-center text-gray-400">{lang === 'kz' ? 'Қол жетімсіз' : 'Нет доступа'}</div>;
  }

  if (ratingSession) {
    return (
      <RatingForm
        lang={lang as 'kz' | 'ru'}
        session={ratingSession}
        onBack={() => { setRatingSession(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Star size={24} className="text-yellow-500" />
        {lang === 'kz' ? 'Сабақтарға баға беру' : 'Оценить занятия'}
      </h1>
      <p className="text-sm text-gray-500">
        {lang === 'kz'
          ? 'Аяқталған сабақтарға баға қойыңыз. Отзыв анонимді немесе ашық болуы мүмкін.'
          : 'Оцените пройденные занятия. Отзыв может быть анонимным или открытым.'}
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : sessions.length === 0 ? (
        <div className="card py-10 text-center text-gray-400">
          <Star size={32} className="mx-auto mb-2" />
          {lang === 'kz' ? 'Аяқталған сабақтар жоқ' : 'Нет завершённых занятий'}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div
              key={s.session_id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                s.already_rated
                  ? 'border-green-200 bg-green-50/30'
                  : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50 cursor-pointer'
              }`}
              onClick={() => !s.already_rated && setRatingSession(s)}
            >
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                s.already_rated ? 'bg-green-100 text-green-600' : 'bg-primary-50 text-primary-600'
              }`}>
                {s.already_rated ? <CheckCircle2 size={18} /> : <Star size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.topic}</p>
                <p className="text-xs text-gray-500">
                  {s.teacher_name} &middot; {s.planned_date}
                </p>
              </div>
              <span className={`text-xs font-medium ${s.already_rated ? 'text-green-600' : 'text-primary-600'}`}>
                {s.already_rated
                  ? (lang === 'kz' ? 'Бағаланды ✓' : 'Оценено ✓')
                  : (lang === 'kz' ? 'Бағалау →' : 'Оценить →')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingForm({ lang, session, onBack }: {
  lang: 'kz' | 'ru';
  session: SessionForReview;
  onBack: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reason, setReason] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/ratings/session/${session.session_id}`, {
        rating,
        reason: reason.trim() || undefined,
        is_anonymous: isAnonymous,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="card py-12 text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-green-500" />
        <p className="text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Рахмет! Бағаңыз қабылданды.' : 'Спасибо! Ваша оценка принята.'}
        </p>
        <button onClick={onBack} className="btn-primary">
          {lang === 'kz' ? '← Артқа' : '← Назад'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="btn-secondary text-sm">
        ← {lang === 'kz' ? 'Артқа' : 'Назад'}
      </button>

      <div className="card space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{session.topic}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {session.teacher_name} &middot; {session.planned_date}
          </p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Star rating */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {lang === 'kz' ? 'Баға (1-10)' : 'Оценка (1-10)'}
          </p>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v)}
                onMouseEnter={() => setHoverRating(v)}
                onMouseLeave={() => setHoverRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={`${
                    v <= (hoverRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-500 mt-1">{rating}/10</p>
          )}
        </div>

        {/* Reason */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <MessageSquare size={14} />
            {lang === 'kz' ? 'Пікір (міндетті емес)' : 'Отзыв (необязательно)'}
          </p>
          <textarea
            className="input-field"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={lang === 'kz' ? 'Сабақ туралы ойыңыз...' : 'Ваше мнение о занятии...'}
          />
        </div>

        {/* Anonymous toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={e => setIsAnonymous(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="flex items-center gap-1 text-sm text-gray-600">
            {isAnonymous ? <EyeOff size={14} /> : <Eye size={14} />}
            {lang === 'kz' ? 'Анонимді түрде жіберу' : 'Отправить анонимно'}
          </span>
        </label>

        <button
          onClick={handleSubmit}
          disabled={submitting || rating < 1}
          className="btn-primary w-full"
        >
          {submitting
            ? <Loader2 size={16} className="animate-spin mr-2" />
            : <Star size={16} className="mr-2" />}
          {lang === 'kz' ? 'Бағалау' : 'Оценить'}
        </button>
      </div>
    </div>
  );
}
