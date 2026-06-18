// Маршруты мероприятий: создание, список и управление событиями.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { generateId, nowISO, ERROR_CODES } from '@tarbie/shared';

const events = new Hono<HonoEnv>();

events.use('*', authMiddleware);

// List events for school
events.get('/', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');

  let sql = `SELECT e.*, u.full_name as creator_name,
    (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as registered_count
    FROM events e
    JOIN users u ON e.created_by = u.id
    WHERE e.school_id = ?`;
  const params: string[] = [user.school_id];

  if (status) {
    sql += ' AND e.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY e.event_date DESC';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: rows.results });
});

// Get single event with registrations
events.get('/:id', async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');

  const event = await c.env.DB.prepare(
    `SELECT e.*, u.full_name as creator_name,
      (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as registered_count
     FROM events e JOIN users u ON e.created_by = u.id
     WHERE e.id = ? AND e.school_id = ?`
  ).bind(eventId, user.school_id).first();

  if (!event) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Event not found' }, 404);
  }

  const registrations = await c.env.DB.prepare(
    `SELECT er.id, er.student_id, er.registered_at, u.full_name as student_name,
            u.avatar_url as student_avatar_url
     FROM event_registrations er
     JOIN users u ON er.student_id = u.id
     WHERE er.event_id = ?
     ORDER BY er.registered_at`
  ).bind(eventId).all();

  // Check if current user is registered
  const myReg = await c.env.DB.prepare(
    'SELECT id FROM event_registrations WHERE event_id = ? AND student_id = ?'
  ).bind(eventId, user.id).first();

  return c.json({
    success: true,
    data: { ...event, registrations: registrations.results, is_registered: !!myReg },
  });
});

// Create event (admin/teacher)
events.post('/', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    title: string; description?: string; event_date: string;
    event_time?: string; location?: string; capacity?: number;
  };

  if (!body.title || !body.event_date) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'title and event_date required' }, 400);
  }

  // No backdating
  const today = new Date().toISOString().split('T')[0]!;
  if (body.event_date < today) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot create events in the past' }, 400);
  }

  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO events (id, school_id, title, description, event_date, event_time, location, capacity, created_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`
  ).bind(
    id, user.school_id, body.title, body.description || null,
    body.event_date, body.event_time || null, body.location || null,
    body.capacity || 0, user.id, now, now
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// Update event
events.put('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');
  const body = await c.req.json() as {
    title?: string; description?: string; event_date?: string;
    event_time?: string; location?: string; capacity?: number; status?: string;
  };

  const existing = await c.env.DB.prepare(
    'SELECT id, created_by FROM events WHERE id = ? AND school_id = ?'
  ).bind(eventId, user.school_id).first<{ id: string; created_by: string }>();

  if (!existing) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Event not found' }, 404);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (body.title) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description || ''); }
  if (body.event_date) { updates.push('event_date = ?'); values.push(body.event_date); }
  if (body.event_time !== undefined) { updates.push('event_time = ?'); values.push(body.event_time || ''); }
  if (body.location !== undefined) { updates.push('location = ?'); values.push(body.location || ''); }
  if (body.capacity !== undefined) { updates.push('capacity = ?'); values.push(body.capacity); }
  if (body.status && ['upcoming', 'ongoing', 'completed', 'cancelled'].includes(body.status)) {
    updates.push('status = ?'); values.push(body.status);
  }

  if (updates.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Nothing to update' }, 400);
  }

  updates.push('updated_at = ?'); values.push(nowISO());
  values.push(eventId);

  await c.env.DB.prepare(
    `UPDATE events SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: eventId, updated: true } });
});

// Delete event
events.delete('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM events WHERE id = ? AND school_id = ?'
  ).bind(eventId, user.school_id).first();

  if (!existing) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Event not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run();
  return c.json({ success: true, data: { id: eventId, deleted: true } });
});

// Register for event (any authenticated user, mainly students)
events.post('/:id/register', async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');

  const event = await c.env.DB.prepare(
    'SELECT id, capacity, status FROM events WHERE id = ? AND school_id = ?'
  ).bind(eventId, user.school_id).first<{ id: string; capacity: number; status: string }>();

  if (!event) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Event not found' }, 404);
  }
  if (event.status !== 'upcoming' && event.status !== 'ongoing') {
    return c.json({ success: false, code: 'EVENT_CLOSED', message: 'Event is not open for registration' }, 400);
  }

  // Check capacity
  if (event.capacity > 0) {
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM event_registrations WHERE event_id = ?'
    ).bind(eventId).first<{ cnt: number }>();
    if (count && count.cnt >= event.capacity) {
      return c.json({ success: false, code: 'CAPACITY_FULL', message: 'Event is full' }, 400);
    }
  }

  // Check already registered
  const existing = await c.env.DB.prepare(
    'SELECT id FROM event_registrations WHERE event_id = ? AND student_id = ?'
  ).bind(eventId, user.id).first();
  if (existing) {
    return c.json({ success: false, code: 'ALREADY_REGISTERED', message: 'Already registered' }, 409);
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO event_registrations (id, event_id, student_id, registered_at) VALUES (?, ?, ?, ?)'
  ).bind(id, eventId, user.id, nowISO()).run();

  return c.json({ success: true, data: { id, registered: true } }, 201);
});

// Unregister from event
events.delete('/:id/register', async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM event_registrations WHERE event_id = ? AND student_id = ?'
  ).bind(eventId, user.id).run();

  return c.json({ success: true, data: { unregistered: true } });
});

export default events;
