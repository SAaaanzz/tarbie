import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Star, TrendingUp, MessageSquare, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { Avatar } from '../components/Avatar';

interface TeacherSummary {
  teacher_id: string;
  teacher_name: string;
  total_ratings: number;
  valid_ratings: number;
  average_rating: number;
  teacher_avatar_url?: string | null;
}

interface TeacherDetail {
  teacher_id: string;
  teacher_name: string;
  total_ratings: number;
  valid_ratings: number;
  average_rating: number;
  recent_reviews: { rating: number; reason: string; created_at: string; is_anonymous: boolean; student_name: string | null; student_avatar_url?: string | null }[];
}

function ratingColor(r: number): string {
  if (r >= 8) return 'text-green-600';
  if (r >= 5) return 'text-amber-600';
  return 'text-red-600';
}

function ratingBg(r: number): string {
  if (r >= 8) return 'bg-green-50 border-green-200';
  if (r >= 5) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

export function TeacherRatingsPage() {
  const { lang } = useAuthStore();
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const k = lang === 'kz';

  useEffect(() => {
    api.get<TeacherSummary[]>('/api/ratings/teachers').then(setTeachers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (teacherId: string) => {
    if (expandedId === teacherId) { setExpandedId(null); setDetail(null); setDetailError(false); return; }
    setExpandedId(teacherId);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(false);
    try {
      const d = await api.get<TeacherDetail>(`/api/ratings/teacher/${teacherId}`);
      // Ensure recent_reviews is always an array
      if (d && !Array.isArray(d.recent_reviews)) d.recent_reviews = [];
      setDetail(d);
    } catch {
      setDetail(null);
      setDetailError(true);
    } finally { setDetailLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Star size={24} className="text-amber-500" />
        {k ? 'Кураторлар рейтингі' : 'Рейтинг кураторов'}
      </h1>

      {teachers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{k ? 'Бағалар жоқ' : 'Оценок пока нет'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teachers.map(t => (
            <div key={t.teacher_id} className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
              <button onClick={() => toggleExpand(t.teacher_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg ${ratingBg(t.average_rating)} border`}>
                    <span className={ratingColor(t.average_rating)}>{t.average_rating || '—'}</span>
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <Avatar name={t.teacher_name} size="sm" avatarUrl={t.teacher_avatar_url} />
                      <p className="font-semibold text-gray-900">{t.teacher_name}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {k ? `${t.valid_ratings} баға (${t.total_ratings} барлығы)` : `${t.valid_ratings} оценок (${t.total_ratings} всего)`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {t.average_rating > 0 && (
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }, (_, i) => (
                        <div key={i} className={`h-2 w-2 rounded-full ${i < Math.round(t.average_rating) ? 'bg-amber-400' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  )}
                  {expandedId === t.teacher_id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>

              {expandedId === t.teacher_id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  {detailLoading ? (
                    <div className="text-center py-4"><div className="animate-spin h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" /></div>
                  ) : detailError ? (
                    <p className="text-sm text-red-500 text-center py-4">{k ? 'Жүктеу қатесі' : 'Ошибка загрузки'}</p>
                  ) : detail ? (
                    <div>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="rounded-xl bg-white p-3 border text-center">
                          <TrendingUp size={16} className="mx-auto text-green-500 mb-1" />
                          <p className="text-lg font-bold text-gray-900">{detail.average_rating}</p>
                          <p className="text-[10px] text-gray-500">{k ? 'Орташа' : 'Средняя'}</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 border text-center">
                          <Star size={16} className="mx-auto text-amber-500 mb-1" />
                          <p className="text-lg font-bold text-gray-900">{detail.valid_ratings}</p>
                          <p className="text-[10px] text-gray-500">{k ? 'Жарамды' : 'Валидных'}</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 border text-center">
                          <MessageSquare size={16} className="mx-auto text-blue-500 mb-1" />
                          <p className="text-lg font-bold text-gray-900">{detail.recent_reviews?.length ?? 0}</p>
                          <p className="text-[10px] text-gray-500">{k ? 'Пікірлер' : 'Отзывов'}</p>
                        </div>
                      </div>

                      {detail.recent_reviews && detail.recent_reviews.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-gray-600 mb-2">{k ? 'Соңғы пікірлер' : 'Последние отзывы'}</h4>
                          {detail.recent_reviews.map((r, i) => (
                            <div key={i} className={`rounded-xl p-3 border ${ratingBg(r.rating)}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-sm font-bold ${ratingColor(r.rating)}`}>⭐ {r.rating}/10</span>
                                <span className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-sm text-gray-800">{r.reason}</p>
                              <div className="flex items-center gap-1 mt-1">
                                {r.is_anonymous || !r.student_name ? (
                                  <span className="text-[10px] text-gray-400 italic">🕶 {k ? 'Аноним' : 'Аноним'}</span>
                                ) : (
                                  <>
                                    <Avatar name={r.student_name} size="xs" avatarUrl={r.student_avatar_url} />
                                    <span className="text-[10px] text-gray-500">— {r.student_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center">{k ? 'Пікірлер жоқ' : 'Нет отзывов с комментариями'}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
